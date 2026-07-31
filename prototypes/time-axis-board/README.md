# Time-axis concept board

Three direction-finding sketches for the **vertical axis pivot**: height stops
meaning *proficiency* and starts meaning *time*, cut into quarters.

Same pattern as [acacia-look/](../acacia-look/) — variants you choose between by
**looking**, not by reading. Walter's steer when this board was commissioned:

> *"that's hard to predict based on prose. Let's visualize 3 different prototypes"*

which is the same judgement that killed the previous direction: the tiered-pagoda
preview was argued for in prose, looked at once, and rejected in four words —
*"the visual difference is minimal."*

## Running

All three fetch `data/growth-log.jsonl`, so serve from the **repo root**:

```bash
python -m http.server 8123        # from the repo root
```

| Variant | URL | The bet |
| --- | --- | --- |
| **Quarterly whorls** | [/prototypes/time-axis-board/whorls.html](http://localhost:8123/prototypes/time-axis-board/whorls.html) | One trunk, branches radiating at each quarter's height. Conifer/monkey-puzzle habit. Most legibly chronological. |
| **Banded ribs** | [/prototypes/time-axis-board/banded-ribs.html](http://localhost:8123/prototypes/time-axis-board/banded-ribs.html) | Keep the 10-rib sector compass, band each rib by quarter. Preserves the most of today's acacia. |
| **Trunk rings + crown** | [/prototypes/time-axis-board/trunk-rings.html](http://localhost:8123/prototypes/time-axis-board/trunk-rings.html) | Trunk = the archive (growth rings), crown = the present. History in the wood, now in the foliage. |

Each variant states its own honest weakness in a comment at the top of its file.
Those weaknesses are the point — the board exists to find out which one survives
contact with the real data.

## What is already settled (do not re-litigate per variant)

**Vertical = time, cut as QUARTERS.** Not years: there are only three of them and
one holds four events, and annual buckets smear away the transition below.
Eight quarters is enough to render and enough to show the shape.

**Thickness = COMMITS ONLY.** A PR's own commits are also in the log, so raw
event counts would overstate 2026 by roughly 3× — an artifact of *how* Walter
works now, not of *how much*. Volume rides on commits; the mix rides on
composition.

**Mix = stacked ring composition.** Each quarter band divides into proportional
sub-layers by kind (commit / pr / review / issue).

## The data these render

The maturity signal this board exists to show is a **phase change, not a drift**:

```
QTR     commit   pr  rev  iss | collab%
2024Q4       3    1    0    0 |    25%
2025Q1      47    0    0    0 |     0%
2025Q2      85    0    0    0 |     0%
2025Q3     124    4    0   24 |    18%
2025Q4     368    0    0   32 |     8%
2026Q1     255    2    0   26 |    10%
2026Q2     477  196  304   93 |    55%   <- the jump
2026Q3     390  188  194   91 |    55%
```

Reviews go `0 → 0 → 498`: PR review is a practice that did not exist in this
history before 2026. **2025Q1 and 2025Q2 having zero collaboration is not a gap
in the data — it is the finding.** No variant may smooth it away.

## Why this board exists at all

Height used to be gated by hand-authored milestones ([ADR-0004](../../docs/decisions/0004-milestones-gate-strata.md),
which sat at *"Proposed — awaiting Walter's call"* for its entire life and was
never accepted). All five milestones were authored in a single week — the week
the feature shipped — while the commits they certify span nineteen months. The
dates record when the tooling existed, not when the skill arrived.

Walter's call:

> *"there is no hard threshold by which we can tell the new level was reached.
> Maybe we should let go of that idea."*

So competence leaves the vertical axis and returns as **behaviour**: the
commit/PR/review/issue mix, which cannot be faked by editing a YAML file.

## Consequences to face when one wins

- [ADR-0008](../../docs/decisions/0008-acacia-silhouette.md) (the acacia) is
  largely undone by two of the three variants — the flat earned-ceiling top has
  nothing left to mean once height is time.
- [ADR-0009](../../docs/decisions/0009-activity-fills-the-band.md) is superseded
  outright: its whole mechanism is the earned-ceiling fill that quarters replace.
- The four strata (Novice / Experimenter / Practitioner / Expert) stop being
  competence bands. Their names go with them.

None of that gets written up until a variant wins. The board decides first.
