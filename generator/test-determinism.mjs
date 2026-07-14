#!/usr/bin/env node
// test-determinism.mjs — "the one test that must never break" (docs/04 §CI).
//
// 1. Runs grow() TWICE (fresh, no shared module state) on the real log and
//    byte-compares the two serialized outputs.
// 2. Byte-compares that output against the committed data/tree.json (a
//    regeneration must reproduce the checked-in tree exactly).
//
// Exits nonzero with a clear first-difference message on any mismatch.
//
//   node generator/test-determinism.mjs [--log <path>] [--tree <path>] [--config <path>]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { grow, ALGO_VERSION } from './grow.mjs';
import { stableStringify, parseYaml } from './serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };

const logPath = resolve(arg('--log', resolve(repoRoot, 'data/growth-log.jsonl')));
const treePath = resolve(arg('--tree', resolve(repoRoot, 'data/tree.json')));
const configPath = resolve(arg('--config', resolve(repoRoot, 'tree.config.yml')));

function fail(msg) { console.error(`\n✗ DETERMINISM TEST FAILED\n  ${msg}\n`); process.exit(1); }

function readLog(path) {
  if (!existsSync(path)) fail(`growth log not found: ${path}`);
  return readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => JSON.parse(l));
}

function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}:\n    A: ${JSON.stringify(la[i])}\n    B: ${JSON.stringify(lb[i])}`;
  }
  return `lengths differ: A=${a.length} bytes, B=${b.length} bytes`;
}

const events = readLog(logPath);
const config = existsSync(configPath) ? parseYaml(readFileSync(configPath, 'utf8')) : {};
if (!config.seed) config.seed = config.owner || 'webmemo-code';
if (!config.taxonomy) config.taxonomy = 'default-v1';

// 1) two independent runs must be byte-identical
const a = stableStringify(grow(events, config, ALGO_VERSION)) + '\n';
const b = stableStringify(grow(events, config, ALGO_VERSION)) + '\n';
if (a !== b) fail(`grow() is non-deterministic across two runs on the same log.\n  ${firstDiff(a, b)}`);
console.log(`✓ grow() byte-identical across two runs (${a.length} bytes, ${events.length} events)`);

// 2) regeneration must match the committed tree.json
if (!existsSync(treePath)) {
  console.log(`⚠ no committed tree.json at ${treePath} — skipping regeneration check (run build.mjs first)`);
  console.log('\n✓ DETERMINISM TEST PASSED (self-consistency only)');
  process.exit(0);
}
const committed = readFileSync(treePath, 'utf8');
if (a !== committed) {
  fail(`regeneration does not match committed ${treePath}.\n  Rebuild with: node generator/build.mjs\n  ${firstDiff(a, committed)}`);
}
console.log(`✓ regeneration byte-identical to committed data/tree.json`);
console.log('\n✓ DETERMINISM TEST PASSED');
