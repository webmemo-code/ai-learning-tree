#!/usr/bin/env node
// test-vault.mjs — zero-dep, NO NETWORK. Builds a real (throwaway) git repo in
// a temp dir from harvester/fixtures/vault/, seeded with N deterministic
// commits across distinct dates (GIT_AUTHOR_DATE/GIT_COMMITTER_DATE), and runs
// vault.mjs's harvester against that repo exactly as it would run against a
// real obsidian-git checkout. All git/fs work is local — there is nothing to
// fake, so unlike test-harvest.mjs there's no injected fetch seam here.
//
// Asserts the whole privacy + granularity contract from docs/03-data-model.md
// §6 and docs/decisions/0002: private:true always, hash-only ids (no path/
// filename/folder/title/secret text/unmapped tag ever survives), tag-map
// allow-listing, per-(note,day) granularity + same-day collapsing, deleted-note
// handling, cursor + dedupe/idempotence, sort + trailing newline, and the
// disabled/missing-vault CLI behaviors.
//
//   node harvester/test-vault.mjs

import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { parseYaml } from '../generator/serialize.mjs';
import { jline, parseLog, buildOutput } from './harvest.mjs';
import {
  hashPath, utcDay, noteEventId, extractRawTags, mappedTags, sectorForTags,
  noteEvent, assertPrivate, parseGitLog, collectNoteDays, vaultCursorFloor,
  harvestVault,
} from './vault.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fixturesDir = resolve(__dirname, 'fixtures/vault');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ============================================================================
// build a throwaway fixture vault repo with deterministic history
// ============================================================================
function git(cwd, args, envExtra) {
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...envExtra },
  });
}
function commitAt(cwd, iso, message) {
  git(cwd, ['commit', '-q', '-m', message], {
    GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso,
    GIT_AUTHOR_NAME: 'Vault Test', GIT_AUTHOR_EMAIL: 'vault-test@example.invalid',
    GIT_COMMITTER_NAME: 'Vault Test', GIT_COMMITTER_EMAIL: 'vault-test@example.invalid',
  });
}
function copyIn(tmp, relPath) {
  const dst = join(tmp, relPath);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(fixturesDir, relPath), dst);
}

function buildFixtureVault() {
  const tmp = mkdtempSync(join(tmpdir(), 'vault-fixture-'));
  git(tmp, ['init', '-q', '-b', 'main']);
  git(tmp, ['config', 'user.name', 'Vault Test']);
  git(tmp, ['config', 'user.email', 'vault-test@example.invalid']);

  copyIn(tmp, 'falcon-session.md');
  copyIn(tmp, 'harbor-draftboard.md');
  copyIn(tmp, 'marble-diary.md');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-01T09:00:00+00:00', 'add batch 1');

  copyIn(tmp, 'nectar-runbook.md');
  copyIn(tmp, 'fieldnotes/orchid-fieldwork.md');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-02T10:00:00+00:00', 'add batch 2');

  copyIn(tmp, 'quartz-refit.md');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-03T11:00:00+00:00', 'add quartz-refit');

  copyIn(tmp, 'vellum-capture.md');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-04T12:00:00+00:00', 'add vellum-capture');

  appendFileSync(join(tmp, 'vellum-capture.md'), '\nFollow-up: confirmed SECRET timing window.\n');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-05T13:00:00+00:00', 'edit vellum-capture');

  git(tmp, ['rm', '-q', 'vellum-capture.md']);
  commitAt(tmp, '2025-01-06T14:00:00+00:00', 'delete vellum-capture');

  appendFileSync(join(tmp, 'quartz-refit.md'), '\nDay two of the refactor - SECRET internal codename Project Refit.\n');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-07T08:00:00+00:00', 'edit quartz-refit morning');

  appendFileSync(join(tmp, 'quartz-refit.md'), '\nFinal cleanup pass before merge.\n');
  git(tmp, ['add', '.']);
  commitAt(tmp, '2025-01-07T15:00:00+00:00', 'edit quartz-refit afternoon');

  return tmp;
}

const vaultPath = buildFixtureVault();

// real tree.config.yml's vault.tag-map — reused rather than duplicated, so the
// test can't silently drift from the actual config (all fixture tags below are
// chosen to already exist in that map).
const realConfig = parseYaml(readFileSync(resolve(repoRoot, 'tree.config.yml'), 'utf8'));
const config = { vault: { enabled: true, 'tag-map': realConfig.vault['tag-map'] } };

// ============================================================================
// 1. pure helpers
// ============================================================================
eq(hashPath('a').length, 12, 'hashPath truncates to 12 hex chars');
ok(/^[0-9a-f]{12}$/.test(hashPath('fieldnotes/orchid-fieldwork.md')), 'hashPath is lowercase hex');
ok(hashPath('a') !== hashPath('b'), 'hashPath differs for different paths');
eq(hashPath('same/path.md'), hashPath('same/path.md'), 'hashPath is deterministic');
eq(utcDay('2025-01-07T15:00:00+00:00'), '20250107', 'utcDay formats YYYYMMDD in UTC');
eq(noteEventId('x.md', '20250101'), `obs:${hashPath('x.md')}:20250101`, 'noteEventId shape');

const rawInline = extractRawTags(readFileSync(join(fixturesDir, 'harbor-draftboard.md'), 'utf8'));
ok(rawInline.has('ai/copy') && rawInline.has('medical-history'), 'extractRawTags finds inline #tags (raw, pre-filter)');
const rawFmInline = extractRawTags(readFileSync(join(fixturesDir, 'falcon-session.md'), 'utf8'));
eq([...rawFmInline].sort(), ['ai/seo'], 'extractRawTags parses inline-array frontmatter');
const rawFmList = extractRawTags(readFileSync(join(fixturesDir, 'nectar-runbook.md'), 'utf8'));
eq([...rawFmList].sort(), ['ai/no-code', 'ai/workflows', 'side-quest-lantern'].sort(), 'extractRawTags parses block-list frontmatter');
const rawNone = extractRawTags(readFileSync(join(fixturesDir, 'marble-diary.md'), 'utf8'));
eq([...rawNone], [], 'extractRawTags returns empty set for a tag-free note');
ok(!extractRawTags('# Heading\nbody').has('Heading'), 'a markdown heading ("# X") is never mistaken for a hashtag');

eq(mappedTags(['ai/seo', 'medical-history'], config.vault['tag-map']), ['ai/seo'], 'mappedTags drops anything not in tag-map');
eq(mappedTags(['ai/no-code', 'ai/workflows', 'side-quest-lantern'], config.vault['tag-map']), ['ai/no-code', 'ai/workflows'], 'mappedTags sorts + filters');
eq(sectorForTags(['ai/no-code', 'ai/workflows'], config.vault['tag-map']), 'build.no-code', 'sectorForTags: first mapped tag (alphabetical) wins the tie-break');
eq(sectorForTags([], config.vault['tag-map']), 'unclassified', 'sectorForTags: no mapped tag -> unclassified');

const sample = noteEvent({ relPath: 'x.md', day: '20250101', ts: '2025-01-01T09:00:00+00:00', tagMap: config.vault['tag-map'], rawTags: new Set(['ai/seo']), exists: true });
eq(Object.keys(sample), ['id', 'ts', 'source', 'kind', 'sector', 'project', 'weight', 'attrs', 'private'], 'noteEvent key order matches §2 schema');
eq(sample.source, 'obsidian', 'source is obsidian');
eq(sample.kind, 'note', 'kind is note');
eq(sample.project, 'vault', 'project is vault');
eq(sample.private, true, 'noteEvent is private:true');
ok(!('path' in sample) && !('title' in sample) && !('filename' in sample), 'noteEvent never carries path/title/filename fields');
try { assertPrivate({ id: 'x', private: false }); ok(false, 'assertPrivate should throw on private:false'); } catch { ok(true, 'assertPrivate throws on private:false'); }

// ============================================================================
// 2. full harvest against the real temp fixture vault (no cursor, first run)
// ============================================================================
const events = harvestVault({ vaultPath, config, existingIds: new Set(), sinceIso: null });

eq(events.length, 9, 'event count: 5 single-day notes + quartz(2 days) + vellum(2 days) = 9');
ok(events.every((e) => e.private === true), 'EVERY emitted event is private:true');
ok(events.every((e) => /^obs:[0-9a-f]{12}:\d{8}$/.test(e.id)), 'every id matches obs:<12-hex>:<YYYYMMDD>');

// ---- privacy leak-scan: filenames, folder name, title words, SECRET, unmapped tags ----
const blob = events.map(jline).join('\n');
const FORBIDDEN = [
  'falcon-session', 'harbor-draftboard', 'marble-diary', 'nectar-runbook',
  'orchid-fieldwork', 'quartz-refit', 'vellum-capture', // filenames (no extension)
  'fieldnotes', // folder name
  'Falcon', 'Session', 'Harbor', 'Draftboard', 'Marble', 'Diary', 'Nectar', 'Runbook',
  'Orchid', 'Fieldwork', 'Quartz', 'Refit', 'Vellum', 'Capture', // title words
  'SECRET', 'Redacted', 'Q4', 'pricing', // secret-looking body text
  'medical-history', 'side-quest-lantern', // unmapped tags
];
for (const bad of FORBIDDEN) ok(!blob.includes(bad), `leak scan: "${bad}" never appears in emitted output`);

// ---- expected sector/tags/weight per note, looked up by the id the test computes independently ----
const byId = Object.fromEntries(events.map((e) => [e.id, e]));
const idFor = (relPath, day) => noteEventId(relPath, day);

const falcon = byId[idFor('falcon-session.md', '20250101')];
eq(falcon?.sector, 'distribute.seo', 'falcon-session -> distribute.seo via ai/seo');
eq(falcon?.attrs.tags, ['ai/seo'], 'falcon-session tags');
eq(falcon?.weight, 1, 'falcon-session weight 1.0 (note still exists)');

const harbor = byId[idFor('harbor-draftboard.md', '20250101')];
eq(harbor?.sector, 'create.copy', 'harbor-draftboard -> create.copy via ai/copy');
eq(harbor?.attrs.tags, ['ai/copy'], 'harbor-draftboard: unmapped #medical-history stripped from attrs.tags');

const marble = byId[idFor('marble-diary.md', '20250101')];
eq(marble?.sector, 'unclassified', 'marble-diary (no tags) -> unclassified');
eq(marble?.attrs.tags, [], 'marble-diary attrs.tags is empty');

const nectar = byId[idFor('nectar-runbook.md', '20250102')];
eq(nectar?.sector, 'build.no-code', 'nectar-runbook -> build.no-code (alphabetical tie-break over ai/workflows)');
eq(nectar?.attrs.tags, ['ai/no-code', 'ai/workflows'], 'nectar-runbook: 2 mapped tags kept + sorted, side-quest-lantern stripped');

const orchid = byId[idFor('fieldnotes/orchid-fieldwork.md', '20250102')];
eq(orchid?.sector, 'distribute.geo', 'orchid-fieldwork (subfolder note) -> distribute.geo via ai/geo');

const quartzDay1 = byId[idFor('quartz-refit.md', '20250103')];
const quartzDay2 = byId[idFor('quartz-refit.md', '20250107')];
ok(quartzDay1 && quartzDay2, 'quartz-refit produced TWO events (per-(note,day) granularity across 2025-01-03 and 2025-01-07)');
eq(quartzDay1?.sector, 'build.pro-code', 'quartz-refit day 1 sector');
eq(quartzDay2?.sector, 'build.pro-code', 'quartz-refit day 2 sector');
eq(quartzDay2?.ts, '2025-01-07T15:00:00Z', 'quartz-refit day 2 ts is the AFTERNOON (latest) commit, not the morning one — same-day commits collapse');

const vellumDay1 = byId[idFor('vellum-capture.md', '20250104')];
const vellumDay2 = byId[idFor('vellum-capture.md', '20250105')];
ok(vellumDay1 && vellumDay2, 'deleted note still yields its historical (note,day) events');
eq(vellumDay1?.weight, 0.6, 'deleted-note event weight damped to 0.6');
eq(vellumDay2?.weight, 0.6, 'deleted-note event weight damped to 0.6 (both days)');
eq(vellumDay1?.sector, 'unclassified', 'deleted note: tags unreadable from a gone file -> unclassified, NOT its original ai/images sector');
eq(vellumDay1?.attrs.tags, [], 'deleted note: attrs.tags is empty (content/tags cannot be re-read once gone)');

// ============================================================================
// 3. cursor + dedupe/idempotence via buildOutput (the same merge machinery
//    harvest.mjs uses — the log IS the state, no separate cursor file)
// ============================================================================
const out1 = buildOutput([], events, new Set());
ok(out1.text.endsWith('\n'), 'output ends with a trailing newline');
const rows1 = parseLog(out1.text);
let sorted = true;
for (let i = 1; i < rows1.length; i++) if (Date.parse(rows1[i].ts) < Date.parse(rows1[i - 1].ts)) sorted = false;
ok(sorted, 'output sorted ascending by ts');

// re-running the FULL harvest with existingIds seeded from the first run
// appends nothing — same-note-same-day is never double counted.
const events2 = harvestVault({ vaultPath, config, existingIds: new Set(events.map((e) => e.id)), sinceIso: null });
eq(events2.length, 0, 'dedupe: re-running with existingIds from the first run finds no new events');

const out2 = buildOutput(rows1, [], new Set(rows1.map((r) => r.id)));
eq(out2.appended.length, 0, 'buildOutput: a second merge with no new events appends nothing');
eq(out2.text, out1.text, 'buildOutput: re-merge leaves the file byte-identical');

// cursor: vaultCursorFloor computes UTC-midnight of the newest logged obs: ts,
// and re-scanning from there (git --since) still yields zero NEW events once
// everything up to that point is already in existingIds (boundary-day rescan
// is intentional — see vault.mjs comment — but dedupe absorbs it).
const cursor = vaultCursorFloor(rows1);
eq(cursor, '2025-01-07T00:00:00Z', 'vaultCursorFloor: day-floor of the newest obs: ts in the log');
const eventsSinceCursor = harvestVault({ vaultPath, config, existingIds: new Set(rows1.map((r) => r.id)), sinceIso: cursor });
eq(eventsSinceCursor.length, 0, 'cursor: re-run scoped to since=<cursor> still appends nothing new (already logged)');
eq(vaultCursorFloor([]), null, 'vaultCursorFloor: null cursor when the log has no obs: rows yet (full history)');

// commits strictly before the cursor day are genuinely excluded by --since
const onlyOldRaw = parseGitLog(execFileSync('git', ['-C', vaultPath, 'log', '--diff-filter=ACM', '--name-only', '--date=iso-strict', '--pretty=format:@@COMMIT@@%H\t%cI', '--since=2025-01-07T00:00:00Z', '--', '*.md'], { encoding: 'utf8' }));
ok(onlyOldRaw.every((c) => c.ts >= '2025-01-07'), 'sanity: git --since actually restricts history to the cursor day forward');
const noteDaysSinceCursor = collectNoteDays(onlyOldRaw);
ok([...noteDaysSinceCursor.values()].every((n) => n.day === '20250107'), 'sanity: only 2025-01-07 note-days remain once scoped by cursor');

// ============================================================================
// 4. CLI behavior: disabled vault, missing vault path, and --dry-run
// ============================================================================
function runCli(args) {
  return spawnSync(process.execPath, [resolve(__dirname, 'vault.mjs'), ...args], { cwd: repoRoot, encoding: 'utf8' });
}

// tree.config.yml ships with vault.enabled: false by default — no --vault flag
// means "respect config", so this must skip silently (exit 0).
const disabledRun = runCli([]);
eq(disabledRun.status, 0, 'CLI: disabled vault (no --vault, config enabled:false) exits 0');
ok(/disabled/.test(disabledRun.stderr), 'CLI: disabled vault prints a clear "disabled" message');

// --vault forces a run even though config says disabled; a missing path must
// fail loudly (exit 1) rather than silently doing nothing.
const missingRun = runCli(['--vault', join(tmpdir(), 'definitely-does-not-exist-vault')]);
eq(missingRun.status, 1, 'CLI: --vault forces a run; a missing/non-git path exits 1');
ok(/no git checkout found/.test(missingRun.stderr), 'CLI: missing-vault message is clear');

// --dry-run against the real temp fixture vault: prints candidate events to
// stdout, writes nothing, and the printed JSON passes the same leak scan.
const dryRunResult = runCli(['--vault', vaultPath, '--dry-run']);
eq(dryRunResult.status, 0, 'CLI: --dry-run against the fixture vault exits 0');
const dryLines = dryRunResult.stdout.trim().split('\n').filter(Boolean);
eq(dryLines.length, 9, 'CLI --dry-run: prints exactly the 9 expected candidate events to stdout');
for (const line of dryLines) ok(JSON.parse(line).private === true, 'CLI --dry-run: every printed event is private:true');
const dryBlob = dryRunResult.stdout;
for (const bad of FORBIDDEN) ok(!dryBlob.includes(bad), `CLI --dry-run leak scan: "${bad}" never appears in stdout`);

// cleanup
rmSync(vaultPath, { recursive: true, force: true });

// ----------------------------------------------------------------------------
console.log(`\n${failed === 0 ? '✓ all green' : '✗ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
