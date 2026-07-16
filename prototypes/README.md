# Prototypes

Throwaway sketches that make the concept docs tangible. Nothing here is production
code — geometry, palette and parameters are placeholders; **the feeling is the spec**.

| Sketch | What it demonstrates |
| --- | --- |
| [mood-sketch/](mood-sketch/) | Phase-1 visual mood: night-garden palette, four strata bands, 10-sector compass, tree with bloom, sap-light, foliage recency colors, fireflies, root ghosting, and the **Replay growth** sweep |
| ↳ phase 2 | Interaction sketch layered on the same scene: click a compass wedge / sector chip to **dim-not-hide filter** a sector + fly a *Sector Walk* camera tour; click a leaf or blossom for a detail panel (real commit link / level-up evidence); hover a stratum legend row to highlight that height band. Drag-vs-click discriminated (5px/200ms); Escape or empty-click clears. Verifier hooks on `window.__dbg` (`setFilter`, `pickAt`, `state`). |
| ↳ **now data-driven** | The sketch no longer hardcodes the tree. It `fetch`es `../../data/tree.json` — the deterministic output of [`generator/`](../generator/) run over the growth log — and builds all geometry (segments / leaf clusters / blossoms / fireflies), the compass, strata and sector legend from it. Leaf and blossom panels show **real events** from the log (commit ids link to GitHub; milestones show their evidence URL + note). Because it fetches, it must be **served over http** (see below); opening the file directly shows a graceful error panel. Rebuild the data with `node generator/build.mjs`. |
| ↳ phase 4 · **roots reveal** 🕳 | The `🕳 Roots` button (or `__dbg.setRoots(bool)`) flies the camera below the ground disc — the privacy boundary as a *place you visit* (docs/02 §3.7, [ADR-0005](../docs/decisions/0005-roots-privacy-modes.md)). Over ~0.8s the above-ground world dims to a ~12% desaturated silhouette, the ground goes translucent, the strata fade, and the **root system glows** (owner mode: sector hues; silhouette mode: neutral warm gray). Composes with the sector filter (the filtered sector's roots glow brightest) and, in owner mode, a root cluster is **clickable** for that sector's private-note aggregates (count · last tended · top tags) — never per-note data. Escape leaves roots mode first, then clears a filter. Depends on the generator's `privacy.roots` mode: the button hides itself when `tree.json` has no roots (`hidden`). |
| [acacia-look/](acacia-look/) | **Direction-finding concept board** for the tree's silhouette: four generative 2D-canvas sketches exploring the move from the current tall-leader look to a **savanna acacia** — (1) Rising Umbrella: one flat pad per sector parked under its earned stratum ceiling, (2) Tiered Pagoda: persistent pads at every crossed stratum, (3) Savanna Night: the four strata as sky bands over an open plain, (4) Thorn & Lace: zigzag elbow wood + bipinnate lace foliage close-up. Zero deps, opens from `file://`, 🎲 reseed for variants (`?seed=`). Write-up + generator deltas in its [README](acacia-look/README.md). |
| [acacia-sketch/](acacia-sketch/) | **The acacia mood sketch** — the concept board's recommended direction (1 Rising Umbrella + 3 Savanna Night) judged in real 3D, side by side with mood-sketch. A fork of the full mood-sketch app (replay, timeline, filters, roots reveal, sound, record, share — all intact) that fetches the **same `tree.json`** and re-grows only the above-ground geometry client-side: short bole forking low, angular elbowed ribs per sector that flatten hard under their **earned stratum ceiling**, flat pad-lens foliage, blossoms riding the ribs at the crossings, fireflies in the shade *under* the pads. Roots and every real event reference pass through untouched. The sky becomes savanna bands (ground haze → dusk teal → gold afterglow → **stars only above the Expert line**) over an open fog-faded plain; band labels read Ground haze / Dusk / Afterglow / Starfield (display-only — tree.json keeps its names). Camera + replay path scale to the tree's earned height: the real (all-Novice) tree is one honest low umbrella; `?data=mock` shows the full multi-tier crown. Same URL params as mood-sketch; extra `__dbg`: `acacia`, `crownY`, `targetY`. This is the 3D preview of generator algoVersion 2.0.0. |
| [grove-sketch/](grove-sketch/) | Phase-6 concept made visible: a **top-down night map of a mock grove**, placed by the real [`grove/place.mjs`](../grove/place.mjs) — commons + three clearings on golden-angle spirals, ~200 sector-hued tree glows, stumps as faint rings, reserved moss discs, clearing name plates. Hover a dot for `tree · clearing · slot`. No three.js — plain 2D canvas, but it still needs `http` for the module import. |
| [grove-walk/](grove-walk/) | Phase-6 build: the **walkable 3D grove** ([docs/05-grove.md](../docs/05-grove.md) G5). First person — **drag** to look, **WASD/arrows** to walk, **wheel** to glide; a **🚶 Stroll** mode (on by default, any input cancels) wanders among each clearing's trees and *flies* the empty meadow between clearings, where the phyllotaxis pattern reads from the air. Every member renders as an **impostor**: one instanced-billboard draw for all crowns, one instanced trunk mesh — members with a fetchable `tree.json` build their impostors from the real data (leaf-cluster centers/radii, sector hues + recency, blossom positions); the rest get seeded plausible specs. Click a tree → member id, clearing, slot, planted date, and a "visit this tree →" link. Stumps stay as bark-hued rings. Supports `?dpr=` (+ adaptive quality), `?hud=0`, `?stroll=0`. `__dbg`: `goTo(id)`, `pickAt`, `setStroll`, `state`. |
| ↳ **walks real groves** | The page is now a thin shell over the shared renderer [`grove/walk-app.mjs`](../grove/walk-app.mjs) (vendored into the template, so every grove repo ships its own walk page). Without params you get the built-in **mock story** (two real local trees + ~200 seeded members). Pass **`?grove=<base-url>`** to walk a *real* grove: the base must serve `grove.yml` + `plantings.jsonl` (a repo's raw-content root, a Pages root, or a relative path) — try `?grove=../../grove/fixtures/demo-grove`. Member impostors come from each planting's `tree.json` URL where fetchable; the visit link points at the member's GitHub repo. |
| ↳ phase 5 · **Bloom** 🌸 | The polish layer (docs/04 phase 5, docs/00 "the time-lapse"). **🎬 Replay journey**: the tree regrows from seed in ~30s under an authored camera — ground-level sprout → understory rise → one slow full orbit through the canopy → in among the blossoms → pull-back landing exactly on the load pose. Wall-clock synced (a 30s journey is 30s even if the frame rate dips), letterboxed cinema mode (HUD fades), a running **date readout** (uGrow inverted through the generator's `tNorm`, anchored on `generatedFrom.earliestTs/latestTs`), and **milestone captions + pentatonic chime** as each blossom crosses the growth front. Escape / any drag cancels; growth then sweeps on from where it was. **Timeline**: a bottom scrubber — drag to move the growth front through history (date label follows, fireflies vanish in the past), release to stay there, double-click → today. **Sound** 🔊: fully synthesized night-garden ambience (filtered-noise wind + soft pad), blossom chimes, camera swoosh; preference persists in `localStorage`, context starts on first gesture (autoplay-safe), default on. **🎥 Record clip**: runs the reel while capturing the canvas via `MediaRecorder` (+ live audio if on) → downloads `ai-learning-tree-journey.webm` — the phase-5 exit criterion, literally. **⤴ Share**: copies a `?reel=1` deep link that opens with the replay. Adaptive quality: if fps stays under ~28 the pixel ratio steps down (never up; explicit `?dpr=` opts out). New `__dbg` hooks: `startReel(dur)`, `stopReel`, `setGrow`, `recordJourney`, `journeyUrl`. |

## Running

The mood-sketch fetches `data/tree.json`, so serve it from the **repo root** (not
the sketch folder) and you need to be online for three.js from jsdelivr:

```bash
python -m http.server 8123        # from the repo root
# then open http://localhost:8123/prototypes/mood-sketch/
```

Opening `index.html` directly (`file://`) blocks the fetch — the page shows a
full-screen hint instead of the tree. First build the data if it's missing:
`node generator/build.mjs`.

On low-power machines or software-GL environments, append `?dpr=1` (or `?dpr=0.75`)
to the URL to reduce render cost.

By default the page fetches the real tree (`data/tree.json`, produced by the
phase-3 harvester + `generator/build.mjs` — see [data/README.md](../data/README.md)).
Append `?data=mock` to load the frozen phase-2 fixture instead
(`data/mock/tree.json`) — handy before the real pipeline has produced anything,
or to compare current output against the known-good reference shape. The HUD's
bottom-right note gets a "· mock data" suffix whenever this param is active, so
it's always obvious which dataset is on screen. Combine freely with `?dpr=`,
e.g. `?data=mock&dpr=1`.

### URL params (deep links & embedding)

| Param | Effect |
| --- | --- |
| `?data=mock` | Load the frozen phase-2 fixture instead of the real tree |
| `?dpr=1` | Cap the pixel ratio (also disables the adaptive-quality guard) |
| `?reel=1` | Autoplay the 30s journey on load — this is what **⤴ Share** links to |
| `?filter=<label>` | Start with a sector filter engaged (e.g. `?filter=pro-code`) |
| `?roots=1` | Start in the roots reveal (if the tree's privacy mode has roots) |
| `?hud=0` | Hide every overlay — a clean canvas for iframe embeds |

`reel=1` takes precedence over `filter`/`roots` (the journey always shows the
whole public tree). Sound never auto-starts from a URL — browsers require a
real gesture, and the 🔊 preference is the visitor's own (persisted locally).
