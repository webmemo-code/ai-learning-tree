// grow.mjs — the deterministic tree generator.
//
//   tree = grow(events, config, algoVersion)
//
// PURE FUNCTION. No filesystem, no Date.now, no Math.random. The "now" anchor is
// the latest event timestamp; all randomness comes from mulberry32 streams seeded
// from (config.seed, sector, ...) per docs/03 §4. Same (events, config,
// algoVersion) in => byte-identical tree.json out, on every machine, forever.
//
// This module owns geometry + metadata ONLY. It never touches pixels; the
// renderer never touches the raw log. Clean seam (docs/03 §4).
//
// Ported from prototypes/mood-sketch/index.html's approved curved-limb look
// (trunk + gravity/tropism limbs + secondary branching + canopy clusters +
// stratum-crossing blossoms + root flare). The per-sector drivers
// (level/act/recent/roots) that used to be hand-tuned constants are now DERIVED
// from the growth log — see deriveDrivers().

import { getTaxonomy } from './taxonomy.mjs';

export const ALGO_VERSION = '1.0.0';

// ----------------------------------------------------------------------------
// deterministic PRNG — mulberry32, seeded from a string hash of (seed, ...parts)
// ----------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a 32-bit string hash -> seed int (platform-independent)
function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// a fresh, independent stream keyed by (seed, ...parts) — doc §4 determinism anchor
function mkRng(seed, ...parts) {
  return mulberry32(strHash([seed, ...parts].join('|')));
}

// ----------------------------------------------------------------------------
// tiny vector helpers (plain arrays [x,y,z]; no THREE dependency in the generator)
// ----------------------------------------------------------------------------
const v = (x = 0, y = 0, z = 0) => [x, y, z];
const clone = (a) => [a[0], a[1], a[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
function normalize(a) { const l = len3(a) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; }
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const deg = (d) => (d * Math.PI) / 180;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const round4 = (n) => Math.round(n * 1e4) / 1e4;

// ----------------------------------------------------------------------------
// driver derivation — replaces the hand-tuned act/recent/roots/level constants
// ----------------------------------------------------------------------------
function normMax(map) {
  const mx = Math.max(0, ...Object.values(map));
  const out = {};
  for (const k of Object.keys(map)) out[k] = mx > 0 ? map[k] / mx : 0;
  return out;
}

// Returns { drivers: {sectorId: {level, act, recent, roots}}, unclassified:[...],
//           bySector:{id:{public:[], private:[], milestones:[], firstTs, lastTs}},
//           firstTs, lastTs }
function deriveDrivers(events, sectors) {
  const known = new Set(sectors.map((s) => s.id));
  const now = Math.max(...events.map((e) => e.tsMs));
  const RECENT_WINDOW = 30 * 86400000; // last 30 days before the now-anchor

  const bySector = {};
  for (const s of sectors) bySector[s.id] = { public: [], private: [], milestones: [], shipped: [] };
  const unclassified = [];

  const pubWeight = {};   // sum of public event weight
  const recentCount = {}; // count of events within the recency window
  const totalCount = {};
  const privWeight = {};  // sum of private (roots) weight
  const msLevel = {};     // max attrs.level among milestones (+ milestone count)
  const msCount = {};
  for (const s of sectors) { pubWeight[s.id] = 0; recentCount[s.id] = 0; totalCount[s.id] = 0; privWeight[s.id] = 0; msLevel[s.id] = 0; msCount[s.id] = 0; }

  for (const e of events) {
    if (!known.has(e.sector)) { unclassified.push(e); continue; }
    const b = bySector[e.sector];
    totalCount[e.sector]++;
    if (now - e.tsMs <= RECENT_WINDOW) recentCount[e.sector]++;
    if (e.private) { b.private.push(e); privWeight[e.sector] += e.weight; continue; }
    // public events
    if (e.kind === 'milestone') {
      b.milestones.push(e);
      msCount[e.sector]++;
      const lvl = e.attrs && Number.isFinite(e.attrs.level) ? e.attrs.level : 0;
      msLevel[e.sector] = Math.max(msLevel[e.sector], lvl);
    } else {
      b.public.push(e);
      pubWeight[e.sector] += e.weight;
      if (e.kind === 'shipped') b.shipped.push(e);
    }
  }

  // act: log-damped public-weight share, normalized so the busiest sector = 1.0
  const actRaw = {};
  for (const s of sectors) actRaw[s.id] = Math.log2(1 + pubWeight[s.id]);
  const act = normMax(actRaw);

  // recent: share of a sector's OWN events landing in the last 30d, normalized max->1
  const recentRaw = {};
  for (const s of sectors) recentRaw[s.id] = totalCount[s.id] > 0 ? recentCount[s.id] / totalCount[s.id] : 0;
  const recent = normMax(recentRaw);

  // roots: private-weight share, normalized max->1 (drives root-flare size)
  const roots = normMax(privWeight);

  const drivers = {};
  for (const s of sectors) {
    // level: 1 + milestone count, but authoritative attrs.level wins if higher
    const level = Math.max(1 + msCount[s.id], msLevel[s.id] || 1);
    drivers[s.id] = {
      level: Math.min(4, level),
      act: act[s.id],
      recent: recent[s.id],
      roots: roots[s.id],
    };
  }

  // per-sector event time bounds (for ts-derived born)
  for (const s of sectors) {
    const all = [...bySector[s.id].public, ...bySector[s.id].milestones, ...bySector[s.id].shipped];
    const ts = all.map((e) => e.tsMs);
    bySector[s.id].firstTs = ts.length ? Math.min(...ts) : now;
    bySector[s.id].lastTs = ts.length ? Math.max(...ts) : now;
  }

  const firstTs = Math.min(...events.map((e) => e.tsMs));
  return { drivers, unclassified, bySector, firstTs, lastTs: now };
}

// ----------------------------------------------------------------------------
// the growth algorithm (ported from the mood sketch — same look, now pure)
// ----------------------------------------------------------------------------
export function grow(events, config = {}, algoVersion = ALGO_VERSION) {
  const seed = config.seed != null ? String(config.seed) : 'seed';
  const taxonomy = getTaxonomy(config.taxonomy || 'default-v1');
  const SECTORS = taxonomy.sectors;
  const STRATA = taxonomy.strata;
  const secIndex = new Map(SECTORS.map((s, i) => [s.id, i]));

  // normalize + sort events (stable: by ts then id)
  const evs = events
    .map((e) => ({ ...e, tsMs: Date.parse(e.ts), weight: Number.isFinite(e.weight) ? e.weight : 1 }))
    .sort((a, b) => (a.tsMs - b.tsMs) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (evs.length === 0) throw new Error('grow(): empty event log');

  const { drivers, unclassified, bySector, firstTs, lastTs } = deriveDrivers(evs, SECTORS);

  // ts -> born in [0,1]. Trunk occupies the first TRUNK_SPAN; branches/leaves/
  // blossoms sweep across the rest by the timestamp of the work that grew them
  // (replay = growth-front sweep, docs/03 §5).
  const TRUNK_SPAN = 0.12;
  const span = lastTs - firstTs || 1;
  const tNorm = (ms) => TRUNK_SPAN + (1 - TRUNK_SPAN) * clamp01((ms - firstTs) / span);

  const STRATUM_BOUNDARIES = STRATA.slice(1).map((st) => st.y0);
  const ceilingFor = (lvl) => STRATA[Math.max(0, Math.min(3, lvl - 1))].y1 - 0.35;

  // ---- output accumulators ----
  const segments = [];     // { start, dir, len, r, born, dist, hue, sector }
  const leafClusters = []; // { center, radius, born, sector, density, count, eventIds }
  const blossoms = [];
  const fireflies = [];
  const roots = [];        // same shape as segments; kept separate then concatenated
  const eventMeta = {};    // id -> public event metadata for renderer detail panels

  function pushSeg(arr, start, dir, len, r, born, dist, hue, sec) {
    arr.push({
      start: clone(start), dir: normalize(dir), len, r,
      born: clamp01(born), dist: clamp01(dist), hue, sector: sec,
    });
  }
  function recordMeta(e) {
    if (!eventMeta[e.id]) {
      eventMeta[e.id] = { id: e.id, kind: e.kind, sector: e.sector, project: e.project || null, ts: e.ts };
      if (e.attrs && e.attrs.url) eventMeta[e.id].url = e.attrs.url;
    }
  }

  // ---- the trunk: one dominant leader, grows in during the first TRUNK_SPAN ----
  const TRUNK_H = 8.4, TRUNK_STEPS = 15, TRUNK_BASE_R = 0.54, TRUNK_TOP_R = 0.135;
  const trunkRng = mkRng(seed, '__trunk');
  const R = (rng, lo, hi) => lo + rng() * (hi - lo);
  const trunkNodes = [];
  {
    const leanAz = R(trunkRng, 0, Math.PI * 2), lean = R(trunkRng, 0.05, 0.09);
    const waver = R(trunkRng, 0.03, 0.06);
    let p = v(0, -0.35, 0), dir = v(0, 1, 0);
    for (let i = 0; i < TRUNK_STEPS; i++) {
      const t = i / (TRUNK_STEPS - 1);
      const r = TRUNK_TOP_R + (TRUNK_BASE_R - TRUNK_TOP_R) * Math.pow(1 - t, 1.5);
      const dist = 0.32 * t;
      const born = TRUNK_SPAN * t;
      trunkNodes.push({ pos: clone(p), dir: normalize(dir), r, dist, born, frac: t });
      const bend = lean * t + waver * Math.sin(t * Math.PI * 1.7 + 0.6);
      const target = normalize(v(Math.cos(leanAz) * bend, 1, Math.sin(leanAz) * bend));
      dir = normalize(lerp3(dir, target, 0.4));
      const len = (TRUNK_H / TRUNK_STEPS) * (0.9 + 0.2 * (1 - t));
      pushSeg(segments, p, dir, len, r, born, dist, 0x8a7a68, -1);
      p = addScaled(p, dir, len);
    }
  }
  function trunkAt(frac) {
    const f = Math.min(0.999, Math.max(0, frac));
    const x = f * (trunkNodes.length - 1);
    const i = Math.floor(x), k = x - i;
    const a = trunkNodes[i], b = trunkNodes[Math.min(trunkNodes.length - 1, i + 1)];
    return {
      pos: lerp3(a.pos, b.pos, k), dir: normalize(lerp3(a.dir, b.dir, k)),
      r: a.r + (b.r - a.r) * k, dist: a.dist + (b.dist - a.dist) * k,
    };
  }

  // ---- a limb: eased curve, gravity sag + phototropic tip-curl, secondary forks ----
  // `rng` is the sector's stream; `tipClusters` collects branch-tip cluster stubs.
  function growBranch(rng, p0, dir0, r0, opts, tipClusters) {
    const {
      steps, stepLen, az, azKeep, ceil, hue, born0, bornSpan,
      depth, dist0, dist1, secIdx, isMain, ctx, gravity, tropism, taper, targetArr,
    } = opts;
    let p = clone(p0), dir = normalize(dir0), r = r0;
    for (let i = 0; i < steps; i++) {
      const t = steps > 1 ? i / (steps - 1) : 0;
      let target = clone(dir);
      // 1) azimuth keeping
      const rXZ = Math.hypot(target[0], target[2]) || 1e-4;
      const curAz = Math.atan2(target[2], target[0]);
      const dAz = Math.atan2(Math.sin(az - curAz), Math.cos(az - curAz));
      const newAz = curAz + dAz * azKeep;
      target[0] = Math.cos(newAz) * rXZ; target[2] = Math.sin(newAz) * rXZ;
      // 2) gravity sag
      target[1] -= gravity * Math.sin(Math.min(1, t) * Math.PI);
      // 3) phototropic tip-curl
      target[1] += tropism * smoothstep(0.5, 1.0, t);
      // 4) stratum ceiling — flatten & spread beneath instead of piercing
      if (p[1] + target[1] * stepLen > ceil) {
        target[1] = Math.min(target[1], (ceil - p[1]) / stepLen);
        if (target[1] < 0) target[1] *= 0.3;
      }
      target = normalize(target);
      dir = normalize(lerp3(dir, target, 0.3));

      const len = stepLen * (1 - 0.35 * t);
      const dist = dist0 + (dist1 - dist0) * t;
      const born = born0 + bornSpan * t;
      pushSeg(targetArr, p, dir, len, r, born, dist, hue, secIdx);
      const pPrev = clone(p);
      p = addScaled(p, dir, len);
      r *= taper;

      if (isMain && ctx) {
        for (const b of STRATUM_BOUNDARIES) {
          if ((pPrev[1] - b) * (p[1] - b) <= 0 && Math.abs(pPrev[1] - b) < 2.0) ctx.crossings.push({ y: b, pos: clone(p), born });
        }
      }

      // children — outer half, fan to twigs (da Vinci strand thinning at the fork)
      if (depth > 0 && t > 0.45 && rng() < 0.55) {
        const childArea = R(rng, 0.32, 0.5);
        const childR = r * Math.sqrt(childArea);
        r *= Math.sqrt(1 - childArea);
        const side = rng() < 0.5 ? 1 : -1;
        const spreadAz = az + side * R(rng, 0.35, 0.85);
        const up = R(rng, 0.2, 0.55);
        const fan = normalize(v(Math.cos(spreadAz) * (1 - up), up + 0.2, Math.sin(spreadAz) * (1 - up)));
        const cDir = normalize(lerp3(dir, fan, 0.6));
        growBranch(rng, p, cDir, childR, {
          ...opts,
          steps: Math.max(3, Math.round((steps - i) * 0.7)), stepLen: stepLen * 0.72,
          az: spreadAz, azKeep: azKeep * 0.55, born0: born, bornSpan: bornSpan * (1 - t) * 0.9,
          depth: depth - 1, dist0: dist, isMain: false, gravity: gravity * 1.1, tropism: tropism * 1.15,
        }, tipClusters);
      }
    }
    // foliage cluster stub at this tip (twigs, secondary tips, and each limb tip)
    if (tipClusters && (depth <= 1 || isMain)) {
      tipClusters.push({ center: clone(p), born0, bornSpan, depth });
    }
    return p;
  }

  // ---- 9 sector limbs fork off the trunk at staggered heights ----
  const TOP_DEPTH = 2;
  for (const s of SECTORS) {
    const d = drivers[s.id];
    const sb = bySector[s.id];
    const secIdx = secIndex.get(s.id);
    const rng = mkRng(seed, s.id);
    const az = deg(s.az);
    const lf = (d.level - 1) / 3;
    const attachFrac = Math.min(0.86, Math.max(0.14, 0.16 + lf * 0.55 + R(rng, -0.05, 0.12)));
    const node = trunkAt(attachFrac);
    const branchAngle = deg(62 - d.level * 6 + R(rng, -6, 8));
    const horiz = v(Math.cos(az), 0, Math.sin(az));
    const dir0 = normalize(add(scale(horiz, Math.sin(branchAngle)), v(0, Math.cos(branchAngle), 0)));
    const start = add(addScaled(node.pos, horiz, node.r * 0.8), v(0, R(rng, -0.05, 0.05), 0));
    const r0 = Math.min(node.r * 0.72, 0.1 + d.act * 0.14);
    const reach = (3.2 + d.act * 3.2 + (d.level - 1) * 1.1) * (0.5 + 0.5 * (d.level / 4));
    const steps = Math.round(6 + d.act * 6 + d.level * 1.2);

    // ts-derived born window for this sector's limb
    const born0 = tNorm(sb.firstTs);
    const bornEnd = Math.max(born0 + 0.02, tNorm(sb.lastTs));

    const ctx = { crossings: [] };
    const tipClusters = [];
    growBranch(rng, start, dir0, r0, {
      steps, stepLen: reach / steps, az, azKeep: 0.35, ceil: ceilingFor(d.level), hue: s.hue,
      born0, bornSpan: bornEnd - born0, depth: TOP_DEPTH, dist0: node.dist, dist1: 1.0,
      secIdx, isMain: true, ctx, gravity: 0.13, tropism: 0.17, taper: 0.9, targetArr: segments,
    }, tipClusters);

    // ---- assign this sector's public non-milestone events to the tip clusters ----
    const pub = sb.public.slice().sort((a, b) => a.tsMs - b.tsMs);
    let clusters = tipClusters;
    if (pub.length === 0) {
      clusters = []; // no public work -> no canopy for this sector
    } else if (clusters.length > pub.length) {
      clusters = clusters.slice(0, pub.length); // guarantee every emitted cluster carries >=1 real event
    }
    // round-robin events across clusters (chronological) so each cluster is real
    const buckets = clusters.map(() => []);
    pub.forEach((e, i) => { if (clusters.length) buckets[i % clusters.length].push(e); });

    clusters.forEach((tc, ci) => {
      const evList = buckets[ci];
      if (!evList.length) return;
      evList.forEach(recordMeta);
      const cr = 0.4 + d.act * 0.4 + (2 - tc.depth) * 0.12;
      const latest = Math.max(...evList.map((e) => e.tsMs));
      const born = Math.max(tc.born0 + tc.bornSpan, tNorm(latest));
      const count = Math.max(4, Math.round((3 + d.act * 7) * (tc.depth === 0 ? 1.0 : 1.4)));
      leafClusters.push({
        center: clone(tc.center), radius: cr, born, sector: secIdx,
        density: tc.depth === 0 ? 1.0 : 1.4, count, eventIds: evList.map((e) => e.id),
      });
      // fireflies: this cluster's events within 7 days of the now-anchor
      const SEVEN = 7 * 86400000;
      for (const e of evList) {
        if (lastTs - e.tsMs <= SEVEN) {
          const rr = cr * 1.25;
          fireflies.push({
            pos: [tc.center[0] + R(rng, -rr, rr), tc.center[1] + R(rng, -rr * 0.7, rr), tc.center[2] + R(rng, -rr, rr)],
            hue: s.hue, sector: secIdx, eventId: e.id,
          });
        }
      }
    });

    // ---- blossoms mark each stratum boundary this sector crossed (real milestones) ----
    const milestones = sb.milestones.slice().sort((a, b) => (a.attrs?.level || 0) - (b.attrs?.level || 0));
    for (let lvl = 2; lvl <= d.level; lvl++) {
      const boundary = STRATA[lvl - 1].y0;
      const near = ctx.crossings.filter((c) => Math.abs(c.y - boundary) < 0.01);
      const c = near.length ? near[(rng() * near.length) | 0] : null;
      // the milestone event that granted this level (attrs.level === lvl), else the nearest
      let ms = milestones.find((m) => (m.attrs?.level || 0) === lvl) || milestones[lvl - 2] || milestones[milestones.length - 1] || null;
      if (c && ms) {
        recordMeta(ms);
        blossoms.push({
          pos: [c.pos[0] + R(rng, -0.15, 0.15), c.pos[1] + R(rng, 0, 0.25), c.pos[2] + R(rng, -0.15, 0.15)],
          born: Math.min(0.95, Math.max(c.born + 0.03, tNorm(ms.tsMs))),
          hue: s.hue, sector: secIdx, stratum: STRATA[lvl - 1].name, levelLabel: STRATA[lvl - 1].level, level: lvl,
          eventId: ms.id, evidence: ms.attrs?.evidence || null, note: ms.attrs?.note || null,
        });
      }
    }

    // ---- roots: mirror the compass below ground (private-note flare), dim ----
    const nRoots = 1 + Math.round(d.roots * 2);
    for (let k = 0; k < nRoots; k++) {
      const ra = az + R(rng, -0.4, 0.4);
      const rd = normalize(v(Math.cos(ra) * 0.85, -0.9, Math.sin(ra) * 0.85));
      const rStart = v(Math.cos(az) * TRUNK_BASE_R * 0.6, -0.2, Math.sin(az) * TRUNK_BASE_R * 0.6);
      growBranch(rng, rStart, rd, 0.06 + d.roots * 0.06, {
        steps: 4 + Math.round(d.roots * 4), stepLen: 0.5, az: ra, azKeep: 0.4, ceil: -0.05,
        hue: 0x36503f, born0: 0.03 + R(rng, 0, 0.09), bornSpan: 0.3, depth: 1, dist0: 0.12, dist1: 0.02,
        secIdx: -1, isMain: false, ctx: null, gravity: 0.06, tropism: -0.04, taper: 0.86, targetArr: roots,
      }, null);
    }
  }

  // ---- unclassified: faint gray shoots at the trunk base (docs/03 §3 rule 4) ----
  if (unclassified.length) {
    const rng = mkRng(seed, '__unclassified');
    const n = Math.min(unclassified.length, 5);
    for (let k = 0; k < n; k++) {
      const a = (k / Math.max(1, n)) * Math.PI * 2 + R(rng, -0.2, 0.2);
      const start = v(Math.cos(a) * TRUNK_BASE_R * 0.7, -0.1, Math.sin(a) * TRUNK_BASE_R * 0.7);
      const dir = normalize(v(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5));
      growBranch(rng, start, dir, 0.05, {
        steps: 4, stepLen: 0.32, az: a, azKeep: 0.4, ceil: 1.2, hue: 0x5b6472,
        born0: tNorm(unclassified[k].tsMs), bornSpan: 0.04, depth: 0, dist0: 0.1, dist1: 0.4,
        secIdx: -1, isMain: false, ctx: null, gravity: 0.05, tropism: 0.1, taper: 0.85, targetArr: segments,
      }, null);
    }
  }

  // ---- merge roots into the segment list (single instanced mesh in the renderer) ----
  for (const rs of roots) segments.push(rs);

  // ---- round everything to 4 decimals for byte-stable output ----
  const roundSeg = (s) => ({
    start: s.start.map(round4), dir: s.dir.map(round4), len: round4(s.len), r: round4(s.r),
    born: round4(s.born), dist: round4(s.dist), hue: s.hue, sector: s.sector,
  });
  const outSegments = segments.map(roundSeg);
  const outClusters = leafClusters.map((c) => ({
    center: c.center.map(round4), radius: round4(c.radius), born: round4(c.born),
    sector: c.sector, density: round4(c.density), count: c.count, eventIds: c.eventIds,
  }));
  const outBlossoms = blossoms.map((b) => ({
    pos: b.pos.map(round4), born: round4(b.born), hue: b.hue, sector: b.sector,
    stratum: b.stratum, levelLabel: b.levelLabel, level: b.level,
    eventId: b.eventId, evidence: b.evidence, note: b.note,
  }));
  const outFireflies = fireflies.map((f) => ({ pos: f.pos.map(round4), hue: f.hue, sector: f.sector, eventId: f.eventId }));

  // ---- bounds ----
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const s of outSegments) {
    const tip = addScaled(s.start, s.dir, s.len);
    for (const pt of [s.start, tip]) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], pt[i]); max[i] = Math.max(max[i], pt[i]); }
  }

  // ---- sectors block for the renderer (compass, filter, legend) ----
  const outSectors = SECTORS.map((s, i) => ({
    id: s.id, label: s.label, limb: s.limb, az: s.az, hue: s.hue, index: i,
    level: drivers[s.id].level, act: round4(drivers[s.id].act),
    recent: round4(drivers[s.id].recent), roots: round4(drivers[s.id].roots),
  }));

  return {
    algoVersion,
    seed,
    taxonomy: taxonomy.version,
    generatedFrom: {
      events: evs.length,
      earliestTs: new Date(firstTs).toISOString().replace('.000Z', 'Z'),
      latestTs: new Date(lastTs).toISOString().replace('.000Z', 'Z'),
      unclassified: unclassified.length,
    },
    strata: STRATA.map((st) => ({ name: st.name, level: st.level, y0: st.y0, y1: st.y1, tint: st.tint })),
    sectors: outSectors,
    segments: outSegments,
    leafClusters: outClusters,
    blossoms: outBlossoms,
    fireflies: outFireflies,
    eventMeta,
    bounds: { min: min.map(round4), max: max.map(round4) },
  };
}

export default grow;
