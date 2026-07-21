# AI Learning Tree 🌳

**Visualize your AI learning journey as a living, growing 3D tree.**

Every commit you push, every note you write, every skill you level up — the tree grows.
Vertically it climbs through the four strata of AI proficiency. Radially it spreads
across the fields of the AI landscape you practice in. It is your journey, rendered
as something alive — and something worth showing to other knowledge workers to say:
*you can grow one too.*

> **Status: 🌲🌲 Forest phase (6 of 6).** The tree pipeline is live (nightly GitHub +
> Obsidian harvest → deterministic `tree.json` → interactive renderer with the 30s
> replay), grove coordination is decided (ADR-0006/0007), and **the
> [first real grove is planted](https://github.com/webmemo-code/my-ai-learning-journey)** —
> this repo's own tree stands at slot 0 of its commons, joined by the same
> [planting ceremony](grove/template/README.md) every future member will use.
> **The tree's species is the savanna acacia** (generator algoVersion 3.0.0,
> [ADR-0008](docs/decisions/0008-acacia-silhouette.md) +
> [ADR-0009](docs/decisions/0009-activity-fills-the-band.md)): each sector's
> foliage pad climbs its *earned* proficiency band with the work itself — daily
> entries lift it day by day, a level-up opens the next band, and past the
> Expert threshold the tree keeps growing — see the
> [acacia sketch](prototypes/acacia-sketch/) and the living TODO
> in [docs/04 §4](docs/04-roadmap-and-process.md). The
> origin brain dump lives in [issue #1](https://github.com/webmemo-code/ai-learning-tree/issues/1).

[![The live tree — this image re-captures itself after every nightly harvest deploy](https://webmemo-code.github.io/ai-learning-tree/assets/tree-latest.png)](https://webmemo-code.github.io/ai-learning-tree/prototypes/acacia-sketch/)
*The live tree, re-shot automatically on every deploy (nightly, after the
harvest): blossoms mark evidenced level-ups, fireflies gather under pads worked
in the last seven days, and the **contribution meadow** glows at the rim — one
luminous grass ring per week of the growth log, recent weeks outermost. Click
the image to orbit the real thing. Dated milestone shots are kept in
[docs/documentation/](docs/documentation/).*

**🌳 [Open the interactive tree](https://webmemo-code.github.io/ai-learning-tree/prototypes/acacia-sketch/)** —
orbit it, click leaves and blossoms for their commits and milestone evidence,
hover the compass and strata, or hit *🎬 Replay journey* for the 30-second
regrowth ([source](prototypes/acacia-sketch/)). The ground carries the
**contribution meadow** — the weekly work rhythm as luminous grass rings
(blade height = that week's commits, sector-hued, private work included as
aggregates only, [ADR-0010](docs/decisions/0010-contribution-meadow-aggregates.md)).
The site redeploys on every push **and** is chained behind the nightly harvest
workflow, so it always shows the latest harvested tree.

Sibling project: [ai-periodic-cube](https://github.com/webmemo-code/ai-periodic-cube) —
the Periodic Cube of AI, whose visual language (bloom, camera choreography, sound,
filters, level of detail) this project inherits and takes botanical.

## The idea in one picture

```
                          ✦ EMERGENT  · Expert ····································
                        🌸    /
                     .·´¯`·.🌸           the crown that rises above the forest
                  ···🍃·canopy·🍃···· CANOPY · Practitioner ·······················
               🍃´        |        `🍃
                 \        |        /     repeatable workflows, embedded practice
              ····🍃······|······🍃··· UNDERSTORY · Experimenter ··················
                   `·.    |    .·´
                      \   |   /          frequent one-off use, trying things
              ~~~~~~~~~~\ | /~~~~~~~~~ FOREST FLOOR · Novice ······················
                         \|/
                    ══════╬══════        ground level: you, starting out
                       .··|··.
                      · roots ·          private knowledge (Obsidian), foundations
                       `··:··´
```

- **Vertical axis** — the four AI proficiency levels defined by
  [Section](https://www.sectionai.com/ai/the-ai-proficiency-report):
  Novice → Experimenter → Practitioner → Expert, mapped onto the four real
  strata of a forest: floor, understory, canopy, emergent layer.
- **Radial axis** — the fields of AI practice (content, images, video, workflow
  automation, SEO/GEO, no-/low-/pro-code building …), arranged like a compass rose.
- **Growth** — driven by real evidence: GitHub commits and Obsidian notes,
  harvested into an append-only growth log that deterministically generates
  the tree. Same history, same tree — which makes your journey **replayable
  as a time-lapse**.

## Documents

| Doc | What it holds |
| --- | --- |
| [docs/00-vision.md](docs/00-vision.md) | Why this exists, for whom, and what "done" feels like |
| [docs/01-concept.md](docs/01-concept.md) | The tree allegory: anatomy mapping, axes, growth mechanics, tree-vs-forest |
| [docs/02-visual-language.md](docs/02-visual-language.md) | Look & feel: what we inherit from the Periodic Cube, and the tree's own moments |
| [docs/03-data-model.md](docs/03-data-model.md) | Sources, growth-event log, sector classification, growth algorithm, privacy |
| [docs/04-roadmap-and-process.md](docs/04-roadmap-and-process.md) | Phases, working process, and the path to letting anyone plant their own tree |
| [docs/05-grove.md](docs/05-grove.md) | The forest layer: how shared groves coordinate — the planting log, phyllotaxis placement, clearings, federation |
| [docs/research/prior-art.md](docs/research/prior-art.md) | Annotated sources: botanical infovis, procedural trees, commit visualizers, digital gardens |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records — where open questions go to become decisions |

## License

[MIT](LICENSE) © Walter Schärer
