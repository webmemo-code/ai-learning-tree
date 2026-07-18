# Visual language

*What the tree looks and feels like. Inherits the Periodic Cube's vocabulary
([ai-periodic-cube](https://github.com/webmemo-code/ai-periodic-cube)) and takes it
botanical. Concrete file references below point into that repo — an inventory pass
(2026-07-13) confirmed these modules are extracted and liftable.*

## 1. Mood: the bioluminescent savanna night

A dark scene is bloom's natural habitat — the Periodic Cube already lives there, and
the tree should too: **a quiet night where light = life**. Wood is near-black bark
with faint emissive veins; everything that represents *activity* glows. Growth is
literally luminous. Since the acacia decision
([ADR-0008](decisions/0008-acacia-silhouette.md), generator algoVersion 2.0.0) the
scene is a **savanna night**: one umbrella-crowned acacia on an open plain under a
huge sky, not a tree inside a forest. (A "dawn mode" daylight variant can come
post-phase-5 — golden hour is the acacia's home lighting; it's a different rig, not
a different concept.)

The four strata read as **atmosphere, not gridlines** — sky bands over the plain
rather than forest fog layers: green ground haze hugging the grass (forest floor /
Novice), cool dusk teal (understory / Experimenter), a thin gold afterglow stripe
(canopy / Practitioner), and clear starlight above — **stars render only above the
emergent line**, so your tallest pad is the one thing silhouetted against actual
stars. Display naming may go savanna (Ground haze / Dusk / Afterglow / Starfield),
but the data-model stratum names are unchanged. You *feel* a rib crossing a stratum
before you could name it — and because pads climb their earned band with the
work itself (daily entries lift them a little each day, the band top holds until
a milestone opens the next — [ADR-0009](decisions/0009-activity-fills-the-band.md)),
the level-up moment is the canopy visibly lifting. Reference renderer:
[prototypes/acacia-sketch/](../prototypes/acacia-sketch/).

## 2. Inherited from the Periodic Cube (proven, liftable)

| Concept | Cube implementation (reuse) | Tree application |
| --- | --- | --- |
| **Bloom** | `three/postprocessing/bloomComposer.ts` — UnrealBloomPass factory, mobile-aware presets, `bloomDampen` shader trick to keep backgrounds from over-blooming | Leaves, blossoms, fireflies bloom; bark and ground get `bloomDampen` so the glow stays *on the life* |
| **Glowing line geometry** | `three/geometry/tubeEdges.ts` — 720 tubes in **one InstancedMesh**, per-instance color/opacity/emissive + gradient shader with brightness normalization | **Branches are tubes.** The whole skeleton (thousands of segments) renders as instanced tubes; per-instance emissive = recency; gradient shader = sap-light climbing from trunk to tip |
| **LOD & perf budget** | `three/lod/lodSystem.ts` — distance LOD, frustum culling, `DistanceCache`, "animate only nearest 20" budgeting | Same budget philosophy: full leaf detail near camera, foliage clusters at distance, only nearest N leaves sway/sparkle |
| **Camera choreography** | Hand-rolled keyframe tours + `easeInOutCubic` (`ThreeScene.tsx` animate loop), presets in `config/animations.ts`, and **`CameraAnimHelper.tsx`** — an in-app tool that exports hand-flown keyframes to config | Authored tours: *The Reveal* (descend through strata), *Sector Walk* (orbit per bough), *Level-Up Witness* (fly to a blossom). Keep the AnimHelper — hand-flown paths beat programmatic ones |
| **Sound** | `lib/audioManager.ts` — Howler singleton, 11 named events, dual webm/mp3, iOS-safe lazy init, persisted mute | Rebind the event vocabulary: `growth-tick`, `leaf-sprout`, `blossom` (level-up chime), `season-turn`, `camera-swoosh` (keep), ambient `night-garden` loop (crickets + soft wind) |
| **Filters that dim, not hide** | Persona relevance system (`ThreeScene.tsx:185-284`): three-tier highlight — Tier 1 pulses bright, Tier 2 dims, Tier 3 near-wireframe | Sector filter: chosen bough glows full, siblings dim to silhouette — **the tree never loses its shape** (hiding branches would amputate it) |
| **Intro reveal** | Ghost-grid fade-in, then staggered scale-up from zero with per-position delays | The tree *grows in* on load: trunk first, then boughs in birth order, foliage last — a 4-second echo of the full replay |
| **Labels** | `three/spriteFactory.ts` — crisp canvas→sprite text, DPI-scaled, HUD panels; billboard + top-N-nearest logic in `lodSystem.ts` | Sector name plates orbit bough bases; leaf inspector (hover = commit message / note tags) via HUD panel style |
| **Overlay UI** | `DraggablePanel.tsx` glass panels, shadcn/Tailwind, `Minimap.tsx` (ortho top-down with camera cone) | Same glass style. Minimap becomes the **compass rose**: top-down sector wheel showing where the camera looks — doubles as the sector filter |
| **Picking** | Raycast with drag-vs-click discriminator (5px/200ms) | Click leaf → event details (commit link!); click blossom → milestone evidence |

Stack decision inherited too: **three.js + Vite + TypeScript**, static output (the
cube's Express/WS server only powers its phone-gesture extra — the tree needs none of
that, so GitHub Pages hosting stays on the table for the template-repo path).

## 3. Native to the tree (new vocabulary)

These don't exist in the cube and define the tree's own personality:

1. **The Replay** 🎬 — *the* hero feature. One button: the tree regrows from seed
   while the camera orbits (authored keyframes synced to the growth-front sweep,
   see [03-data-model.md](03-data-model.md) §5). 30 seconds, exportable as a clip.
2. **Blossom = level-up** 🌸 — when a bough crosses a stratum: camera flies over
   (*Level-Up Witness* tour), a blossom opens (scale + bloom flare), single clear
   chime, then blossoms persist as permanent markers at the crossing height —
   the tree wears its milestones.
3. **Foliage seasons** 🍂 — leaf color = recency, per branch: fresh green (this
   month) → deep evergreen (sustained practice) → autumn gold (dormant >6 months).
   Never bare/dead. Dormancy must look like *a season, not a failure*.
4. **Fireflies** ✨ — the last ~7 days of events drift as glowing motes around the
   branches where they happened (`THREE.Points`, new — the cube has no particles).
   A living tree at first glance, even before you read anything.
5. **Sap-light** — a slow emissive pulse traveling trunk→tips along the instanced
   tubes (gradient shader offset animated over time). The tree breathes. Frequency
   eases with overall recent activity: an active month = a livelier pulse.
6. **Wind** 🌬️ — subtle vertex-shader sway on leaves and thin branches, amplitude
   by branch thinness. Stillness reads as dead; two lines of shader fix that.
7. **Roots reveal** 🕳️ — for the owner: camera dips below the ground disc, above-
   ground world dims to silhouette, the root system glows (Obsidian sectors mirror
   the canopy azimuths). Privacy boundary as a *place* you visit, not a setting.
8. **Strata bands** — four horizon-wide translucent light layers with faint labels
   (Novice / Experimenter / Practitioner / Expert) that fade in only when the camera
   moves vertically or a filter references them; otherwise atmosphere does the job.

## 4. Color system

- **Hue = sector** (10 hues around the wheel, grouped so each limb owns an arc):
  CREATE warm (amber / magenta / crimson / coral for copy / images / video / 3D), AUTOMATE
  spring-green, DISTRIBUTE teal + azure (SEO / GEO), BUILD violet spectrum
  (no-code lavender → low-code violet → pro-code indigo).
- **Lightness/saturation = recency** (the seasons axis) — hue never changes with
  time, so a sector is recognizable at any age.
- **Cross-cutting attribute** (local vs cloud, per ADR-0003): material finish, not
  color — cloud leaves iridescent/translucent, local leaves matte/dense.
- Wood/bark: near-black warm gray, `bloomDampen`ed. Background: deep blue-black
  gradient sphere (reuse cube's parallax background-sphere pattern, new texture).
- One consolidated token file from day one (the cube learned this the hard way —
  its 3D hex constants and CSS variables drifted apart).

## 5. Interaction model (phase 2 scope)

| Input | Result |
| --- | --- |
| Orbit / pinch | Free camera (inertia, soft limits keep tree in frame) |
| Click sector name / compass wedge | *Sector Walk* tour + dim-not-hide filter |
| Click leaf / blossom / fruit | HUD panel: event details, link to commit / note tag / milestone evidence |
| **Replay** button | Full regrowth time-lapse with authored camera |
| Stratum legend hover | Highlights that height band + every branch tip inside it |
| Time scrubber (phase 5) | Drag through history — the tree grows/ungrows under your hand |
| 🔇 / 🔊 | audioManager mute (persisted), ambience defaults ON but ducked |

## 6. Performance budget (inherited discipline)

Target: 60 fps desktop / 30 fps mid-range mobile at **10k events** (mock worst case,
tested in phase 2 before any real data): branch skeleton ≤ 5k instanced tube
segments; leaves as instanced quads with 3 LOD tiers (individual → cluster impostor
→ foliage billboard); fireflies ≤ 500 points; one bloom pass (mobile preset per
cube's `MOBILE_BLOOM_CONFIG` learnings); animation budget = nearest-N pattern from
`lodSystem.ts`.
