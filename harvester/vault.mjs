#!/usr/bin/env node
// vault.mjs — the phase-4 Obsidian vault harvester. Turns the vault's OWN git
// history into `kind: note` growth events and appends them to
// data/growth-log.jsonl, exactly like harvest.mjs does for GitHub commits.
//
//   node harvester/vault.mjs [--vault <path>] [--dry-run]
//
// HARD RULE (docs/03-data-model.md §6, docs/decisions/0002): NOTE CONTENT NEVER
// LEAVES THE VAULT. We read a note's file locally (working-tree copy) only to
// extract tags — we never emit a title, a body excerpt, a filename, or a folder
// name. The only things that ever reach the log are: a one-way path-hash (the
// vault-relative path is hashed with sha256 and truncated; the path itself is
// thrown away immediately after hashing), a timestamp, and a tag list ALREADY
// FILTERED through tree.config.yml's `vault.tag-map` allow-list.
//
// Why an allow-list and not "emit whatever tags exist": an unmapped tag is
// still a topic name Walter chose for himself and never told this pipeline was
// safe to surface (`#medical-history`, `#job-search`, whatever it might be).
// Only tags he has explicitly listed in tag-map are known-safe sector labels —
// anything else silently becomes `unclassified` rather than round-tripping a
// private word into a committed file. See harvester/README.md "Vault harvesting".
//
// private: true is asserted, not merely set, before every event leaves this
// file (see assertPrivate below) — a bug here must throw, never silently ship
// a public-looking vault event.
//
// Input: a LOCAL checkout of the vault's git repo (it syncs via obsidian-git,
// https://github.com/Vinzent03/obsidian-git). In Actions it is checked out as
// a sibling directory (.github/workflows/harvest.yml); locally it defaults to
// `../vault` next to this repo, override with --vault or config `vault.path`.
//
// Event granularity: one event per (note, commit-day) — id
// `obs:{sha256(vault-relative-path).slice(0,12)}:{YYYYMMDD}`, ts = that day's
// LATEST commit time touching the note (UTC ISO). Tags are read from the
// CURRENT working-tree copy of the note; a note that was later deleted has no
// current copy to read, so it contributes tags: [] (sector unclassified) at
// weight 0.6 instead of 1.0 — still fully private, still roots-only.
//
// Zero npm dependencies. Reuses harvest.mjs's jline/parseLog/buildOutput (the
// log-merge/dedupe/sort machinery is source-agnostic) — see harvest.mjs for
// the "log is the state" cursor design this mirrors.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { parseYaml } from '../generator/serialize.mjs';
import { toUtcZ, jline, parseLog, buildOutput } from './harvest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const MARK = '@@COMMIT@@';

// ---------------------------------------------------------------------------
// pure helpers (all exported — test-vault.mjs exercises these directly)
// ---------------------------------------------------------------------------

// one-way path -> id fragment. The vault-relative path goes in; only this hex
// fragment ever comes out. Truncated to 12 hex chars (48 bits) — plenty of
// collision resistance for one person's note count, matches the terse `gh:`
// sha7 style already used by harvest.mjs.
export function hashPath(relPath) {
  return createHash('sha256').update(relPath).digest('hex').slice(0, 12);
}

// commit ts (any ISO offset) -> UTC calendar day, "YYYYMMDD". Fails fast on an
// unparseable ts, same spirit as harvest.mjs's tsMs guard in buildOutput.
export function utcDay(ts) {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) throw new Error(`vault: invalid commit ts ${JSON.stringify(ts)}`);
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

export function noteEventId(relPath, day) {
  return `obs:${hashPath(relPath)}:${day}`;
}

// Extract RAW tag strings (no leading '#', no surrounding quotes) from a note's
// text: YAML frontmatter `tags:` (inline `[a, b]` or block `- a` list) plus
// inline `#tag` tokens in the body. This is the ONLY function that ever looks
// at note content — its return value is filtered through tag-map immediately
// by the caller; nothing else about the text survives past this function.
export function extractRawTags(text) {
  const tags = new Set();
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const block = fm[1];
    const line = block.match(/^tags:[ \t]*(.*)$/m);
    if (line) {
      const inline = line[1].trim();
      if (inline.startsWith('[')) {
        for (const t of inline.replace(/^\[|\]$/g, '').split(',')) {
          const v = t.trim().replace(/^["']|["']$/g, '');
          if (v) tags.add(v);
        }
      } else {
        // block-list style: indented "- item" lines right after "tags:". The
        // first split element is always the (empty) tail of the "tags:" line
        // itself, not a list item — drop it before scanning.
        const after = block.slice(block.indexOf(line[0]) + line[0].length).split('\n').slice(1);
        for (const l of after) {
          const m = l.match(/^\s*-\s*(.+?)\s*$/);
          if (!m) break; // list ends at the first non "- " line
          const v = m[1].replace(/^["']|["']$/g, '');
          if (v) tags.add(v);
        }
      }
    }
  }
  // inline #tags in the body only (skip the frontmatter block itself so a
  // stray "tags:" value never gets re-parsed as a hashtag). Requires a
  // non-numeric leading char right after '#' with no space, so markdown
  // headings ("# Heading") never match (Obsidian's own hashtag rule).
  const body = fm ? text.slice(fm[0].length) : text;
  const inlineRe = /(^|[\s(])#([A-Za-z][\w\-/]*)/g;
  let m;
  while ((m = inlineRe.exec(body))) tags.add(m[2]);
  return tags;
}

// raw tag strings -> the subset present in vault.tag-map, sorted. THIS is the
// privacy gate: everything not in tag-map is dropped right here and never
// touches an event.
export function mappedTags(rawTags, tagMap) {
  const map = tagMap || {};
  const out = [];
  for (const t of rawTags) if (Object.prototype.hasOwnProperty.call(map, t)) out.push(t);
  return out.sort();
}

// sector from already-mapped, already-sorted tags: first (alphabetically)
// mapped tag's sector wins — deterministic tie-break when a note carries more
// than one mapped tag. No mapped tag -> 'unclassified' (never dropped, docs/03
// §3 rule 4 — same nagging-shoots behavior as the GitHub side).
export function sectorForTags(sortedMapped, tagMap) {
  if (sortedMapped.length === 0) return 'unclassified';
  return tagMap[sortedMapped[0]];
}

// build a note event in the exact §2 schema (key order matches the log style).
// private is asserted true, unconditionally — see assertPrivate.
export function noteEvent({ relPath, day, ts, tagMap, rawTags, exists }) {
  const tags = mappedTags(rawTags, tagMap || {});
  const ev = {
    id: noteEventId(relPath, day),
    ts: toUtcZ(ts),
    source: 'obsidian',
    kind: 'note',
    sector: sectorForTags(tags, tagMap || {}),
    project: 'vault',
    weight: exists ? 1.0 : 0.6, // note no longer exists in the working tree -> damped
    attrs: { tags },
    private: true,
  };
  return assertPrivate(ev);
}

// belt-and-suspenders: docs/decisions/0002 makes this a hard rule, not a
// convention, so a bug here must throw rather than silently ship a
// non-private vault event.
export function assertPrivate(ev) {
  if (ev.private !== true) throw new Error(`vault: event ${ev.id} is not private:true — refusing to emit`);
  return ev;
}

// ---------------------------------------------------------------------------
// git history reader — the only thing that touches the vault checkout.
// Mirrors bootstrap-local.mjs's MARK-prefixed --pretty=format parsing.
// ---------------------------------------------------------------------------
export function runGitLog(vaultPath, sinceIso) {
  const args = ['-C', vaultPath, 'log', '--diff-filter=ACM', '--name-only', '--date=iso-strict', `--pretty=format:${MARK}%H%x09%cI`];
  if (sinceIso) args.push(`--since=${sinceIso}`);
  args.push('--', '*.md');
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// git log text -> [{ sha, ts, files: [relPath, ...] }], newest-first (git's
// default order) — callers rely on that order to pick each day's LATEST ts.
export function parseGitLog(text) {
  const commits = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith(MARK)) {
      const [sha, ts] = line.slice(MARK.length).split('\t');
      cur = { sha, ts, files: [] };
      commits.push(cur);
    } else if (line.trim() && cur) {
      if (line.trim().toLowerCase().endsWith('.md')) cur.files.push(line.trim());
    }
  }
  return commits;
}

// commits (newest-first) -> Map("relPath::YYYYMMDD" -> { relPath, day, ts }),
// ts is the LATEST commit time for that note on that day because we keep only
// the first occurrence encountered while scanning newest-to-oldest.
export function collectNoteDays(commits) {
  const map = new Map();
  for (const c of commits) {
    for (const f of c.files) {
      const day = utcDay(c.ts);
      const key = `${f}::${day}`;
      if (!map.has(key)) map.set(key, { relPath: f, day, ts: c.ts });
    }
  }
  return map;
}

// read a note's CURRENT working-tree tags. A deleted note (no longer on disk)
// yields exists:false, rawTags: empty — this is the one and only place file
// content is read, and only extractRawTags's return value leaves this scope.
export function readNoteTags(vaultPath, relPath) {
  const full = join(vaultPath, relPath);
  if (!existsSync(full)) return { exists: false, rawTags: new Set() };
  try {
    return { exists: true, rawTags: extractRawTags(readFileSync(full, 'utf8')) };
  } catch {
    // the file exists but couldn't be read (permissions, transient IO) — that is
    // not a deletion, so keep exists:true and just emit no tags this round
    return { exists: true, rawTags: new Set() };
  }
}

// day-floor (UTC midnight) of the newest already-logged obs: event's ts, or
// null if none exist yet. Used as the --since cursor: coarser than an exact ts
// so a same-day commit added after a previous run is never missed, while a
// (note, day) pair that's already in the log is still skipped by id-dedupe in
// buildOutput regardless (the log is the state — no separate cursor file).
export function vaultCursorFloor(existingRows) {
  let max = null;
  for (const r of existingRows) {
    if (r.id.startsWith('obs:') && (!max || r.ts > max)) max = r.ts;
  }
  return max ? `${max.slice(0, 10)}T00:00:00Z` : null;
}

// ---------------------------------------------------------------------------
// orchestrator — testable against a real (fixture) vault checkout, no network
// involved at all (git + fs are local). Returns the candidate note events.
// ---------------------------------------------------------------------------
export function harvestVault({ vaultPath, config, existingIds, sinceIso, log = () => {} }) {
  const tagMap = (config.vault && config.vault['tag-map']) || {};
  const commits = parseGitLog(runGitLog(vaultPath, sinceIso));
  log(`  scanned ${commits.length} commit(s) touching *.md${sinceIso ? ` since ${sinceIso}` : ' (full history)'}`);
  const noteDays = collectNoteDays(commits);
  const events = [];
  for (const { relPath, day, ts } of noteDays.values()) {
    const id = noteEventId(relPath, day);
    if (existingIds && existingIds.has(id)) continue; // already logged, skip re-reading the file entirely
    const { exists, rawTags } = readNoteTags(vaultPath, relPath);
    events.push(noteEvent({ relPath, day, ts, tagMap, rawTags, exists }));
  }
  return events;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function has(flag) { return process.argv.includes(flag); }

function main() {
  const dryRun = has('--dry-run');
  const vaultArg = arg('--vault', null);

  const configPath = resolve(repoRoot, 'tree.config.yml');
  const logPath = resolve(repoRoot, 'data/growth-log.jsonl');
  const config = existsSync(configPath) ? parseYaml(readFileSync(configPath, 'utf8')) : {};
  const vaultCfg = config.vault || {};
  const enabled = vaultCfg.enabled === true;
  const forced = vaultArg != null; // --vault always forces a run, even if disabled in config

  if (!enabled && !forced) {
    console.error('vault: vault harvesting disabled (tree.config.yml vault.enabled: false) — pass --vault to force a run.');
    process.exit(0);
  }

  const vaultPath = resolve(repoRoot, vaultArg || vaultCfg.path || '../vault');

  if (!existsSync(vaultPath) || !existsSync(join(vaultPath, '.git'))) {
    console.error(`vault: no git checkout found at ${vaultPath} — the vault syncs via obsidian-git and is expected as a local checkout (a sibling directory in Actions, see .github/workflows/harvest.yml). Nothing harvested.`);
    process.exit(1);
  }

  const existingRows = existsSync(logPath) ? parseLog(readFileSync(logPath, 'utf8')) : [];
  const existingIds = new Set(existingRows.map((r) => r.id));
  const sinceIso = vaultCursorFloor(existingRows);

  console.error(`vault: harvesting ${vaultPath}${sinceIso ? ` since ${sinceIso}` : ' (full history)'}${dryRun ? ' (dry-run)' : ''}`);

  let events;
  try {
    events = harvestVault({ vaultPath, config, existingIds, sinceIso, log: (m) => console.error(m) });
  } catch (err) {
    console.error(`vault: reading vault git history failed — ${err.message}`);
    process.exit(1);
  }

  const { text, appended } = buildOutput(existingRows, events, existingIds);

  if (appended.length === 0) {
    console.error('vault: no new note activity — log already up to date.');
    process.exit(0);
  }

  if (dryRun) {
    console.error(`vault: would append ${appended.length} event(s) (dry-run, nothing written):`);
    for (const e of appended) process.stdout.write(jline(e) + '\n');
    process.exit(0);
  }

  writeFileSync(logPath, text);
  console.error(`vault: appended ${appended.length} event(s) -> ${logPath}`);
  process.exit(0);
}

// run only when invoked directly (not when imported by the tests)
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (e) { console.error(e); process.exit(1); }
}
