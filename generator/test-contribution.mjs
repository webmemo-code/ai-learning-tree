#!/usr/bin/env node
// test-contribution.mjs — the contribution-meadow data contract (ADR-0010).
// Zero-dep, no fixtures on disk: tiny inline event logs are fed to grow() and the
// emitted `contribution` array is asserted. Covers: absolute-week bucketing across
// a Sunday/Monday UTC boundary; the privacy.contributions knob (public-only vs
// combined vs hidden); privCount/privWeight aggregate reporting; sort order; level
// bounds; and the "only github-source commits bucket — milestones stay blossoms,
// vault notes stay roots-only" invariant (ADR-0010). Style-matched to
// harvester/test-harvest.mjs's eq/ok harness.
//
//   node generator/test-contribution.mjs

import { grow } from './grow.mjs';

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// A real taxonomy sector id so events classify (build.pro-code is index 8 in
// default-v1; create.copy is another). grow() throws on an empty log, so every
// fixture carries at least one event.
const baseCfg = { seed: 'test', taxonomy: 'default-v1' };
// a public commit builder (defaults keep call sites terse)
let n = 0;
const ev = (ts, sector, weight = 1, priv = false, kind = 'commit') =>
  ({ id: `e${n++}:${ts}:${sector}`, ts, source: 'github', kind, sector, project: 'p', weight, private: priv });

const contribOf = (events, cfg = {}) => grow(events, { ...baseCfg, ...cfg }).contribution;

// ============================================================================
// 1. absolute-UTC-week bucketing across a Sunday/Monday boundary
//    2026-07-12 is a SUNDAY -> belongs to the week whose Monday is 2026-07-06.
//    2026-07-13 is a MONDAY -> starts the next week bucket (Monday 2026-07-13).
// ============================================================================
{
  const c = contribOf([
    ev('2026-07-12T23:59:00Z', 'build.pro-code'),   // Sunday -> week of 07-06
    ev('2026-07-13T00:01:00Z', 'build.pro-code'),   // Monday -> week of 07-13
  ]);
  eq(c.length, 2, 'Sunday and the following Monday fall in different week buckets');
  eq(c.map((b) => b.weekTs), ['2026-07-06', '2026-07-13'], 'weekTs is each bucket\'s UTC Monday, YYYY-MM-DD');
  ok(c.every((b) => b.count === 1), 'each single-event week has count 1');
}

// ============================================================================
// 2. public-only (default): private events are EXCLUDED entirely
// ============================================================================
{
  const c = contribOf([
    ev('2026-07-13T09:00:00Z', 'build.pro-code', 2, false),
    ev('2026-07-13T10:00:00Z', 'build.pro-code', 5, true),   // private — dropped in public-only
  ]);
  eq(c.length, 1, 'public-only: one bucket');
  eq(c[0].count, 1, 'public-only: private event not counted');
  eq(c[0].weight, 2, 'public-only: private weight not summed');
  eq([c[0].privCount, c[0].privWeight], [0, 0], 'public-only: privCount/privWeight are 0');
}

// ============================================================================
// 3. combined: private events INCLUDED; privCount/privWeight report their share
// ============================================================================
{
  const cfg = { privacy: { contributions: 'combined' } };
  const c = contribOf([
    ev('2026-07-13T09:00:00Z', 'build.pro-code', 2, false),
    ev('2026-07-13T10:00:00Z', 'build.pro-code', 5, true),
    ev('2026-07-13T11:00:00Z', 'build.pro-code', 1.5, true),
  ], cfg);
  eq(c.length, 1, 'combined: one bucket');
  eq(c[0].count, 3, 'combined: all three events counted');
  eq(c[0].weight, 8.5, 'combined: total weight includes private (2+5+1.5)');
  eq(c[0].privCount, 2, 'combined: privCount = number of private events');
  eq(c[0].privWeight, 6.5, 'combined: privWeight = private share of weight (5+1.5)');
  ok(c[0].privWeight <= c[0].weight && c[0].privCount <= c[0].count, 'combined: private share never exceeds the total');
}

// ============================================================================
// 4. hidden: the contribution key is omitted entirely
// ============================================================================
{
  const tree = grow([ev('2026-07-13T09:00:00Z', 'build.pro-code')], { ...baseCfg, privacy: { contributions: 'hidden' } });
  ok(!('contribution' in tree), 'hidden: no contribution key at all');
}

// weight-2 decimals rounding is byte-stable (mirrors the segment round4 discipline)
{
  const c = contribOf([ev('2026-07-13T09:00:00Z', 'build.pro-code', 1.005)]);
  ok(Number.isFinite(c[0].weight) && c[0].weight === Math.round(c[0].weight * 100) / 100, 'weight rounded to 2 decimals');
}

// ============================================================================
// 5. sort order (weekTs asc, then sector asc) + level bounds 1..4, never 0
// ============================================================================
{
  // three weeks x two sectors, deliberately out of order on input
  const c = contribOf([
    ev('2026-07-20T09:00:00Z', 'create.copy', 3),
    ev('2026-07-06T09:00:00Z', 'build.pro-code', 8),
    ev('2026-07-06T10:00:00Z', 'create.copy', 1),
    ev('2026-07-13T09:00:00Z', 'build.pro-code', 4),
    ev('2026-07-06T11:00:00Z', 'build.pro-code', 2),   // same week+sector as above -> merges
  ], { privacy: { contributions: 'combined' } });
  // primary key weekTs asc, secondary sector asc
  const keys = c.map((b) => `${b.weekTs}#${b.sector}`);
  const sorted = [...keys].sort();
  eq(keys, sorted, 'buckets sorted by weekTs asc then sector asc');
  ok(c.every((b) => b.level >= 1 && b.level <= 4), 'level within 1..4');
  ok(c.every((b) => b.level !== 0), 'level 0 never emitted');
  ok(c.every((b) => Number.isInteger(b.level)), 'level is an integer');
  // the busiest bucket (max weight) quantizes to the top level 4
  const top = c.reduce((m, b) => (b.weight > m.weight ? b : m));
  eq(top.level, 4, 'field-max bucket quantizes to level 4');
}

// ============================================================================
// 6. only GITHUB-SOURCE commits bucket: milestones (source 'manual') and vault
//    notes (source 'obsidian') are EXCLUDED; unclassified skipped (ADR-0010).
//    Milestones keep their blossom signal; vault notes stay roots-only (ADR-0002).
// ============================================================================
{
  const events = [
    ev('2026-07-06T09:00:00Z', 'build.pro-code', 1, false),
    ev('2026-07-06T10:00:00Z', 'build.pro-code', 1, true),
    ev('2026-07-13T09:00:00Z', 'create.copy', 1, false),
    { id: 'ms0', ts: '2026-07-13T10:00:00Z', source: 'manual', kind: 'milestone', sector: 'create.copy', weight: 1, private: false }, // milestone -> EXCLUDED (blossom, not a bucket)
    ev('2026-07-13T11:00:00Z', 'not-a-real-sector', 1, false),        // unclassified -> skipped
  ];
  const cCombined = contribOf(events, { privacy: { contributions: 'combined' } });
  const sumCombined = cCombined.reduce((s, b) => s + b.count, 0);
  eq(sumCombined, 3, 'combined: bucket counts sum to the 3 github-source classified commits (milestone + unclassified excluded)');

  const cPublic = contribOf(events); // public-only default
  const sumPublic = cPublic.reduce((s, b) => s + b.count, 0);
  eq(sumPublic, 2, 'public-only: bucket counts sum to the 2 PUBLIC github-source commits');
  // the manual milestone does NOT share the week bucket — only the github commit lands there
  const wk = cPublic.find((b) => b.weekTs === '2026-07-13');
  eq(wk.count, 1, 'public-only: the milestone (source manual) is excluded — only the github commit buckets');
}

// ============================================================================
// 7. an obsidian-source private event is EXCLUDED even in combined mode
//    (vault knowledge stays roots-only, ADR-0002/ADR-0010) — it must never
//    contaminate the above-ground meadow the way github private work may.
// ============================================================================
{
  const note = { id: 'note0', ts: '2026-07-13T12:00:00Z', source: 'obsidian', kind: 'note', sector: 'build.pro-code', weight: 3, private: true };
  const commit = ev('2026-07-13T09:00:00Z', 'build.pro-code', 2, true); // github private -> DOES bucket in combined
  const c = contribOf([note, commit], { privacy: { contributions: 'combined' } });
  eq(c.length, 1, 'combined: one bucket (only the github event)');
  eq(c[0].count, 1, 'combined: the obsidian note is NOT counted (roots-only, ADR-0002)');
  eq(c[0].weight, 2, 'combined: the obsidian note weight is NOT summed');
  eq([c[0].privCount, c[0].privWeight], [1, 2], 'combined: only the github private commit contributes to the private share');
}

// ----------------------------------------------------------------------------
console.log(`\n${failed === 0 ? '✓ all green' : '✗ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
