# Discovery session — finding a 3D form for the growth log

Screenshots from the form-search session of **31 July – 1 August 2026**, selected from
~300 working shots in the session scratchpad. Every image below is a *state of the idea*,
not a detail check. Detail/regression shots (error panels, single-wedge close-ups,
before/after crops of one quarter) were left behind.

The whole search runs on one real dataset: `data/growth-log.json`, 1,749 commits /
2,909 events across 19–20 monthly buckets, Dec '24 → Jul '26. Three facts every sketch
had to keep honest: 2025-02 is missing from the log entirely (a real gap, drawn as a gap),
2025-05 has exactly one commit, and `build.no-code` / `build.low-code` have never had a
single event.

Prototypes live in [prototypes/time-axis-board/](../../../prototypes/time-axis-board/).

---

## Act 1 — Three variants, chosen by eye

| | |
|---|---|
| **01** [variant A · banded ribs](01-variant-A-banded-ribs.png) | Ten ribs, one per sector, banded by quarter. Height = when, azimuth = sector, thickness = commits. Reads as a fountain, not a trunk. |
| **02** [variant B · trunk rings](02-variant-B-trunk-rings.png) | One band per quarter, oldest at the roots; band radius = commits, stripes = the commit/PR/review/issue mix. The crown above is *now*. |
| **03** [trunk rings · cross-section](03-trunk-rings-cross-section.png) | The same wood seen end-on — rings you can literally count, the mix as concentric stripes. |
| **04** [trunk rings refined — and the funnel problem](04-trunk-rings-refined-the-funnel-problem.png) | The honest version of variant B. Because activity genuinely peaks *now*, radius-from-commits makes a funnel: fat at the top, thin at the base. On this dataset "radius = commits" and "looks like a tree" are incompatible. |

## Act 2 — "None is wow": twelve form directions

| | |
|---|---|
| **05** [form moodboard](05-moodboard-twelve-form-directions.png) | The pivotal image. Twelve structural ideas against the same real data, each with an explicit **BET** and **WEAK** verdict written under it — uneven spacing by mass, competitive branching, dieback, sympodial growth, Da Vinci's rule, persistent boughs, ring/cross-section hybrid, density field, silhouette-from-envelope, espalier, bark texture, phototropic column. Two are marked **DEAD END** outright. The three earlier 3D variants failed for one shared reason, stated at the top: the tree was *a chart wearing bark* — geometry placed at computed coordinates instead of grown. Sketch 09 is what gets rescued. |

## Act 3 — The radial envelope

| | |
|---|---|
| **06** [first loft](06-radial-envelope-first-loft.png) | Sketch 09 in 3D: monthly activity as a lofted surface. Radius at (month, bearing) = that sector's commits that month; the skin carries the mix, never size. The finding is already visible in the silhouette — base spiky and lopsided, top rounder. |
| **07** [glass skin + interior rosettes](07-envelope-glass-skin-and-rosettes.png) | The measurement moves inside. The 19 cross-sections are drawn at their *true* radii and glow; the skin between two rosettes is Catmull-Rom inference, so it becomes the faint thing. Honest about which parts are data and which are interpolation. |
| **08** [separation tuning, old vs new](08-separation-tuning-old-vs-new.png) | Skin alpha / bloom / threshold as a three-way trade. Left the old hot look where ten sector hues wash to a single white; right the tuned one where lobes stay countable. |
| **09** [envelope, settled](09-envelope-final-eight-sectors-respaced.png) | Eight sectors, not ten: work that avoids the dev setup never produces a commit, so a commit-derived view cannot observe `no-code`/`low-code` at all. Bearings respaced to an even octagon — azimuth means "which sector", not a compass direction. |

## Act 4 — Attribution: one commit, several sectors

| | |
|---|---|
| **10** [three attribution models side by side](10-multi-axis-three-attribution-models.png) | Same log, same geometry, same camera — only the assignment rule differs. **A** fractional weights summing to 1.0, **B** whole commit per axis, **C** primary + secondary as a ghost. Weights derive from each repo's GitHub topics, and the panel reports that honestly: the derived rule reaches only 59% of commits, the rest is hand-asserted. A new `agents` sector appears. |
| **11** [the chosen model, plus the rollup](11-chosen-model-AC-merged-plus-quadrant-rollup.png) | **A + C merged**: fractional effort as the solid, secondary reach as the ghost — the gap is what the old single-sector model was throwing away. Beside it the same measurement at a coarser altitude: nine sectors rolled up to four limbs (create / automate / distribute / build). Gini 0.375 → 0.179. |
| **12** [rollup body — boxes vs envelope](12-rollup-body-boxes-vs-envelope.png) | What form should a *summary* take? A soft lofted envelope reads as continuous growth; discrete boxes admit that a rollup is an abstraction. |
| **13** [quarterly collars](13-quarterly-collars-variant.png) | Intermediate: one radiating box per quarter × limb, tied to the stem, reach = that limb's effort. |
| **14** [one box per quarter](14-one-box-per-quarter-the-summary-unit.png) | The resolution decision. A summary's unit is the *period*: eight boxes, one per quarter, footprint area = the quarter's attributed effort. The panel states the price — at this altitude the 2025-02 gap **cannot be shown**, because a non-empty quarter has no empty box to put it in. |

## Act 5 — Getting the wedges honest

| | |
|---|---|
| **15** [corrected sector→limb correspondence](15-wedges-corrected-sector-to-limb-correspondence.png) | Wedge arcs derive from their member sectors, so a limb's wedge points where its sectors actually are. Fixed a pointing bug and a 4× asymmetry; the mirror-across-x and per-quarter scaling fixes follow. |
| **16** [hover — three questions, three channels](16-hover-three-questions-three-channels.png) | Area of the box = how big the quarter was; angle/area of a wedge = what it was made of; height of a wedge = how many commits that limb had. The readout also warns where units don't subtract. |
| **17** [the finished object](17-final-whole-stack.png) | Eight quarters stacked bottom→top on the time axis, wedges scaled to their own quarter. |
| **18** [the same, with guide rings](18-final-stack-with-guide-rings.png) | Ground-plane and per-quarter scaffolding showing the limb bearings the boxes sit against. |

---

### Notes for the write-up

- The arc is: **three variants → all three fail the same way → a moodboard that names the failure → rescue one sketch → make it honest → add attribution → decide the summary's altitude → fix the geometry.**
- Images 04 and 05 are the turning points. 04 is the failure stated in geometry; 05 is the failure stated in words, with twelve alternatives priced out.
- Nearly every panel in these shots carries its own caveats — the ~3× workflow-artifact overstatement, the never-interpolated gap, the 59%-derived attribution, the cost of quarterly resolution. That self-reporting is itself a story beat.
