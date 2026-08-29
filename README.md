# AI Learning Tree 🌳

**Your AI learning journey, drawn as a real tree that grows a little every time you learn something.**

You don't have to understand code to enjoy this page. Here's the whole idea in
three sentences:

1. While you learn to work with AI, you leave small traces behind — every step
   of work you save to GitHub, every pull request, review and issue you take
   part in there, and the notes you write in your notebook app.
2. This project quietly collects those traces once a night and turns them into a
   **3D tree** you can spin around in your browser.
3. The more you practice, the taller and fuller the tree gets — so you can
   *see* your progress instead of just hoping it's there.

It's your journey, rendered as something alive — and something worth showing to
other people who'd like to grow one too.

## Have a look first — nothing to install

[![The live tree — this image re-captures itself after every nightly harvest deploy](https://webmemo-code.github.io/ai-learning-tree/assets/tree-latest.png)](https://webmemo-code.github.io/ai-learning-tree/prototypes/acacia-sketch/)

**🌳 [Open the interactive tree](https://webmemo-code.github.io/ai-learning-tree/prototypes/acacia-sketch/)** —
it opens like any normal web page. Drag with the mouse to walk around the tree,
click a leaf or a blossom to see what piece of work it stands for, and press
*🎬 Replay journey* to watch the whole tree grow again in 30 seconds.

A few things you'll notice once you're in there:

- **Blossoms** mark moments where a new level was reached.
- **Fireflies** hover under the parts you've worked on in the last seven days.
- **The glowing grass ring at the bottom** — we call it the *contribution
  meadow* — is one ring per week of work: the taller the blades, the busier that
  week was. Work done in private stays private; it only shows up as brightness,
  never as details (the reasoning:
  [ADR-0010](docs/decisions/0010-contribution-meadow-aggregates.md)).

The picture above is not a hand-made screenshot: the site re-photographs itself
every night after it collects new work, so what you see is always current.
Older, dated snapshots are kept in [docs/documentation/](docs/documentation/).

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

Read the tree like this:

- **How high something sits = how far you've come.** A real forest has four
  layers, from the shady floor up to the few tall trees poking out of the top.
  Those four layers stand for the four skill levels described in
  [Section's AI proficiency report](https://www.sectionai.com/ai/the-ai-proficiency-report):
  Novice → Experimenter → Practitioner → Expert.
- **Which direction a branch points = what kind of work it is.** The branches
  fan out like a compass: writing and images, video, automating repetitive
  tasks, SEO, building things with and without code.
- **The roots = your private notes.** They're part of the foundation, but their
  contents are never published.
- **Nothing grows without evidence.** The tree only reacts to work that really
  happened — your commits, pull requests, reviews and issues on GitHub, plus
  your private notes. Same history in, same tree out — which is exactly why the
  30-second replay is possible.

## Where the project stands today

**Status: 🌲🌲 Forest phase (the last of six).** In plainer terms: the whole
thing works end to end.

- Every night, the project checks GitHub (and, optionally, your private notes)
  for new work and writes it into a running list.
- That list is turned into the tree you can open in the browser, including the
  replay.
- The **first shared forest is planted**: this repo's own tree stands in the
  [my-ai-learning-journey grove](https://github.com/webmemo-code/my-ai-learning-journey),
  and everyone who joins later follows the same short
  [planting ceremony](grove/template/README.md).
- **The tree is modelled on a savanna acacia** — the flat-topped kind you know
  from wildlife documentaries. Each direction's leafy pad rises with the work
  you put in: everyday work lifts it day by day, and reaching a new level opens
  the next band above. See the [acacia sketch](prototypes/acacia-sketch/) and
  the decision notes
  [ADR-0008](docs/decisions/0008-acacia-silhouette.md) and
  [ADR-0009](docs/decisions/0009-activity-fills-the-band.md).

The very first, unfiltered brain dump that started all of this is
[issue #1](https://github.com/webmemo-code/ai-learning-tree/issues/1). What's
still to come is listed in [docs/04 §4](docs/04-roadmap-and-process.md).

## Words you'll bump into

New to GitHub? These are the only terms you really need:

| Word | What it means here |
| --- | --- |
| **Repository** (or *repo*) | A project folder that lives on GitHub. This page is the front door of one. |
| **Commit** | One saved step of work, with a date and a short note. These are the bulk of what the tree counts. |
| **Issue** / **Pull request** | GitHub's ways of saying "here's something to do" and "here's a change I'd like to make". Both count too, as does reviewing someone else's pull request. |
| **Harvest** | Our nightly collection run: it looks for new commits, pull requests, reviews, issues and notes, and writes them down. |
| **Growth log** | The running list of everything harvested, in the order it happened. Nothing is ever removed. |
| **`tree.json`** | The finished description of your tree — the file the 3D viewer reads. |
| **Obsidian** | A popular note-taking app. If you use it, your notes can feed the roots — privately. |
| **Grove** | Several people's trees standing side by side, like a small forest. |
| **ADR** | "Architecture Decision Record": a short note explaining why we chose something. |

## Want to try it yourself?

- **Just looking around?** The [live tree](https://webmemo-code.github.io/ai-learning-tree/prototypes/acacia-sketch/)
  is all you need — no account, no installation.
- **Curious how it runs on your own computer?**
  [QUICKSTART.md](QUICKSTART.md) walks through it step by step. You'll need to
  copy the project to your machine and start a small local web server; the
  commands are written out to copy and paste.
- **Want your own tree, or to join a grove?** Read
  [docs/04-roadmap-and-process.md](docs/04-roadmap-and-process.md) for how
  planting your own tree is meant to work, and
  [grove/template/README.md](grove/template/README.md) for how joining a shared
  forest works.

## The longer documents

Only if you want the full story — they get more technical as you go down the list.

| Doc | What it holds |
| --- | --- |
| [docs/00-vision.md](docs/00-vision.md) | Why this exists, who it's for, and what "finished" would feel like |
| [docs/01-concept.md](docs/01-concept.md) | The tree comparison in detail: which part of a tree stands for what, and how growth works |
| [docs/02-visual-language.md](docs/02-visual-language.md) | The look and feel — colors, light, motion, sound |
| [docs/03-data-model.md](docs/03-data-model.md) | Where the data comes from, how it's sorted, and how privacy is handled |
| [docs/04-roadmap-and-process.md](docs/04-roadmap-and-process.md) | What's built, what's next, and the path to letting anyone plant a tree |
| [docs/05-grove.md](docs/05-grove.md) | The forest layer: how several people's trees are arranged without ever moving each other |
| [docs/research/prior-art.md](docs/research/prior-art.md) | Related work that inspired this: data-art, procedural trees, commit visualizers, digital gardens |
| [docs/decisions/](docs/decisions/) | The decision notes (ADRs) — where open questions were settled |

## Related project

[ai-periodic-cube](https://github.com/webmemo-code/ai-periodic-cube) — the
Periodic Cube of AI, by the same author. This project borrows its visual style
(glow, camera moves, sound) and gives it a botanical twist.

## License

[MIT](LICENSE) © Walter Schärer — free to use, copy and adapt.
