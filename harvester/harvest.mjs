#!/usr/bin/env node
// harvest.mjs — the phase-3 GitHub harvester. Turns real repo activity into
// growth events and appends them to data/growth-log.jsonl. The log IS the state:
// there is no cursor file — we read the newest `gh:{owner}/{repo}:*` event
// already in the log and ask GitHub only for commits newer than that.
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

// index existing rows: id set (dedupe) + newest ts per gh repo (the cursor).
export function indexExisting(rows) {
  const ids = new Set();
  const cursor = new Map(); // "owner/repo" -> newest ts string
  for (const r of rows) {
    ids.add(r.id);
    const m = r.id.match(/^gh:([^:]+):/); // gh:owner/repo:sha
    if (m) {
      const key = m[1];
      const prev = cursor.get(key);
      if (!prev || r.ts > prev) cursor.set(key, r.ts);
    }
  }
  return { ids, cursor };
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
  const all = [
    ...existingRows.map((r) => ({ id: r.id, tsMs: Date.parse(r.ts), raw: r.raw })),
    ...appended.map((e) => ({ id: e.id, tsMs: Date.parse(e.ts), raw: jline(e) })),
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

// wrap fetchJson with rate-limit + error handling (docs: abort clearly on 403
// ratelimit rather than silently truncating the harvest).
async function ghGet(url, token, fetch_) {
  const res = await fetch_(url, token);
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
    throw new Error(`GitHub ${status} for ${url}: ${body?.message || 'unexpected response'}`);
  }
  return res;
}

// paginate a list endpoint: urlFor(page) -> full URL. Stops when a page is short
// or empty. Cap at 20 pages (2000 items) — polite and loop-safe.
async function paginate(urlFor, token, fetch_) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { body } = await ghGet(urlFor(page), token, fetch_);
    if (!Array.isArray(body) || body.length === 0) break;
    out.push(...body);
    if (body.length < 100) break;
  }
  return out;
}

// list the owner's repos. With a token we hit /user/repos (returns public +
// whatever private the token can see) and filter to the owner; without a token
// we hit the public /users/{owner}/repos. The private-repos CONFIG flag gates
// keeping them, separately from the token being able to SEE them (docs/03 §6).
async function listRepos({ owner, token, fetch_ }) {
  const urlFor = token
    ? (page) => `${API}/user/repos?per_page=100&affiliation=owner&page=${page}`
    : (page) => `${API}/users/${owner}/repos?per_page=100&page=${page}`;
  const repos = await paginate(urlFor, token, fetch_);
  return repos.filter((r) => !r.owner || r.owner.login === owner);
}

async function listCommits({ owner, repo, token, since, fetch_ }) {
  const base = `${API}/repos/${owner}/${repo}/commits?per_page=100&author=${encodeURIComponent(owner)}`;
  const sinceQ = since ? `&since=${encodeURIComponent(since)}` : '';
  return paginate((page) => `${base}${sinceQ}&page=${page}`, token, fetch_);
}

async function commitDetail({ owner, repo, sha, token, fetch_ }) {
  const { body } = await ghGet(`${API}/repos/${owner}/${repo}/commits/${sha}`, token, fetch_);
  return body;
}

// ---------------------------------------------------------------------------
// orchestrator — testable with an injected fetch_. Returns { events, stats }.
// ---------------------------------------------------------------------------
export async function harvestRepos({ owner, config, token, fetch_, existing, since, onlyRepo, log = () => {} }) {
  const includeForks = !!(config.harvest && config.harvest['include-forks']);
  const includePrivate = !!(config.harvest && config.harvest['private-repos']);
  const events = [];
  const stats = { repos: 0, skippedForks: [], skippedPrivate: [], commits: 0 };

  let repos = await listRepos({ owner, token, fetch_ });
  if (onlyRepo) repos = repos.filter((r) => r.name === onlyRepo.repo);

  for (const repo of repos) {
    if (repo.fork && !includeForks) { stats.skippedForks.push(repo.name); continue; }
    if (repo.private && !includePrivate) { stats.skippedPrivate.push(repo.name); continue; }
    stats.repos++;

    const cursor = since || existing.cursor.get(`${owner}/${repo.name}`) || null;
    log(`  ${repo.name}${cursor ? ` (since ${cursor})` : ' (full history)'}`);
    const commits = await listCommits({ owner, repo: repo.name, token, since: cursor, fetch_ });

    for (const c of commits) {
      const id = `gh:${owner}/${repo.name}:${String(c.sha).slice(0, 7)}`;
      if (existing.ids.has(id)) continue; // cursor boundary is inclusive — skip the one we already have
      // per-commit detail is fetched only for genuinely-new commits (the weight
      // heuristic needs the file count). METADATA ONLY: we read files.length and
      // throw the rest — names, patches, message — away.
      const detail = await commitDetail({ owner, repo: repo.name, sha: c.sha, token, fetch_ });
      const files = detail && Array.isArray(detail.files) ? detail.files.length : 0;
      const ts = c.commit?.committer?.date || c.commit?.author?.date;
      events.push(commitEvent({
        owner, repo: repo.name, sha: c.sha, ts,
        sector: classify(repo, config), lang: repo.language, priv: repo.private, files,
      }));
      stats.commits++;
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
    console.error(`  scanned ${stats.repos} repo(s); skipped ${stats.skippedForks.length} fork(s), ${stats.skippedPrivate.length} private; ${stats.commits} new commit(s)`);
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
