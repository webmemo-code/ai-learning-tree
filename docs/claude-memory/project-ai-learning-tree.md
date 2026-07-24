---
name: project-ai-learning-tree
description: "AI Learning Tree — pipeline built & running; 10-sector taxonomy live (create.3d added 2026-07-15)"
metadata:
  type: project
---

ai-learning-tree (github.com/webmemo-code/ai-learning-tree, PUBLIC now, MIT) visualizes Walter's AI learning journey as a growing 3D tree; anyone can hook up their GitHub + optional Obsidian. Origin brain dump: issue #1.

On 2026-07-13 a "wild and free" ideation session produced the phase-1 (Seed) docs. Since then the pipeline is BUILT and RUNNING: generator/ (deterministic grow() over an append-only growth-log → tree.json, taxonomy.mjs is the sector source-of-truth), harvester/ (nightly GitHub harvest, workflow_dispatch-runnable; classify() maps repo→sector via tree.config.yml), grove/ (multi-tree community layer), prototypes/mood-sketch (the renderer, reads ../../data/tree.json — MUST be served from the REPO ROOT: `python -m http.server 8123` then visit /prototypes/mood-sketch/, NOT from inside the sketch dir or `../` escapes the served tree).

Taxonomy is now **10 sectors in 4 limbs** (CREATE copy·images·video·**3d** / AUTOMATE workflows / DISTRIBUTE seo·geo / BUILD no-·low-·pro-code). create.3d added & wired through 2026-07-15 (PRs #16 sector+config+.gitattributes, #17 docs 9→10, #18 reclassify stale log rows). Vertical = Section AI's 4 levels (Novice/Experimenter/Practitioner/Expert) → forest strata (floor/understory/canopy/emergent).

**Contribution meadow** (2026-07-20, issue #34, PRs #35-38, ADR-0010): GitHub's calendar radialized onto the ground — weekly per-sector buckets in tree.json (`contribution` array, github-source only), rendered as glowing blades (height = week's commit count, rim-recent rings, sector hue, moonlit-desaturated by private share). KEY PRIVACY MODEL: Walter works 82% in private repos and WANTS that visible as aggregate intensity ({count, weight} only, never ids) — `privacy.contributions: combined` in his config, vault stays roots-only. Sector Walk camera: opposite-side azimuth, height DYNAMIC `12 + 3.5 × bounds.max[1]` (scales with growth). Ground click = sector select only (time scrubbing is the slider's job — Walter removed the ground scrubber after testing). entity-map remapped seo→geo (323 rows, GEO now Experimenter with own milestone).

**Gotchas:** (1) tree.config.yml has a fragile hand-rolled YAML parser (serialize.mjs) — a comment after a value breaks on CRLF; `.gitattributes` now forces LF, keep it. Walter's git is core.autocrlf=true so fresh checkouts smudge to CRLF on disk — tests/build need LF. (2) Harvester is append-only keyed by commit id: re-mapping a repo does NOT re-classify already-logged rows; they keep their frozen sector until new commits land (or a manual reclassify — see PR #18's one-off approach: reuse classify()+jline() from harvest.mjs verbatim so unchanged rows stay byte-identical).

ADRs 0001-0007 all committed (0001 one-tree-per-person; 0002 roots=private/Obsidian; 0003 local-vs-cloud=leaf attribute not a sector; 0004 milestones gate strata; 0005 roots privacy modes; 0006 grove planting log; 0007 grove phyllotaxis).

Reuse from sibling [[project-ai-periodic-cube]]: bloomComposer.ts, lodSystem.ts, tubeEdges.ts (instanced tubes = branches), spriteFactory.ts, audioManager.ts, camera keyframe tours + CameraAnimHelper, dim-not-hide filter pattern.

