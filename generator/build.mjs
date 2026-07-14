#!/usr/bin/env node
// build.mjs — node CLI: read the growth log + config, run grow(), write tree.json.
//
//   node generator/build.mjs [--log <path>] [--config <path>] [--out <path>]
//
// Defaults resolve relative to the repo root (this file's ../). No npm
// dependencies: JSONL is parsed line-by-line, YAML by a tiny hand-rolled parser
// (only the flat/one-level-nested subset tree.config.yml uses).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { grow, ALGO_VERSION } from './grow.mjs';
import { stableStringify, parseYaml } from './serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const logPath = resolve(arg('--log', resolve(repoRoot, 'data/growth-log.jsonl')));
const configPath = resolve(arg('--config', resolve(repoRoot, 'tree.config.yml')));
const outPath = resolve(arg('--out', resolve(repoRoot, 'data/tree.json')));

// ---- read the growth log (JSONL, one event per line) ----
function readLog(path) {
  if (!existsSync(path)) throw new Error(`growth log not found: ${path}`);
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`bad JSON on line ${i + 1}: ${e.message}`); }
    });
}

function main() {
  const events = readLog(logPath);
  const config = existsSync(configPath) ? parseYaml(readFileSync(configPath, 'utf8')) : {};
  if (!config.seed) config.seed = config.owner || 'webmemo-code';
  if (!config.taxonomy) config.taxonomy = 'default-v1';

  const tree = grow(events, config, ALGO_VERSION);
  const json = stableStringify(tree) + '\n';
  writeFileSync(outPath, json);

  const fpsTotal = tree.segments.length + tree.leafClusters.reduce((n, c) => n + c.count, 0) + tree.fireflies.length;
  console.log(`built ${outPath}`);
  console.log(`  algoVersion=${tree.algoVersion} seed=${tree.seed} taxonomy=${tree.taxonomy}`);
  console.log(`  events=${tree.generatedFrom.events} (unclassified=${tree.generatedFrom.unclassified}) now-anchor=${tree.generatedFrom.latestTs}`);
  console.log(`  segments=${tree.segments.length} leafClusters=${tree.leafClusters.length} leaves≈${tree.leafClusters.reduce((n, c) => n + c.count, 0)} blossoms=${tree.blossoms.length} fireflies=${tree.fireflies.length}`);
  console.log(`  ~instanced primitives (fps budget): ${fpsTotal}`);
}

main();
