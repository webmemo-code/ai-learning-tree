#!/usr/bin/env node
// harvest.mjs — the phase-3 GitHub harvester. Turns real repo activity into
// growth events and appends them to data/growth-log.jsonl. The log IS the state:
// there is no cursor file — we read the newest `gh:{owner}/{repo}:*` event
// already in the log, PER EVENT FAMILY (commit / pr / issue), and ask GitHub
// only for things newer than that family's own high-water mark. See
// indexExisting() for why a single per-repo cursor would lose commits.
//
// With `harvest.collaboration: true` (opt-in, off by default) it also collects
// pull requests, PR reviews and issues authored by the owner — the commit/PR/
// review/issue MIX is a maturity signal. Metadata only: no title, no body.
//
//   node harvester/harvest.mjs [--dry-run] [--repo owner/name] [--since ISO]
//
// Auth (docs/03 §6): HARVEST_TOKEN (opt-in PAT, may see private repos) wins over
// GITHUB_TOKEN (the Actions default — public + this repo). No token → public API,
// low rate limit, still works. Default scope is PUBLIC data; a private repo's
// commits are harvested only when the token can see it AND config
// `harvest.private-repos: true`.
//
// METADATA ONLY. We never emit a commit message, a file path, a diff, or a patch
// — only the schema fields in docs/03 §2. A thin adapter per source (docs/04
// §risk): fetchJson() is the only thing that touches the network, so the tests
// inject fixtures straight into it.
//
// Zero npm dependencies. YAML config is parsed by the generator's tiny parser.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseYaml } from '../generator/serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// pure helpers (all exported — the tests exercise these directly)
// ---------------------------------------------------------------------------

// committer date -> canonical UTC "…Z" (no milliseconds), matching the log style.
export function toUtcZ(ts) {
  const s = String(ts).length <= 10 ? `${ts}T00:00:00Z` : ts;
  return new Date(s).toISOString().replace('.000Z', 'Z');
}

// weight heuristic: files touched, log-damped and clamped so a big refactor
// counts more than a typo but no single commit can grow a monster branch.
export function weightForFiles(files) {
  const n = Math.max(0, files | 0);
  const w = 0.4 + Math.log2(1 + n) * 0.5;
  return Math.round(Math.min(3.0, Math.max(0.4, w)) * 100) / 100;
}

// classification priority chain (docs/03 §3), first match wins:
//   1. explicit repos: mapping  2. topic-map: via GitHub topics  3. unclassified
export function classify(repo, config) {
  const repos = config.repos || {};
  if (repos[repo.name]) return repos[repo.name];
  const topicMap = config['topic-map'] || {};
  for (const t of repo.topics || []) if (topicMap[t]) return topicMap[t];
  return 'unclassified'; // never dropped — faint gray shoots nag you to map it
}

// build a commit event in the exact §2 schema (key order matches the log style).
export function commitEvent({ owner, repo, sha, ts, sector, lang, priv, files }) {
  return {
    id: `gh:${owner}/${repo}:${String(sha).slice(0, 7)}`,
    ts: toUtcZ(ts),
    source: 'github',
    kind: 'commit',
    sector,
    project: repo,
    weight: weightForFiles(files),
    attrs: { runtime: 'cloud', lang: lang || null },
    private: !!priv,
  };
}

// --- collaboration events (kind: pr | review | issue) ----------------------
// The commit/PR/review/issue MIX is a maturity signal: novices only commit;
// experienced developers open PRs, review other people's work, and file issues
// to plan. So we collect them as first-class growth events — SAME §2 schema,
// same 9 keys in the same order, no new top-level keys.
//
// METADATA ONLY, harder than for commits: a PR/issue TITLE and BODY are free
// text the author wrote, so unlike a file count they can carry anything. We
// read only the number, the state, the author login (to filter), and the
// timestamp. No title, no body, no branch name, no label text — nothing that
// could round-trip prose into the log. (attrs.title/attrs.url exist in the
// schema for MILESTONES; deliberately not reused here.)
//
// Weight (constraint: clamped + 2-decimal rounded, like weightForFiles, but
// NOT derived from it — a PR has no file count of its own that we're willing
// to pay an extra API call for, and its "size" is already represented by the
// commits inside it, which we harvest separately). Flat per-kind base values,
// deliberately in the same 0.4..3.0 band as commit weights so the mix is
// comparable on one axis:
//   pr     1.5  — a deliberate, reviewable unit of work. Heavier than the
//                 typical commit (weightForFiles(1..5) ≈ 0.9..1.69) because a
//                 PR is the act of PACKAGING work for others, not just saving it.
//   review 1.0  — real work, and the strongest maturity signal in the set, but
//                 lighter than a PR because it produces no artifact of its own.
//                 Rated at the weight of a ~2-file commit: honest, not inflated.
//   issue  0.6  — cheap to open (seconds), yet it signals planning ahead of
//                 code. Above the 0.4 floor, well below a commit.
// Double-counting note: a PR's own commits are ALSO harvested as commit events.
// That is intended — the PR event is not a re-count of the code, it's a count
// of the collaboration act layered on top of it.
// Serialisation note: review's 1.0 lands in the log as `"weight": 1`, because
// jline() delegates to JSON.stringify and JS has no integer/float distinction.
// That is the log's PRE-EXISTING representation, not a regression introduced
// here — weightForFiles's 3.0 clamp already writes `"weight": 3` on ~56 lines
// of the real log. Such a line reparses and re-serialises byte-identically, so
// the append-only guarantee holds; "fixing" jline to print 1.0 would instead
// churn every one of those existing lines.
export const COLLAB_WEIGHTS = { pr: 1.5, review: 1.0, issue: 0.6 };

export function weightForCollab(kind) {
  const w = COLLAB_WEIGHTS[kind] ?? 0.4;
  return Math.round(Math.min(3.0, Math.max(0.4, w)) * 100) / 100;
}

// id suffixes: pr{n} / pr{n}r{reviewId} / i{n}. These can never collide with a
// commit id (`gh:owner/repo:{sha7}`): a sha7 is 7 chars drawn from [0-9a-f],
// and neither `p`, `r` nor `i` is a hex digit, so a collaboration suffix can
// never *be* a sha7 — nor a prefix/suffix of one, since the whole segment after
// the last ':' is compared. (Checked in both directions: `pr123` starts with a
// non-hex char; `i7` likewise. And a sha7 can never start with `pr`/`i`.)
export function collabEvent({ owner, repo, kind, number, reviewId, ts, sector, lang, priv }) {
  const suffix = kind === 'issue'
    ? `i${number}`
    : kind === 'review' ? `pr${number}r${reviewId}` : `pr${number}`;
  return {
    id: `gh:${owner}/${repo}:${suffix}`,
    ts: toUtcZ(ts),
    source: 'github',
    kind,
    sector,
    project: repo,
    weight: weightForCollab(kind),
    attrs: { runtime: 'cloud', lang: lang || null },
    private: !!priv,
  };
}

// milestones.yml is a YAML list-of-maps; the generator's parser skips top-level
// lists, so we parse this small dialect ourselves. Only ts/sector/level/evidence/
// note are recognised (docs/03 §2).
export function parseMilestones(text) {
  const items = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!noComment.trim()) continue;
    const dash = noComment.match(/^(\s*)-\s+(.*)$/);
    const line = dash ? dash[2] : noComment.trim();
    if (dash) { cur = {}; items.push(cur); }
    if (!cur) continue;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (key === 'level') val = Number(val);
    cur[key] = val;
  }
  return items.filter((m) => m.ts && m.sector);
}

// milestone events. Dedup key is ts+sector+level (data/README.md contract), so
// that's exactly what the id encodes — safe to edit an entry's note/evidence
// text without minting a new event.
export function milestoneEvents(milestones) {
  return milestones.map((m) => {
    const date = String(m.ts).slice(0, 10);
    const level = Number(m.level) || 1;
    const attrs = { level };
    if (m.evidence) attrs.evidence = m.evidence;
    if (m.note) attrs.note = m.note;
    return {
      id: `manual:${date}-${m.sector}-l${level}`,
      ts: toUtcZ(m.ts),
      source: 'manual',
      kind: 'milestone',
      sector: m.sector,
      project: null,
      weight: 1.0,
      attrs,
      private: false,
    };
  });
}

// compact one-line JSON matching the log's on-disk style (space after ':' and
// ','), keys in insertion order. Equivalent to Python's json.dumps default —
// re-serialising an existing line is byte-identical, so old lines never churn.
export function jline(val) {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) return '[' + val.map(jline).join(', ') + ']';
  if (typeof val === 'object') {
    return '{' + Object.keys(val).map((k) => JSON.stringify(k) + ': ' + jline(val[k])).join(', ') + '}';
  }
  return JSON.stringify(val);
}

// parse an existing JSONL log into { id, ts, raw } rows. raw is the verbatim
// line so existing events are re-emitted byte-for-byte (append-only in spirit;
// only re-sorted if an older event arrives late).
export function parseLog(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const e = JSON.parse(line);
    rows.push({ id: e.id, ts: e.ts, raw: line });
  }
  return rows;
}

// classify a `gh:owner/repo:{suffix}` id into its CURSOR FAMILY. Each family is
// paginated by its own GitHub endpoint with its own `since`-style floor, so each
// needs its own high-water mark:
//   'commit'  — suffix is a 7-hex sha       -> /commits?since=
//   'pr'      — suffix is pr{n} (no `r`)    -> /pulls (also covers reviews, see below)
//   'issue'   — suffix is i{n}              -> /issues?since=
// Reviews (pr{n}r{id}) intentionally fold into the 'pr' family: they are fetched
// per-PR, not from a list endpoint with its own floor, so they never need — and
// must never SET — a cursor of their own.
export function idFamily(suffix) {
  if (/^[0-9a-f]{7}$/.test(suffix)) return 'commit';
  if (/^pr\d+r\d+$/.test(suffix)) return 'pr';   // review, folded into the pr family
  if (/^pr\d+$/.test(suffix)) return 'pr';
  if (/^i\d+$/.test(suffix)) return 'issue';
  return null; // unknown suffix shape: never allowed to move any cursor
}

// index existing rows: id set (dedupe) + newest ts per gh repo (the cursor).
//
// CURSOR DESIGN (why it is per-FAMILY, not one per repo):
// the log is the state — there is no cursor file. Before collaboration events,
// every `gh:owner/repo:*` id was a commit, so "newest ts for this repo" was
// exactly "newest commit ts" and a single number was safe. It no longer is.
// A PR opened on 2025-06-01 in a repo whose newest harvested COMMIT is
// 2025-02-01 would push a single shared cursor to June; the next run would then
// call /commits?since=2025-06-01 and silently skip every commit between
// February and June — a permanent hole in the log, invisible because the
// harvester would cheerfully report "no new growth".
//
// So `cursor` is keyed "owner/repo" -> { commit, pr, issue }, each family's own
// high-water mark, and each list endpoint is floored only by its OWN family.
// `cursorFor(existing, repoKey, family)` is the single read path. Kept as a
// nested map rather than three maps so the shape stays one object per repo.
export function indexExisting(rows) {
  const ids = new Set();
  const cursor = new Map(); // "owner/repo" -> { commit, pr, issue } newest ts per family
  for (const r of rows) {
    ids.add(r.id);
    const m = r.id.match(/^gh:(.+):([^:]+)$/); // gh:owner/repo:suffix
    if (m) {
      const family = idFamily(m[2]);
      if (!family) continue;
      const key = m[1];
      const marks = cursor.get(key) || {};
      if (!marks[family] || r.ts > marks[family]) marks[family] = r.ts;
      cursor.set(key, marks);
    }
  }
  return { ids, cursor };
}

// read one family's high-water mark for a repo (null when never harvested).
// Tolerates the pre-collaboration shape (a bare ts string per repo) so an
// index built by older code still floors the commit fetch correctly.
export function cursorFor(existing, repoKey, family) {
  const marks = existing?.cursor?.get(repoKey);
  if (!marks) return null;
  if (typeof marks === 'string') return family === 'commit' ? marks : null;
  return marks[family] || null;
}

// merge new events into existing rows, dedupe by id, sort ascending by
// (ts, id). Returns { text, appended } — text is the full file, appended is the
// events actually added.
export function buildOutput(existingRows, newEvents, existingIds) {
  const seen = existingIds || new Set(existingRows.map((r) => r.id));
  const appended = [];
  for (const e of newEvents) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    appended.push(e);
  }
  // the log is the pipeline's state/cursor — a NaN ts would silently unsort it, so fail fast
  const tsMs = (id, ts) => {
    const ms = Date.parse(ts);
    if (Number.isNaN(ms)) throw new Error(`invalid ts ${JSON.stringify(ts)} on event ${id} — refusing to sort/write the log`);
    return ms;
  };
  const all = [
    ...existingRows.map((r) => ({ id: r.id, tsMs: tsMs(r.id, r.ts), raw: r.raw })),
    ...appended.map((e) => ({ id: e.id, tsMs: tsMs(e.id, e.ts), raw: jline(e) })),
  ];
  all.sort((a, b) => (a.tsMs - b.tsMs) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const text = all.length ? all.map((r) => r.raw).join('\n') + '\n' : '';
  return { text, appended };
}

// ---------------------------------------------------------------------------
// network adapter — the ONLY thing that touches GitHub. Tests replace it.
// Returns { status, headers (lowercased), body (parsed JSON | null) }.
// ---------------------------------------------------------------------------
export async function fetchJson(url, token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'ai-learning-tree-harvester',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const h = {};
  res.headers.forEach((v, k) => { h[k] = v; });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, headers: h, body };
}

// --- transient-failure retry ------------------------------------------------
// A full backfill makes many hundreds of API calls, so an occasional GitHub 5xx
// or a dropped socket is near-certain. Losing the whole run (and, nightly, a
// whole night) to one momentary hiccup is not acceptable, so ghGet retries a
// narrowly-defined TRANSIENT set. Everything else keeps failing fast, exactly
// as before — in particular a rate-limit 403/429 must NEVER be retried: the
// budget is already gone, so retrying just burns the remainder and delays a
// clear error message.
const RETRY_STATUS = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;      // 1 try + 2 retries
const RETRY_BASE_MS = 500;   // 500ms, then 1000ms — bounded, modest added latency

// injectable so the tests never touch real timers (the suite must stay fast).
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// wrap fetchJson with rate-limit + error handling (docs: abort clearly on 403
// ratelimit rather than silently truncating the harvest) plus a bounded retry
// for transient 5xx / network failures.
async function ghGet(url, token, fetch_, { sleep_ = sleep, log = () => {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    // A network-level throw from fetch_ (DNS failure, socket hangup, ECONNRESET)
    // is retried on the same terms as a 5xx: it is the same class of momentary
    // infrastructure failure, and it is the MORE likely one over a long backfill.
    // The error object is re-thrown unchanged once the attempts run out, so it
    // carries no .status and cannot be mistaken for a soft-failable 404/403/409.
    let res;
    try {
      res = await fetch_(url, token);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
      log(`  … ${err.message} on ${url}, retrying (${attempt + 1}/${MAX_ATTEMPTS}) in ${wait}ms`);
      await sleep_(wait);
      continue;
    }

    const { status, headers = {}, body } = res;
    const remaining = headers['x-ratelimit-remaining'];
    const rateLimited =
      (status === 403 || status === 429) &&
      (remaining === '0' || headers['retry-after'] != null || /rate limit/i.test(body?.message || ''));
    if (rateLimited) {
      const reset = headers['x-ratelimit-reset'];
      const when = headers['retry-after'] != null
        ? `${headers['retry-after']}s`
        : reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown';
      throw new Error(
        `GitHub rate limit hit (resets ${when}). Set HARVEST_TOKEN or GITHUB_TOKEN to raise the limit, or retry later.`,
      );
    }
    if (status === 401) throw new Error('GitHub auth failed (401) — token invalid or lacks scope.');
    if (status === 404) throw new Error(`GitHub 404 for ${url} — owner/repo not found or token cannot see it.`);
    if (status < 200 || status >= 300) {
      // Retry the transient statuses; every other non-2xx is a real error and
      // throws on the first attempt, with the identical message/shape as before.
      if (RETRY_STATUS.has(status) && attempt < MAX_ATTEMPTS) {
        const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
        log(`  … ${status} on ${url}, retrying (${attempt + 1}/${MAX_ATTEMPTS}) in ${wait}ms`);
        await sleep_(wait);
        continue;
      }
      const err = new Error(`GitHub ${status} for ${url}: ${body?.message || 'unexpected response'}`);
      err.status = status; // callers may branch on a non-rate-limit 403 (installation tokens)
      throw err;
    }
    return res;
  }
}

// paginate a list endpoint: urlFor(page) -> full URL. Stops when a page is short
// or empty. Cap at 20 pages (2000 items) — polite and loop-safe.
// `opts` carries the retry seam ({ sleep_, log }) straight through to ghGet.
async function paginate(urlFor, token, fetch_, opts) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { body } = await ghGet(urlFor(page), token, fetch_, opts);
    if (!Array.isArray(body) || body.length === 0) break;
    out.push(...body);
    if (body.length < 100) break;
  }
  return out;
}

// list the owner's repos. With a token we try /user/repos (returns public +
// whatever private the token can see) and filter to the owner. That endpoint
// only works for USER tokens (a PAT): the Actions GITHUB_TOKEN is an
// installation token with no "user" behind it, so GitHub answers 403
// "Resource not accessible by integration" — in that case we fall back to the
// public /users/{owner}/repos, still sending the token for its higher rate
// limit. No token goes straight to the public endpoint. The private-repos
// CONFIG flag gates KEEPING private repos, separately from the token being
// able to SEE them (docs/03 §6).
async function listRepos({ owner, token, fetch_, opts, log = () => {} }) {
  const ownerOnly = (repos) => repos.filter((r) => !r.owner || r.owner.login === owner);
  if (token) {
    try {
      return ownerOnly(await paginate(
        (page) => `${API}/user/repos?per_page=100&affiliation=owner&page=${page}`, token, fetch_, opts,
      ));
    } catch (err) {
      // Only the installation-token 403 falls through to the public list.
      // Rate-limit 403s carry no .status (ghGet throws them specially), and
      // any other 403 (PAT scope/org restriction) is a real auth problem that
      // must abort loudly, not silently degrade to a public-only harvest.
      if (err.status !== 403 || !/not accessible by integration/i.test(err.message)) throw err;
      log(`  /user/repos not accessible with this token (installation token) — falling back to public repo list for ${owner}`);
    }
  }
  return ownerOnly(await paginate(
    (page) => `${API}/users/${owner}/repos?per_page=100&page=${page}`, token, fetch_, opts,
  ));
}

// COMMITS ABORT, they never soft-fail. Commits are the core signal and the log
// IS the cursor: silently degrading a failed commit page to [] would move no
// cursor but would report "no new growth", so the gap would be invisible and
// permanent. A persistent 5xx here (after retries) must stop the run loudly.
async function listCommits({ owner, repo, token, since, fetch_, opts }) {
  const base = `${API}/repos/${owner}/${repo}/commits?per_page=100&author=${encodeURIComponent(owner)}`;
  const sinceQ = since ? `&since=${encodeURIComponent(since)}` : '';
  try {
    return await paginate((page) => `${base}${sinceQ}&page=${page}`, token, fetch_, opts);
  } catch (err) {
    // GitHub answers 409 "Git Repository is empty." for a repo with no commits
    // yet — that's a normal state for a freshly created repo, not an error;
    // one empty repo must never abort the whole night's harvest.
    if (err.status === 409) return [];
    throw err;
  }
}

async function commitDetail({ owner, repo, sha, token, fetch_, opts }) {
  const { body } = await ghGet(`${API}/repos/${owner}/${repo}/commits/${sha}`, token, fetch_, opts);
  return body;
}

// A repo can be missing/archived/disabled/blocked per-endpoint: /pulls and
// /issues answer 404 (gone or invisible), 403 (feature disabled for the repo,
// e.g. issues turned off, or an installation token without that permission) or
// 409 (empty repo) — all of which are normal states for ONE repo and must never
// abort the night's harvest for the other 30. Rate-limit 403s do NOT land here:
// ghGet throws those without a .status, so they still propagate and abort.
// (ghGet turns 404 into a plain Error with no .status, so match on the message.)
//
// A PERSISTENT 5xx (i.e. one that survived ghGet's three attempts) soft-fails
// TOO, and only here. The asymmetry with listCommits is deliberate:
//   - collaboration data is optional ENRICHMENT. Losing one repo's PR list for
//     one night costs a few pr/review/issue events that the next run re-fetches
//     anyway (they are id-deduped, and /pulls has no server-side cursor), so
//     the damage self-heals. Aborting instead would cost the whole night's
//     harvest across every repo — strictly worse.
//   - commits are the CORE signal and set the cursor, so listCommits keeps
//     propagating: a silent gap there would never self-heal.
// This only fires after the retry budget is spent, so a momentary blip is
// already handled upstream and never reaches here.
function softFail(err) {
  if (err.status === 404 || err.status === 403 || err.status === 409) return true;
  if (err.status >= 500 && err.status < 600) return true;
  return err.status === undefined && /^GitHub 404 for /.test(err.message);
}
async function listSoft(urlFor, token, fetch_, opts) {
  try {
    return await paginate(urlFor, token, fetch_, opts);
  } catch (err) {
    if (softFail(err)) {
      if (err.status >= 500) (opts?.log || (() => {}))(`  … ${err.status} persisted after ${MAX_ATTEMPTS} attempts on a collaboration endpoint — skipping it for this run`);
      return [];
    }
    throw err;
  }
}

// PRs authored by the owner. GitHub has no `author=` filter on /pulls, so we
// pull state=all and filter on user.login — a PR someone else opened on your
// repo is their growth event, not yours.
async function listPulls({ owner, repo, token, fetch_, opts }) {
  return listSoft(
    (page) => `${API}/repos/${owner}/${repo}/pulls?state=all&per_page=100&page=${page}`,
    token, fetch_, opts,
  );
}

// Reviews on ONE pull request. Only ever called for PRs we are keeping and that
// are genuinely new to the log — this is the per-PR call, the expensive one.
async function listReviews({ owner, repo, number, token, fetch_, opts }) {
  return listSoft(
    (page) => `${API}/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100&page=${page}`,
    token, fetch_, opts,
  );
}

// Issues. IMPORTANT: this endpoint returns PULL REQUESTS as issues too — every
// PR is an issue in GitHub's data model. Any object carrying a `pull_request`
// key is filtered out by the caller, or PRs would be double-counted as both
// `pr` and `issue`.
// `since` here filters on UPDATED_AT, not created_at (GitHub's semantics). That
// is safe as a floor — anything created after the floor was also updated after
// it — but it is deliberately loose: an old issue that got a comment yesterday
// comes back in the page and is then dropped by the id-dedupe. Correct, not free.
async function listIssues({ owner, repo, token, since, fetch_, opts }) {
  const sinceQ = since ? `&since=${encodeURIComponent(since)}` : '';
  return listSoft(
    (page) => `${API}/repos/${owner}/${repo}/issues?state=all&per_page=100${sinceQ}&page=${page}`,
    token, fetch_, opts,
  );
}

// ---------------------------------------------------------------------------
// orchestrator — testable with an injected fetch_. Returns { events, stats }.
// ---------------------------------------------------------------------------
export async function harvestRepos({ owner, config, token, fetch_, existing, since, onlyRepo, log = () => {}, sleep_ = sleep }) {
  // the retry seam, threaded to every ghGet call site. sleep_ is injectable so
  // the test suite never burns real wall-clock time on backoff.
  const opts = { sleep_, log };
  const includeForks = !!(config.harvest && config.harvest['include-forks']);
  const includePrivate = !!(config.harvest && config.harvest['private-repos']);
  // OPT-IN: three extra list endpoints per repo (plus one per new PR) roughly
  // triples API usage, so absent/false means off — an existing user's nightly
  // harvest must not change cost because they pulled a new version.
  const includeCollab = !!(config.harvest && config.harvest.collaboration);
  const events = [];
  const stats = { repos: 0, skippedForks: [], skippedPrivate: [], commits: 0, prs: 0, reviews: 0, issues: 0 };

  let repos = await listRepos({ owner, token, fetch_, opts, log });
  if (onlyRepo) repos = repos.filter((r) => r.name === onlyRepo.repo);

  for (const repo of repos) {
    if (repo.fork && !includeForks) { stats.skippedForks.push(repo.name); continue; }
    if (repo.private && !includePrivate) { stats.skippedPrivate.push(repo.name); continue; }
    stats.repos++;

    const repoKey = `${owner}/${repo.name}`;
    // --since overrides every family's floor; otherwise each family reads its own.
    const cursor = since || cursorFor(existing, repoKey, 'commit');
    log(`  ${repo.name}${cursor ? ` (since ${cursor})` : ' (full history)'}`);
    const commits = await listCommits({ owner, repo: repo.name, token, since: cursor, fetch_, opts });

    // every event from this repo shares the repo's sector/lang/private flags
    const sector = classify(repo, config);
    const common = { owner, repo: repo.name, sector, lang: repo.language, priv: repo.private };

    for (const c of commits) {
      const id = `gh:${owner}/${repo.name}:${String(c.sha).slice(0, 7)}`;
      if (existing.ids.has(id)) continue; // cursor boundary is inclusive — skip the one we already have
      // per-commit detail is fetched only for genuinely-new commits (the weight
      // heuristic needs the file count). METADATA ONLY: we read files.length and
      // throw the rest — names, patches, message — away.
      const detail = await commitDetail({ owner, repo: repo.name, sha: c.sha, token, fetch_, opts });
      const files = detail && Array.isArray(detail.files) ? detail.files.length : 0;
      const ts = c.commit?.committer?.date || c.commit?.author?.date;
      events.push(commitEvent({ ...common, sha: c.sha, ts, files }));
      stats.commits++;
    }

    if (!includeCollab) continue; // no /pulls, /reviews or /issues call at all

    // --- pull requests + their reviews -------------------------------------
    // /pulls has no server-side `since`, so we always list and filter locally
    // by id-dedupe; the pr cursor exists to bound the per-PR REVIEW fetch.
    const prFloor = since || cursorFor(existing, repoKey, 'pr');
    for (const pr of await listPulls({ owner, repo: repo.name, token, fetch_, opts })) {
      if (pr.user?.login !== owner) continue; // someone else's PR is their growth, not yours
      const ts = pr.created_at;
      if (!ts) continue;
      const prId = `gh:${owner}/${repo.name}:pr${pr.number}`;
      if (!existing.ids.has(prId)) {
        events.push(collabEvent({ ...common, kind: 'pr', number: pr.number, ts }));
        stats.prs++;
      }
      // Reviews: only for PRs that could still hold an unharvested review.
      // The filter MUST be `updated_at`, not `created_at`: a PR opened in
      // February can be reviewed in July, and a created_at filter would skip
      // that PR forever once the cursor passed February. Submitting a review
      // always bumps updated_at, so "updated_at < prFloor" is a sound "nothing
      // new happened here since we last looked". It is deliberately loose in
      // the other direction (a comment edit also bumps updated_at and buys us
      // a wasted call) — false positives cost one request, false negatives
      // would cost a permanently missing event.
      if (prFloor && pr.updated_at && pr.updated_at < prFloor) continue;
      for (const rv of await listReviews({ owner, repo: repo.name, number: pr.number, token, fetch_, opts })) {
        if (rv.user?.login !== owner) continue;
        if (!rv.submitted_at || rv.id == null) continue; // PENDING reviews have no submitted_at
        const rvId = `gh:${owner}/${repo.name}:pr${pr.number}r${rv.id}`;
        if (existing.ids.has(rvId)) continue;
        events.push(collabEvent({ ...common, kind: 'review', number: pr.number, reviewId: rv.id, ts: rv.submitted_at }));
        stats.reviews++;
      }
    }

    // --- issues -------------------------------------------------------------
    // NOTE: /issues returns PRs as issues. Anything with a `pull_request` key is
    // dropped here, or every PR would be counted twice (once `pr`, once `issue`).
    const issueFloor = since || cursorFor(existing, repoKey, 'issue');
    for (const it of await listIssues({ owner, repo: repo.name, token, since: issueFloor, fetch_, opts })) {
      if (it.pull_request) continue;
      if (it.user?.login !== owner) continue;
      if (!it.created_at) continue;
      const id = `gh:${owner}/${repo.name}:i${it.number}`;
      if (existing.ids.has(id)) continue;
      events.push(collabEvent({ ...common, kind: 'issue', number: it.number, ts: it.created_at }));
      stats.issues++;
    }
  }
  return { events, stats };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function has(flag) { return process.argv.includes(flag); }

async function main() {
  const dryRun = has('--dry-run');
  const repoArg = arg('--repo', null);       // owner/name
  const sinceArg = arg('--since', null);      // ISO floor overriding the log cursor

  const configPath = resolve(repoRoot, 'tree.config.yml');
  const logPath = resolve(repoRoot, 'data/growth-log.jsonl');
  const milestonesPath = resolve(repoRoot, 'data/milestones.yml');

  const config = existsSync(configPath) ? parseYaml(readFileSync(configPath, 'utf8')) : {};
  let owner = config.owner || 'webmemo-code';
  let onlyRepo = null;
  if (repoArg) {
    const [o, r] = repoArg.includes('/') ? repoArg.split('/') : [owner, repoArg];
    owner = o; onlyRepo = { owner: o, repo: r };
  }

  const token = process.env.HARVEST_TOKEN || process.env.GITHUB_TOKEN || null;
  const tokenLabel = process.env.HARVEST_TOKEN ? 'HARVEST_TOKEN' : process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'none (public, low rate limit)';

  const existingRows = existsSync(logPath) ? parseLog(readFileSync(logPath, 'utf8')) : [];
  const existing = indexExisting(existingRows);

  console.error(`harvest: owner=${owner} token=${tokenLabel}${onlyRepo ? ` repo=${onlyRepo.repo}` : ''}${sinceArg ? ` since=${sinceArg}` : ''}${dryRun ? ' (dry-run)' : ''}`);

  let commitEvents = [];
  try {
    const { events, stats } = await harvestRepos({
      owner, config, token, fetch_: fetchJson, existing, since: sinceArg, onlyRepo,
      log: (m) => console.error(m),
    });
    commitEvents = events;
    const collab = config.harvest && config.harvest.collaboration
      ? `, ${stats.prs} PR(s), ${stats.reviews} review(s), ${stats.issues} issue(s)` : '';
    console.error(`  scanned ${stats.repos} repo(s); skipped ${stats.skippedForks.length} fork(s), ${stats.skippedPrivate.length} private; ${stats.commits} new commit(s)${collab}`);
  } catch (err) {
    console.error(`harvest: GitHub fetch failed — ${err.message}`);
    console.error('harvest: nothing written. (Offline/no-token runs still work once the API is reachable.)');
    process.exit(1);
  }

  // milestones.yml -> milestone events (hand-authored; merged every run, deduped)
  let msEvents = [];
  if (existsSync(milestonesPath)) {
    msEvents = milestoneEvents(parseMilestones(readFileSync(milestonesPath, 'utf8')));
  }

  const { text, appended } = buildOutput(existingRows, [...commitEvents, ...msEvents], existing.ids);

  if (appended.length === 0) {
    console.error('harvest: no new growth — log already up to date.');
    process.exit(0);
  }

  if (dryRun) {
    console.error(`harvest: would append ${appended.length} event(s) (dry-run, nothing written):`);
    for (const e of appended) process.stdout.write(jline(e) + '\n');
    process.exit(0);
  }

  writeFileSync(logPath, text);
  console.error(`harvest: appended ${appended.length} event(s) -> ${logPath}`);
  process.exit(0);
}

// run only when invoked directly (not when imported by the tests)
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
