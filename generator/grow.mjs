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
// algoVersion 2.0.0 — THE ACACIA (ADR-0008, prototypes/acacia-look + acacia-sketch).
// The tree's species changed: a short stout bole forks low into one angular,
// elbowed rib per sector; each rib rises steeply and flattens hard under its
// EARNED stratum ceiling, ending in a flat foliage pad. The 1.x ceiling rule
// ("flatten & spread beneath instead of piercing") is now the silhouette's
// defining feature: a level-up = the pad visibly lifts to the next band.
// Below ground nothing changed — roots keep the 1.x curved-limb habit (and the
// unclassified shoots keep theirs), each on its own PRNG stream.
// The per-sector drivers (level/act/recent/roots) are DERIVED from the growth
// log — see deriveDrivers().
//
// algoVersion 3.0.0 — ACTIVITY FILLS THE BAND (ADR-0009). The earned stratum
// still gates height (ADR-0004: only milestones cross a boundary), but the pad
// no longer parks at the band top the moment the band is unlocked. Instead the
// ceiling starts at the band floor and RISES with log-damped work weight
// accrued since the level-up — a week of daily entries lifts the sector's
// twigs a little higher each day. Levels 1–3 clamp just under the band top
// (brushing it is the "author the milestone" nudge); the top band (Expert /
// Emergent) never clamps — past that threshold the tree simply keeps growing.
// With the harvest.private-repos opt-in, private GitHub commits count as
// canopy-lifting WORK (aggregate geometry only — ids/refs never leave the
// log); private vault notes remain roots-only knowledge (ADR-0002).

import { getTaxonomy } from './taxonomy.mjs';

export const ALGO_VERSION = '3.0.0';

// Neutral warm bark-gray for silhouette-mode roots (no sector attribution). Owner
// mode paints roots with their sector hue instead; hidden mode emits no roots.
const ROOT_SILHOUETTE_HUE = 0x6b5f52;

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

// Private GitHub commits are WORK (unlike vault notes, which are knowledge and
// stay roots-only per ADR-0002) — with the harvest.private-repos opt-in their
// weight lifts the canopy as aggregate geometry; ids/refs never leave the log.
const isPrivateWork = (e) => !!e.private && e.source === 'github';

// work weight that fills one stratum band, log-damped (ADR-0009). ~60 weight is
// a few weeks of daily entries: early days move the pad visibly, a backlog
// can't teleport it, and past the Expert threshold the same curve keeps rising.
const BAND_FILL_WEIGHT = 60;

// Returns { drivers: {sectorId: {level, act, recent, roots, fill}}, unclassified:[...],
//           bySector:{id:{public:[], private:[], milestones:[], firstTs, lastTs}},
//           firstTs, lastTs }
function deriveDrivers(events, sectors, { privateCanopy = false } = {}) {
  const known = new Set(sectors.map((s) => s.id));
  const now = Math.max(...events.map((e) => e.tsMs));
  const RECENT_WINDOW = 30 * 86400000; // last 30 days before the now-anchor

  const bySector = {};
  for (const s of sectors) bySector[s.id] = { public: [], private: [], milestones: [], shipped: [] };
  const unclassified = [];

  const workWeight = {};  // weight that grows wood: public + (opt-in) private GitHub work
  const recentCount = {}; // count of events within the recency window
  const totalCount = {};
  const privWeight = {};  // sum of private (roots) weight
  const msLevel = {};     // max attrs.level among milestones (+ milestone count)
  const msCount = {};
  const msLastTs = {};    // ts of the sector's latest milestone — the band-unlock moment
  for (const s of sectors) { workWeight[s.id] = 0; recentCount[s.id] = 0; totalCount[s.id] = 0; privWeight[s.id] = 0; msLevel[s.id] = 0; msCount[s.id] = 0; msLastTs[s.id] = -Infinity; }

  // recent/total tally ONLY events that shape the public canopy — public events
  // plus (opt-in) private GitHub work. Vault notes must not tick an above-ground
  // freshness signal (docs/03 §6 rule 2: knowledge influences roots only).
  const tally = (sec, tsMs) => {
    totalCount[sec]++;
    if (now - tsMs <= RECENT_WINDOW) recentCount[sec]++;
  };
  for (const e of events) {
    if (!known.has(e.sector)) { unclassified.push(e); continue; }
    const b = bySector[e.sector];
    if (e.private) {
      b.private.push(e);
      privWeight[e.sector] += e.weight;
      if (privateCanopy && isPrivateWork(e)) {
        workWeight[e.sector] += e.weight;
        tally(e.sector, e.tsMs);
      }
      continue;
    }
    tally(e.sector, e.tsMs);
    // public events
    if (e.kind === 'milestone') {
      b.milestones.push(e);
      msCount[e.sector]++;
      msLastTs[e.sector] = Math.max(msLastTs[e.sector], e.tsMs);
      const lvl = e.attrs && Number.isFinite(e.attrs.level) ? e.attrs.level : 0;
      msLevel[e.sector] = Math.max(msLevel[e.sector], lvl);
    } else {
      b.public.push(e);
      workWeight[e.sector] += e.weight;
      if (e.kind === 'shipped') b.shipped.push(e);
    }
  }

  // act: log-damped work-weight share, normalized so the busiest sector = 1.0
  const actRaw = {};
  for (const s of sectors) actRaw[s.id] = Math.log2(1 + workWeight[s.id]);
  const act = normMax(actRaw);

  // fill: how far up its CURRENT band a sector has climbed (ADR-0004 rule 1
  // made real — ADR-0009). Only work accrued AFTER the milestone that unlocked
  // the band counts (all-time for level-1 sectors), so each level starts at its
  // band floor and daily entries lift the pad day by day. May exceed 1.0 — the
  // per-level clamp lives in grow()'s ceilingFor (the top band never clamps).
  const fillWeight = {};
  for (const s of sectors) fillWeight[s.id] = 0;
  for (const e of events) {
    if (!known.has(e.sector) || e.kind === 'milestone') continue;
    if (e.private && !(privateCanopy && isPrivateWork(e))) continue;
    if (e.tsMs > msLastTs[e.sector]) fillWeight[e.sector] += e.weight;
  }
  const fillDenom = Math.log2(1 + BAND_FILL_WEIGHT);

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
      fill: Math.log2(1 + fillWeight[s.id]) / fillDenom,
    };
  }

  // per-sector event time bounds (for ts-derived born); opt-in private work
  // sweeps the rib's growth front just like public work does
  for (const s of sectors) {
    const b = bySector[s.id];
    const all = [...b.public, ...b.milestones, ...(privateCanopy ? b.private.filter(isPrivateWork) : [])];
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
  // Privacy mode for the root system (docs/03 §6 rule 2/3, ADR-0005). Default is
  // `silhouette` — safe by default: geometry stays but nothing attributes it to a
  // sector and no private aggregates ship. Walter's own config says `owner`.
  const rootsMode = (() => {
    const m = config.privacy && config.privacy.roots;
    return (m === 'owner' || m === 'silhouette' || m === 'hidden') ? m : 'silhouette';
  })();
  // harvest.private-repos is a double opt-in (docs/03 §6 rules 2 + 4, ADR-0009):
  // harvesting private repos at all AND letting that private commit history grow
  // public canopy — as aggregate geometry only, never as ids/refs. Vault notes
  // stay roots-only regardless (isPrivateWork checks source === 'github').
  const privateCanopy = !!(config.harvest && config.harvest['private-repos']);
  const taxonomy = getTaxonomy(config.taxonomy || 'default-v1');
  const SECTORS = taxonomy.sectors;
  const STRATA = taxonomy.strata;
  const secIndex = new Map(SECTORS.map((s, i) => [s.id, i]));

  // normalize + sort events (stable: by ts then id)
  const evs = events
    .map((e) => ({ ...e, tsMs: Date.parse(e.ts), weight: Number.isFinite(e.weight) ? e.weight : 1 }))
    .sort((a, b) => (a.tsMs - b.tsMs) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (evs.length === 0) throw new Error('grow(): empty event log');

  const { drivers, unclassified, bySector, firstTs, lastTs } = deriveDrivers(evs, SECTORS, { privateCanopy });

  // ts -> born in [0,1]. Trunk occupies the first TRUNK_SPAN; branches/leaves/
  // blossoms sweep across the rest by the timestamp of the work that grew them
  // (replay = growth-front sweep, docs/03 §5).
  const TRUNK_SPAN = 0.12;
  const span = lastTs - firstTs || 1;
  const tNorm = (ms) => TRUNK_SPAN + (1 - TRUNK_SPAN) * clamp01((ms - firstTs) / span);

  const STRATUM_BOUNDARIES = STRATA.slice(1).map((st) => st.y0);
  // The earned band gates height (ADR-0004); ACTIVITY fills it (ADR-0009). The
  // ceiling starts at the band floor and rises with the sector's log-damped
  // fill driver, so a week of daily entries lifts the pad a little higher each
  // day. Levels 1–3 clamp just under the band top — brushing it is the "author
  // the milestone" nudge. The TOP band (Expert/Emergent) never clamps: past
  // that threshold the tree simply keeps growing above the stratum.
  const ceilingFor = (lvl, fill) => {
    const st = STRATA[Math.max(0, Math.min(STRATA.length - 1, lvl - 1))];
    const span = st.y1 - 0.35 - st.y0;
    const f = lvl >= STRATA.length ? fill : Math.min(1, fill);
    // a fresh level-up still lifts the pad visibly INTO the new band (min 0.25)
    return st.y0 + Math.max(lvl > 1 ? 0.25 : 0, span * f);
  };

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

  // ---- the bole: short and stout, forking low (was an 8.4-tall single leader) ----
  const BOLE_H = 2.0, BOLE_STEPS = 7, TRUNK_BASE_R = 0.6, TRUNK_TOP_R = 0.32;
  const trunkRng = mkRng(seed, '__trunk');
  const R = (rng, lo, hi) => lo + rng() * (hi - lo);
  const boleNodes = [];
  {
    const leanAz = R(trunkRng, 0, Math.PI * 2), lean = R(trunkRng, 0.04, 0.09);
    let p = v(0, -0.35, 0);
    for (let i = 0; i <= BOLE_STEPS; i++) {
      const t = i / BOLE_STEPS;
      const r = TRUNK_TOP_R + (TRUNK_BASE_R - TRUNK_TOP_R) * Math.pow(1 - t, 1.4);
      boleNodes.push({ pos: clone(p), r, dist: 0.26 * t, born: TRUNK_SPAN * t });
      if (i < BOLE_STEPS) {
        const bend = lean * t + 0.03 * Math.sin(t * 5.1);
        const q = v(
          p[0] + Math.cos(leanAz) * bend * (BOLE_H / BOLE_STEPS) * 6,
          p[1] + BOLE_H / BOLE_STEPS,
          p[2] + Math.sin(leanAz) * bend * (BOLE_H / BOLE_STEPS) * 6
        );
        const dvec = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        pushSeg(segments, p, dvec, len3(dvec), r, TRUNK_SPAN * t, 0.26 * t, 0x8a7a68, -1);
        p = q;
      }
    }
  }
  function boleAt(frac) {
    const f = Math.min(0.999, Math.max(0, frac));
    const x = f * (boleNodes.length - 1);
    const i = Math.floor(x), k = x - i;
    const a = boleNodes[i], b = boleNodes[Math.min(boleNodes.length - 1, i + 1)];
    return {
      pos: lerp3(a.pos, b.pos, k),
      r: a.r + (b.r - a.r) * k, dist: a.dist + (b.dist - a.dist) * k,
    };
  }

  // ---- the 1.x curved limb, kept verbatim for what DIDN'T change species: ----
  // roots (below ground) and the unclassified gray shoots at the bole's feet.
  // Eased curve, gravity sag + phototropic tip-curl, secondary forks.
  function growCurved(rng, p0, dir0, r0, opts, tipClusters) {
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
        growCurved(rng, p, cDir, childR, {
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

  // ---- the acacia ribs: one angular limb per sector, forking low off the bole, ----
  // ---- flattening hard under its EARNED stratum ceiling into a flat pad ----
  const RIB_STEPS = 11;
  for (const s of SECTORS) {
    const d = drivers[s.id];
    const sb = bySector[s.id];
    const secIdx = secIndex.get(s.id);
    const rng = mkRng(seed, s.id);
    const az0 = deg(s.az);

    // ts-derived born window for this sector's rib
    const born0 = tNorm(sb.firstTs);
    const bornEnd = Math.max(born0 + 0.02, tNorm(sb.lastTs));
    const bornAt = (t) => born0 + (bornEnd - born0) * t;

    const node = boleAt(0.55 + R(rng, 0, 0.4)); // tight low fork band — no leader above it
    // activity-filled ceiling — but never below the sapling's own fork
    const ceil = Math.max(ceilingFor(d.level, d.fill), node.pos[1] + 0.55);
    const reach = 1.9 + d.act * 2.4 + (d.level - 1) * 1.05;
    const r0 = Math.min(node.r * 0.75, 0.08 + d.act * 0.1);
    const distAt = (t) => node.dist + (1 - node.dist) * t;

    const crossings = [];   // exact stratum-boundary hits along the main rib (blossom anchors)
    const tips = [];        // pad anchor points: { pos, born, depth }

    const emit = (a, b, r, born, dist) => {
      const dvec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len = len3(dvec);
      if (len < 1e-5) return;
      pushSeg(segments, a, dvec, len, r, born, dist, s.hue, secIdx);
    };

    // secondary fans in the outer half — they define the pad's footprint
    const growFan = (from, azp, rhop, tp, rem, tier) => {
      const side = rng() < 0.5 ? 1 : -1;
      let azf = azp + side * R(rng, 0.16, 0.45);
      const ext = reach * (1 - tp) * R(rng, 0.45, 0.8) + 0.5;
      const M = 4;
      let q = from, tq = tp;
      for (let j = 1; j <= M; j++) {
        const u = j / M;
        const rr = rhop + ext * u;
        let yy = from[1] + (ceil - 0.06 - from[1]) * (1 - Math.pow(1 - u, 1.7));
        yy = Math.min(yy, ceil - 0.03) + ((j % 2 ? 1 : -1) * R(rng, 0.02, 0.06)) * (1 - u); // elbows
        azf += R(rng, -0.06, 0.06);
        const pp = v(node.pos[0] * 0.4 + Math.cos(azf) * rr, yy, node.pos[2] * 0.4 + Math.sin(azf) * rr);
        const tt = tp + (1 - tp) * u;
        emit(q, pp, r0 * 0.5 * (1 - 0.6 * u), bornAt(tt), distAt(tt));
        q = pp; tq = tt;
        if (rem > 0 && j === 2 && rng() < 0.55) growFan(pp, azf, rr, tt, rem - 1, tier + 1);
      }
      tips.push({ pos: clone(q), born: bornAt(tq), depth: tier });
    };

    // the main rib: steep rise off the fork, easing flat under the ceiling, elbowed
    let az = az0 + R(rng, -0.06, 0.06);
    let prev = null;
    const yA = node.pos[1], yB = ceil - 0.02;
    for (let i = 0; i <= RIB_STEPS; i++) {
      const t = i / RIB_STEPS;
      const rho = node.r * 0.85 + reach * Math.pow(t, 1.22);
      let y = yA + (yB - yA) * (1 - Math.pow(1 - t, 1.9));
      if (i > 0 && i < RIB_STEPS) y += ((i % 2 ? 1 : -1) * R(rng, 0.05, 0.12)) * (1 - t * 0.75); // elbows
      y = Math.min(y, ceil); // never pierce the earned ceiling (ADR-0004 made visible)
      az += R(rng, -0.05, 0.05);
      const p = v(node.pos[0] * 0.4 + Math.cos(az) * rho, y, node.pos[2] * 0.4 + Math.sin(az) * rho);
      if (prev) {
        emit(prev, p, r0 * (1 - 0.78 * ((i - 1) / RIB_STEPS)), bornAt(t), distAt(t));
        const tPrev = (i - 1) / RIB_STEPS;
        for (const b of STRATUM_BOUNDARIES) {
          if ((prev[1] - b) * (p[1] - b) <= 0 && prev[1] !== p[1] && Math.abs(prev[1] - b) < 2.0) {
            // interpolate position AND born with the same fraction — the blossom's
            // replay moment must match the exact crossing, not the segment's end
            const k = (b - prev[1]) / (p[1] - prev[1]);
            crossings.push({
              y: b,
              pos: [prev[0] + (p[0] - prev[0]) * k, b, prev[2] + (p[2] - prev[2]) * k],
              born: bornAt(tPrev + (t - tPrev) * k),
            });
          }
        }
      }
      if (i >= 5 && i < RIB_STEPS && rng() < 0.6) growFan(p, az, rho, t, 1, 1);
      if (i === RIB_STEPS) tips.push({ pos: clone(p), born: bornEnd, depth: 0 });
      prev = p;
    }

    // ---- assign this sector's public non-milestone events to the pad anchors ----
    const pub = sb.public.slice().sort((a, b) => a.tsMs - b.tsMs);
    // opt-in private work still grows a canopy — pads as pure geometry with NO
    // event refs (eventIds stays empty; the details never leave the log)
    const privWork = privateCanopy ? sb.private.filter(isPrivateWork) : [];
    const privLastTs = privWork.length ? Math.max(...privWork.map((e) => e.tsMs)) : -Infinity;
    let anchors = tips;
    if (pub.length === 0) {
      // no public work: private work (opt-in) lifts a few bare-ref pads; else no canopy
      anchors = privWork.length ? tips.slice(0, Math.min(tips.length, 1 + Math.round(d.act * 2))) : [];
    } else if (anchors.length > pub.length) {
      anchors = anchors.slice(0, pub.length); // guarantee every emitted cluster carries >=1 real event
    }
    // round-robin events across pads (chronological) so each pad is real
    const buckets = anchors.map(() => []);
    pub.forEach((e, i) => { if (anchors.length) buckets[i % anchors.length].push(e); });

    anchors.forEach((tc, ci) => {
      const evList = buckets[ci];
      if (!evList.length && !privWork.length) return;
      evList.forEach(recordMeta);
      // the pad: a flat lens on the ceiling plane, anchored at this tip
      const padY = ceil - 0.16 + R(rng, -0.06, 0.06);
      const center = [tc.pos[0] + R(rng, -0.35, 0.35), padY, tc.pos[2] + R(rng, -0.35, 0.35)];
      const cr = 0.55 + d.act * 0.35 + (tc.depth === 0 ? 0.15 : 0);
      const latest = evList.length ? Math.max(...evList.map((e) => e.tsMs)) : privLastTs;
      const born = Math.max(tc.born, tNorm(latest));
      const count = Math.max(4, Math.round((3 + d.act * 7) * (tc.depth === 0 ? 1.0 : 1.4)));
      leafClusters.push({
        center, radius: cr, born, sector: secIdx,
        density: tc.depth === 0 ? 1.0 : 1.4, count, eventIds: evList.map((e) => e.id),
      });
      // fireflies: this pad's events within 7 days of the now-anchor gather in
      // the shade UNDER the umbrella — the savanna's gathering place
      const SEVEN = 7 * 86400000;
      for (const e of evList) {
        if (lastTs - e.tsMs <= SEVEN) {
          fireflies.push({
            pos: [center[0] + R(rng, -1, 1) * cr * 1.1, padY - R(rng, 0.35, 1.4), center[2] + R(rng, -1, 1) * cr * 1.1],
            hue: s.hue, sector: secIdx, eventId: e.id,
          });
        }
      }
    });

    // ---- blossoms mark each stratum boundary this sector crossed (real milestones) ----
    // They ride the rib at the exact crossing — the rim the canopy lifted from.
    const milestones = sb.milestones.slice().sort((a, b) => (a.attrs?.level || 0) - (b.attrs?.level || 0));
    for (let lvl = 2; lvl <= d.level; lvl++) {
      const boundary = STRATA[lvl - 1].y0;
      const near = crossings.filter((c) => Math.abs(c.y - boundary) < 0.01);
      const c = near.length ? near[(rng() * near.length) | 0] : null;
      // the milestone event that granted this level (attrs.level === lvl), else the nearest
      let ms = milestones.find((m) => (m.attrs?.level || 0) === lvl) || milestones[lvl - 2] || milestones[milestones.length - 1] || null;
      if (c && ms) {
        recordMeta(ms);
        blossoms.push({
          pos: [c.pos[0] + R(rng, -0.15, 0.15), c.pos[1] + R(rng, 0.08, 0.3), c.pos[2] + R(rng, -0.15, 0.15)],
          born: Math.min(0.95, Math.max(c.born + 0.03, tNorm(ms.tsMs))),
          hue: s.hue, sector: secIdx, stratum: STRATA[lvl - 1].name, levelLabel: STRATA[lvl - 1].level, level: lvl,
          eventId: ms.id, evidence: ms.attrs?.evidence || null, note: ms.attrs?.note || null,
        });
      }
    }

    // ---- roots: mirror the compass below ground (private-note flare) ----
    // Privacy modes (docs/03 §6 rule 2/3, ADR-0005):
    //   hidden     → emit NO root segments at all (below-ground world is absent)
    //   silhouette → geometry only, one neutral bark-gray hue, no sector attribution
    //   owner      → geometry + per-sector hue/index (like above-ground segments)
    // The root GEOMETRY (start/dir/len/r/born/dist) is byte-identical between owner and
    // silhouette — only `hue`/`secIdx` (stored, never fed back into the PRNG) differ.
    // Roots kept the 1.x curved habit through the 2.0.0 species change; they now draw
    // from their own stream (seed, sector, 'roots') so the above-ground rewrite can
    // never reshuffle them again.
    if (rootsMode !== 'hidden') {
      const rootRng = mkRng(seed, s.id, 'roots');
      const rootHue = rootsMode === 'owner' ? s.hue : ROOT_SILHOUETTE_HUE;
      const rootSec = rootsMode === 'owner' ? secIdx : -1;
      const nRoots = 1 + Math.round(d.roots * 2);
      for (let k = 0; k < nRoots; k++) {
        const ra = az0 + R(rootRng, -0.4, 0.4);
        const rd = normalize(v(Math.cos(ra) * 0.85, -0.9, Math.sin(ra) * 0.85));
        const rStart = v(Math.cos(az0) * TRUNK_BASE_R * 0.6, -0.2, Math.sin(az0) * TRUNK_BASE_R * 0.6);
        growCurved(rootRng, rStart, rd, 0.06 + d.roots * 0.06, {
          steps: 4 + Math.round(d.roots * 4), stepLen: 0.5, az: ra, azKeep: 0.4, ceil: -0.05,
          hue: rootHue, born0: 0.03 + R(rootRng, 0, 0.09), bornSpan: 0.3, depth: 1, dist0: 0.12, dist1: 0.02,
          secIdx: rootSec, isMain: false, ctx: null, gravity: 0.06, tropism: -0.04, taper: 0.86, targetArr: roots,
        }, null);
      }
    }
  }

  // ---- unclassified: faint gray shoots at the bole's feet (docs/03 §3 rule 4) ----
  // start radius 1.2× the (now fatter) base so the shoots sprout OUTSIDE the wood
  if (unclassified.length) {
    const rng = mkRng(seed, '__unclassified');
    const n = Math.min(unclassified.length, 5);
    for (let k = 0; k < n; k++) {
      const a = (k / Math.max(1, n)) * Math.PI * 2 + R(rng, -0.2, 0.2);
      const start = v(Math.cos(a) * TRUNK_BASE_R * 1.2, -0.1, Math.sin(a) * TRUNK_BASE_R * 1.2);
      const dir = normalize(v(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5));
      growCurved(rng, start, dir, 0.05, {
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

  // ---- rootDetail (OWNER mode only): per-sector AGGREGATES of private events ----
  // PRIVACY (docs/03 §6 rule 3, ADR-0005): aggregates ONLY — a note count, the last
  // note timestamp, and the top mapped tag counts. NEVER event ids, path hashes, or
  // per-event rows for private events. Even this OWNER payload stays strictly
  // aggregate on purpose: tree.json may be embedded on a public page by mistake, so
  // there must be nothing here that a leak could turn into per-note tracking.
  let rootDetail;
  if (rootsMode === 'owner') {
    rootDetail = {};
    for (const s of SECTORS) {
      const priv = bySector[s.id].private;
      if (!priv.length) continue; // only sectors with actual private activity
      const tagCounts = {};
      let lastTs = -Infinity;
      for (const e of priv) {
        lastTs = Math.max(lastTs, e.tsMs);
        const tags = e.attrs && Array.isArray(e.attrs.tags) ? e.attrs.tags : [];
        for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
      const topTags = Object.keys(tagCounts)
        .map((tag) => ({ tag, count: tagCounts[tag] }))
        .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
        .slice(0, 5);
      rootDetail[String(secIndex.get(s.id))] = {
        noteCount: priv.length,
        lastNoteTs: new Date(lastTs).toISOString().replace('.000Z', 'Z'),
        topTags,
      };
    }
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
    ...(rootDetail !== undefined ? { rootDetail } : {}),
    bounds: { min: min.map(round4), max: max.map(round4) },
  };
}

export default grow;
