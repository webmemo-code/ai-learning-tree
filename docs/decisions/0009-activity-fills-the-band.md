# ADR-0009 — Activity fills the band; the Emergent stratum never clamps

- **Status:** Accepted (generator algoVersion 3.0.0)
- **Date:** 2026-07-18
- **Context:** Since 2.0.0 a sector's pad parked at the TOP of its earned band the
  moment the band was unlocked. That made day-to-day work invisible on the
  vertical axis: a week of daily SEO entries changed nothing about the twigs'
  height, and the only vertical motion the tree ever showed was the milestone
  jump. ADR-0004 had already decided the right mechanic ("activity
  extends/thickens branches *within* the sector's current stratum, log-damped,
  capped at that stratum's ceiling") — it just was never implemented literally.
  Separately, `tree.config.yml` documents `harvest.private-repos: true` as the
  decision that "private commit history should grow public canopy", but the
  generator still routed every `private: true` event to roots only — so a sector
  whose work lives in private repos (Walter's `distribute.seo`) had no canopy at
  all and could never show growth.

## Decision

Three coupled changes, all in the generator (`grow.mjs`, algoVersion 3.0.0):

1. **The ceiling is earned twice.** A sector's height ceiling starts at its
   band's FLOOR and rises with log-damped work weight accrued **since the
   milestone that unlocked the band** (all-time for level-1 sectors):
   `fill = log₂(1 + w) / log₂(1 + 60)`. A week of daily entries visibly lifts
   the pad day by day; a bulk backlog can't teleport it. Levels 1–3 clamp just
   under the band top — brushing the ceiling is the "author the milestone"
   nudge ADR-0004 wanted. A fresh level-up always lifts the pad at least 0.25
   into the new band, and continues climbing from there.
2. **The top band never clamps.** Once a sector passes the Expert threshold
   (level 4), the same fill curve keeps rising above the Emergent band top —
   the four proficiency levels stay authoritative (only milestones cross a
   boundary), but there is no artificial lid above the last boundary. Emergent
   trees pierce the canopy; that's what the stratum is named for.
3. **Private GitHub commits are work, not knowledge.** With the
   `harvest.private-repos` opt-in, private-repo commit weight counts toward the
   `act` and `fill` drivers and grows canopy — as **aggregate geometry only**:
   pads grown from private work carry an empty `eventIds` list, emit no
   fireflies and no `eventMeta`, so no id, repo name, or timestamp of a private
   commit ever reaches `tree.json`. Private vault notes are knowledge and stay
   roots-only regardless (ADR-0002); the distinction is `source === 'github'`.

## Why

1. The tree's promise is that growth is visible: work this week must look
   different from no work this week, on the axis people actually read (height).
2. Integrity is preserved: activity still cannot cross a stratum boundary
   (ADR-0004), and the level cap of 4 stands. Above-Expert growth crosses no
   gate — there is no fifth level being claimed, just an Emergent crown that
   keeps living.
3. The private-canopy rule implements a decision the config had already
   recorded, with the same privacy class as silhouette roots: geometry may be
   influenced by private aggregates, references never.

## Consequences

- algoVersion **3.0.0** (major: same log now yields different geometry);
  `data/mock/tree.json` regenerated per the fixture rule in `data/README.md`.
- Sectors with zero work no longer show full-height bare ribs — they are short
  shoots at the fork until real work accrues. Honest demographics.
- The renderers show a "private work" note (instead of an event list) for pads
  with no public refs.

## Alternatives considered

- **Pin the pad at the band top (status quo):** rejects the daily-growth signal
  entirely; rejected.
- **Cap Expert at y = 16.5 like the other bands:** makes the top of the tree a
  dead end and the last milestone an ending rather than a threshold; rejected.
- **Let private work also emit (anonymized) leaf refs:** even hashed refs are
  linkable; aggregate-only is the standing rule (ADR-0005) and stays.
