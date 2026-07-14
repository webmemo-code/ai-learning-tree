# Tree generator

The **deterministic** seam between the growth log and the renderer (docs/03 §4):

```
data/growth-log.jsonl  ──▶  grow(events, config, algoVersion)  ──▶  data/tree.json  ──▶  renderer
   (source of truth)          generator/grow.mjs (pure fn)         (geometry graph)     (three.js)
```

`tree.json` is a pure function of `(events, config, algoVersion)`. Same inputs →
**byte-identical** output on every machine, forever. The generator owns geometry +
metadata only; it never touches pixels. The renderer never touches the raw log —
it consumes `tree.json` alone (including the public event refs it needs for detail
panels). Clean seam.

## Files

| File | Role |
| --- | --- |
| `grow.mjs` | `grow(events, config, algoVersion) → tree` — the pure generator. No fs, no `Date.now`, no `Math.random`. |
| `taxonomy.mjs` | `default-v1` scaffold: the 9 sectors (id/label/limb/az/hue) + the 4 strata. Additive-only. |
| `build.mjs` | Node CLI: read log + config, run `grow()`, write `data/tree.json`. |
| `serialize.mjs` | Stable JSON stringify (sorted keys) + a tiny no-deps YAML parser. |
| `test-determinism.mjs` | The one test that must never break (docs/04 §CI). |

## Rebuild

```bash
node generator/build.mjs
# flags: --log data/growth-log.jsonl  --config tree.config.yml  --out data/tree.json
```

Reads `data/growth-log.jsonl` (JSONL, docs/03 §2) and `tree.config.yml` (parsed by a
tiny hand-rolled YAML reader — **no npm dependencies**). If the config is absent,
`seed` falls back to `owner` then `"webmemo-code"`, and `taxonomy` to `default-v1`.

## Test (determinism — must never break)

```bash
node generator/test-determinism.mjs
```

1. Runs `grow()` twice on the real log and byte-compares the two outputs.
2. Byte-compares that output against the committed `data/tree.json` (a regeneration
   must reproduce the checked-in tree exactly).

Exits nonzero with a clear first-difference line on any mismatch. This is CI's
guardrail: *same log + seed + algoVersion ⇒ byte-identical `tree.json`.*

## Determinism, precisely

- **No wall clock.** The "now" anchor is the **latest event timestamp**. Relative
  dates in the renderer key off `generatedFrom.latestTs`, not the real clock.
- **No `Math.random`.** All variation is `mulberry32` seeded from an FNV-1a hash of
  `(config.seed, sector, …)` (docs/03 §4). Streams: `(seed,'__trunk')` for the
  trunk, `(seed, sector.id)` per limb, `(seed,'__unclassified')` for gray shoots.
- **Fixed float precision.** Every coordinate is rounded to 4 decimals before
  serialization, so output is identical across platforms/FPUs.
- **Stable key order.** `serialize.mjs` sorts object keys recursively; arrays keep
  their (geometry) order.

## `algoVersion` discipline (semver, sacred — docs/04 §versioning)

`algoVersion` is recorded in every `tree.json`. **Any change that alters geometry
from the same log is a major bump**, recorded in the ADR log. Old snapshots must
replay identically forever — a tree that retroactively changes shape betrays trust.
Current: **`1.0.0`** (the approved curved-limb look ported from the mood sketch:
trunk + gravity/tropism limbs + secondary branching + canopy clusters +
stratum-crossing blossoms + root flare). Taxonomy versions (`default-v1`) are
additive-only; renames/merges need a new taxonomy id + migration note.

## Derived per-sector drivers (replace the old hand-tuned constants)

Computed in `deriveDrivers()` from the raw log:

| Driver | Derivation |
| --- | --- |
| `level` | `1 + count(milestone events)` for the sector; authoritative `attrs.level` wins if higher; capped at 4. Gates height (which stratum the bough may reach). |
| `act` | Log-damped share of lifetime **public** weight: `log2(1+Σweight)`, normalized so the busiest sector = 1.0. Drives limb reach/thickness/leaf mass. |
| `recent` | Share of the sector's own events landing in the **last 30 days** before the now-anchor, normalized max→1.0. Drives foliage freshness + fireflies. |
| `roots` | Share of **private**-event weight, normalized max→1.0. Drives root-flare size (docs/03 §6: private → roots only). |

Unclassified events (sector not in the taxonomy, docs/03 §3 rule 4) become faint
gray shoots at the trunk base — visible nagging to classify them, never dropped.

## `tree.json` schema

```jsonc
{
  "algoVersion": "1.0.0",
  "seed": "webmemo-code",
  "taxonomy": "default-v1",
  "generatedFrom": { "events": 329, "earliestTs": "...", "latestTs": "...", "unclassified": 3 },
  "strata":  [ { "name": "Understory", "level": "Experimenter", "y0": 3, "y1": 7, "tint": 5233604 } ],
  "sectors": [ {
    "id": "build.pro-code", "label": "pro-code", "limb": "BUILD",
    "az": 350, "hue": 6982399, "index": 8,
    "level": 4, "act": 1.0, "recent": 0.633, "roots": 0.678      // derived drivers
  } ],
  "segments": [ {                                                // tapered cylinders (trunk+limbs+roots+shoots)
    "start": [x,y,z], "dir": [x,y,z], "len": n, "r": n,
    "born": 0..1,      // growth-front time (ts-derived; replay sweeps uGrow across it)
    "dist": 0..1,      // 0 = root, 1 = tip (bark darkening + sap-light)
    "hue": 6982399,
    "sector": 8        // sector index 0..8, or -1 for shared (trunk / roots / gray shoots)
  } ],
  "leafClusters": [ {                                            // canopy blobs; pickable anchors
    "center": [x,y,z], "radius": n, "born": 0..1,
    "sector": 8, "density": 1.0, "count": 9,
    "eventIds": ["gh:owner/repo:sha", ...]                       // REAL public events in this cluster
  } ],
  "blossoms": [ {                                                // level-up moments = real milestones
    "pos": [x,y,z], "born": 0..1, "hue": 6982399, "sector": 8,
    "stratum": "Canopy", "levelLabel": "Practitioner", "level": 3,
    "eventId": "ms:...", "evidence": "https://…", "note": "…"
  } ],
  "fireflies": [ { "pos": [x,y,z], "hue": n, "sector": 8, "eventId": "gh:…" } ], // last-7d event refs
  "eventMeta": {                                                 // public event metadata for detail panels
    "gh:owner/repo:sha": { "id": "…", "kind": "commit", "sector": "…", "project": "…", "ts": "…", "url"?: "…" }
  },
  "bounds": { "min": [x,y,z], "max": [x,y,z] }
}
```

Every leaf cluster and every blossom carries **real event ids** from the log, and
`born` fields are derived from event timestamp order — so the renderer's replay
(`grow(events.filter(ts ≤ t))` swept over `t`, docs/03 §5) is a pure growth-front
sweep of `uGrow` over the `born` values, no second code path.

`eventMeta` embeds only **public** events referenced by geometry (leaves / blossoms
/ fireflies) — never private note content (docs/03 §6.3). It's what lets the
renderer show real commit links / milestone evidence without touching the raw log.
