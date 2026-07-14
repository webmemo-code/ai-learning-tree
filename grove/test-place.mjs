// test-place.mjs — the grove's trust properties (ADR-0006/0007) as executable
// checks. Run: node grove/test-place.mjs
import { placeGrove, parsePlantings, PLACE_VERSION, DEFAULTS } from './place.mjs';

let passed = 0, failed = 0;
function ok(cond, label, extra = '') {
  if (cond) { passed++; }
  else { failed++; console.error(`✗ ${label}${extra ? '  [' + extra + ']' : ''}`); }
}
function throws(fn, re, label) {
  try { fn(); ok(false, label, 'did not throw'); }
  catch (e) { ok(re.test(String(e.message)), label, e.message); }
}

const plant = (n, clearing) => ({ kind: 'planted', tree: `owner/tree-${n}`, url: `https://example.com/${n}/tree.json`, clearing, ts: '2026-08-01T00:00:00Z' });
const range = (n) => [...Array(n).keys()];

// ---------- 1. determinism ----------
{
  const log = [
    { kind: 'clearing', id: 'acme', label: 'ACME guild' },
    ...range(40).map(i => plant(i, i % 3 ? 'commons' : 'acme')),
  ];
  const a = JSON.stringify(placeGrove(log, { seed: 'g1' }));
  const b = JSON.stringify(placeGrove(log, { seed: 'g1' }));
  ok(a === b, 'same log + seed => byte-identical placement');
  const c = JSON.stringify(placeGrove(log, { seed: 'g2' }));
  ok(a !== c, 'different grove seed => different azimuths');
  ok(JSON.parse(a).placeVersion === PLACE_VERSION, 'output is placeVersion-stamped');
}

// ---------- 2. append-stability: new plantings move zero existing trees ----------
{
  const full = [
    { kind: 'clearing', id: 'acme' },
    ...range(120).map(i => plant(i, i % 4 ? 'commons' : 'acme')),
    { kind: 'clearing', id: 'late-team' },
    ...range(30).map(i => plant(200 + i, 'late-team')),
  ];
  for (const cut of [1, 13, 60, 121]) {
    const prefix = placeGrove(full.slice(0, cut), { seed: 'g1' });
    const whole = placeGrove(full, { seed: 'g1' });
    const stable = prefix.trees.every((t, i) =>
      JSON.stringify(t) === JSON.stringify(whole.trees[i])) &&
      prefix.clearings.every(pc => {
        const wc = whole.clearings.find(w => w.id === pc.id);
        return wc && wc.center[0] === pc.center[0] && wc.center[1] === pc.center[1];
      });
    ok(stable, `append-stability: prefix of ${cut} lines unchanged by the rest`);
  }
}

// ---------- 3. spacing floors (the phyllotaxis packing claims, measured) ----------
{
  const N = DEFAULTS.clearingCapacity;
  const g = placeGrove(range(N).map(i => plant(i, 'commons')), { seed: 'g1' });
  let min = Infinity;
  const ps = g.trees.map(t => t.pos);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const d = Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]);
    if (d < min) min = d;
  }
  console.log(`   measured min tree spacing: ${(min / DEFAULTS.plotPitch).toFixed(3)}·pitch over ${N} plots`);
  ok(min >= 0.85 * DEFAULTS.plotPitch, 'min tree spacing >= 0.85·plotPitch at full capacity', `${min.toFixed(2)}`);
  const rim = Math.max(...ps.map(p => Math.hypot(p[0], p[1])));
  ok(rim <= g.config.reservedRadius, 'a full clearing stays inside its reserved radius', `rim=${rim.toFixed(1)} reserved=${g.config.reservedRadius.toFixed(1)}`);
}
{
  // 24 clearings (the default grove bound): reserved discs must stay disjoint
  const log = range(23).map(i => ({ kind: 'clearing', id: `c${i}` }));
  const g = placeGrove(log, { seed: 'g1' });
  let min = Infinity;
  const cs = g.clearings.map(c => c.center);
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const d = Math.hypot(cs[i][0] - cs[j][0], cs[i][1] - cs[j][1]);
    if (d < min) min = d;
  }
  console.log(`   measured min clearing gap: ${(min / (2 * g.config.reservedRadius)).toFixed(3)}·(2·reserved) over 24 clearings`);
  ok(min >= 2 * g.config.reservedRadius, '24 clearings: reserved discs disjoint', `min=${min.toFixed(0)} need=${(2 * g.config.reservedRadius).toFixed(0)}`);
}

// ---------- 4. slots are eternal: stumps, transplants, tombstones ----------
{
  const g = placeGrove([
    { kind: 'clearing', id: 'acme' },
    plant(1), plant(2), // commons slots 0,1
    { kind: 'transplanted', tree: 'owner/tree-1', to: 'acme' },
    plant(3), // commons: must take slot 2, NOT tree-1's vacated slot 0
  ], { seed: 'g1' });
  const stump = g.trees.find(t => t.state === 'stump');
  const t1 = g.trees.find(t => t.tree === 'owner/tree-1' && t.state === 'alive');
  const t3 = g.trees.find(t => t.tree === 'owner/tree-3');
  ok(!!stump && stump.clearing === 'commons' && stump.slot === 0, 'transplant leaves a stump at the old slot');
  ok(t1.clearing === 'acme' && t1.slot === 0, 'transplant takes the target clearing\'s next slot');
  ok(t3.slot === 2, 'a vacated slot is never reused', `slot=${t3.slot}`);
}
{
  // tombstone: replacing a planted line with `reserved` shifts nobody after it
  const before = placeGrove([plant(1), plant(2), plant(3)], { seed: 'g1' });
  const after = placeGrove([plant(1), { kind: 'reserved', clearing: 'commons' }, plant(3)], { seed: 'g1' });
  const pos = (g, id) => g.trees.find(t => t.tree === id).pos.join(',');
  ok(pos(before, 'owner/tree-3') === pos(after, 'owner/tree-3'), 'reserved tombstone: later trees stand exactly where they stood');
  ok(after.trees.length === 2, 'tombstone itself renders nothing');
}
{
  const g = placeGrove([plant(1), { kind: 'felled', tree: 'owner/tree-1' }, plant(1)], { seed: 'g1' });
  ok(g.trees.filter(t => t.tree === 'owner/tree-1').length === 2, 'replanting after felled is allowed');
  ok(g.trees[0].state === 'stump' && g.trees[0].url === null, 'felled leaves a stump and drops the URL');
  ok(g.trees[1].slot === 1, 'the replant takes a fresh slot');
}
{
  const g = placeGrove([plant(1), { kind: 'renamed', tree: 'owner/tree-1', to: 'newowner/tree-1', url: 'https://example.com/new.json' }], { seed: 'g1' });
  ok(g.trees[0].tree === 'newowner/tree-1' && g.trees[0].slot === 0 && g.trees[0].url.endsWith('new.json'), 'rename keeps the slot, updates id + url');
}

// ---------- 5. validation (what the grove CI would reject pre-merge) ----------
throws(() => placeGrove([plant(1, 'nowhere')]), /unknown clearing/, 'planting into an undeclared clearing throws');
throws(() => placeGrove([plant(1), plant(1)]), /already planted/, 'double planting throws');
throws(() => placeGrove([{ kind: 'clearing', id: 'a' }, { kind: 'clearing', id: 'a' }]), /already declared/, 'redeclaring a clearing throws');
throws(() => placeGrove([{ kind: 'felled', tree: 'owner/none' }]), /not alive/, 'felling an unknown tree throws');
throws(() => placeGrove(range(3).map(i => plant(i)), { clearingCapacity: 2 }), /full/, 'capacity overflow throws');
{
  const g = placeGrove([{ kind: 'partyhat', wat: true }, plant(1)], { seed: 'g1' });
  ok(g.trees.length === 1 && g.trees[0].slot === 0, 'unknown event kinds are ignored (forward compat) and consume no slot');
}

// ---------- 6. parser ----------
{
  const evs = parsePlantings('# a comment\n\n{"kind":"planted","tree":"a/b"}\n');
  ok(evs.length === 1 && evs[0].tree === 'a/b', 'parser skips comments/blanks, keeps order');
  throws(() => parsePlantings('{"kind":"planted"}\nnope'), /line 2: invalid JSON/, 'parser reports the failing line');
}

console.log(failed ? `\n✗ ${failed} failed, ${passed} passed` : `\n✓ all green — ${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
