# ADR-0001 — One tree per person (repos are branches, the forest is the community)

- **Status:** Proposed — awaiting Walter's call
- **Date:** 2026-07-13
- **Context:** Issue #1 leaves open whether each repo is its own tree (a person =
  a forest) or all repos form one tree.

## Decision (proposed)

One person = **one tree**. Repos are **branches** growing inside the bough of the
sector they're classified into. The **forest** metaphor is reserved for the
community layer (phase 6): each person a tree, a team a grove.

## Why

1. Section proficiency levels are properties of a *person per field* — strata only
   make sense on a person-tree. A repo has no proficiency level.
2. Identity and shareability: one silhouette that is unmistakably *you*; one
   time-lapse; one hero image. That serves the stated goal (inspire knowledge
   workers) better than a portfolio of saplings.
3. Early-journey sympathy: one young tree reads hopeful; a field of saplings
   reads sparse.
4. The forest isn't lost — it's promoted to the social layer, where "walking the
   forest" *is* the inspiration feature.

## Consequences

- Need log-damping so a single huge repo can't deform the tree (accepted in
  [03-data-model.md](../03-data-model.md) §4).
- Repo archival/deletion policy needed eventually ("fallen leaves become soil").
- Community grove becomes a separate aggregation concern (index of published trees).

## Alternatives considered

- **Tree per repo / person as forest:** scales trivially, but breaks the strata
  mapping, weakens identity, and spends the forest metaphor on the wrong thing.
- **Hybrid (big repos get their own tree):** inconsistent rules; rejected for
  metaphor integrity.
