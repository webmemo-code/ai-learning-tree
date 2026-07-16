# Acacia look — visual concept board

*Direction-finding sketch for the tree's silhouette. Walter: "I have more of an
acacia tree in mind." This folder holds the write-up (this file) and a generative
2D concept board ([index.html](index.html) — no dependencies, opens straight from
`file://`). Nothing here is production code; **the feeling is the spec**.*

## Why the acacia is the right tree for this project

The current generator (ported from mood-sketch 001) grows a **tall single leader**
with limbs forking off at staggered heights — it reads as a young poplar or
conifer. A savanna acacia (*Vachellia tortilis*, the umbrella thorn) is the
opposite habit: a short stout bole that **forks low into a few major limbs**,
which zigzag up and outward and stop in a **wide, flat-topped crown**. Four
reasons this isn't just taste, but a better fit for the allegory:

1. **The crown is the compass.** The tree's radial axis (sectors as azimuth
   wedges, docs/01 §1) is currently spent on limbs stacked *vertically* along the
   trunk. An acacia spends it where the data lives: the umbrella's ribs fan out
   radially, so the crown seen from above *is* the sector compass rose. The
   minimap and the tree become the same picture.
2. **The flat top is the integrity rule made visible.** `grow.mjs` already
   flattens branches beneath each stratum ceiling instead of letting them pierce
   it (ADR-0004: milestones gate strata). Today that flattening is a constraint
   politely hidden; the acacia turns it into *the* characteristic feature. A flat
   crown under a ceiling is the honest silhouette of "this is the level I've
   earned" — and a level-up becomes the most legible moment in the whole system:
   **the canopy lifts**.
3. **One iconic hero shot.** The lone acacia against the sky is arguably the most
   recognizable tree silhouette there is. Docs/00's shareability goal wants one
   image that says "this is my journey" — the acacia is that image by default.
4. **Asymmetry gets beautiful instead of awkward.** Per-sector proficiency means
   pads at different heights (Expert in SEO, Novice in video). On a leader-trunk
   tree that reads as lopsided; on an acacia it reads as a natural multi-tiered
   umbrella — exactly the "asymmetric trees are simply more beautiful" promise of
   docs/01 §1.

Bonus, below ground: acacias are famous for **taproots deeper than the tree is
tall** — the roots-are-private-knowledge metaphor (ADR-0002) gets *stronger*: the
deep unseen root is what lets the crown survive the dry season.

## The tension to resolve first

Docs/01 maps the vertical axis onto **rainforest stratification** (forest floor /
understory / canopy / emergent). An acacia is a savanna tree — it doesn't stand
*inside* those forest layers. Resolution: **keep the four bands and the 1:1
Section mapping untouched; reframe the biome dressing.** The bands become savanna
atmosphere instead of forest layers (Concept 3 below). Nothing in the data model,
taxonomy, or milestone gating moves — only what the height bands *look like*.

The savanna also upgrades the seasons story: foliage recency (docs/02 §3.3) maps
to **wet season / dry season** — acacias flush green after rain and go sparse
gold in drought, without ever reading as dead. Dormancy = dry season is an even
kinder frame than autumn.

---

## Concept 1 — **Rising Umbrella** *(silhouette · the core move)*

```
   Expert ····························································
                                            ─────────────
   Practitioner ······· ▂▄▆████▆▄▂ ······ ▂▄▆███████▆▄▂ ·············
                          \ | /               \  |  /
   Experimenter · ▂▄▆██▆▄▂  \|/    ▂▄▆▆▄▂      \ | /  ················
                     \ /     |       \|         \|/
   Novice ············\──────┼────────/─────────/····················
                              ║  short bole, low fork
                        ══════╩══════
```

One flat foliage **pad per sector**, its top plane sitting just under the ceiling
of that sector's current stratum. Limbs fork from a short bole in a tight band
(no leader above the fork), climb outward with the acacia's angular zigzag, and
flatten hard as they approach their ceiling. The whole crown is a set of
umbrella tiers at earned heights — the tree's shape *is* the proficiency report.

Generator deltas (all inside `grow.mjs`, algoVersion **major** bump — the shape
changes, determinism doesn't):

- Trunk: `TRUNK_H` 8.4 → ~2.5–3.5, thicker base; limbs attach in a tight
  `attachFrac` band (~0.55–0.9) instead of staggered 0.14–0.86; nothing continues
  above the fork.
- Limb launch angle steepens outward (≈70–85° from vertical), then the existing
  phototropic curl brings the tip up until the **ceiling flatten** (already in
  the code) takes over — strengthened so approach to `ceil` also *widens* the
  child fan, packing twigs into a dense horizontal mat.
- Leaf clusters become **flattened ellipsoids** (xz radius ≫ y), tops aligned to
  the pad plane; `act` drives crown *radius* rather than reach in all directions.
- Blossoms stay exactly where they are — at stratum crossings, which are now the
  visible rims where the canopy lifted. The Replay improves for free: each
  level-up in the time-lapse is a pad visibly rising to the next band.

## Concept 2 — **Tiered Pagoda** *(history layer · optional on top of C1)*

Each stratum a sector has *ever* crossed leaves a persistent smaller pad at that
band — the current level wears the full fresh crown, older tiers below it thin
out and shift toward dry-season gold. The tree carries its history as layers,
like a cedar-of-Lebanon / layered acacia. Blossoms sit at tier rims, which is
where they already spawn.

Honest trade-off: more foliage geometry per sector and a busier silhouette. This
reads gorgeous at 1–2 tiers and cluttered at 4 × 10 sectors — proposed as an
**owner-toggleable layer** (or a Replay-only effect: past tiers fade as the pad
lifts) rather than the default look.

## Concept 3 — **Savanna Night** *(atmosphere · biome reframe)*

Keep the bioluminescent night garden — relocate it. The four strata become
**sky bands** over an open plain instead of forest fog layers:

| Band | Forest version (today) | Savanna version |
| --- | --- | --- |
| Novice | forest-floor moss fog | **ground haze** — green-tinted grass glow hugging the plain |
| Experimenter | understory teal | **dusk band** — cool teal air |
| Practitioner | canopy gold | **afterglow** — a thin warm gold horizon stripe |
| Expert | emergent starlight | **starfield** — stars render *only* above this line |

You *feel* emergent because your tallest pad is the only thing silhouetted
against actual stars. The ground disc flattens into a wide short-grass plain
with the compass rose faintly etched in it; fog lives only in the bottom band.
The grove gets better too: scattered savanna trees on an open plain is exactly
what grove-walk's meadow flights want — every neighbor readable at distance by
its pad heights alone. And the post-phase-5 "dawn mode" (docs/02 §1) inherits
the acacia's home lighting: golden hour on the savanna is the poster shot
waiting to happen.

## Concept 4 — **Thorn & Lace** *(detail + material pass, after C1/C3)*

The close-up character, where the cube-inherited tech gets rebound:

- **Zigzag wood** — replace the smooth eased limb curves with kinked, angular
  segments (acacias grow in elbows). The instanced-tube skeleton doesn't care;
  only the path generator changes. The **sap-light pulse** running along angular
  zigzags reads like a circuit trace — a quietly perfect accident for an *AI*
  learning tree.
- **Thorns** — tiny non-emissive spikes at kinks. Texture, not threat; they
  catch bloom from nearby foliage without glowing themselves.
- **Lace foliage** — acacia leaves are bipinnate (fern-like combs of tiny
  leaflets). Leaf billboards get a lace texture, and pads render as **thin
  stacked horizontal layers** that glow from within, rather than volumetric
  blobs.
- **Fireflies under the umbrella** — the shade beneath an acacia is the savanna's
  gathering place. Recent-activity motes drift in the shadow *below* the pad
  instead of around the branches; the tree shelters its own last seven days.

---

## Recommendation

**C1 + C3 together are the direction** — one is the silhouette, the other the
world it stands in; done separately each looks half-committed. C4 is the polish
pass after the new skeleton exists. C2 stays an experiment behind a toggle.

Suggested path, mirroring how the current look was found:

1. This 2D board (done — pick/adjust the direction here first, it's the cheap
   place to argue).
2. Fork mood-sketch into an **acacia mood sketch** — same data, same renderer,
   acacia growth parameters + savanna sky, side by side with the current look.
3. Once the 3D feeling is approved, port into `generator/grow.mjs` as
   algoVersion 2.0.0 and update docs/01 §1 + docs/02 §1 (biome wording) in the
   same PR.

**What doesn't move:** the growth log, drivers, taxonomy, milestone gating,
privacy modes, replay mechanics, the entire data model. `tree = grow(events,
seed)` stays pure — the tree just learns which species it is.
