# Ground marks: five failed fixes, and the actual analysis

Written after Walter stopped the fifth patch attempt on `multi-axis.html`:

> *"Plan this properly… It's worse than before: Now 'A+C' also got the second stray arc.
> Remove them on both ground items. Also the stray '2024Q4 (1 mo)' is still there, after
> 5 rounds of fixing!"*

This file exists so the diagnosis survives a session boundary. **Read it before touching
any ground-mark code.**

## The symptom

Faint coloured arcs and tick rings sit on the floor, detached from the object they
belong to, plus a `2024Q4 (1 mo)` label that reads as floor decoration rather than as
the smallest quarter's caption.

## Why five fixes failed — the meta-lesson

Each round I found *a* real defect, fixed it, and shipped. Each was a genuine bug. None
was **the** bug, because I never enumerated the whole system before editing.

| # | What I fixed | Was it real? | Why it didn't work |
|---|---|---|---|
| 1 | "2024Q4 collapses to `minSpan`" | **No — false.** Its span is 1.196, not 0.95 | Fixed nothing; the premise was wrong |
| 2 | `QY(0)=0` put the box on the ground plane; lifted the stack | Yes | Addressed *height*, but the strays were a *radius* problem |
| 3 | Per-quarter scaffolding sized from the biggest quarter (§QSCAFF) | Yes | Fixed families 3–4 (per-quarter), strays were families 1–2 (global) |
| 4 | Wedges mirrored by `rotateX(-π/2)` | Yes, and severe | Real bug, unrelated to the floor |
| 5 | Unified marks into `groundMarks()`; missed that the lift stranded them at `y≈0` | Partly | Introduced a **regression**: A+C now gets a second arc |

**The pattern: I was fixing at whatever layer I happened to be looking at.** Per-quarter
when the fault was global; height when the fault was radius; geometry when the fault was
a call site. A fix that lands at the wrong layer leaves a residue that looks identical to
the original symptom, which is why it read as "the same bug persisting" five times.

**Second-order cause:** my verification tool was blind to the thing being verified.
`__floor()` walked **meshes only**. Every stray here is a `THREE.Line`. So four rounds of
measurement came back clean while Walter's screenshots plainly showed arcs. *A probe that
cannot see the failure mode will always report success.*

**Third-order cause:** in round 4 the probe compared `QUAD_ARC` against `QUADS` — **both
inputs to** `wedgeGeometry()`. The mirror was applied downstream of everything it
inspected. It read 0° error while the wedges were 160° out. *A probe reading its own
inputs cannot catch a transform applied after them.*

## The actual current bug (round 5's regression)

`groundMarks()` is now a single owner, which was correct. But it has **three call sites**
and they do not agree:

| line | body | radius passed | correct? |
|---|---|---|---|
| 2158 | `buildEnvelope` (A+C, 9-sector) | **`MAX_R`** | **NO — bypasses `bodyOuterR()`** |
| 3427 | `buildQuarterOneBox` (1 box/qtr) | `bodyOuterR(ud)` + explicit y/spoke opts | yes |
| 3680 | `buildQuarterBoxes` (collars) | `bodyOuterR({boxes:true})` | yes |

Line 2158 passes the global `MAX_R` and **omits the `opts` object entirely**, so it gets
default y and default radii. That is why A+C regressed: it is the one body still using
the pre-unification path. The unification was done at two of three call sites.

## The `2024Q4 (1 mo)` label

Separate from the arcs, and never actually addressed. It is drawn by the **ladder-label**
loop, not by `groundMarks()`, so every ground-mark fix missed it by construction.

Compounding: 2024Q4 is **3 commits, all in `build`** — three of its four wedges are
measured zeros drawn as 0.055 wafers. There is almost no box for the label to attach to,
so it reads as floating text regardless of where it is placed.

## The rule this system needs

> **One function owns every mark below the body. It is called exactly once per body, with
> that body's own outer radius and its own base height. No call site passes a global
> constant. No mark is drawn outside it.**

Anything that violates this will re-create the bug. Verify with a probe that walks
**`Line` and `LineSegments` as well as `Mesh` and `Sprite`**, and that measures the
**drawn scene graph**, never the inputs that fed it.

## Checklist for the next attempt

1. Enumerate every object with `y < body_base + ε`, by type, with radius. Meshes, lines,
   sprites. Print the table *before* changing anything.
2. Make all three call sites identical in shape.
3. Delete rather than re-scale: Walter has asked twice for the arcs to be **removed** on
   both ground items, not shrunk.
4. Anchor the quarter label to its box, so it cannot float when the box is tiny.
5. Re-run the enumeration. Diff the two tables. That diff is the evidence.

---

# Round 6 — what was actually found, and what was done

The checklist above was followed in order. Step 1 is what made the difference: the
before-table falsified part of the diagnosis this file was written with.

## What the before-table showed that the analysis had missed

`window.__marks()` was run against the drawn scene graph on both bodies before any edit:

| body | mark | kind | r | y |
|---|---|---|---|---|
| **A+C** (`outerR` 4.2) | bearing spokes ×9 | line | 0.30 – **4.90** | 0.010 |
| **A+C** | **correspondence guides** | lineseg | **4.54 – 4.99** | **0.005** |
| **A+C** | axisLabel ×9 | sprite | 5.88 | 0.120 |
| **Q one-box** (`outerR` 1.99) | *(nothing but the core)* | — | — | — |

The A+C row is the regression exactly as diagnosed: a 474-vertex arc ring at r≈4.5–5.0
lying on the floor at y=0.005, sized from `MAX_R` because call site 2158 passed the
global constant and no `opts`.

**But the Q one-box body came back nearly empty, and that was a lie.** `__marks()` took a
single `yMax` for every body, defaulting to 0.5, while the one-box stack's base is
`bodyMarkY() = QY(0) = 0.57`. Every mark on the body under investigation sat *above* the
cutoff. The probe reported the stack's floor as clean while its spokes, its tick ring and
the `2024Q4 (1 mo)` sprite were all sitting there unexamined.

Worse, the scene-level sprite sweep filtered on `o.userData.axisLabel`, and the ladder
labels carry no `axisLabel`. **So the "2024Q4 (1 mo)" sprite — the object Walter had named
five times — could not appear in the probe's output by construction.**

This is the *third* instance of the same failure the file already records twice: first a
mesh-only probe, then a probe reading its own inputs, now a probe with a global cutoff and
a filter that excluded its subject. The pattern is not "the probe was incomplete", it is
**the probe kept inheriting the same wrong assumption as the code it was checking** — one
global number where the system has one per body. Fixing `groundMarks()` to take a body and
leaving `__marks()` taking a global `yMax` would have shipped a half-fix with a clean
report attached.

## What was changed

**1. The arcs are deleted from both bodies (§GMARK-D).** Both branches of `groundMarks()`
are gone, along with the `arc()` and `radial()` helpers and the empty `LineSegments` they
fed. Not defaulted off behind `?guides=1` — a flag for a graphic asked to be removed twice
is a way of keeping it. `?guides=0` and the Guides button now gate the **bearing spokes**,
which is the only ground mark left and the one that was always doing the correspondence
work; the flag keeps a referent instead of becoming a no-op.

The reasoning that had been missed for five rounds: **a mark drawn flat on the floor reads
as floor decoration at any radius.** It has no vertical relationship to the solid above it,
so the eye files it with the grid rather than with the object. Rounds A–C each sized the
arcs more correctly and each produced correctly-sized floor decoration. Sizing was never
the axis the problem lived on.

**2. `groundMarks()` no longer takes a radius (§GMARK-E).** The signature went from
`(axes, outerR, opts)` to `(axes, ud, opts)` — the body's own `userData`. It derives the
radius via `bodyOuterR(ud)` and the height via `bodyMarkY(ud)` itself, and `opts` now
carries look only (`spokeAlpha`). **There is no geometry parameter left for a call site to
get wrong.** All three calls are now `groundMarks(AXES, grp.userData)` and differ only in
the axes array. Each builder also had its `grp.userData = {...}` assignment moved *above*
the call, so `groundMarks` reads the same object the probe later reads.

`gmarkRadii()` was cut from five radii to two (`spoke`, `label`); the arc/tick radii were
deleted rather than left dangling, because a stale `arc: R + 0.79` is how a removed mark
comes back. The spoke now ends **at** the body's edge rather than 0.70 past it — that
overhang existed to reach the guide ring, and without the ring it was just a bearing ray
outrunning its object.

**3. The ladder label is anchored by measurement (§QLABEL-ANCHOR).** The builder now
records `qExtent[qi]` — the largest radius each quarter's own wedges, wafers and halo
*actually reach*, read off their position attributes — and the label is placed from that
plus a fixed 0.42 gap, with a **leader line** drawn from the box's measured edge to the
text. Previous rounds placed it from `qoneTickR(qi) + 0.55`, a formula for what the box is
*supposed* to reach; on 2024Q4 (3 commits, three limbs drawn as 0.055 wafers) the gap
between predicted and drawn is the float the eye was reading.

Measured alone was not enough — 2024Q4's box is genuinely tiny, so a correctly-placed
caption still has almost nothing beside it. The leader is what makes the association drawn
rather than inferred, and it is what makes the honesty rule affordable: the quarter keeps
its real size, keeps its `(1 mo)` mark, and cannot be read as furniture.

A trap worth recording: `grp.userData.qExtent = ...` was written *before* the builder's
`grp.userData = {...}` literal, which silently wiped it, and the label fell back to the
very formula the section exists to replace — with no error and no visible symptom except
a leader starting at 1.99 instead of 1.91. It was caught only because the after-table
reported the leader's drawn start. **Same class as the A+C call site: correct code
defeated by an assignment order nobody re-read.**

**4. `__marks()` was fixed to be able to see the failure (§MARKS-BASE).** The cutoff is
now each body's own `bodyMarkY()` plus a margin, and the scene-level sweep takes every
sprite and line in the body's column, naming them by `userData.text`. And `__probe()`'s
`scaffold.labelX` no longer recomputes `qoneTickR(i) + 0.55` — it reports the builder's
measured extent, so the probe cannot agree with itself while the label drifts.

## The after-table

Same probe, same bodies, after the change:

| body | mark | kind | r | y |
|---|---|---|---|---|
| **A+C** (`outerR` 4.2, base 0.005) | bearing spokes ×9 | line | 0.30 – **4.20** | 0.010 |
| **A+C** | axisLabel ×9 | sprite | 5.88 | 0.120 |
| **Q one-box** (`outerR` 1.99, base 0.57) | wedges/wafers 2024Q4 ×4 | mesh | 0.16 – 1.80 | 0.597 – 0.795 |
| **Q one-box** | ghost halo | mesh | 1.32 – 1.91 | 0.720 – 1.020 |
| **Q one-box** | tick ring | lineseg | 1.99 | 0.570 |
| **Q one-box** | bearing spokes ×4 | line | 0.30 – **1.99** | 0.575 |
| **Q one-box** | **ladder leader 2024Q4** | line | **1.91 – 2.33** | 0.570 |
| **Q one-box** | **label "2024Q4 (1 mo)"** | sprite | 2.33 → | 0.570 |

**The diff: the `correspondence guides` row is gone from every body in every `?qstyle=`,
and two new rows appear that name their own quarter.**

## Verified

- 0 arc objects below either body, in `boxes`, `collars`, `envelope`, `evidence=1`,
  `seed=42`, `model=A`, `guides=0`. 0 console errors on all of them.
- `__align()` worst case **0.06°** (label vs wedge, and wedge vs bearing) on the one-box
  body; 0.00° on collars and envelope. Well under 1°.
- Quarterly commits `[3, 47, 85, 124, 368, 255, 477, 390]`, sum **1749**.
- §QZFIGHT: `interpenetratingPairs` 0, `worstOverlap` 0, `coplanarTops` 0, `bevelOk` true.
- `areaErr` 1.11e-16. `hoverPicks` 32; hover on 2024Q4/build and 2026Q2/create both
  populate the readout and light 2 table cells.
- All eight ladder leaders are exactly 0.42 long from their quarter's own measured edge,
  and `__probe().qbox.oneBox.scaffold.labelX` matches the drawn leader ends to 3 decimals.

## The rule, restated after round 6

> **One function owns every mark below a body. It takes the BODY, never a radius and never
> a height, so no call site can supply a wrong one. And every probe that checks it is
> parameterised per body too — a probe carrying a global where the system has a per-body
> value will report the one body that matters as clean.**

---

# Round 7 — the deletion was an over-correction; the arcs are back

Walter, on seeing round 6:

> *"Okay, the fix worked. But you lost the original arcs that were actually genuinely
> helpful: Both models showed the same arcs but on different scales. Please re-introduce
> those."*

## What round 6 got right, and the inference it got wrong

Round 6's observation was correct and is worth keeping: **a mark drawn flat on the floor
under a body reads as floor decoration at any radius**, because nothing connects it
vertically to the solid above it. Five rounds of re-sizing produced five well-sized pieces
of floor decoration, and that is why sizing never fixed the symptom.

The inference drawn from it was wrong. "An arc on the FLOOR under a lifted body is
decoration" was generalised to "an arc is decoration", and the whole family was deleted —
the useful part with the stray part. That is the same class of error the file already
records four times, just in the other direction: **acting at the wrong layer.** The
previous five rounds fixed height when the fault was radius, or per-quarter when the fault
was global. Round 6 fixed *existence* when the fault was *placement*.

The complaint was never "there are arcs". It was, twice, "there are DOUBLE entries" and
"the second stray arc". Three concrete defects, and only three:

| # | defect | round 7 |
|---|---|---|
| 1 | drawn at `y ≈ 0.005` while the one-box body is lifted to `QY(0) = 0.57` | now `bodyMarkY(ud)` — 0.57 on that body |
| 2 | sized from the global `MAX_R` (4.2) on a body of radius 1.99 | now `gmarkRadii(bodyOuterR(ud))`, no global reachable |
| 3 | a per-limb CENTRE tick duplicating the bearing spoke at that same bearing | **stays deleted** |

## What the arcs carry, stated so it is not deleted again

One arc per limb, spanning that limb's `QUAD_ARC`, drawn on BOTH bodies at each body's own
radius, with the two END ticks that mark where one limb hands over to the next:

| limb | arc span | member sectors | A+C radius | Q one-box radius |
|---|---|---|---|---|
| create | 160° | 4 | 4.99 | 2.43 |
| automate | 80° | 2 | 4.99 | 2.43 |
| distribute | 80° | 2 | 4.99 | 2.43 |
| build | 40° | 1 | 4.99 | 2.43 |

**Same four angles, two scales.** That is the visual proof of the page's central claim —
these two objects are the same measurement at two altitudes. The bearing spokes do not
carry it: a spoke is a *bearing*, a single direction. The arc is the *span*, the width a
limb owns, and width is the quantity that differs between limbs and does NOT differ
between bodies. Deleting the arcs removed the evidence for the thing the page exists to
show. On the nine-sector body the per-sector inward ticks add the rollup: each sector ticks
inward under its parent limb's arc, so "these four sectors are that one wedge" is drawn.

## The radius rule, sharpened (§GMARK-F)

`gmarkRadii(R)` is back to five radii, but every one is `R + c·k` where `k =
clamp(R / MAX_R, 0.55, 1)`. The offsets **scale with the body**. A flat `R + 0.79` is a 19%
standoff around the 4.2 envelope and a 40% standoff around the 1.99 box stack — correct by
the letter of the per-body rule and still visibly not hugging. `MAX_R` appears in `k` as a
reference scale only; it can no longer set a mark's position, because it is only ever a
denominator of the body's own radius.

## The flag

`?guides=` gates the ARCS again, which is its natural referent — they are the
correspondence argument, the drawn claim you can switch off to see the bodies bare. Round 6
had repointed it at the bearing spokes only because the arcs no longer existed. **The
spokes are now always on**: they are the body's own axes, and the axis labels sit at the
end of them, so hiding them would leave nine captions floating at bearings nothing marks.
Default ON for both.

## Verification — measured on the DRAWN graph, per body

Two independent walks were run, deliberately not sharing code: the page's own
`window.__marks()`, and an external walker that takes each body's base from **measured mesh
geometry** rather than from `bodyMarkY()`, so it cannot inherit the code's assumption about
where a body stands. They agree on every row. Both walk `Line`, `LineSegments`, `Points`,
`Mesh` and `Sprite`.

### A+C, nine-sector envelope — `outerR` 4.2, base 0.005

| mark | kind | r | y |
|---|---|---|---|
| bearing spokes ×9 | line | 0.30 – 4.20 | 0.010 |
| **limb arcs + sector ticks** | **lineseg** | **4.54 – 4.99** | **0.005** |
| axisLabel ×9 | sprite | 5.88 | 0.120 |

### Q one-box stack — `outerR` 1.99, base **0.570**

| mark | kind | r | y |
|---|---|---|---|
| wedges/wafers 2024Q4 ×4 | mesh | 0.16 – 1.80 | 0.597 – 0.795 |
| tick ring | lineseg | 1.99 | 0.570 |
| bearing spokes ×4 | line | 0.30 – 1.99 | 0.575 |
| ladder leader 2024Q4 | line | 1.91 – 2.33 | 0.570 |
| **limb arcs** | **lineseg** | **2.28 – 2.42** | **0.570** |
| label "2024Q4 (1 mo)" | sprite | 3.20 | 0.570 |

**The row that matters is the last arc row: `y = 0.570`, not `0.005`.** The arcs are up
with the boxes. The specific regression that cost five rounds — a coloured ring on the
floor under a floating object — cannot be present, because the only y this code can produce
is `bodyMarkY(ud)`.

Across `boxes` / `collars` / `envelope` / `guides=0` / `evidence=1&seed=42` / `model=A`, on
every body: arc `y` equals that body's own base to within 0.01, and no body whose base is
above 0.1 has any mark at ~0.005. Arc spans measured off the drawn `LineSegments` by
colour bucket: **160 / 80 / 80 / 40 on every body in every mode.**

## Other invariants, re-checked

- `__align()` worst **0.06°** (build, label-vs-wedge and wedge-vs-bearing); 0.00° on
  collars and envelope. Under 1°.
- Quarterly commits `[3, 47, 85, 124, 368, 255, 477, 390]`, sum **1749**.
- §QZFIGHT `interpenetratingPairs` 0, `worstOverlap` 0, `coplanarTops` 0, `bevelOk` true.
- `areaErr` 1.11e-16. `sectorSum` 360, `arcTiles` true, `arcSeams` all 0,
  `maxArcCentreOffset` 0, `hoverPicks` 32.
- 0 console errors in all six URL variants and all twelve screenshot runs.

## The rule, after round 7

> **A mark belongs to a body in TWO dimensions, and both come from the body: its radius
> from `bodyOuterR`, its height from `bodyMarkY`. Getting one right and the other wrong
> produces a mark that is correctly sized and still reads as furniture — which is what
> made five rounds look like one persistent bug.**
>
> **And: when a report names a specific defect ("double entries", "the second stray arc"),
> fix that defect. Deleting the family it belongs to is a fix at the wrong layer in the
> other direction, and it costs the thing the family was doing.**
