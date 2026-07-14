# data/

The growth log — the single source of truth the tree is grown from. See
[docs/03-data-model.md](../docs/03-data-model.md) for the full spec; this is
the short version.

## Files

- **`growth-log.jsonl`** — one JSON growth event per line, append-only,
  sorted ascending by `ts`. Every line follows the §2 schema:
  `id, ts, source, kind, sector, project, weight, attrs, private`.
  `kind` is one of `commit | note | milestone | shipped`; `source` is one of
  `github | obsidian | manual`. This file is **hand-written mock data for
  phase 2 ("Sapling")** — it plays the role that the phase-3 harvester
  (GitHub Action, nightly cron) will fill later. It was authored to
  plausibly reproduce the shape of the mock profile in
  `prototypes/mood-sketch/index.html`'s `SECTORS` table (per-sector activity,
  recency, and root mass). When the real harvester ships, this file gets
  replaced by harvested events — the schema doesn't change, only the source
  of the lines does.

- **`milestones.yml`** — the hand-authored source of every `kind: milestone`
  event in the log (`ts, sector, level, evidence, note`). Milestones are the
  *only* way a sector's stratum ceiling rises (the integrity rule in
  [01-concept.md §5](../docs/01-concept.md)); activity alone can fill a
  stratum but never cross into the next one. Every entry here has a matching
  event in `growth-log.jsonl` (same `ts`/`sector`/`level`) — in phase 3 the
  harvester will read this file and merge its entries into the log
  automatically instead of them being copied by hand.

## The pure-function property

The tree is a pure function of this log: `tree = grow(events, seed,
algoVersion)`. Concretely:

- Same log + same `seed` (from `tree.config.yml`) + same `algoVersion` →
  byte-identical `tree.json`, forever. No hidden state, no wall-clock
  dependence.
- The log's own "now" is **the timestamp of its latest event**, not the
  system clock — replay, recency coloring, and the "last ~7 days" firefly
  window all anchor off `max(ts)` in the log, so a generator run next month
  against this same file still reproduces this exact tree.
- Replay/time-lapse falls out for free: `grow(events.filter(e => e.ts <= t))`
  swept over `t` is the entire time-lapse feature — no second code path.

## Privacy rules for `note` events (§6)

Obsidian vault notes feed the tree as **roots** — private knowledge that
nourishes but never blooms into public canopy. Hard rules, enforced in this
mock data exactly as they will be by the real harvester:

1. Note **content never leaves the vault**. A `note` event carries only a
   path-hash-derived `id` (`obs:<8-hex>`), a timestamp, a `weight`, and
   `attrs.tags` — never a title, body, excerpt, or filename.
2. Every `note` event has `"private": true`. Privacy is a hard flag, not a
   convention — `private: true` events contribute to **roots only**; they
   never grow above-ground wood or leaves.
3. `roots` mass (see `SECTORS[i].roots` in the prototype) is the relative
   share of private-note weight per sector — it can foreshadow growth
   (e.g. `create.video` has the smallest visible commit history but the
   *largest* root mass: lots of private learning, a shoot not yet grown)
   without ever exposing what was actually written.

## Replacement plan (phase 3)

Once the GitHub Action harvester lands, `growth-log.jsonl` starts being
appended to automatically from the GitHub GraphQL API (commits) and the
Obsidian vault's git history (notes), with `milestones.yml` merged in
verbatim. This hand-written version is disposable mock data — it exists so
the generator and renderer have a realistic, privacy-correct fixture to
build and test against before real harvesting exists.
