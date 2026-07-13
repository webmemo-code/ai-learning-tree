# ADR-0004 — Activity grows branches; only milestones cross strata

- **Status:** Proposed — awaiting Walter's call
- **Date:** 2026-07-13
- **Context:** Commits and notes measure *activity*; Section's levels measure
  *competence*. If commit volume alone pushed branches upward, the tree's central
  claim ("height = proficiency") would be false — 500 experiments don't make a
  Practitioner. The vertical axis is only worth having if it can be trusted.

## Decision (proposed)

Per sector, two coupled mechanisms:

1. **Activity** (commits, notes) extends/thickens branches **within** the sector's
   current stratum, log-damped, capped at that stratum's ceiling.
2. **Milestone events** (hand-authored in `data/milestones.yml`, with an `evidence`
   link) raise the sector's level and unlock the next height band. This is the
   blossom moment 🌸.

Level-ups are therefore *declared and evidenced*, not inferred. Self-assessment
honesty is on the owner — but it's public, linked evidence, which is exactly the
accountability a public tree needs.

## Why

1. Integrity: the tree cannot silently inflate competence claims. Trustworthiness
   is the whole value of visualizing evidence.
2. Motivation design: a visible ceiling ("my SEO bough is brushing the top of the
   understory") turns leveling up into an explicit, celebrated act.
3. Clean mechanics: strata ceilings give the growth algorithm hard constraints,
   which is what makes the silhouette legible.

## Consequences

- Needs a lightweight milestone-authoring ritual (yml edit or an issue-template →
  Action appends the event). Should feel ceremonial, not bureaucratic.
- Optional later: map milestone types to Section's assessment dimensions
  (knowledge / usage / skill) for people who take their benchmark.

## Alternatives considered

- **Volume heuristics promote automatically:** gameable, dishonest; rejected.
- **Third-party validation (peer attestations):** interesting for the forest phase;
  deferred, not core.
