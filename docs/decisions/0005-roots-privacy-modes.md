# ADR-0005 — Root-system privacy has three modes; silhouette is the default

- **Status:** Accepted
- **Date:** 2026-07-14
- **Context:** [ADR-0002](0002-roots-are-private-knowledge.md) made the ground plane the
  privacy boundary — public evidence above, private knowledge (Obsidian note
  metadata, learning inputs) in the roots below — and named two visibility choices
  for visitors: *nothing* or *anonymized silhouette*. Phase 4 ("Roots") has to turn
  that stance into concrete generator output and renderer behaviour without ever
  leaking note content or per-note data ([03-data-model.md](../03-data-model.md) §6).
  The question this ADR settles: exactly what does `tree.json` carry for the roots,
  and what does a viewer get to see?

## Decision

A single config key, `privacy.roots`, with **three modes**, resolved in the
generator (`generator/grow.mjs`):

| Mode | Root geometry | Attribution | `rootDetail` aggregates |
| --- | --- | --- | --- |
| `owner` | full | per-sector hue + index (like above-ground segments) | present |
| `silhouette` | full | none — one neutral bark-gray hue, `sector: -1` | absent |
| `hidden` | **none emitted** | — | absent |

- **`silhouette` is the default** — safe by default. A tree published without a
  deliberate choice reveals only an anonymized below-ground shape: root *mass*
  mirrors the sector compass (heavy note-taking foreshadows a shoot), but nothing
  attributes it and no counts ship. Walter's own `tree.config.yml` sets `owner`.
- **`rootDetail` is aggregates only, even in `owner` mode**: per sector with private
  activity, `{ noteCount, lastNoteTs, topTags: [{tag, count}] }` (≤5 tags). It
  **never** contains event ids, path hashes, or per-event rows. The owner payload is
  held to the same aggregate-only bar as a visitor's on purpose — a `tree.json` may
  be embedded on a public page by mistake, and there must be nothing in it that a
  leak could turn into per-note tracking. This is the direct implementation of
  [03-data-model.md](../03-data-model.md) §6 rule 3 (see the tie-in below).
- The renderer's "roots reveal" (dip below the ground disc, dim the crown to
  silhouette, glow the roots) is a *view* over whatever mode the data was built in;
  it invents nothing the generator didn't emit. The `🕳 Roots` button hides itself
  when `tree.json` carries no roots (`hidden`).

This change is **additive**: from the same log + seed, root *geometry*
(start/dir/len/r/born/dist) is byte-identical to algoVersion `1.0.0`; only root
hue/sector attribution and the new `rootDetail` block differ. Per the versioning
discipline ([04-roadmap-and-process.md](../04-roadmap-and-process.md) §versioning),
additive ⇒ **minor** bump: `algoVersion` `1.0.0` → `1.1.0`.

## Why

1. **The metaphor already carries the privacy story** (ADR-0002): a mode that emits
   *no* attribution (`silhouette`) is the honest default, because an accidental
   publish then reveals only a shape, not a sector-by-sector account of what someone
   studies in private.
2. **Aggregates-only, even for the owner**, collapses the leak surface to nearly
   nothing. There is no "richer but riskier" owner payload to accidentally ship —
   the richest thing in `tree.json` is a note count and a tag histogram, both of
   which are already implied by the public tag-map.
3. **`hidden` exists** for people who want the tree to make no claim about private
   work at all — the below-ground world simply isn't there.
4. **Additive/minor** keeps the promise that old snapshots replay identically: a
   `1.0.0` tree and a `1.1.0` tree from the same log have the same silhouette.

## §6 rule-3 tie-in

[03-data-model.md](../03-data-model.md) §6 rule 3: *"Public tree pages embed only
`tree.json` (geometry + public event refs), never the log's private lines."* The
three modes are how the generator honours it:

- Private *lines* of the growth log never enter `tree.json` in any mode — only their
  aggregate shadow (root geometry driven by private-event weight; in `owner`, the
  `rootDetail` counts).
- Rule 2 (*private events influence roots only; roots render for the owner, for
  visitors only as anonymized silhouette or not at all — config*) maps exactly onto
  `owner` / `silhouette` / `hidden`.

## Consequences

- `tree.json` gains an optional `rootDetail` object (owner mode) and root segments
  may now carry a real sector index — the renderer identifies roots **geometrically**
  (segment entirely below `y=0`), so this works in every mode and on older files.
- Generator schema + README updated; `test-determinism.mjs` needs no logic change —
  the frozen mock fixture, regenerated in `owner` mode, keeps byte-identical geometry
  (verified: only `rootDetail`, root hue/sector, and `algoVersion` differ).
- The renderer's roots reveal (camera below ground, `uRootsMode` easing, owner-mode
  root detail panel) enters the phase-4 visual scope, composing with the existing
  sector filter and Sector Walk tours.

## Alternatives considered

- **Two modes (owner = full detail incl. per-note rows / visitor = nothing):**
  rejected — a "full detail" owner payload is a loaded gun in a file designed to be
  embedded. Aggregates-only for everyone is barely less useful and far safer.
- **Roots always visible, privacy handled only in the renderer:** rejected — privacy
  that lives in the viewer is no privacy at all once the data file is in someone's
  hands. The boundary has to hold in `tree.json` itself.
