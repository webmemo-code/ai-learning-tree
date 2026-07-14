# Prototypes

Throwaway sketches that make the concept docs tangible. Nothing here is production
code — geometry, palette and parameters are placeholders; **the feeling is the spec**.

| Sketch | What it demonstrates |
| --- | --- |
| [mood-sketch/](mood-sketch/) | Phase-1 visual mood: night-garden palette, four strata bands, 9-sector compass, tree with bloom, sap-light, foliage recency colors, fireflies, root ghosting, and the **Replay growth** sweep |
| ↳ phase 2 | Interaction sketch layered on the same scene: click a compass wedge / sector chip to **dim-not-hide filter** a sector + fly a *Sector Walk* camera tour; click a leaf or blossom for a detail panel (real commit link / level-up evidence); hover a stratum legend row to highlight that height band. Drag-vs-click discriminated (5px/200ms); Escape or empty-click clears. Verifier hooks on `window.__dbg` (`setFilter`, `pickAt`, `state`). |
| ↳ **now data-driven** | The sketch no longer hardcodes the tree. It `fetch`es `../../data/tree.json` — the deterministic output of [`generator/`](../generator/) run over the growth log — and builds all geometry (segments / leaf clusters / blossoms / fireflies), the compass, strata and sector legend from it. Leaf and blossom panels show **real events** from the log (commit ids link to GitHub; milestones show their evidence URL + note). Because it fetches, it must be **served over http** (see below); opening the file directly shows a graceful error panel. Rebuild the data with `node generator/build.mjs`. |

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
