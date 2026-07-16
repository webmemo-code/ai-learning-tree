# ADR-0008 — The tree is an acacia; the biome is a savanna

- **Status:** Accepted (Walter's direction, concept board + 3D sketch approved
  and merged before the port)
- **Date:** 2026-07-16
- **Context:** The 1.x generator grew a tall single leader with limbs forking
  at staggered heights — it read as a young poplar, and the load-bearing
  visual claims (radial sectors, earned height) were carried by geometry that
  didn't showcase them. Walter: "I have more of an acacia tree in mind."
  Explored in `prototypes/acacia-look/` (four concept directions), proven in
  3D in `prototypes/acacia-sketch/`, ported as generator algoVersion 2.0.0.

## Decision

The tree's species is the **savanna acacia** (umbrella thorn habit), and the
scene it stands in is a **savanna night**:

1. **Silhouette ("Rising Umbrella"):** a short stout bole forks low into one
   angular, elbowed rib per sector; each rib rises steeply, then flattens
   hard under the ceiling of that sector's **earned** stratum, ending in a
   flat foliage pad. The 1.x "flatten & spread beneath instead of piercing"
   constraint is now the silhouette's defining feature: **a level-up = the
   pad visibly lifts to the next band.**
2. **Biome ("Savanna Night"):** the four strata keep their 1:1 Section
   mapping and their data-model names (Forest floor / Understory / Canopy /
   Emergent, unchanged in `taxonomy.mjs` and `tree.json`) but *present* as
   savanna atmosphere — ground haze → dusk teal → gold afterglow → stars only
   above the Expert line. Presentation naming (Ground haze / Dusk / Afterglow
   / Starfield) is a renderer concern, never a data one.

## Why

1. **The crown is the compass** — the umbrella's ribs spend the radial axis
   where the data lives; the crown seen from above *is* the sector wheel.
2. **The flat top is the integrity rule (ADR-0004) made visible** — a crown
   parked under a ceiling is the honest silhouette of "this is the level I've
   earned," and the level-up becomes the most legible moment in the system.
3. **Asymmetry turns beautiful** — per-sector levels render as a natural
   multi-tier umbrella instead of a lopsided conifer.
4. **One iconic hero shot** — the lone acacia against the sky is the most
   recognizable tree silhouette there is (docs/00's shareability goal).
5. Bonus metaphors improve: dormancy = **dry season** (kinder than autumn),
   roots = the acacia's famously deep taproot, groves = scattered savanna
   trees readable at distance by pad heights.

## Consequences

- `generator/grow.mjs` is algoVersion **2.0.0** — same log + seed still means
  byte-identical output, but the shape changed by design. Roots kept their
  1.x curved habit and moved onto their own PRNG stream
  (`seed, sector, 'roots'`) so future above-ground work can never reshuffle
  them again.
- The frozen fixture `data/mock/tree.json` was **deliberately regenerated**
  (the mock *inputs* — log, config, milestones — stay frozen); this is the
  "deliberate, separate decision" case data/README.md reserves.
- Blossom completeness improved: 1.x limbs sometimes never cleanly crossed a
  boundary they'd earned (mock fixture: 7 blossoms for 13 earned crossings);
  the 2.0.0 rib crosses every boundary below its ceiling, so all 13 exist.
- Renderers need no schema changes. `prototypes/acacia-sketch/` (savanna
  dressing, flat pad-lens leaf scatter) is the reference renderer;
  mood-sketch still works and shows the same skeleton in the old
  night-garden dressing.

## Alternatives considered

- **Tiered pagoda (persistent pad per crossed stratum):** gorgeous at 1–2
  tiers, cluttered at 4×10 sectors; kept as a possible renderer toggle, not
  generator geometry.
- **Keeping the rainforest biome around an acacia:** the strata were mapped
  to rainforest layers an acacia doesn't live in; rejected as half-committed
  (see `prototypes/acacia-look/README.md`).
- **Staying with the 1.x leader:** rejected — it spent the radial axis on
  vertical stacking and hid the integrity rule the tree exists to show.
