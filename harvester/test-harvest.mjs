#!/usr/bin/env node
// test-harvest.mjs — zero-dep, NO NETWORK. Injects recorded GitHub fixtures
// (harvester/fixtures/) into harvest.mjs's fetchJson seam and asserts the whole
// contract: classification chain order, fork/private skipping, dedupe, the
// cursor-in-log design, weight bounds, milestone merge/dedupe, ts sort, the
// privacy guarantee (no message/path/diff ever escapes into an event), and the
// bounded transient-failure retry (§12 — with an INJECTED sleep, so the suite
// never burns real wall-clock time on backoff).
//
//   node harvester/test-harvest.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  harvestRepos, classify, weightForFiles, parseMilestones, milestoneEvents,
  parseLog, indexExisting, buildOutput, jline, commitEvent,
  weightForCollab, collabEvent, idFamily, cursorFor,
} from './harvest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const fxText = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');

const SUITE_STARTED_AT = Date.now(); // §12 asserts no real backoff timer ever ran
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// --- the fake network: URL -> fixture, recording every requested URL ---------
// opts.installationToken: /user/repos answers the Actions-GITHUB_TOKEN 403
//   ("Resource not accessible by integration"); the public /users/{owner}/repos
//   serves the same fixture minus private repos (as the real endpoint would).
// opts.rateLimited: /user/repos answers a rate-limit 403 (remaining: 0).
// opts.forbidden: /user/repos answers a non-integration hard 403 (e.g. a PAT
//   blocked by org policy) — must abort, never fall back.
// opts.issuesDisabled: /issues answers 404 for topic-repo (issues turned off /
//   invisible to the token) — one bad endpoint must not abort the harvest.
function makeFetch(opts = {}) {
  const calls = [];
  const detailMap = { a: null, b: 'commit-detail-b.json', c: 'commit-detail-c.json', d: 'commit-detail-d.json', e: 'commit-detail-e.json' };
  async function fetch_(url) {
    calls.push(url);
    const reply = (body) => ({ status: 200, headers: { 'x-ratelimit-remaining': '4999' }, body });
    const page1 = /page=1(\b|&|$)/.test(url);

    // --- collaboration endpoints (only ever hit with harvest.collaboration) ---
    const reviews = url.match(/\/repos\/faketree\/([^/]+)\/pulls\/(\d+)\/reviews\?/);
    if (reviews) {
      if (!page1) return reply([]);
      const f = `reviews-${reviews[1]}-${reviews[2]}.json`;
      return reply(existsSync(resolve(__dirname, 'fixtures', f)) ? fx(f) : []);
    }
    const pulls = url.match(/\/repos\/faketree\/([^/]+)\/pulls\?/);
    if (pulls) {
      if (!page1) return reply([]);
      const f = `pulls-${pulls[1]}.json`;
      return reply(existsSync(resolve(__dirname, 'fixtures', f)) ? fx(f) : []);
    }
    const issues = url.match(/\/repos\/faketree\/([^/]+)\/issues\?/);
    if (issues) {
      if (opts.issuesDisabled && issues[1] === 'topic-repo') {
        // GitHub answers 404 when a repo has issues disabled / invisible
        return { status: 404, headers: { 'x-ratelimit-remaining': '4999' }, body: { message: 'Not Found' } };
      }
      if (!page1) return reply([]);
      const f = `issues-${issues[1]}.json`;
      return reply(existsSync(resolve(__dirname, 'fixtures', f)) ? fx(f) : []);
    }

    if (url.includes('/user/repos')) {
      if (opts.rateLimited) {
        return { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1750000000' }, body: { message: 'API rate limit exceeded' } };
      }
      if (opts.installationToken) {
        return { status: 403, headers: { 'x-ratelimit-remaining': '4999' }, body: { message: 'Resource not accessible by integration' } };
      }
      if (opts.forbidden) {
        return { status: 403, headers: { 'x-ratelimit-remaining': '4999' }, body: { message: 'Resource protected by organization SAML enforcement.' } };
      }
      return reply(/page=1(\b|&|$)/.test(url) ? fx('repos.json') : []); // page 2+ empty -> stop
    }
    if (url.includes('/users/faketree/repos')) {
      return reply(/page=1(\b|&|$)/.test(url) ? fx('repos.json').filter((r) => !r.private) : []);
    }
    const detail = url.match(/\/commits\/(.)/); // /commits/{sha}; first char keys the fixture
    if (detail) {
      const key = detail[1];
      return reply(detailMap[key] ? fx(detailMap[key]) : null);
    }
    const list = url.match(/\/repos\/faketree\/([^/]+)\/commits\?/);
    if (list) {
      if (list[1] === 'empty-repo') {
        // a repo with no commits yet: GitHub answers the commits endpoint 409
        return { status: 409, headers: { 'x-ratelimit-remaining': '4999' }, body: { message: 'Git Repository is empty.' } };
      }
      if (!/page=1(\b|&|$)/.test(url)) return reply([]); // page 2+ empty
      const map = {
        'explicit-repo': 'commits-explicit-repo.json', 'topic-repo': 'commits-topic-repo.json',
        'plain-repo': 'commits-plain-repo.json', 'secret-repo': 'commits-secret-repo.json',
      };
      const f = map[list[1]];
      if (!f) throw new Error(`unexpected commit fetch for repo ${list[1]} (should have been skipped)`);
      return reply(fx(f));
    }
    throw new Error(`fixture miss: ${url}`);
  }
  return { fetch_, calls };
}

const config = {
  owner: 'faketree',
  repos: { 'explicit-repo': 'build.pro-code' },
  'topic-map': { comfyui: 'automate.workflows' },
  harvest: { 'include-forks': false, 'private-repos': false },
};

const seedRows = parseLog(fxText('existing-log.jsonl'));
const existing = indexExisting(seedRows);

// ============================================================================
// 1. pure classification chain — explicit map beats topic beats unclassified
// ============================================================================
eq(classify({ name: 'explicit-repo', topics: ['comfyui'] }, config), 'build.pro-code', 'explicit repo mapping wins over topic');
eq(classify({ name: 'topic-repo', topics: ['comfyui'] }, config), 'automate.workflows', 'topic classifies when repo unmapped');
eq(classify({ name: 'plain-repo', topics: [] }, config), 'unclassified', 'unmapped + no topic -> unclassified');

// ============================================================================
// 2. weight heuristic bounds — clamp(0.4 + log2(1+files)*0.5, 0.4, 3.0)
// ============================================================================
eq(weightForFiles(0), 0.4, 'weight lower bound at 0 files');
eq(weightForFiles(1), 0.9, 'weight for 1 file');
eq(weightForFiles(5), 1.69, 'weight for 5 files');
eq(weightForFiles(100000), 3.0, 'weight upper bound clamps at 3.0');

// ============================================================================
// 3. harvest (private-repos OFF): fork skipped, private skipped, owner filtered,
//    cursor honored, classification applied, weight bounds end-to-end.
// ============================================================================
const { fetch_, calls } = makeFetch();
const run1 = await harvestRepos({ owner: 'faketree', config, token: 'faketoken', fetch_, existing });
const byId = Object.fromEntries(run1.events.map((e) => [e.id, e]));

ok(run1.stats.skippedForks.includes('old-fork'), 'fork repo skipped');
ok(!calls.some((u) => u.includes('/old-fork/')), 'fork repo never triggered a commit fetch');
ok(run1.stats.skippedPrivate.includes('secret-repo'), 'private repo skipped without opt-in');
ok(!run1.events.some((e) => e.project === 'secret-repo'), 'no private-repo events without opt-in');
ok(!run1.events.some((e) => e.project === 'not-mine'), "another owner's repo filtered out");

// an EMPTY repo (GitHub 409 "Git Repository is empty." on its commits list)
// yields no events but must not abort the harvest — later repos still scanned.
ok(calls.some((u) => u.includes('/empty-repo/commits')), 'empty repo: commits endpoint was queried');
ok(!run1.events.some((e) => e.project === 'empty-repo'), 'empty repo: no events emitted');
ok(run1.events.length > 0, 'empty repo: harvest continued past the 409 and emitted other events');

// cursor: explicit-repo has a prior event, so its commit list is fetched with since=<cursor>
const explicitList = calls.find((u) => /\/explicit-repo\/commits\?/.test(u));
ok(explicitList && explicitList.includes('since=2025-01-01T00%3A00%3A00Z'), 'cursor: explicit-repo fetched with since=<newest logged ts>');
const plainList = calls.find((u) => /\/plain-repo\/commits\?/.test(u));
ok(plainList && !plainList.includes('since='), 'no cursor for a repo with no prior events (full history)');

// cursor dedupe: the already-logged commit aaaaaaa is not re-emitted, and its
// detail was never fetched (we skip detail for commits we already have).
ok(!byId['gh:faketree/explicit-repo:aaaaaaa'], 'already-logged commit not re-emitted');
ok(!calls.some((u) => u.includes('/commits/aaaaaaa')), 'no detail fetch for an already-logged commit');

// classification + weight of the genuinely-new commits
eq(byId['gh:faketree/explicit-repo:bbbbbbb']?.sector, 'build.pro-code', 'new commit classified via explicit map');
eq(byId['gh:faketree/explicit-repo:bbbbbbb']?.weight, 1.69, 'new commit weight from 5 files');
eq(byId['gh:faketree/topic-repo:ccccccc']?.sector, 'automate.workflows', 'topic-repo commit classified via topic');
eq(byId['gh:faketree/topic-repo:ccccccc']?.weight, 3.0, '100-file commit clamps to weight 3.0');
eq(byId['gh:faketree/plain-repo:ddddddd']?.sector, 'unclassified', 'plain-repo commit unclassified');
eq(byId['gh:faketree/plain-repo:ddddddd']?.weight, 0.4, '0-file commit clamps to weight 0.4');
eq(byId['gh:faketree/explicit-repo:bbbbbbb']?.attrs?.lang, 'TypeScript', 'lang carried from repo primary language');
eq(byId['gh:faketree/explicit-repo:bbbbbbb']?.attrs?.runtime, 'cloud', 'runtime is cloud');
eq(byId['gh:faketree/explicit-repo:bbbbbbb']?.ts, '2025-02-01T12:00:00Z', 'ts is the committer date in UTC Z');

// ============================================================================
// 4. harvest (private-repos ON): private repo now included, private:true
// ============================================================================
const configPriv = { ...config, harvest: { 'include-forks': false, 'private-repos': true } };
const net2 = makeFetch();
const run2 = await harvestRepos({ owner: 'faketree', config: configPriv, token: 'faketoken', fetch_: net2.fetch_, existing });
const secret = run2.events.find((e) => e.project === 'secret-repo');
ok(secret, 'private repo included with private-repos: true');
eq(secret?.private, true, 'private-repo commit carries private: true');
ok(run2.stats.skippedForks.includes('old-fork'), 'fork still skipped even with private opt-in');

// ============================================================================
// 4b. installation token (the Actions GITHUB_TOKEN): /user/repos answers 403
//     "Resource not accessible by integration" -> fall back to the public
//     /users/{owner}/repos and harvest identically (public repos only).
// ============================================================================
const net3 = makeFetch({ installationToken: true });
const run3 = await harvestRepos({ owner: 'faketree', config, token: 'ghs_installation', fetch_: net3.fetch_, existing });
ok(net3.calls.some((u) => u.includes('/user/repos')), 'installation token: /user/repos attempted first');
ok(net3.calls.some((u) => u.includes('/users/faketree/repos')), 'installation token: fell back to public /users/{owner}/repos after 403');
eq(
  run3.events.map((e) => e.id).sort(),
  run1.events.map((e) => e.id).sort(),
  'installation token: fallback harvests the same (public) events as a PAT run',
);

// a rate-limit 403 must NOT be mistaken for the installation-token 403 — it
// aborts the harvest instead of silently degrading to the public list.
const net4 = makeFetch({ rateLimited: true });
let rateLimitErr = null;
try {
  await harvestRepos({ owner: 'faketree', config, token: 'faketoken', fetch_: net4.fetch_, existing });
} catch (err) { rateLimitErr = err; }
ok(rateLimitErr && /rate limit/i.test(rateLimitErr.message), 'rate-limit 403 still aborts the harvest');
ok(!net4.calls.some((u) => u.includes('/users/faketree/repos')), 'rate-limit 403 does not fall back to the public list');

// ...and neither is any OTHER hard 403 (PAT scope / org restriction): that's a
// real auth problem, so it aborts instead of degrading to a public-only harvest.
const net5 = makeFetch({ forbidden: true });
let forbiddenErr = null;
try {
  await harvestRepos({ owner: 'faketree', config, token: 'faketoken', fetch_: net5.fetch_, existing });
} catch (err) { forbiddenErr = err; }
ok(forbiddenErr && /GitHub 403/.test(forbiddenErr.message), 'non-integration hard 403 still aborts the harvest');
ok(!net5.calls.some((u) => u.includes('/users/faketree/repos')), 'non-integration hard 403 does not fall back to the public list');

// ============================================================================
// 5. milestone merge + dedupe (dedup key = ts+sector+level, per data/README.md)
// ============================================================================
const ms = milestoneEvents(parseMilestones(fxText('milestones.yml')));
eq(ms.map((m) => m.id), ['manual:2025-06-01-build.pro-code-l2', 'manual:2025-07-01-distribute.seo-l3'], 'milestone ids encode ts+sector+level');
eq(ms[0].kind, 'milestone', 'milestone kind');
eq(ms[1].attrs, { level: 3, note: 'new milestone — should be appended once' }, 'milestone attrs level/note (evidence optional)');

// ============================================================================
// 6. full merge/dedupe/sort through buildOutput, then privacy scan
// ============================================================================
const allNew = [...run1.events, ...ms];
const out1 = buildOutput(seedRows, allNew, new Set(seedRows.map((r) => r.id)));

// milestone already in the seed log (edited note) must NOT be re-appended
ok(!out1.appended.some((e) => e.id === 'manual:2025-06-01-build.pro-code-l2'), 'milestone dedupe: existing ts+sector+level not re-added');
ok(out1.appended.some((e) => e.id === 'manual:2025-07-01-distribute.seo-l3'), 'new milestone appended once');

// ts sort ascending + stable
const outRows = parseLog(out1.text);
let sorted = true;
for (let i = 1; i < outRows.length; i++) if (Date.parse(outRows[i].ts) < Date.parse(outRows[i - 1].ts)) sorted = false;
ok(sorted, 'output is sorted ascending by ts');

// idempotence: running again over the produced log appends nothing
const out2 = buildOutput(parseLog(out1.text), allNew, null);
eq(out2.appended.length, 0, 'dedupe: a second run appends nothing');
eq(out2.text, out1.text, 'dedupe: a second run leaves the file byte-identical');

// existing lines preserved byte-for-byte (append-only in spirit)
for (const r of seedRows) ok(out1.text.includes(r.raw), `existing line preserved verbatim: ${r.id}`);

// ============================================================================
// 7. PRIVACY — no message / path / diff / patch ever escapes into an event
// ============================================================================
const ALLOWED_TOP = new Set(['id', 'ts', 'source', 'kind', 'sector', 'project', 'weight', 'attrs', 'private']);
const ALLOWED_ATTR = new Set(['runtime', 'lang', 'level', 'evidence', 'note', 'tags', 'title', 'url']);
const FORBIDDEN_KEYS = ['message', 'files', 'file', 'path', 'filename', 'diff', 'patch', 'stats', 'sha', 'body', 'commit'];

for (const e of allNew) {
  for (const k of Object.keys(e)) ok(ALLOWED_TOP.has(k), `event ${e.id}: unexpected top-level key "${k}"`);
  for (const k of Object.keys(e.attrs || {})) ok(ALLOWED_ATTR.has(k), `event ${e.id}: unexpected attrs key "${k}"`);
  const blob = jline(e);
  // match key form ("foo":) so we don't trip over the legit value "kind": "commit"
  for (const bad of FORBIDDEN_KEYS) ok(!blob.includes(`"${bad}":`), `event ${e.id}: forbidden key "${bad}" present`);
  // the fixtures stuffed "SECRET …" into every commit message + file patch —
  // none of that text may survive into an emitted event.
  ok(!/SECRET/.test(blob), `event ${e.id}: commit-message/diff text leaked`);
  ok(!/private-path|secret\//.test(blob), `event ${e.id}: file path leaked`);
}
// and the same scan over the entire produced log file
ok(!/SECRET/.test(out1.text), 'no commit-message/diff text anywhere in the produced log');

// ============================================================================
// 8. sanity: commitEvent shape matches the §2 schema key order on disk
// ============================================================================
const sample = commitEvent({ owner: 'faketree', repo: 'r', sha: 'abcdef01234', ts: '2025-01-02T03:04:05Z', sector: 'build.pro-code', lang: 'Go', priv: false, files: 2 });
eq(jline(sample),
  '{"id": "gh:faketree/r:abcdef0", "ts": "2025-01-02T03:04:05Z", "source": "github", "kind": "commit", "sector": "build.pro-code", "project": "r", "weight": 1.19, "attrs": {"runtime": "cloud", "lang": "Go"}, "private": false}',
  'commitEvent serialises to the on-disk §2 line shape');

// ============================================================================
// 9. collaboration events (kind: pr | review | issue) — OPT-IN via
//    harvest.collaboration. The commit/PR/review/issue mix is the point.
// ============================================================================

// --- 9a. the flag is off by default: no events, and NO calls to the endpoints
for (const [label, cfg] of [
  ['absent', config],
  ['explicitly false', { ...config, harvest: { ...config.harvest, collaboration: false } }],
]) {
  const net = makeFetch();
  const run = await harvestRepos({ owner: 'faketree', config: cfg, token: 't', fetch_: net.fetch_, existing });
  ok(!run.events.some((e) => ['pr', 'review', 'issue'].includes(e.kind)), `collaboration ${label}: no pr/review/issue events`);
  ok(!net.calls.some((u) => /\/pulls[?/]/.test(u)), `collaboration ${label}: /pulls never called`);
  ok(!net.calls.some((u) => /\/issues\?/.test(u)), `collaboration ${label}: /issues never called`);
  ok(!net.calls.some((u) => /\/reviews\?/.test(u)), `collaboration ${label}: /reviews never called`);
  eq(run.events.map((e) => e.id).sort(), run1.events.map((e) => e.id).sort(), `collaboration ${label}: identical to a commits-only harvest`);
}

// --- 9b. the flag on: pr/review/issue events with correct ids/kinds/ts/weight
const configCollab = { ...config, harvest: { ...config.harvest, collaboration: true } };
const netC = makeFetch();
const runC = await harvestRepos({ owner: 'faketree', config: configCollab, token: 't', fetch_: netC.fetch_, existing });
const cById = Object.fromEntries(runC.events.map((e) => [e.id, e]));

eq(cById['gh:faketree/explicit-repo:pr7']?.kind, 'pr', 'PR event emitted with kind pr');
eq(cById['gh:faketree/explicit-repo:pr7']?.ts, '2025-02-10T09:30:00Z', 'PR ts is created_at in UTC Z');
eq(cById['gh:faketree/explicit-repo:pr7']?.weight, 1.5, 'PR weight 1.5');
eq(cById['gh:faketree/explicit-repo:pr7']?.sector, 'build.pro-code', 'PR classified by the same repo->sector chain');
eq(cById['gh:faketree/explicit-repo:pr7']?.project, 'explicit-repo', 'PR project is the repo');
eq(cById['gh:faketree/explicit-repo:pr7']?.private, false, 'public-repo PR is private:false');
eq(cById['gh:faketree/explicit-repo:pr7']?.attrs, { runtime: 'cloud', lang: 'TypeScript' }, 'PR attrs carry runtime + repo lang only');
ok(cById['gh:faketree/explicit-repo:pr8'], 'second owner PR emitted');

eq(cById['gh:faketree/explicit-repo:pr7r555001']?.kind, 'review', 'review event emitted with kind review');
eq(cById['gh:faketree/explicit-repo:pr7r555001']?.ts, '2025-02-11T08:00:00Z', 'review ts is submitted_at');
eq(cById['gh:faketree/explicit-repo:pr7r555001']?.weight, 1.0, 'review weight 1.0');
ok(!cById['gh:faketree/explicit-repo:pr7r555003'], 'PENDING review (no submitted_at) not emitted');

eq(cById['gh:faketree/explicit-repo:i12']?.kind, 'issue', 'issue event emitted with kind issue');
eq(cById['gh:faketree/explicit-repo:i12']?.ts, '2025-02-15T11:00:00Z', 'issue ts is created_at');
eq(cById['gh:faketree/explicit-repo:i12']?.weight, 0.6, 'issue weight 0.6');
eq(cById['gh:faketree/explicit-repo:i12']?.source, 'github', 'issue source is github');

ok(cById['gh:faketree/explicit-repo:pr10'], 'third owner PR emitted');
eq(cById['gh:faketree/explicit-repo:pr10r555010']?.ts, '2025-07-15T08:00:00Z', 'a review submitted long after the PR opened is emitted at its own submitted_at');

eq(runC.stats.prs, 3, 'stats.prs counts only the owner PRs');
eq(runC.stats.reviews, 2, 'stats.reviews counts only the owner submitted reviews');
eq(runC.stats.issues, 1, 'stats.issues counts only real owner issues');

// the `pull_request` key filter — PR #7 also comes back from /issues, and must
// NOT become a second event as gh:…:i7
ok(!cById['gh:faketree/explicit-repo:i7'], 'issue carrying a pull_request key is NOT double-counted as an issue');
eq(runC.events.filter((e) => /:(pr7|i7)$/.test(e.id)).length, 1, 'PR #7 produced exactly one event, not two');

// authorship filter — another user's PR / review / issue is never yours
ok(!cById['gh:faketree/explicit-repo:pr9'], "another user's PR excluded");
ok(!cById['gh:faketree/explicit-repo:pr7r555002'], "another user's review on your PR excluded");
ok(!cById['gh:faketree/explicit-repo:i13'], "another user's issue excluded");

// commits still harvested identically alongside the new kinds
ok(cById['gh:faketree/explicit-repo:bbbbbbb'], 'commits still emitted when collaboration is on');
eq(runC.stats.commits, run1.stats.commits, 'collaboration does not change the commit count');

// private flag mirrors the repo, and the private-repos gate still applies first
ok(!runC.events.some((e) => e.project === 'secret-repo'), 'no private-repo collaboration events without the private opt-in');
ok(!netC.calls.some((u) => u.includes('/secret-repo/pulls')), 'private repo: /pulls not even called without the opt-in');
const netCp = makeFetch();
const configCollabPriv = { ...config, harvest: { 'include-forks': false, 'private-repos': true, collaboration: true } };
const runCp = await harvestRepos({ owner: 'faketree', config: configCollabPriv, token: 't', fetch_: netCp.fetch_, existing });
const privPr = runCp.events.find((e) => e.id === 'gh:faketree/secret-repo:pr3');
const privIssue = runCp.events.find((e) => e.id === 'gh:faketree/secret-repo:i4');
eq(privPr?.private, true, 'private-repo PR carries private: true');
eq(privIssue?.private, true, 'private-repo issue carries private: true');
eq(privPr?.weight, 1.5, 'private-repo PR keeps the pr weight');

// --- 9c. a soft-failing endpoint (404) on one repo must not abort the harvest
const netD = makeFetch({ issuesDisabled: true });
const runD = await harvestRepos({ owner: 'faketree', config: configCollab, token: 't', fetch_: netD.fetch_, existing });
ok(netD.calls.some((u) => u.includes('/topic-repo/issues')), 'issues-disabled repo: endpoint was still attempted');
ok(runD.events.some((e) => e.id === 'gh:faketree/explicit-repo:i12'), 'issues 404 on one repo did not abort the others');
eq(runD.events.map((e) => e.id).sort(), runC.events.map((e) => e.id).sort(), 'issues 404 degrades to zero issues for that repo only');

// --- 9d. pure helpers: weight clamp, id shapes, family classification -------
eq(weightForCollab('pr'), 1.5, 'weightForCollab pr');
eq(weightForCollab('review'), 1.0, 'weightForCollab review');
eq(weightForCollab('issue'), 0.6, 'weightForCollab issue');
eq(weightForCollab('nonsense'), 0.4, 'weightForCollab unknown kind clamps to the 0.4 floor');
for (const k of ['pr', 'review', 'issue', 'nonsense']) {
  const w = weightForCollab(k);
  ok(w >= 0.4 && w <= 3.0, `weightForCollab ${k} stays inside the 0.4..3.0 clamp`);
  eq(Math.round(w * 100) / 100, w, `weightForCollab ${k} is rounded to 2 decimals`);
}

eq(collabEvent({ owner: 'faketree', repo: 'r', kind: 'pr', number: 3, ts: '2025-01-02T03:04:05Z', sector: 'build.pro-code', lang: 'Go' }).id,
  'gh:faketree/r:pr3', 'PR id shape gh:owner/repo:pr{n}');
eq(collabEvent({ owner: 'faketree', repo: 'r', kind: 'review', number: 3, reviewId: 99, ts: '2025-01-02T03:04:05Z', sector: 's' }).id,
  'gh:faketree/r:pr3r99', 'review id shape gh:owner/repo:pr{n}r{reviewId}');
eq(collabEvent({ owner: 'faketree', repo: 'r', kind: 'issue', number: 3, ts: '2025-01-02T03:04:05Z', sector: 's' }).id,
  'gh:faketree/r:i3', 'issue id shape gh:owner/repo:i{n}');
eq(jline(collabEvent({ owner: 'faketree', repo: 'r', kind: 'pr', number: 3, ts: '2025-01-02T03:04:05Z', sector: 'build.pro-code', lang: 'Go', priv: false })),
  '{"id": "gh:faketree/r:pr3", "ts": "2025-01-02T03:04:05Z", "source": "github", "kind": "pr", "sector": "build.pro-code", "project": "r", "weight": 1.5, "attrs": {"runtime": "cloud", "lang": "Go"}, "private": false}',
  'collabEvent serialises to the same §2 line shape, same 9 keys in the same order');
// review's 1.0 serialises as `1` — JS has no int/float split and jline is
// JSON.stringify. This matches the log's pre-existing shape (weightForFiles's
// 3.0 clamp already writes `"weight": 3`), and such a line round-trips
// byte-identically, so the append-only guarantee is untouched.
const rvLine = jline(collabEvent({ owner: 'o', repo: 'r', kind: 'review', number: 1, reviewId: 2, ts: '2025-01-01T00:00:00Z', sector: 's' }));
ok(rvLine.includes('"weight": 1,'), 'review weight serialises as 1 (JSON has no 1.0), matching the log\'s existing integer weights');
eq(jline(JSON.parse(rvLine)), rvLine, 'an integer weight round-trips byte-identically — append-only holds');
eq(jline(JSON.parse(jline(commitEvent({ owner: 'o', repo: 'r', sha: 'abcdef0', ts: '2025-01-01T00:00:00Z', sector: 's', files: 100000 })))),
  jline(commitEvent({ owner: 'o', repo: 'r', sha: 'abcdef0', ts: '2025-01-01T00:00:00Z', sector: 's', files: 100000 })),
  'the pre-existing 3.0 commit clamp round-trips the same way');

eq(Object.keys(collabEvent({ owner: 'o', repo: 'r', kind: 'pr', number: 1, ts: '2025-01-01T00:00:00Z', sector: 's' })),
  Object.keys(commitEvent({ owner: 'o', repo: 'r', sha: 'abcdef0', ts: '2025-01-01T00:00:00Z', sector: 's', files: 1 })),
  'collabEvent and commitEvent share the exact same top-level key order');

// ids never collide with a commit sha7: `p`, `r` and `i` are not hex digits, so
// no collaboration suffix can ever BE a 7-hex sha, in either direction.
eq(idFamily('abcdef0'), 'commit', 'idFamily: 7-hex suffix is a commit');
eq(idFamily('pr7'), 'pr', 'idFamily: pr{n} is the pr family');
eq(idFamily('pr7r555001'), 'pr', 'idFamily: a review folds into the pr family (no list cursor of its own)');
eq(idFamily('i12'), 'issue', 'idFamily: i{n} is the issue family');
eq(idFamily('deadbee'), 'commit', 'idFamily: an all-hex word is still a commit');
eq(idFamily('whatever'), null, 'idFamily: an unknown suffix moves no cursor');
for (const s of ['pr7', 'pr7r1', 'i12']) ok(!/^[0-9a-f]{7}$/.test(s), `collaboration suffix ${s} can never look like a sha7`);
for (const s of ['abcdef0', '1234567', 'deadbee']) ok(idFamily(s) === 'commit' && !/^(pr|i)\d/.test(s), `sha7 ${s} can never look like a collaboration suffix`);

// ============================================================================
// 10. CURSOR CORRECTNESS — the subtle one. Per-FAMILY high-water marks.
//     A repo whose NEWEST logged event is a PR must still fetch commits from
//     the newest logged COMMIT, or every commit in between is lost forever.
// ============================================================================
const mixedLog = [
  '{"id": "gh:faketree/explicit-repo:aaaaaaa", "ts": "2025-01-01T00:00:00Z", "source": "github", "kind": "commit", "sector": "build.pro-code", "project": "explicit-repo", "weight": 1.0, "attrs": {"runtime": "cloud", "lang": "TypeScript"}, "private": false}',
  // …and a MUCH newer PR on the same repo. Naive "newest ts per repo" would
  // floor the commit fetch at June and swallow February–June commits.
  '{"id": "gh:faketree/explicit-repo:pr7", "ts": "2025-06-30T00:00:00Z", "source": "github", "kind": "pr", "sector": "build.pro-code", "project": "explicit-repo", "weight": 1.5, "attrs": {"runtime": "cloud", "lang": "TypeScript"}, "private": false}',
  '{"id": "gh:faketree/explicit-repo:i12", "ts": "2025-05-05T00:00:00Z", "source": "github", "kind": "issue", "sector": "build.pro-code", "project": "explicit-repo", "weight": 0.6, "attrs": {"runtime": "cloud", "lang": "TypeScript"}, "private": false}',
].join('\n') + '\n';
const mixedRows = parseLog(mixedLog);
const mixed = indexExisting(mixedRows);

eq(cursorFor(mixed, 'faketree/explicit-repo', 'commit'), '2025-01-01T00:00:00Z', 'commit cursor reads the newest COMMIT, not the newer PR');
eq(cursorFor(mixed, 'faketree/explicit-repo', 'pr'), '2025-06-30T00:00:00Z', 'pr cursor reads the newest PR');
eq(cursorFor(mixed, 'faketree/explicit-repo', 'issue'), '2025-05-05T00:00:00Z', 'issue cursor reads the newest ISSUE');
eq(cursorFor(mixed, 'faketree/never-seen', 'commit'), null, 'no cursor for a repo with no prior events');
// backward compatibility with the pre-collaboration index shape (bare ts string)
const legacy = { cursor: new Map([['faketree/explicit-repo', '2025-01-01T00:00:00Z']]) };
eq(cursorFor(legacy, 'faketree/explicit-repo', 'commit'), '2025-01-01T00:00:00Z', 'legacy string cursor still floors the commit fetch');
eq(cursorFor(legacy, 'faketree/explicit-repo', 'pr'), null, 'legacy string cursor claims nothing about the pr family');

// …and end-to-end: the commit list URL must carry since=<the January COMMIT ts>
const netE = makeFetch();
const runE = await harvestRepos({ owner: 'faketree', config: configCollab, token: 't', fetch_: netE.fetch_, existing: mixed });
const mixedCommitList = netE.calls.find((u) => /\/explicit-repo\/commits\?/.test(u));
ok(mixedCommitList && mixedCommitList.includes('since=2025-01-01T00%3A00%3A00Z'),
  'cursor: newest event is a PR, yet commits are still fetched since the newest COMMIT');
ok(!mixedCommitList.includes('2025-06-30'), 'cursor: the PR ts never leaks into the commit since= floor');
ok(runE.events.some((e) => e.id === 'gh:faketree/explicit-repo:bbbbbbb'),
  'cursor: the February commit that sits BEHIND the June PR is still harvested');
const mixedIssueList = netE.calls.find((u) => /\/explicit-repo\/issues\?/.test(u));
ok(mixedIssueList && mixedIssueList.includes('since=2025-05-05T00%3A00%3A00Z'), 'cursor: issues floored by the issue family only');
// the already-logged pr7/i12 are not re-emitted
ok(!runE.events.some((e) => e.id === 'gh:faketree/explicit-repo:pr7'), 'already-logged PR not re-emitted');
ok(!runE.events.some((e) => e.id === 'gh:faketree/explicit-repo:i12'), 'already-logged issue not re-emitted');
// The per-PR review call is gated on updated_at, NOT created_at. pr10 was
// OPENED in February — behind the June cursor — but was reviewed in July, so it
// must still be polled, or that review would be lost forever.
ok(netE.calls.some((u) => u.includes('/pulls/10/reviews')), 'reviews still fetched for an OLD PR whose updated_at is past the pr cursor');
ok(runE.events.some((e) => e.id === 'gh:faketree/explicit-repo:pr10r555010'), 'a late review on an old PR is harvested, not skipped by the cursor');
// …while pr7/pr8, untouched since before the pr high-water mark, cost no
// per-PR review call at all.
ok(!netE.calls.some((u) => u.includes('/pulls/7/reviews')), 'no per-PR review call for a PR untouched since before the pr cursor');
ok(!netE.calls.some((u) => u.includes('/pulls/8/reviews')), 'no per-PR review call for a second untouched PR');

// …and the updated_at gate above is only REACHABLE if the PR is on a page we
// actually fetched. paginate() caps at 20 pages (2000 PRs); under GitHub's
// default ordering an old-but-recently-reviewed PR sits deep in the list and
// would fall past that cap in a high-PR repo, silently losing its late reviews.
// Sorting by update recency puts exactly those PRs on the first pages. This
// assertion guards the pairing — the gate and the sort are one mechanism.
const pullsListCalls = netE.calls.filter((u) => /\/pulls\?/.test(u));
ok(pullsListCalls.length > 0, 'sanity: the /pulls list endpoint was called');
ok(pullsListCalls.every((u) => u.includes('sort=updated') && u.includes('direction=desc')),
  '/pulls is fetched sorted by update recency, so late reviews on old PRs stay inside the page cap');

// --since overrides every family's floor, as before
const netF = makeFetch();
await harvestRepos({ owner: 'faketree', config: configCollab, token: 't', fetch_: netF.fetch_, existing: mixed, since: '2020-01-01T00:00:00Z' });
const forcedCommits = netF.calls.find((u) => /\/explicit-repo\/commits\?/.test(u));
const forcedIssues = netF.calls.find((u) => /\/explicit-repo\/issues\?/.test(u));
ok(forcedCommits.includes('since=2020-01-01T00%3A00%3A00Z'), '--since overrides the commit family floor');
ok(forcedIssues.includes('since=2020-01-01T00%3A00%3A00Z'), '--since overrides the issue family floor');

// ============================================================================
// 11. dedupe / idempotence + PRIVACY for the new kinds
// ============================================================================
const collabOut1 = buildOutput(seedRows, runC.events, new Set(seedRows.map((r) => r.id)));
ok(collabOut1.appended.some((e) => e.id === 'gh:faketree/explicit-repo:pr7'), 'collaboration: PR appended on the first run');
ok(collabOut1.appended.some((e) => e.id === 'gh:faketree/explicit-repo:pr7r555001'), 'collaboration: review appended on the first run');
ok(collabOut1.appended.some((e) => e.id === 'gh:faketree/explicit-repo:i12'), 'collaboration: issue appended on the first run');
const collabOut2 = buildOutput(parseLog(collabOut1.text), runC.events, null);
eq(collabOut2.appended.length, 0, 'collaboration dedupe: a second run appends nothing');
eq(collabOut2.text, collabOut1.text, 'collaboration dedupe: a second run leaves the file byte-identical');
// re-running the harvester against the produced log emits the events again as
// candidates? No — indexExisting sees them, so harvestRepos itself emits none.
const netG = makeFetch();
const runG = await harvestRepos({ owner: 'faketree', config: configCollab, token: 't', fetch_: netG.fetch_, existing: indexExisting(parseLog(collabOut1.text)) });
ok(!runG.events.some((e) => ['pr', 'review', 'issue'].includes(e.kind)), 'collaboration idempotence: a second harvest emits no already-logged pr/review/issue');

// the §7 privacy scan, extended over every collaboration event. The fixtures
// stuffed "SECRET …" into every PR/issue title AND body, plus review bodies,
// branch names and label names — none of it may survive into an event.
for (const e of runCp.events) {
  for (const k of Object.keys(e)) ok(ALLOWED_TOP.has(k), `collab event ${e.id}: unexpected top-level key "${k}"`);
  for (const k of Object.keys(e.attrs || {})) ok(ALLOWED_ATTR.has(k), `collab event ${e.id}: unexpected attrs key "${k}"`);
  const blob = jline(e);
  for (const bad of [...FORBIDDEN_KEYS, 'title', 'pull_request', 'user', 'login', 'state', 'labels', 'number', 'head', 'ref']) {
    ok(!blob.includes(`"${bad}":`), `collab event ${e.id}: forbidden key "${bad}" present`);
  }
  ok(!/SECRET/.test(blob), `collab event ${e.id}: PR/issue/review title or body text leaked`);
  ok(!/private-path|secret\/|SECRET-branch|SECRET-label/.test(blob), `collab event ${e.id}: path/branch/label text leaked`);
}
ok(!/SECRET/.test(collabOut1.text), 'no PR/issue/review text anywhere in the produced collaboration log');
// belt and braces: scan the raw fixture text to prove the SECRETs were really there
ok(/SECRET/.test(fxText('pulls-explicit-repo.json')), 'sanity: the PR fixture really does contain SECRET text to leak');
ok(/SECRET/.test(fxText('issues-explicit-repo.json')), 'sanity: the issue fixture really does contain SECRET text to leak');
ok(/SECRET/.test(fxText('reviews-explicit-repo-7.json')), 'sanity: the review fixture really does contain SECRET text to leak');

// ============================================================================
// 12. TRANSIENT-FAILURE RETRY — a single GitHub 502 must not lose the run.
//     A full backfill makes hundreds of calls, so an occasional 5xx is
//     near-certain; the whole night's harvest must survive one.
//     NO REAL TIMERS: sleep_ is injected and merely records its delays.
// ============================================================================

// wrap a fake network so that URLs matching `pattern` fail `failTimes` times
// (or always, when failTimes is Infinity) before being served normally.
// Counts attempts PER URL so "bounded at 3" is directly assertable.
function withFailures(net, { pattern, failTimes, reply }) {
  const attempts = new Map();
  const inner = net.fetch_;
  async function fetch_(url, token) {
    if (pattern.test(url)) {
      const n = (attempts.get(url) || 0) + 1;
      attempts.set(url, n);
      if (n <= failTimes) return reply(url);
    }
    return inner(url, token);
  }
  return { fetch_, calls: net.calls, attempts };
}
const http = (status, message) => () => ({ status, headers: { 'x-ratelimit-remaining': '4999' }, body: { message } });
// a recording fake sleep: never actually waits, just logs the requested delays.
function fakeSleep() {
  const delays = [];
  return { sleep_: async (ms) => { delays.push(ms); }, delays };
}

// --- 12a. a 502 that succeeds on retry -> harvest completes, same events -----
{
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: 1, reply: http(502, 'Server Error'),
  });
  const sl = fakeSleep();
  const logs = [];
  const run = await harvestRepos({
    owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing,
    sleep_: sl.sleep_, log: (m) => logs.push(m),
  });
  eq(run.events.map((e) => e.id).sort(), run1.events.map((e) => e.id).sort(),
    'retry: a 502 that succeeds on attempt 2 yields exactly the same events as a clean run');
  eq(run.stats.commits, run1.stats.commits, 'retry: commit count unaffected by a transient 502');
  const failedUrl = [...net.attempts.keys()][0];
  eq(net.attempts.get(failedUrl), 2, 'retry: the 502 URL was attempted exactly twice (failed once, then succeeded)');
  eq(sl.delays, [500], 'retry: injected sleep called once with the 500ms base backoff — no real timer');
  ok(logs.some((m) => /502 on .*retrying \(2\/3\) in 500ms/.test(m)), 'retry: the retry is logged in the existing two-space style');
}

// --- 12b. every transient status retries, and each is bounded at 3 attempts --
for (const status of [500, 502, 503, 504]) {
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: 2, reply: http(status, 'Server Error'),
  });
  const sl = fakeSleep();
  const run = await harvestRepos({
    owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_,
  });
  ok(run.events.some((e) => e.id === 'gh:faketree/explicit-repo:bbbbbbb'),
    `retry: ${status} twice then success still harvests the repo`);
  eq(sl.delays, [500, 1000], `retry: ${status} backoff is exponential 500ms then 1000ms`);
}

// --- 12c. retry count is BOUNDED: a permanent 5xx stops at exactly 3 ---------
// On the COMMITS path a persistent 5xx must still ABORT: commits are the core
// signal and the log IS the cursor, so silently degrading to [] would report
// "no new growth" and leave a permanent, invisible hole.
{
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: Infinity, reply: http(502, 'Server Error'),
  });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /GitHub 502 for /.test(err.message), 'retry: a persistent 502 on COMMITS aborts with the same error shape as before');
  eq(err?.status, 502, 'retry: the thrown error still carries .status for callers that branch on it');
  const failedUrl = [...net.attempts.keys()][0];
  eq(net.attempts.get(failedUrl), 3, 'retry: BOUNDED — exactly 3 attempts, never a 4th');
  eq(sl.delays, [500, 1000], 'retry: exactly two backoffs before giving up');
}

// --- 12d. a persistent 5xx on a COLLABORATION endpoint soft-fails to [] ------
// Collaboration data is optional enrichment: losing one repo's PR list for one
// night is far better than losing the whole night, and the next run re-fetches
// it anyway (/pulls has no server-side cursor, and ids are deduped).
{
  const net = withFailures(makeFetch(), {
    pattern: /\/topic-repo\/issues\?/, failTimes: Infinity, reply: http(503, 'Service Unavailable'),
  });
  const sl = fakeSleep();
  const logs = [];
  const run = await harvestRepos({
    owner: 'faketree', config: configCollab, token: 't', fetch_: net.fetch_, existing,
    sleep_: sl.sleep_, log: (m) => logs.push(m),
  });
  eq(run.events.map((e) => e.id).sort(), runC.events.map((e) => e.id).sort(),
    'retry: a persistent 503 on ONE collaboration endpoint degrades to [] for that endpoint only, harvest completes');
  const failedUrl = [...net.attempts.keys()][0];
  eq(net.attempts.get(failedUrl), 3, 'retry: the soft-failing collaboration endpoint was also bounded at 3 attempts');
  ok(logs.some((m) => /503 persisted after 3 attempts/.test(m)), 'retry: the soft-failed collaboration endpoint is logged, not silent');
  ok(run.events.some((e) => e.id === 'gh:faketree/explicit-repo:i12'), 'retry: other repos’ issues still harvested past the persistent 503');
}
// …and the same for /pulls, which also loses that repo's reviews but nothing else.
{
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/pulls\?/, failTimes: Infinity, reply: http(500, 'Server Error'),
  });
  const run = await harvestRepos({
    owner: 'faketree', config: configCollab, token: 't', fetch_: net.fetch_, existing, sleep_: fakeSleep().sleep_,
  });
  ok(!run.events.some((e) => e.kind === 'pr' && e.project === 'explicit-repo'), 'retry: persistent 500 on /pulls yields no PR events for that repo');
  ok(run.events.some((e) => e.id === 'gh:faketree/explicit-repo:bbbbbbb'), 'retry: …but that repo’s COMMITS are still harvested');
  ok(run.events.some((e) => e.id === 'gh:faketree/explicit-repo:i12'), 'retry: …and its issues too — only /pulls degraded');
}

// --- 12e. REGRESSION GUARD: a rate-limit 403 is NEVER retried ---------------
// Retrying would burn the remaining budget and delay a clear error. Exactly one
// attempt, and it still aborts.
{
  const net = makeFetch({ rateLimited: true });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /rate limit/i.test(err.message), 'retry: rate-limit 403 still aborts the harvest');
  eq(net.calls.filter((u) => u.includes('/user/repos')).length, 1, 'retry: rate-limit 403 attempted EXACTLY once — never retried');
  eq(sl.delays, [], 'retry: rate-limit 403 triggers no backoff sleep at all');
  ok(!net.calls.some((u) => u.includes('/users/faketree/repos')), 'retry: rate-limit 403 still does not fall back to the public list');
}
// a 429 with retry-after is the same story — rate limiting, not a transient blip
{
  const net = withFailures(makeFetch(), {
    pattern: /\/user\/repos/, failTimes: Infinity,
    reply: () => ({ status: 429, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' }, body: { message: 'Too Many Requests' } }),
  });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /rate limit/i.test(err.message), 'retry: a 429 rate limit aborts rather than retrying');
  eq([...net.attempts.values()][0], 1, 'retry: 429 attempted exactly once');
  eq(sl.delays, [], 'retry: 429 triggers no backoff sleep');
}

// --- 12f. 401 / 404 / hard-403 are NOT retried either ------------------------
{
  const net = withFailures(makeFetch(), {
    pattern: /\/user\/repos/, failTimes: Infinity, reply: http(401, 'Bad credentials'),
  });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /auth failed \(401\)/.test(err.message), 'retry: 401 aborts with the unchanged message');
  eq([...net.attempts.values()][0], 1, 'retry: 401 attempted exactly once — never retried');
  eq(sl.delays, [], 'retry: 401 triggers no backoff sleep');
}
{
  // a 404 on the COMMITS path is a real error (repo vanished), not soft-failable
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: Infinity, reply: http(404, 'Not Found'),
  });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /GitHub 404 for /.test(err.message), 'retry: 404 aborts with the unchanged message');
  eq([...net.attempts.values()][0], 1, 'retry: 404 attempted exactly once — never retried');
  eq(sl.delays, [], 'retry: 404 triggers no backoff sleep');
}
{
  const net = makeFetch({ forbidden: true });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /GitHub 403/.test(err.message), 'retry: non-integration hard 403 aborts, unchanged');
  eq(net.calls.filter((u) => u.includes('/user/repos')).length, 1, 'retry: hard 403 attempted exactly once — never retried');
  eq(sl.delays, [], 'retry: hard 403 triggers no backoff sleep');
}
{
  // the installation-token 403 must still fall through to the public list on the
  // FIRST attempt — retrying it would just delay the fallback three times over.
  const net = makeFetch({ installationToken: true });
  const sl = fakeSleep();
  const run = await harvestRepos({ owner: 'faketree', config, token: 'ghs_x', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  eq(net.calls.filter((u) => u.includes('/user/repos')).length, 1, 'retry: installation-token 403 attempted exactly once before falling back');
  eq(sl.delays, [], 'retry: installation-token 403 triggers no backoff sleep');
  eq(run.events.map((e) => e.id).sort(), run1.events.map((e) => e.id).sort(), 'retry: installation-token fallback still harvests identically');
}

// --- 12g. 409 "Git Repository is empty." is untouched by the retry logic -----
{
  const net = makeFetch();
  const sl = fakeSleep();
  const run = await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  eq(net.calls.filter((u) => u.includes('/empty-repo/commits')).length, 1, 'retry: the empty-repo 409 is attempted exactly once — never retried');
  eq(sl.delays, [], 'retry: the 409 triggers no backoff sleep');
  ok(!run.events.some((e) => e.project === 'empty-repo'), 'retry: empty repo still yields no events');
}

// --- 12h. a NETWORK-LEVEL throw from fetch_ is retried too -------------------
// fetchJson lets DNS failures / socket hangups propagate as thrown Errors. Over
// a long backfill these are at least as likely as a 5xx, so they are retried on
// the same terms — and re-thrown UNCHANGED (no .status) once the budget is gone,
// so they can never be mistaken for a soft-failable 404/403/409.
{
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: 1,
    reply: () => { const e = new Error('socket hang up'); e.code = 'ECONNRESET'; throw e; },
  });
  const sl = fakeSleep();
  const logs = [];
  const run = await harvestRepos({
    owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_, log: (m) => logs.push(m),
  });
  eq(run.events.map((e) => e.id).sort(), run1.events.map((e) => e.id).sort(), 'retry: a socket hangup on attempt 1 recovers and harvests identically');
  eq(sl.delays, [500], 'retry: a network throw backs off once before succeeding');
  ok(logs.some((m) => /socket hang up on .*retrying \(2\/3\)/.test(m)), 'retry: the network-level retry is logged');
}
{
  const net = withFailures(makeFetch(), {
    pattern: /\/explicit-repo\/commits\?/, failTimes: Infinity,
    reply: () => { throw new Error('getaddrinfo ENOTFOUND api.github.com'); },
  });
  const sl = fakeSleep();
  let err = null;
  try {
    await harvestRepos({ owner: 'faketree', config, token: 't', fetch_: net.fetch_, existing, sleep_: sl.sleep_ });
  } catch (e) { err = e; }
  ok(err && /ENOTFOUND/.test(err.message), 'retry: a persistent network failure is re-thrown UNCHANGED after the budget');
  eq(err?.status, undefined, 'retry: a re-thrown network error carries no .status, so softFail can never swallow it');
  eq([...net.attempts.values()][0], 3, 'retry: network throws are bounded at 3 attempts too');
  eq(sl.delays, [500, 1000], 'retry: network throws use the same exponential backoff');
}

// --- 12i. the suite itself must not have slept ------------------------------
// Every retry test above injected sleep_, so no real timer ran. Guard the whole
// file's wall-clock: 2 real backoffs would already cost 1.5s per retry test.
ok(Date.now() - SUITE_STARTED_AT < 5000, 'retry: the whole suite still runs in well under 5s — no real backoff timers were used');

// ----------------------------------------------------------------------------
console.log(`\n${failed === 0 ? '✓ all green' : '✗ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
