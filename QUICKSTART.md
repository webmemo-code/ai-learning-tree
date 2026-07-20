# Quickstart — run the tree locally

The fastest look is the **[live viewer](https://webmemo-code.github.io/ai-learning-tree/)**
(no setup, always the latest harvested tree). This page is for running it on your
own machine — to hack on the renderer, preview config changes, or explore offline.

## Prerequisites

- **Node 22+** — runs the generator and tests. There is no `npm install`: the whole
  pipeline is dependency-free by design.
- **Any static file server** — the examples use Python's built-in one; `npx http-server`
  works the same.
- A clone of this repo:

```
git clone https://github.com/webmemo-code/ai-learning-tree.git
cd ai-learning-tree
```

## Launch (30 seconds)

```
python -m http.server 8123
```

Then open <http://127.0.0.1:8123/> — the root page redirects to the acacia viewer.

> **The one rule: serve from the repo root.** Every sketch `fetch`es
> `../../data/tree.json`, so the server's document root must be the repo root —
> `data/` and `prototypes/` need to be siblings under the same URL tree. Starting
> the server *inside* a sketch folder (or opening `index.html` via `file://`)
> shows the built-in error panel instead of a tree. Committed `data/tree.json`
> ships in the repo, so there is nothing to build first.

## What to open

| URL (on :8123) | What it is |
| --- | --- |
| `/` | Redirects to the acacia viewer (same as the live site) |
| `/prototypes/acacia-sketch/` | **The reference renderer** — savanna-night acacia, replay, timeline, filters, roots reveal, sound, clip recording |
| `/prototypes/mood-sketch/` | The original night-garden renderer, same data and interactions |
| `/prototypes/grove-sketch/` | Top-down 2D map of a mock grove |
| `/prototypes/grove-walk/` | First-person walkable 3D grove (drag to look, WASD to walk) |
| `/prototypes/acacia-look/` | Static 2D concept board (this one also works from `file://`) |

## Useful URL parameters

Both tree renderers (acacia-sketch and mood-sketch) accept:

| Param | Effect |
| --- | --- |
| `?data=mock` | Render the frozen mock fixture (a fuller, multi-tier crown) instead of the real tree |
| `?dpr=1` | Cap device-pixel-ratio — smoother on low-power machines |
| `?hud=0` | Clean embed: no overlays at all |
| `?filter=<sector>` | Start with a sector filter engaged (short label, e.g. `seo`, `pro-code`) |
| `?roots=1` | Start below ground in the roots reveal |
| `?reel=1` | Auto-start the 30-second replay |

grove-walk additionally takes `?grove=<base-url>` (walk a real grove, e.g.
`?grove=../../grove/fixtures/demo-grove`) and `?stroll=0` (disable auto-wander).

## Rebuilding the tree from data

Only needed after editing `tree.config.yml`, the growth log, or the generator —
the committed `tree.json` is otherwise current:

```
node generator/build.mjs        # data/growth-log.jsonl + tree.config.yml → data/tree.json
```

Refresh the browser afterwards. To verify nothing broke:

```
node generator/test-determinism.mjs
node harvester/test-harvest.mjs
node harvester/test-vault.mjs
```

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| "Couldn't load the tree · HTTP 404" | Server not rooted at the repo root → restart it from the repo's top folder |
| Error panel mentioning `file://` | You opened the HTML directly → serve over http (see above) |
| Tree doesn't reflect a config edit | `tree.json` is generated, not live → rerun `node generator/build.mjs` |
| Port already in use | Pick another: `python -m http.server 8124` — any port works |
| A YAML edit broke the build | The config parser is hand-rolled and strict — see the header comment in [tree.config.yml](tree.config.yml); keep files LF (enforced by `.gitattributes`) |
