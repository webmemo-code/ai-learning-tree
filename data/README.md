# data/

The growth log — the single source of truth the tree is grown from. See
[docs/03-data-model.md](../docs/03-data-model.md) for the full spec; this is
the short version.

## Real vs. `data/mock/`

Phase 3 ("First rings") split this directory in two:

- **`data/` (this directory, real)** — Walter's actual tree. `growth-log.jsonl`
  and `tree.json` are **not committed here directly by hand** — they're
  produced by the pipeline (nightly harvester + `generator/build.mjs`) and
  don't exist until that pipeline has run at least once. `milestones.yml`
  *is* hand-authored here (see below) — it's the one real input a human
  writes directly.
- **`data/mock/`** — the phase-2 ("Sapling") hand-written fixture. The
  *inputs* — `data/mock/growth-log.jsonl`, `data/mock/milestones.yml`,
  `data/mock/tree.config.yml` — are **frozen forever**, a byte-identical
  snapshot of the original mock data. `data/mock/tree.json` is the
  generator's output over those frozen inputs and is regenerated **only** on
  a deliberate algoVersion major bump (done once: 2.0.0, the acacia —
  [ADR-0008](../docs/decisions/0008-acacia-silhouette.md)); between majors it
  is as frozen as the inputs. Kept as:
  - the generator's regression fixture (`generator/test-determinism.mjs`
    regrows `data/mock/growth-log.jsonl` with `data/mock/tree.config.yml` and
    byte-compares the result against `data/mock/tree.json` — this must never
    fail, since nothing about this fixture is ever supposed to change), and
  - a demo/reference dataset for the renderer (see `?data=mock` below) that
    keeps working even before Walter's real pipeline has produced anything.

  Never edit files under `data/mock/` — if the mock profile ever needs to
  change, that's a deliberate, separate decision, not an incidental one.

## Files (real)

- **`growth-log.jsonl`** — one JSON growth event per line, append-only,
  sorted ascending by `ts`. Every line follows the §2 schema:
  `id, ts, source, kind, sector, project, weight, attrs, private`.
  `kind` is one of `commit | note | milestone | shipped`; `source` is one of
  `github | obsidian | manual`. Appended to automatically by the nightly
  harvester (`harvester/harvest.mjs`, run by
  `.github/workflows/harvest.yml`) — see "How the nightly harvest works"
  below. This file does not exist until the pipeline has been bootstrapped
  or run at least once.

- **`milestones.yml`** — the hand-authored source of every `kind: milestone`
  event in the log (`ts, sector, level, evidence, note`). Milestones are the
  *only* way a sector's stratum ceiling rises (the integrity rule in
  [01-concept.md §5](../docs/01-concept.md)); activity alone can fill a
  stratum but never cross into the next one. The harvester reads this file
  on every run and merges its entries into `growth-log.jsonl` automatically
  — you never hand-copy an entry into the log yourself. The committed
  version of this file starts as an empty, commented template: real
  milestones are Walter's to author when a sector genuinely levels up, not
  to invent ahead of time. See the template comments in the file itself for
  the exact shape.

- **`tree.json`** — the generator's output (`node generator/build.mjs`), a
  pure function of `growth-log.jsonl` + `tree.config.yml`. Rebuilt every
  night by the harvest Action and re-verified by
  `generator/test-determinism.mjs` in CI.

## How the nightly harvest works (phase 3)

`.github/workflows/harvest.yml` runs on a nightly cron (and on-demand via
`workflow_dispatch`):

1. `node harvester/harvest.mjs` — reads `tree.config.yml` (owner, repo
   mappings, harvest scope) and `data/milestones.yml`, pulls new GitHub
   activity, and appends new events to `data/growth-log.jsonl`. Idempotent/
   dedupable by `id` — safe to re-run.
1b. `node harvester/vault.mjs --vault vault` (phase 4, "Roots" — only runs when
   `VAULT_TOKEN` is set and `tree.config.yml`'s `vault.enabled: true`; a
   silent no-op otherwise) — reads a checked-out Obsidian vault's **own git
   history**, never its content over the network, and appends `kind: note`
   events. See `harvester/README.md` "Vault harvesting" for the full
   privacy/granularity contract; the short version is in the section below.
2. `node generator/build.mjs` — regrows `data/tree.json` from the updated log.
3. `node generator/test-determinism.mjs` — the fixture half always runs; the
   live half now has a real `data/growth-log.jsonl` to check double-run
   determinism and regeneration against the freshly-built `data/tree.json`.
4. If (and only if) anything under `data/` actually changed, commits with the
   exact message `AUTO | Nightly growth harvest` (author `github-actions[bot]`)
   and pushes. A quiet night — no new commits, no note edits — leaves no
   empty commit behind.

The tree's growth is literally visible in `git log`.

## Authoring `milestones.yml`

Add an entry only when a sector has genuinely crossed into the next stratum
(see `docs/03-data-model.md` §2 for the schema and §3 for the level
meanings: 2 = Experimenter, 3 = Practitioner, 4 = Expert). Evidence should be
a URL only — prose belongs in `note`, never the note's own content (nothing
private leaks through this file; see the privacy rules below). The harvester
merges this file into the log by `(ts, sector, level)`, so editing an
existing entry's `note`/`evidence` text later is safe and won't create a
duplicate event.

## Viewing the mock fixture in the renderer

The mood-sketch prototype defaults to the real tree
(`../../data/tree.json`) but accepts a `?data=mock` query param to load the
frozen fixture instead (`../../data/mock/tree.json`) — useful for demos,
screenshots, or comparing the pipeline's real output against the known-good
reference shape. When active, the HUD's bottom-right note is suffixed with
"· mock data" so it's never ambiguous which dataset is on screen. See
[prototypes/README.md](../prototypes/README.md).

## The pure-function property

The tree is a pure function of its log: `tree = grow(events, seed,
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
nourishes but never blooms into public canopy. Hard rules, enforced in the
mock fixture and by the real harvester (`harvester/vault.mjs`, phase 4) alike:

1. Note **content never leaves the vault**. A `note` event carries only a
   path-hash-derived `id` (`obs:{sha256(vault-relative-path).slice(0,12)}:
   {YYYYMMDD}` — the mock fixture's shorter `obs:<8-hex>` ids predate this
   exact format and are kept as-is, frozen), a timestamp, a `weight`, and
   `attrs.tags` — never a title, body, excerpt, or filename. Tags themselves
   are filtered through `tree.config.yml`'s `vault.tag-map` allow-list before
   being read for real — an unmapped tag never reaches the log at all (see
   `harvester/README.md` for the rationale).
2. Every `note` event has `"private": true`. Privacy is a hard flag, not a
   convention — `private: true` events contribute to **roots only**; they
   never grow above-ground wood or leaves. `harvester/vault.mjs` asserts this
   before an event can leave the module.
3. `roots` mass (see `SECTORS[i].roots` in the prototype) is the relative
   share of private-note weight per sector — it can foreshadow growth
   without ever exposing what was actually written. A note that has since
   been deleted from the vault still contributes its historical days at a
   damped weight (`0.6` vs. `1.0`) and falls back to `unclassified`, since its
   tags can no longer be read from a file that isn't there anymore.

## History note

`data/mock/growth-log.jsonl` and `data/mock/milestones.yml` were originally
`data/growth-log.jsonl` and `data/milestones.yml` — hand-written phase-2
mock data, moved verbatim into `data/mock/` when the real harvester landed
in phase 3. The schema hasn't changed, only where the fixture lives and the
fact that it's now explicitly frozen rather than "the current data, for now."
