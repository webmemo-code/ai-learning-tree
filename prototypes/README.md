# Prototypes

Throwaway sketches that make the concept docs tangible. Nothing here is production
code — geometry, palette and parameters are placeholders; **the feeling is the spec**.

| Sketch | What it demonstrates |
| --- | --- |
| [mood-sketch/](mood-sketch/) | Phase-1 visual mood: night-garden palette, four strata bands, 9-sector compass, mock tree with bloom, sap-light, foliage recency colors, fireflies, root ghosting, and the **Replay growth** sweep |

## Running

Each sketch is a single `index.html` — open it in a browser (three.js loads from
jsdelivr, so you need to be online), or serve the folder:

```bash
npx serve prototypes/mood-sketch
# or: python -m http.server 8123 --directory prototypes/mood-sketch
```

On low-power machines or software-GL environments, append `?dpr=1` (or `?dpr=0.75`)
to the URL to reduce render cost.
