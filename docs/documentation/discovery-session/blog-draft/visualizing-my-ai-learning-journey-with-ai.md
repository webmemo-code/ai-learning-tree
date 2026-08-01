# I Asked AI to Draw My AI Learning Journey. It Took Eighteen Tries.

*What happens when you point a visualization at your own commit history — and let the AI argue back about which shapes lie*

---

## The Premise

I have spent two years learning AI in public. The evidence is sitting in GitHub: 1,749 commits across 35 repositories, from December 2024 to July 2026. SEO experiments, image pipelines, video work, workflow automation, and a growing pile of pro-code projects.

That is a learning journey. It is also, in its raw form, completely unreadable. Nobody — including me — looks at a commit log and feels anything.

So I set out to make it visible. Not as a dashboard. As an **object**: a tree that grows from my actual work, where the shape itself carries the meaning. You can [walk through the live tree here](https://webmemo-code.github.io/ai-learning-tree/) — it is an acacia standing in a savanna night, it replays my journey from seed in about thirty seconds, and its canopy is banded into the four proficiency levels I am trying to climb: ground haze for Novice, dusk for Experimenter, afterglow for Practitioner, starfield for Expert.

That viewer is the destination. This post is about a different question — how do you find a *shape* that tells the truth? — and I built it the way I now build most things: in conversation with AI, in one long session, generating and rejecting forms until one survived.

This post is about that session. Eighteen images, one afternoon and evening, and a lesson I did not expect: **the most valuable thing the AI produced was not a picture. It was a verdict.**

There is a reason I care about making this visible rather than just tracking it. Section's [AI Proficiency Report](https://www.sectionai.com/ai/the-ai-proficiency-report) puts roughly 95% of the workforce below the proficiency bar — about 21% Novices, about 73% Experimenters stuck in one-off usage, and only around 5% Practitioners and Experts who have actually embedded AI into repeatable workflows. Those numbers are accurate and they move nobody. **Stories move people, and images move people.** A learning journey you can look at is an argument that a percentage cannot make.

---

## Act One: Three Shapes, Chosen by Eye

I started where most people start — by asking for options. Three variants of the same data, so I could pick with my eyes instead of my imagination.

**Variant A** put one rib per field of practice, banded by quarter. Height is *when*, angle is *which sector*, thickness is *how much*.

**Variant B** turned the same data into trunk rings: one band per quarter, oldest at the roots, radius set by that quarter's commits, and stripes across each band showing the mix of commits, pull requests, reviews, and issues. Seen from above, it reads as a cross-section — rings you can literally count.

Both looked good in isolation. Then I refined variant B until it was honest, and the honesty broke it.

Here is the problem. My activity genuinely peaks *now*. December 2024 has 3 commits; the most recent quarter has 390. If radius equals commits, the object is fat at the top and needle-thin at the base. It is not a tree. It is a **funnel** standing on its point.

That was the first real finding, and it came from geometry rather than opinion: on this dataset, "radius = commits" and "looks like a tree" are mutually incompatible. One of them had to go.

---

## Act Two: The Image That Changed the Session

At this point I told the AI that none of the three variants was *wow*. What came back was not a fourth variant. It was a **moodboard of twelve structural ideas**, all drawn against the same real data — and each one annotated with an explicit bet and an explicit weakness.

Uneven spacing by mass. Competitive branching, where sectors fight for angular space. Dieback, where what you stopped doing becomes visible as bare grey wood. Sympodial growth, where each season's tallest sector inherits the trunk. Da Vinci's rule, where a limb's cross-section equals the sum of its children. Persistent boughs. A ring/cross-section hybrid. A density field of one dot per commit. Silhouette-from-envelope. Espalier. Bark texture as the mix. A phototropic column with a conserved light budget.

Two of the twelve were labelled **DEAD END** outright. Not "needs work" — dead. The phototropic column had actually been rendered and had failed, and the note said why: losers must splay to keep the canopy opening upward, so shaded sectors run off the canvas as straight diagonals and the metaphor stops being visible at all.

But the sentence that mattered was at the top of the board, diagnosing why all three of my earlier 3D variants had failed for the same underlying reason:

> The tree was **a chart wearing bark** — geometry placed at computed coordinates instead of grown.

That is a better critique than I would have written myself. It named the failure mode precisely, and it made the next step obvious: stop decorating a chart, and make the form itself carry the data.

This is the part I want other knowledge workers to notice. I did not ask for a critique. I asked for options, and I got options *with their own post-mortems attached*. Twelve ideas priced out, including the ones that had already been tried and had already lost. **Working with AI at this level is less like commissioning an illustrator and more like running a design review where the other participant has no ego to defend.**

---

## Act Three: Rescuing the One That Survived

Sketch 09 — *silhouette from envelope* — was the survivor, and it went through four states.

First, the **raw loft**: monthly activity as a 3D surface, where the radius at any (month, direction) is that sector's commits in that month. The finding was immediately visible in the silhouette: the base is spiky and lopsided, the top is rounder. Early on I worked in bursts, in one direction at a time. Later I worked across several fields in the same month. *The shape of the object is the shape of the behaviour change.*

Second, the **glass skin**. The 19 monthly cross-sections were pulled inside the surface and drawn at their true radii, glowing. The skin between two of them is interpolation — literally a curve fit between measurements — so it was made faint. Measured data glows; inferred data whispers. The visualization now tells you which parts of itself are real.

Third, **separation tuning**. With ten sector colours and a hot bloom, everything washed to a single white blur. Three sliders — skin opacity, bloom, threshold — were traded off until the individual lobes stayed countable. The side-by-side of old versus new is the least glamorous image in the set and one of the most useful.

Fourth, **eight sectors, not ten**. Two of my ten categories are `no-code` and `low-code`, and they have never had a single event. At first that looks like a data gap. It is not. Work that avoids the developer setup never produces a commit — so a commit-derived visualization *cannot observe it by construction*. The two empty sectors were dropped from this view and the remaining eight respaced evenly, with a note in the panel explaining that the angle now means "which sector," not a compass direction.

That distinction — *missing because it did not happen* versus *missing because this instrument cannot see it* — is one I now apply to every dashboard I am shown.

---

## Act Four: One Commit, Several Skills

Here the project hit a modelling problem that has nothing to do with 3D.

A single commit rarely belongs to one category. A commit to my Flickr-to-Instagram automation is image work *and* workflow automation *and* a bit of agent code. Assigning it to one bucket throws away most of what it says about my learning.

So three attribution models were rendered **side by side, same geometry, same lighting, same camera** — only the assignment rule differing:

- **A — fractional.** Each commit is split across sectors with weights summing to 1.0. Totals stay honest; the numbers stop being integers.
- **B — whole commit per axis.** Every touched sector gets full credit. Shapes look great; the total inflates from 1,749 to 3,405 and is no longer comparable to anything else.
- **C — primary plus secondary.** Solid lobe for the main sector, ghost lobe for the secondary reach.

The weights come from each repository's GitHub topics — a real, auditable signal rather than my own retrospective guesswork. And the panel reports the quality of that signal without being asked: the derived rule reaches **59%** of commits, another 36% is hand-asserted, 5% falls back to a single label. Only 6 of 34 repositories have topics at all.

It also proposed the cheapest fix, which is not a code change: **add topics to those repositories on GitHub, and they will promote themselves into the better tier.** Improve the source, not the workaround.

I settled on **A + C merged**: fractional effort as the solid body, secondary reach as a ghost around it. The gap between solid and ghost is a picture of exactly what the old one-commit-one-category model had been discarding.

---

## Act Five: What Altitude Should a Summary Live At?

The nine sectors are the honest resolution. They are also a lot to look at. So the same measurement was rolled up to four limbs — **create, automate, distribute, build** — and shown beside the detailed version.

The rollup measurably improves balance: inequality across the categories drops by about half. But the panel again refused to sell it as a free win. Rolled up to four limbs, the month-to-month variation flattens — and that variation is precisely what carried the interesting finding about working serially versus in parallel. **Balance is gained; the story is what pays for it.**

Then came the question of what form a summary should even take. A soft, lofted envelope reads as continuous growth. Discrete boxes admit that a summary *is* an abstraction. Quarterly collars sat somewhere in between.

I went with **one box per quarter** — because a summary's natural unit is the period, not the moment. Eight boxes, one per quarter, stacked up the time axis, footprint area equal to that quarter's total effort, and wedges within each box showing what the quarter was made of.

And the panel stated the price of that choice in plain language: at quarterly resolution, the February 2025 gap **cannot be shown**. That month has no activity at all and is drawn as a real pinch everywhere else in the project — but the quarter containing it carries 47 commits, so there is no empty box to put the gap in. The pinch does not become false. It becomes *invisible*. Which is, precisely, the cost of a summary.

---

## Act Six: Making the Geometry Tell the Truth

The last stretch was unglamorous and necessary. The wedges inside each box were wrong in several ways at once: they pointed in directions that did not correspond to their member sectors, they carried a fourfold asymmetry error, they were mirrored across an axis, and each quarter's internal scaffolding was being scaled against the largest quarter instead of its own.

Every one of those bugs produced an image that looked plausible. That is the danger of 3D data visualization: a wrong picture is still a picture, and nothing about it announces the error. They were caught by deriving each wedge's arc from its member sectors and checking the correspondence explicitly.

The finished object hovers each quarter's box to answer three questions in three separate visual channels: **area** of the box is how big the quarter was, **angle** of a wedge is what the quarter was made of, and **height** of a wedge is how many commits that limb carried. The readout even warns you where the units do not subtract from each other.

---

## What I Actually Learned

Three things, and only one of them is about visualization.

**1. The failures were more valuable than the successes.** The funnel that could not be a tree, the twelve-sketch board with two dead ends, the rollup that flattens the finding, the summary that cannot show the gap. Each is a real constraint discovered by trying, not by planning. The final object is good *because* of the eleven rejected forms behind it, and I have the images to prove the path.

**2. AI is at its best as an opinionated critic, not an image generator.** The single most valuable output of the session was one sentence — *"a chart wearing bark"* — that named why three separate attempts had failed. I got that by asking for alternatives and demanding a stated bet and weakness for each, instead of asking for something prettier. A tool that only ever agrees with you cannot do this.

**3. Honest visualizations report their own limits.** Nearly every panel in the final result carries a caveat: the raw event count would overstate recent activity roughly threefold because of a workflow artifact; the missing month is never interpolated; the attribution is only 59% derived from evidence; quarterly resolution hides a real gap. None of that makes the picture weaker. It is what makes it worth trusting — and it is the standard I would now hold any dashboard to before acting on it.

---

## The Recursive Bit

There is a detail I enjoy more than I should.

This project is itself AI-assisted development. Every commit I made building the learning tree becomes a commit in the log that the learning tree visualizes. The object grows to include the making of itself. When I published this session's work, the tree got measurably taller in the pro-code direction — because of the work of making the tree.

That is not a gimmick. It is the whole argument in miniature. The way you get from *experimenting with AI* to *working with AI* is by building things with it that are real enough to leave evidence. The evidence is the learning. Everything else is a claim.

I am nowhere near done. But it is now a thing you can look at — and that is the entire point.

**[Walk through the live tree →](https://webmemo-code.github.io/ai-learning-tree/)** Press *Replay journey* and watch two years of learning grow from seed in thirty seconds. The shape you see is not designed. It is what my actual working history looks like when you give it a form that refuses to flatter it.

---

*The AI Learning Tree grows from real, verifiable artifacts: commits, notes, and declared milestones — never from self-assessment. The long-term goal is a public repository anyone with a GitHub account can connect to grow their own tree. If you want to be told when that ships, [get in touch](https://webmemo.ch/kontakt/).*
