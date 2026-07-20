# ADR-0010 — The contribution meadow discloses work-rhythm as aggregates only

- **Status:** Accepted (generator algoVersion 3.1.0)
- **Date:** 2026-07-20
- **Context:** The canopy shows *what* a sector has grown into; it says little about
  *cadence* — the week-to-week rhythm of work that a GitHub contribution graph makes
  legible at a glance. Issue #34 asked for that density field, unrolled from the
  timeline onto the ground ring as a meadow of weekly per-sector blades. But cadence
  is exactly the kind of signal privacy rules must gate: a bucket that folds in
  private work discloses *when* someone worked, and vault notes (source `obsidian`)
  are private knowledge that ADR-0002 keeps below ground, in the roots, forever.

## Decision

`tree.json` gains a top-level `contribution` array — one entry per non-empty
**absolute-UTC-week × sector** bucket — carrying `{ count, weight, privCount,
privWeight }` plus a quantized `level` (1..4) and a `born`. It never carries event
ids, names, or messages: aggregates only.

1. **GitHub-source commits only.** Buckets aggregate events with
   `source === 'github'` — the same gate ADR-0009 uses to decide what private work
   may lift canopy. Vault notes (`obsidian`) stay roots-only (ADR-0002); milestones
   (`manual`) stay blossoms — neither enters the above-ground meadow.
2. **Gated by `privacy.contributions`** ∈ `public-only | combined | hidden`,
   **default `public-only`** (safe by default: private events excluded, privCount /
   privWeight = 0). `combined` folds private GitHub work into the buckets and reports
   its share as `privCount`/`privWeight`; `hidden` omits the array entirely.
3. **This repo opts into `combined`** — the owner's explicit choice (issue #34), on a
   separate axis from `privacy.roots`: cadence disclosure and root visibility don't
   imply each other.

## Why

1. The meadow reads work-rhythm, which is disclosure — so the soil line stays the
   privacy boundary for *detail*: above it, aggregates; below it, nothing leaves.
2. The `source === 'github'` gate is the standing line between work and knowledge
   (ADR-0009): work may aggregate above ground, knowledge never does.
3. Aggregates can't be de-anonymized into per-event tracking the way even hashed
   refs can (ADR-0005) — count + weight is the whole payload.

## Consequences

- algoVersion **3.1.0** (minor: strictly additive — every segment/leaf/blossom is
  byte-identical to 3.0.0 from the same log+seed); both fixtures regenerated.
- The mock fixture (public-only, with manual milestones) emits fewer buckets than a
  naive "any classified event" rule would — milestones no longer bucket.

## Alternatives considered

- **Bucket every classified event (commits + milestones + notes):** folds vault
  knowledge into an above-ground cadence signal — violates ADR-0002; rejected.
- **Emit per-week event ids for the owner:** even owner-only refs can leak on a
  mis-embedded page; aggregate-only is the standing rule (ADR-0005) and stays.
