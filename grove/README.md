# grove/ — the coordination system (phase 6)

*Which tree grows where?* Answered in [docs/05-grove.md](../docs/05-grove.md) and
decided (**Accepted**) in [ADR-0006](../docs/decisions/0006-grove-planting-log.md) /
[ADR-0007](../docs/decisions/0007-grove-placement-phyllotaxis.md). This directory
holds the **reference implementation** of the placement function — the part that
must be pure, deterministic, and append-stable — plus the **grove template**: the
folder a community copies to start a grove of their own.

| File | What it is |
| --- | --- |
| [place.mjs](place.mjs) | `placeGrove(events, config)` — planting log → clearing centers + tree positions. Pure: no I/O, no clock, no unseeded randomness. Stamped `placeVersion` (semver-sacred, mirror of `algoVersion`). |
| [test-place.mjs](test-place.mjs) | The trust properties as executable checks: determinism, append-stability, measured spacing floors, stump/tombstone slot semantics, validation — plus the template drift guard (the vendored copy must stay byte-identical). |
| [template/](template/) | **The grove template**: `grove.yml`, empty `plantings.jsonl`, the planting-ceremony CI check, keeper documentation. Copy it, name it, plant. |

## The one-paragraph version

A grove is a repo. Its only coordination state is `plantings.jsonl` — an
append-only log where **file order is slot order**. Joining is a PR appending one
`planted` line. Placement is **phyllotaxis** (the sunflower's golden-angle spiral)
at two scales: trees inside a clearing, clearings around the commons. Because a
tree's position depends only on its own slot number, planting tree N+1 moves zero
existing trees — the forest never reshuffles under you, by construction. Slots are
never reused: departures leave stumps, erasures leave invisible tombstones, and
everyone else stands exactly where they always stood.

## Run the checks

```bash
node grove/test-place.mjs
```

## See it

Serve the repo root and open the top-down sketch (see
[prototypes/README.md](../prototypes/README.md)):

```bash
python -m http.server 8123
# http://localhost:8123/prototypes/grove-sketch/
```

## Starting a grove

Copy [template/](template/) into a new repository (it is self-contained — it
vendors its own `place.mjs`), edit `grove.yml`, and merge your first planting.
The template's README carries the full keeper + ceremony documentation. When the
template graduates to its own `grove-template` repo ("Use this template" button),
this folder is its source of truth.

## What is deliberately NOT here

Any grove *instance*. Walter's own grove — like anyone's — belongs in its own
repo, planted from the template. This repo only ships the seeds.
