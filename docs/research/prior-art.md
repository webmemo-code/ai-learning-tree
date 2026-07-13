# Prior art & sources

*Annotated research base for the concept (gathered 2026-07-13). Each entry notes
what we take and what we deliberately do differently.*

## The vertical axis

### Section — The AI Proficiency Report
<https://www.sectionai.com/ai/the-ai-proficiency-report>
Survey of 5,026 US knowledge workers; defines the four proficiency levels we map to
strata: **Novice** ("does not have the skills and knowledge needed to get value out
of AI", ~20.9%), **Experimenter** ("uses AI frequently, but for one-off tasks — no
repeatable workflows yet", ~73.5%), **Practitioner** ("AI is embedded into how they
work — into repeatable workflows"), **Expert** ("builds AI workflows for themselves
and others — automation, agents, new use cases") — Practitioner + Expert together
only ~5.5%. They measure five dimensions (knowledge, usage, skill, attitudes, org
readiness). **We take:** the four level names + definitions as the canonical strata.
**We add:** the forest-stratification mapping (floor / understory / canopy /
emergent layer) — real forests happen to have exactly four layers.

## Botanical & procedural visualization

### Kleiberg, van de Wetering, van Wijk — *Botanical Visualization of Huge Hierarchies* (IEEE InfoVis 2001)
<https://vanwijk.win.tue.nl/botatree.pdf>
The classic: renders directory trees as botanical trees using **Holton's strand
model** — every leaf pulls a strand down to the root, so branch thickness = subtree
size; leaf clusters render as "fruit" for scale. **We take:** the strand/pipe-model
thickness rule (da Vinci's rule) and cluster-leaves-at-distance LOD. **We differ:**
their input is a static hierarchy; ours is a time-ordered event log — growth and
replay are first-class.

### Runions, Lane, Prusinkiewicz — *Modeling Trees with a Space Colonization Algorithm* (2007)
<http://algorithmicbotany.org/papers/colonization.egwnp2007.pdf> · impl. refs:
<https://github.com/dsforza96/tree-gen>, <https://ciphrd.com/articles/generating-a-3d-growing-tree-using-a-space-colonization-algorithm/>
Branches grow by competing for attractor points scattered in space; breaks
L-system symmetry, yields organic forms. **We take:** the generator core — but our
attractors are *spawned by growth events* inside sector wedges under stratum
ceilings, which is the whole trick of this project (work opens space; branches
colonize it).

### Prusinkiewicz & Lindenmayer — *The Algorithmic Beauty of Plants*
<http://algorithmicbotany.org/papers/abop/abop.pdf>
The L-systems bible. **We take:** vocabulary and the scaffold idea (a designed
grammar for trunk/limb skeleton); space colonization handles the organic rest.

## Activity → visualization

### Gource — software version control visualization
<https://gource.io/> · <https://github.com/acaudwell/Gource>
Animated repo history: directories as branches, files as leaves, contributors as
fireflies swarming what they touch. The emotional proof that watching history *grow*
moves people. **We take:** the replay-as-spectacle instinct and the firefly idea.
**We differ:** Gource is per-repo and ephemeral (a video); our tree is per-person,
persistent, and claims *meaning* on its axes (proficiency, fields).

### GitHub Skyline (CLI extension)
<https://github.com/github/gh-skyline> · <https://github.blog/changelog/2024-12-09-github-skyline-cli-extension/>
Contribution graph as a 3D-printable city skyline. Proof that people *love* physical
/ visual artifacts of their commit history and share them. **We take:** the
share-your-history impulse (and maybe, one day: 3D-print your tree 🌳🖨️).
**We differ:** skyline encodes volume only; the tree encodes fields + proficiency +
privacy-layered sources.

### Obsidian graph view & the digital-garden movement
Obsidian's built-in graph shows note connectivity; Maggie Appleton's
[A Brief History & Ethos of the Digital Garden](https://maggieappleton.com/garden-history)
frames public knowledge as something *tended* over time, growing from seedling notes
to evergreen essays. **We take:** the tending ethos, "evergreen" as a maturity
color, and the legitimacy of gardening metaphors for knowledge work. **We differ:**
digital gardens publish content; our tree publishes only *shape* — evidence of
growth, not the notes themselves.

### Vinzent03/obsidian-git
<https://github.com/Vinzent03/obsidian-git>
Mature community plugin: automatic commit-and-sync of a vault to git. **We take:**
the architectural shortcut — a git-synced vault makes Obsidian ingestion identical
to GitHub ingestion (one harvester, two sources), with metadata-only emission for
privacy.

## Skill-tree ancestry (games)

Games have trained an entire generation to read "tree = progression" (talent trees,
tech trees). **We take:** the instant legibility of branch-as-specialization.
**We invert the causality:** game skill trees are *menus of the possible* that you
unlock top-down; this tree is *evidence of the actual* growing bottom-up. Nothing
here is pre-drawn — you can't see branches you haven't grown. That inversion is the
project's soul and should be stated in the public README when the repo opens up.

## Sibling project

### webmemo-code/ai-periodic-cube
Internal reuse inventory (2026-07-13) identified the liftable modules: bloom
composer, instanced glowing tubes, LOD system, sprite labels, audio manager, camera
keyframe tours + authoring helper, dim-not-hide filtering. Details in
[02-visual-language.md](../02-visual-language.md) §2.
