#!/usr/bin/env node
// test-determinism.mjs — "the one test that must never break" (docs/04 §2 CI).
//
// Two independent checks:
//
// 1. FIXTURE (always runs, never skips): grow() over the frozen mock fixture
//    (data/mock/growth-log.jsonl + data/mock/tree.config.yml) must reproduce
//    data/mock/tree.json byte-identically, forever. This fixture is a pure
//    historical snapshot (data/mock/README-ish note lives in data/README.md) —
//    it never changes, so this check has zero excuse to ever fail. It is what
//    proves the generator itself is deterministic even before any real
//    harvested data exists.
//
// 2. LIVE (skips gracefully if absent): grow() run TWICE (fresh, no shared
//    module state) on the real data/growth-log.jsonl must be byte-identical
//    across the two runs, and if data/tree.json is already committed, a
//    regeneration must match it exactly. Both the log and the committed tree
//    are produced by the harvester + nightly Action and may not exist yet
//    (e.g. before harvester/bootstrap-local.mjs has run) — that's fine, this
//    half just skips with a clear message rather than failing.
//
// Exits nonzero with a clear first-difference message on any real mismatch.
//
//   node generator/test-determinism.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { grow, ALGO_VERSION } from './grow.mjs';
import { stableStringify, parseYaml } from './serialize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let failed = false;
function fail(msg) { console.error(`\n✗ DETERMINISM TEST FAILED\n  ${msg}\n`); failed = true; }

function readLog(path) {
  return readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => JSON.parse(l));
}

function loadConfig(path) {
  const config = existsSync(path) ? parseYaml(readFileSync(path, 'utf8')) : {};
  if (!config.seed) config.seed = config.owner || 'webmemo-code';
  if (!config.taxonomy) config.taxonomy = 'default-v1';
  return config;
}

function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}:\n    A: ${JSON.stringify(la[i])}\n    B: ${JSON.stringify(lb[i])}`;
  }
  return `lengths differ: A=${a.length} bytes, B=${b.length} bytes`;
}

// ============================================================================
// 1) FIXTURE — frozen mock log + mock config must always reproduce mock tree.json
// ============================================================================
{
  const logPath = resolve(repoRoot, 'data/mock/growth-log.jsonl');
  const configPath = resolve(repoRoot, 'data/mock/tree.config.yml');
  const treePath = resolve(repoRoot, 'data/mock/tree.json');

  if (!existsSync(logPath) || !existsSync(treePath) || !existsSync(configPath)) {
    fail(`mock fixture missing (expected ${logPath}, ${configPath} and ${treePath}) — the frozen fixture must always be present`);
  } else {
    const events = readLog(logPath);
    const config = loadConfig(configPath);
    const out = stableStringify(grow(events, config, ALGO_VERSION)) + '\n';
    const committed = readFileSync(treePath, 'utf8');
    if (out !== committed) {
      fail(`fixture regeneration does not match committed ${treePath}.\n  ${firstDiff(out, committed)}`);
    } else {
      console.log(`✓ fixture: grow() on data/mock/growth-log.jsonl byte-identical to data/mock/tree.json (${out.length} bytes, ${events.length} events)`);
    }
  }
}

// ============================================================================
// 2) LIVE — real log double-run + (if present) regeneration match, skip gracefully
// ============================================================================
{
  const logPath = resolve(repoRoot, 'data/growth-log.jsonl');
  const configPath = resolve(repoRoot, 'tree.config.yml');
  const treePath = resolve(repoRoot, 'data/tree.json');

  if (!existsSync(logPath)) {
    console.log(`⚠ live: no data/growth-log.jsonl yet — skipping (harvester hasn't run/bootstrapped)`);
  } else {
    const events = readLog(logPath);
    const config = loadConfig(configPath);
    const a = stableStringify(grow(events, config, ALGO_VERSION)) + '\n';
    const b = stableStringify(grow(events, config, ALGO_VERSION)) + '\n';
    if (a !== b) {
      fail(`live: grow() is non-deterministic across two runs on the same log.\n  ${firstDiff(a, b)}`);
    } else {
      console.log(`✓ live: grow() byte-identical across two runs (${a.length} bytes, ${events.length} events)`);
    }
    if (!existsSync(treePath)) {
      console.log(`⚠ live: no committed data/tree.json yet — skipping regeneration check (run build.mjs first)`);
    } else {
      const committed = readFileSync(treePath, 'utf8');
      if (a !== committed) {
        fail(`live: regeneration does not match committed ${treePath}.\n  Rebuild with: node generator/build.mjs\n  ${firstDiff(a, committed)}`);
      } else {
        console.log(`✓ live: regeneration byte-identical to committed data/tree.json`);
      }
    }
  }
}

if (failed) process.exit(1);
console.log('\n✓ DETERMINISM TEST PASSED');
