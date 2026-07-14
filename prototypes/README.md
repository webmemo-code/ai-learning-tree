# Prototypes

Throwaway sketches that make the concept docs tangible. Nothing here is production
code — geometry, palette and parameters are placeholders; **the feeling is the spec**.

| Sketch | What it demonstrates |
| --- | --- |
| [mood-sketch/](mood-sketch/) | Phase-1 visual mood: night-garden palette, four strata bands, 9-sector compass, mock tree with bloom, sap-light, foliage recency colors, fireflies, root ghosting, and the **Replay growth** sweep |
| ↳ phase 2 | Interaction sketch layered on the same scene: click a compass wedge / sector chip to **dim-not-hide filter** a sector + fly a *Sector Walk* camera tour; click a leaf or blossom for a mock detail panel (commit link / level-up evidence); hover a stratum legend row to highlight that height band. Drag-vs-click discriminated (5px/200ms); Escape or empty-click clears. Verifier hooks on `window.__dbg` (`setFilter`, `pickAt`, `state`). |

## Running

Each sketch is a single `index.html` — open it in a browser (three.js loads from
jsdelivr, so you need to be online), or serve the folder:

```bash
npx serve prototypes/mood-sketch
# or: python -m http.server 8123 --directory prototypes/mood-sketch
```

On low-power machines or software-GL environments, append `?dpr=1` (or `?dpr=0.75`)
to the URL to reduce render cost.
