#!/usr/bin/env node
// test-harvest.mjs — zero-dep, NO NETWORK. Injects recorded GitHub fixtures
// (harvester/fixtures/) into harvest.mjs's fetchJson seam and asserts the whole
// contract: classification chain order, fork/private skipping, dedupe, the
// cursor-in-log design, weight bounds, milestone merge/dedupe, ts sort, and the
// privacy guarantee (no message/path/diff ever escapes into an event).
//
//   node harvester/test-harvest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  harvestRepos, classify, weightForFiles, parseMilestones, milestoneEvents,
  parseLog, indexExisting, buildOutput, jline, commitEvent,
} from './harvest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const fxText = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// --- the fake network: URL -> fixture, recording every requested URL ---------
// opts.installationToken: /user/repos answers the Actions-GITHUB_TOKEN 403
//   ("Resource not accessible by integration"); the public /users/{owner}/repos
//   serves the same fixture minus private repos (as the real endpoint would).
// opts.rateLimited: /user/repos answers a rate-limit 403 (remaining: 0).
function makeFetch(opts = {}) {
  const calls = [];
  const detailMap = { a: null, b: 'commit-detail-b.json', c: 'commit-detail-c.json', d: 'commit-detail-d.json', e: 'commit-detail-e.json' };
  async function fetch_(url) {
    calls.push(url);
    const reply = (body) => ({ status: 200, headers: { 'x-ratelimit-remaining': '4999' }, body });
    if (url.includes('/user/repos')) {
      if (opts.rateLimited) {
        return { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1750000000' }, body: { message: 'API rate limit exceeded' } };
      }
      if (opts.installationToken) {
        return { status: 403, headers: { 'x-ratelimit-remaining': '4999' }, body: { message: 'Resource not accessible by integration' } };
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

// ----------------------------------------------------------------------------
console.log(`\n${failed === 0 ? '✓ all green' : '✗ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
