# ADR-0007 — Tree placement is phyllotaxis over planting order; slots are eternal

- **Status:** Proposed *(phase-6 gate: Walter signs off before any grove ships)*
- **Date:** 2026-07-14
- **Context:** Given a planting log ([ADR-0006](0006-grove-planting-log.md)),
  something must turn it into positions — "which tree grows where". Requirements
  distilled in [05-grove.md](../05-grove.md) §2: deterministic, **append-stable**
  (a new planting moves zero existing trees), nothing rankable in the position,
  legible geography, no solver/server.

## Decision

**Placement is a pure function of the planting log** (`grove/place.mjs`,
stamped `placeVersion`), using **golden-angle phyllotaxis at two scales**:

1. **Trees within a clearing:** the k-th tree planted into a clearing stands at
   `θ = k·137.507…° + offset(groveSeed, clearingId)`, `r = plotPitch · √k`
   around the clearing center (slot 0 *is* the center). One fixed `plotPitch`
   for every tree (default 32 units ≈ 2.2× a full canopy radius): **equal soil** —
   plot size never depends on tree size, activity, or seniority.
2. **Clearings within the grove:** the j-th declared clearing sits on the same
   spiral with a coarse pitch, around the implicit **commons** (slot 0, origin).
   A clearing **reserves radius for its full capacity at creation** (default 256
   plots), so clearings can never grow into each other — the taxonomy's
   reserved-azimuth discipline applied to land.
3. **Slots are never reused and never renumbered.** `felled`/`transplanted` leave
   a stump at the old slot; `reserved` tombstones consume a slot invisibly.
   Consequently a tree's position depends **only on lines above it** in the log —
   append-stability is structural, not tested-for.
4. **`placeVersion` is semver and sacred** (mirror of `algoVersion`): any change
   that moves any tree from the same log is a **major** bump, recorded by ADR.

## Why

1. **The metaphor *is* the algorithm.** Phyllotaxis is how plants place new growth
   without disturbing old growth — sunflower seeds take the next spiral slot,
   nothing ever moves, packing is near-optimal with no collision checks and no
   global knowledge. Using it here is not an aesthetic reference; it is the exact
   engineering solution the requirements describe, discovered by botany first.
2. **Append-stability by construction beats append-stability by testing.** Layout
   solvers (force-directed, similarity embeddings) reshuffle the world on every
   join — and a forest that shuffles under you betrays trust the way a tree that
   retroactively changed shape would (04 §versioning). Position-from-own-slot
   cannot reshuffle, provably.
3. **Radius encodes only join order** → the grove gets growth rings (old growth at
   the center, saplings at the rim: the community's history is walkable) while
   offering nothing to compete over — no prime plots, no size-based land, no
   leaderboard geometry. The tree itself remains the only status object.
4. **O(1) per tree, trivially cacheable, renderer-friendly**: positions never
   invalidate; a grove page can cache every placed tree forever and only ever
   *append*.

## Consequences

- `grove/place.mjs` ships as the reference implementation with executable trust
  properties (`grove/test-place.mjs`): determinism, append-stability, pairwise
  spacing floors at both scales, stump/tombstone slot semantics, capacity checks.
- Close canopy, no overlap: at v1 capacity the measured minimum trunk distance is
  exactly 1.0·pitch (256 plots), i.e. crowns approach to ~3 units apart — a forest,
  not an orchard; the grove renderer's LOD budget (G5) handles the density.
- Chronological neighborhoods, not thematic ones: your spiral neighbors are the
  people who joined *when you did* — a cohort, which is socially meaningful;
  thematic adjacency stays inside the tree (its own sector compass). Communities
  that want to stand together use clearings, the explicit mechanism.
- Uniform clearing capacity in v1 (G3); capacity classes would be an **additive**
  change (new clearings only) and so a *minor* placeVersion bump.

## Alternatives considered

- **Choose-your-own-plot (land claims):** rejected — collision machinery, prime-spot
  speculation, conflict resolution forever; placement becomes a market.
- **Similarity layouts (t-SNE/UMAP over sector profiles):** rejected — beautiful
  once, unstable always: every join or profile drift moves *other people's* trees.
- **Random hash scatter:** rejected — stable and fair but meaningless: no
  chronology, no neighborhoods, and collision avoidance needs global knowledge.
- **Grid allotments:** rejected — orchard geometry (rows) reads as plantation, not
  forest; also invites coordinate arithmetic ("block A > block F" status games).
- **Force-directed graph of follow/collab edges:** rejected — solver-dependent,
  reshuffles, and requires a social graph the project deliberately doesn't collect.
