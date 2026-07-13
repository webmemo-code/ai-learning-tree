# ADR-0003 — "Run AI locally vs in the cloud" is a cross-cutting attribute, not a sector

- **Status:** Proposed — awaiting Walter's call
- **Date:** 2026-07-13
- **Context:** Issue #1 lists "Run AI locally vs in the Cloud" among the fields.
  Unlike the other entries, it describes *how* work runs, not *what field* it's in —
  any project in any sector can be local or cloud (often both).

## Decision (proposed)

Model `runtime: local | cloud | hybrid` as an **attribute on growth events**
(`attrs.runtime`), not as a sector wedge. Render it as **leaf material**: cloud work
gets iridescent, sky-lit translucent leaves; local work gets matte, dense, earthier
foliage. A filter toggle lets you view the tree through the local/cloud lens
(dim-not-hide, like all filters).

## Why

1. Taxonomic hygiene: sectors must be mutually exclusive fields; local-vs-cloud
   cuts across all of them. As a sector it would double-count or steal events.
2. As an attribute it yields a better insight: *one glance shows how self-hosted a
   practitioner's whole tree is* — impossible if it were one wedge among nine.
3. Keeps the compass at 9 sectors / 4 limbs — visually balanced.

## Consequences

- Harvester needs a runtime heuristic (repo topics like `ollama`, `local-llm`,
  config hints) + manual override in `tree.config.yml`; default `cloud`.
- Material variants must survive LOD (cluster impostors carry the mix ratio).

## Alternatives considered

- **Own sector wedge:** rejected — category error, double-counting.
- **Roots = local / canopy = cloud:** poetic, but collides with ADR-0002's stronger
  use of roots (privacy) and would wrongly imply local work is private.
