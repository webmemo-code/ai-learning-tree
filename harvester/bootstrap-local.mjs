#!/usr/bin/env node
// bootstrap-local.mjs — seed the REAL growth log from THIS repo's LOCAL git
// history, no network. Used once by the coordinator to replace the phase-2 mock
// log with only-real events before the nightly harvester takes over.
//
//   node harvester/bootstrap-local.mjs           # preview only (prints, writes nothing)
//   node harvester/bootstrap-local.mjs --write    # OVERWRITE data/growth-log.jsonl
//
// Same schema + privacy rules as harvest.mjs: metadata only (committer date +
// files-touched count), never a commit message, path, or diff. Sector comes from
// tree.config.yml's repos: mapping; weight from `git log --numstat` file counts.
//
// This OVERWRITES the log (it does not merge) — the mock log is disposable and
// must not bleed into the real one. milestones.yml is merged in if present.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { parseYaml } from '../generator/serialize.mjs';
import {
  classify, weightForFiles, toUtcZ, milestoneEvents, parseMilestones,
  buildOutput, jline,
} from './harvest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function git(args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// owner/repo: owner from config; repo name from the remote if it agrees, else the
// checkout's directory name (this repo == ai-learning-tree, docs/04 dogfooding).
function ownerRepo(config) {
  const owner = config.owner || 'webmemo-code';
  let repo = basename(repoRoot);
  try {
    const url = git(['remote', 'get-url', 'origin']).trim();
    const m = url.match(/([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (m) repo = m[2];
  } catch { /* no remote — fall back to dir name */ }
  return { owner, repo };
}

// dominant tracked-file language, for attrs.lang (cosmetic; renderer ignores it).
const EXT_LANG = {
  mjs: 'JavaScript', js: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', c: 'C', h: 'C',
  html: 'HTML', css: 'CSS', md: 'Markdown', json: 'JSON', yml: 'YAML', yaml: 'YAML', sh: 'Shell',
};
function primaryLanguage() {
  const counts = {};
  try {
    for (const f of git(['ls-files']).split('\n')) {
      const ext = (f.split('.').pop() || '').toLowerCase();
      const lang = EXT_LANG[ext];
      if (lang) counts[lang] = (counts[lang] || 0) + 1;
    }
  } catch { /* ignore */ }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// parse `git log --numstat` into [{ sha, dateIso, files }]. --numstat emits one
// "added<TAB>removed<TAB>path" line per file after each commit header; we count
// the lines and DISCARD the paths (privacy). Binary files show "-  -  path" —
// still one file touched.
function readGitHistory() {
  const MARK = '@@COMMIT@@';
  const raw = git(['log', '--no-merges', '--date=iso-strict', `--pretty=format:${MARK}%H%x09%cI`, '--numstat']);
  const commits = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith(MARK)) {
      const [sha, cISO] = line.slice(MARK.length).split('\t');
      cur = { sha, dateIso: cISO, files: 0 };
      commits.push(cur);
    } else if (line.trim() && cur) {
      cur.files++;
    }
  }
  return commits;
}

function main() {
  const write = process.argv.includes('--write');
  const configPath = resolve(repoRoot, 'tree.config.yml');
  const logPath = resolve(repoRoot, 'data/growth-log.jsonl');
  const milestonesPath = resolve(repoRoot, 'data/milestones.yml');

  const config = existsSync(configPath) ? parseYaml(readFileSync(configPath, 'utf8')) : {};
  const { owner, repo } = ownerRepo(config);
  const lang = primaryLanguage();
  const sector = classify({ name: repo, topics: [] }, config);

  const history = readGitHistory();
  const commitEvents = history.map((c) => ({
    id: `gh:${owner}/${repo}:${c.sha.slice(0, 7)}`,
    ts: toUtcZ(c.dateIso),
    source: 'github',
    kind: 'commit',
    sector,
    project: repo,
    weight: weightForFiles(c.files),
    attrs: { runtime: 'cloud', lang: lang || null },
    private: false,
  }));

  let msEvents = [];
  if (existsSync(milestonesPath)) {
    msEvents = milestoneEvents(parseMilestones(readFileSync(milestonesPath, 'utf8')));
  }

  // OVERWRITE, not merge: start from an empty base so no mock event survives.
  const { text, appended } = buildOutput([], [...commitEvents, ...msEvents], new Set());

  console.error(`bootstrap-local: ${owner}/${repo} sector=${sector} lang=${lang || 'n/a'}`);
  console.error(`  ${commitEvents.length} commit event(s) + ${msEvents.length} milestone event(s) = ${appended.length} total`);

  if (!write) {
    console.error('  (preview — nothing written; pass --write to OVERWRITE data/growth-log.jsonl)\n');
    process.stdout.write(text);
    return;
  }
  writeFileSync(logPath, text);
  console.error(`  wrote ${appended.length} event(s) -> ${logPath}`);
}

main();
