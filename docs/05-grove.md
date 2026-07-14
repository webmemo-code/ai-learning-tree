# The grove — coordinating a forest of trees

*Phase 6 ("Forest") concept. Phase 1–5 built one tree from one person's history.
This document answers the coordination question that a shared forest raises:
**who — or what — decides where each tree grows?** The answer has to be worthy of
the rest of the project: no gardener-in-chief, no server, no reshuffling, and a
metaphor that carries the mechanics instead of decorating them.*

## 1. What a grove is

A **grove** is a shared forest that people opt their trees into: a team, a company,
a course cohort, a public commons. Every member is one tree (ADR-0001 — the forest
metaphor was deliberately saved for this layer). You walk between the trees; you see
whose video bough is tall and go ask them how they did it. Inspiration becomes
spatial ([00-vision.md](00-vision.md) §the forest).

Mechanically, a grove is **a repo** — exactly as [04-roadmap-and-process.md](04-roadmap-and-process.md)
§3 recommends (GitHub-native federation, no server, nobody holds anyone's data):

```
a-grove-repo/
├── grove.yml          # name, seed, placement constants, placeVersion
├── plantings.jsonl    # THE PLANTING LOG — append-only, one event per line
└── (renderer serves this + fetches each member's published tree.json)
```

The grove repo holds **no tree data** — only public pointers (`owner/repo` + the
member's published `tree.json` URL). Your evidence stays in your repo; the grove
is a map, not a warehouse.

## 2. The coordination problem, stated honestly

When N people share one forest, *something* must assign positions. Every naive
answer fails a project principle:

| Scheme | Why it fails |
| --- | --- |
| Pick your own coordinates | Land grabs, collisions, "prime spot" speculation, endless conflict resolution — the Million-Dollar-Homepage failure mode |
| A human assigns plots | Gardener-in-chief: gatekeeping, doesn't scale, dies with the maintainer |
| Similarity clustering (layout solvers, t-SNE over sector profiles) | Every join **reshuffles the whole forest** — and a tree that moves when someone *else* plants betrays trust the same way a tree that retroactively changes shape would ([04 §versioning](04-roadmap-and-process.md)) |
| Random hash scatter | Stable and fair, but meaningless geography: no chronology, no neighborhoods, collision handling needs global knowledge |
| Geography (user location) | A privacy leak wearing a metaphor |

What we actually need, as requirements:

1. **Deterministic** — the whole forest is a pure function of public records, like
   the tree is a pure function of the growth log. Anyone can recompute it; nobody
   has to be trusted.
2. **Append-stable** — planting tree N+1 moves **zero** existing trees. Your spot
   is yours forever; permalinks to "my place in the grove" never rot.
3. **Nothing rankable in the position** — placement must encode only *when you
   planted*, never how big/good/active your tree is. No prime real estate to
   compete for; the tree itself is the only status object, and it has to be *grown*.
4. **Legible geography** — neighborhoods should mean something social (my team
   around me), and the forest as a whole should read as a story (old growth vs.
   new arrivals).
5. **No server, no authority** — resolvable from a git repo, moderated only at the
   only place a community boundary genuinely exists: who merges the PR.

## 3. The answer the metaphor already contains: phyllotaxis

Plants solved "place new growth without disturbing old growth" half a billion
years ago. A sunflower head places seed k at

```
θ = k · 137.507…°  (the golden angle)      r = pitch · √k
```

— each new seed takes the next slot on the spiral; **no existing seed ever moves**;
packing is near-optimal and collision-free *by construction*, with no solver and no
global knowledge. This is not a decorative reference: phyllotaxis is literally the
botanical algorithm for append-only placement, and the grove uses it as-is.

**Slot = planting order.** Tree k of a clearing stands at spiral slot k around the
clearing's center. The consequences fall out for free:

- **Append-stable**: positions depend only on a tree's own slot number — earlier
  trees are untouched by later ones. (Requirement 2, by construction.)
- **The grove has growth rings**: old-growth at the center, saplings at the rim.
  Walking inward is walking into the community's past — the forest's own replay,
  matching the tree's chronological `born` sweep. (Requirement 4.)
- **Nothing rankable**: your radius says only "when you joined". A founder's plot
  and a newcomer's plot are the same size. (Requirement 3.)
- **Equal soil**: every tree gets the same plot (one fixed `plotPitch` — default
  32 units ≈ 2.2× a full-grown canopy radius, so neighboring crowns nearly touch —
  close canopy, a forest rather than an orchard). A sapling gets old-growth
  spacing: room to grow *is the invitation*.

❓ → [ADR-0007](decisions/0007-grove-placement-phyllotaxis.md)

## 4. The planting log (the grove's growth log)

Coordination state is an **append-only JSONL log**, exactly the discipline the
tree itself uses ([03-data-model.md](03-data-model.md)). One event per line; the
file order *is* the slot order; git history *is* the audit trail.

```jsonl
{"kind":"clearing","id":"acme-guild","label":"ACME growth guild","ts":"2026-08-01T09:00:00Z"}
{"kind":"planted","tree":"webmemo-code/ai-learning-tree","url":"https://raw.githubusercontent.com/webmemo-code/ai-learning-tree/main/data/tree.json","clearing":"commons","ts":"2026-08-01T09:05:00Z"}
{"kind":"planted","tree":"someone/their-tree","url":"…/tree.json","clearing":"acme-guild","ts":"2026-08-02T10:00:00Z"}
{"kind":"transplanted","tree":"someone/their-tree","to":"commons","ts":"2026-09-01T12:00:00Z"}
{"kind":"felled","tree":"another/tree","ts":"2026-09-15T08:00:00Z"}
{"kind":"reserved","clearing":"commons","ts":"2026-09-20T00:00:00Z"}
```

| Event | Meaning | Spatial effect |
| --- | --- | --- |
| `planted` | A tree joins a clearing | Takes the clearing's next spiral slot — forever |
| `clearing` | A community clears ground | Takes the next slot on the grove's *coarse* spiral (§5) |
| `transplanted` | A tree moves to another clearing | New slot in the target; the old slot keeps a **stump** |
| `felled` | A tree leaves the grove | Slot keeps a stump — **slots are never reused** |
| `renamed` | Repo moved/renamed | Same slot, new id/URL |
| `reserved` | Tombstone (see §7 erasure) | Consumes a slot invisibly, so later neighbors never shift |

**Joining is a pull request** that appends one `planted` line — the *planting
ceremony*. Append-only means merge conflicts are trivial; merge order settles slot
order. A CI check on the grove repo validates mechanics (PR author owns `tree`,
URL lives under that owner, tree not already planted, clearing exists and has
room); a human **grove keeper** merges. That single human act is the whole
moderation model — the community boundary lives exactly where git already puts it,
and nowhere else. ❓ → [ADR-0006](decisions/0006-grove-planting-log.md)

## 5. Clearings — where teams stand together

A **clearing** is a named sub-grove: a team, a chapter, a cohort. Trees in the same
clearing stand together; clearing names float over the meadow like the strata
labels float over one tree.

- Every grove has an implicit **commons** clearing at the origin — the default when
  a `planted` event names no clearing.
- Each new `clearing` event takes the next slot on a **coarse phyllotaxis spiral**
  (same math, bigger pitch) — clearings pack around the commons the way trees pack
  inside a clearing. Self-similar on purpose: seeds in a flower, flowers in a field.
- **Space is reserved at creation** — a clearing reserves radius for its full
  `capacity` (default 256 plots) the moment it's declared, so a clearing that
  fills up never collides with its neighbor. This is the taxonomy's
  reserved-azimuth discipline ([03 §2](03-data-model.md)) applied to land: reserve
  first, grow into it, never re-balance. Unfilled plots render as moss circles —
  an inviting clearing, not wasted space; *room to grow is the point of a grove*.
- A clearing that genuinely fills founds an **annex** (a new clearing, linked by
  label convention) — or the community graduates to its own grove (§6).

Uniform capacity keeps v1 honest and the packing math trivial. Heterogeneous
capacity classes (hamlet/village/town) are an open question (§8).

## 6. Federation — the forest of forests

A grove is deliberately **bounded** (default: 24 clearings × 256 plots — ~6k trees
before anyone needs to think). Scale doesn't come from one infinite plane; it comes
from *many groves*:

- Anyone can start a grove: fork the template, name it, merge plantings. Cost: zero.
- A tree may be planted in several groves (it's a public URL; each grove places it
  independently) — you stand in your team's grove *and* in the public commons.
- A **grove directory** (itself just an append-only list of grove-repo URLs) lets a
  renderer paint neighboring groves as distant tree-lines on the horizon. Walking
  to the horizon of one forest reveals the next — federation as geography.

This mirrors the phase-6 deployment stance ([04 §3](04-roadmap-and-process.md)):
template-first, everything in the open, a registry that is only an index.

## 7. Trust properties (the part that must never break)

1. **`placeVersion` is semver and sacred**, exactly like `algoVersion`: any change
   that alters *where the same log puts trees* is a **major** bump, recorded by ADR.
   Old grove snapshots replay identically forever.
2. **Slots are never reused.** A felled tree leaves a stump (rendered as a faint
   ring — the grove remembers, honestly but kindly). Neighbors never inherit a
   dead tree's spot, so nobody's position ever depends on someone else's departure.
3. **Erasure without displacement.** The planting log contains only already-public
   pointers, but if a line must truly vanish (takedown, GDPR), it is **replaced by a
   `reserved` tombstone**, not deleted — the slot is consumed invisibly and every
   later tree stands exactly where it stood. Append-only *order* is what neighbors
   depend on; the tombstone preserves it while the content disappears.
4. **The grove holds no evidence.** It stores pointers to published `tree.json`
   files — which already honour the privacy modes (ADR-0005). A tree leaving a
   grove removes it from the map instantly (its URL is simply no longer fetched).

## 8. Open questions (❓ live list, grove edition)

| # | Question | Current lean | Where |
| --- | --- | --- | --- |
| G1 | Registry + ceremony mechanics as specified? | Planting log, PR ceremony, keeper merges | [ADR-0006](decisions/0006-grove-planting-log.md) — **Accepted** |
| G2 | Placement = phyllotaxis, slots eternal? | Yes — golden-angle spiral at both scales | [ADR-0007](decisions/0007-grove-placement-phyllotaxis.md) — **Accepted** |
| G3 | Heterogeneous clearing capacities? | v1 uniform (256); classes later, additive | backlog |
| G4 | Ownership attestation beyond "PR author == tree owner"? | GitHub identity is enough for v1 | backlog |
| G5 | Grove-level view of a tree: full render vs. impostor budget? | Impostors from `tree.json` bounds + sector hues at distance; full tree within ~2 plots (LOD budget, [02 §5](02-visual-language.md)) | phase-6 build |
| G6 | Does a grove show *comparative* stats (tallest, most active)? | **No leaderboards.** The walk is the feature; comparison stays spatial and voluntary | firm lean — vision §principles |

## 9. What exists already (this phase's deliverables)

- [`grove/place.mjs`](../grove/place.mjs) — the placement function: pure,
  deterministic, `placeVersion`-stamped. Parses a planting log, returns clearings
  + tree positions. No I/O, no clock, no randomness beyond the grove seed.
- [`grove/test-place.mjs`](../grove/test-place.mjs) — the trust properties as
  executable checks: determinism, append-stability, spacing floors, stump/tombstone
  semantics, capacity validation.
- [`prototypes/grove-sketch/`](../prototypes/grove-sketch/) — a top-down night-map
  of a mock grove (commons + three clearings, stumps, moss plots) rendered through
  the real `place.mjs`, so the concept is something you can look at.
- [`grove/template/`](../grove/template/) — **the grove template** (built after the
  ADRs were Accepted): `grove.yml`, an empty planting log, the planting-ceremony CI
  check ([`validate-ceremony.mjs`](../grove/template/tools/validate-ceremony.mjs) —
  append-only, well-formed, owner-authored, still-places), the keeper's
  handbook, and its own **walk page** ([`template/walk/`](../grove/template/walk/) —
  enable GitHub Pages and the grove is a *place*). Self-contained: it vendors
  `place.mjs` and the walk renderer (both drift-guarded by CI here).
- [`prototypes/grove-walk/`](../prototypes/grove-walk/) — the **walkable grove**
  (G5): first-person night walk with a stroll mode that flies between clearings;
  every member an instanced impostor from `tree.json` bounds + sector hues, real
  members fetched live; click a tree to meet its grower and visit its full renderer.
  Walks any real grove via `?grove=<base-url>`.
- **The first real grove is planted** 🌱:
  [`webmemo-code/my-ai-learning-journey`](https://github.com/webmemo-code/my-ai-learning-journey)
  — created from the template on 2026-07-14; this repo's own tree took commons
  slot 0 through the ceremony PR (validated by its own CI, merged by the keeper).
  Dogfooding to the last step: the repo that defines the ceremony joined by it.
