# Concept — the tree allegory

*The load-bearing document. Everything visual and technical hangs off the mappings
defined here. Open questions are marked ❓ and tracked in [docs/decisions/](decisions/).*

## 1. The two axes

### Vertical = proficiency (Section's four levels × forest stratification)

Real forests are vertically stratified into **four layers** — and Section defines
**four levels** of AI proficiency. The mapping is 1:1 and load-bearing:

| Height band | Forest stratum | Section level | Meaning in the tree |
| --- | --- | --- | --- |
| 4 (top) | **Emergent layer** | **Expert** | Builds AI workflows for themselves *and others* — automation, agents, new use cases. Branch tips pierce above the canopy; only they catch the top light. |
| 3 | **Canopy** | **Practitioner** | AI embedded in repeatable workflows. The dense, productive crown. |
| 2 | **Understory** | **Experimenter** | Frequent one-off use, no repeatable workflows yet. Young shoots, smaller leaves. |
| 1 (ground) | **Forest floor** | **Novice** | Not yet extracting value. Seedlings, sprouts, first stems. |
| 0 (below) | **Roots** | *(pre-level / private)* | Learning inputs and private knowledge — see §4. |

Visually, the strata are readable as subtle horizontal *light bands* / atmosphere
zones (fog density, light temperature), not hard grid lines. A branch's height is a
claim about proficiency in that field — which is why height must be *earned*, not
merely accumulated (see §5, integrity rule).

### Radial = fields of practice (the sector compass)

The fields from issue #1, arranged as azimuth sectors around the trunk and grouped
into four **limbs** so the silhouette stays readable:

```
                        N
             pro-code   |   copy
        low-code     \  |  /     images
                      \ | /
   BUILD ──────────────(●)────────────── CREATE
                      / | \
        no-code      /  |  \     video
              GEO       |       workflows
                  SEO   |   (ComfyUI, Make, n8n)
                        S
   W: BUILD limb                E: CREATE limb
   S: DISTRIBUTE limb (SEO/GEO) S-E: AUTOMATE limb
```

| Limb (primary bough) | Sectors (secondary boughs) |
| --- | --- |
| **CREATE** | GenAI for copy · GenAI for images · GenAI for video |
| **AUTOMATE** | Visual workflow tools (ComfyUI, Make, n8n) |
| **DISTRIBUTE** | Programmatic SEO · Programmatic GEO |
| **BUILD** | Vibe coding no-code · low-code · pro-code |

That's 4 limbs → 9 sectors. Each sector owns a fixed azimuth wedge, a hue, and its
own proficiency level (you can be Expert in SEO while a Novice in video — the tree
should show exactly that asymmetry; asymmetric trees are also simply more beautiful).

**"Run AI locally vs in the cloud" is deliberately *not* a sector.** It's a
property of *how* you work in any sector, not a field of its own. Proposal: make it
a **cross-cutting attribute** rendered as leaf material — cloud-run work gets
sky-lit, iridescent leaves; locally-run work gets earthier, denser foliage. One
glance at the tree tells you how self-hosted a practitioner is. (❓ [ADR-0003](decisions/0003-local-vs-cloud-as-attribute.md))

**Taxonomy is config.** These 9 sectors are Walter's default. Public users get this
as a starter taxonomy plus a config file to rename/add/remove sectors. New fields
("More may come to mind") = new wedge, allocated from reserved azimuth space.

## 2. Tree anatomy ↔ learning journey

| Tree part | Represents | Grows when |
| --- | --- | --- |
| **Roots** | Private knowledge & learning inputs (Obsidian notes, courses, reading) | Notes are created/updated in the vault |
| **Trunk** | You — the whole practice. Thickness = total lifetime volume (strand model: trunk cross-section ≈ sum of all boughs, da Vinci's rule) | Any growth anywhere |
| **Rings** *(cut-away / detail view)* | Time. Years of practice, dense rings = intense years | Automatically, by the calendar |
| **Limbs** (4) | Field clusters: CREATE / AUTOMATE / DISTRIBUTE / BUILD | Their sectors grow |
| **Boughs** (9) | Sectors — fields of practice | Activity classified into that sector |
| **Branches** | Projects / repos within a sector | Commits to that repo |
| **Twigs** | Work streams, bursts of related activity | Recent clustered activity |
| **Leaves** | Individual artifacts: a commit, a note, a published piece | One per event (with clustering at LOD distance) |
| **Blossoms** 🌸 | **Level-up moments** — a sector crossing into the next stratum | A declared/validated proficiency milestone |
| **Fruit** 🍎 | Shipped outcomes: launched site, published article, released tool, certification | A milestone event of kind `shipped` |
| **Foliage color** | Recency: fresh green = this month, deep green = evergreen mastery, autumn gold = dormant > N months | Continuously, from event timestamps |
| **Fireflies / pollen motes** | The last ~7 days of activity, drifting near where it happened | Live from latest harvest |

Fun bit of botanical truth: **the strand model** (used in the classic
[botanical infovis paper](research/prior-art.md#botanical-visualization)) means every
leaf pulls a physical strand of thickness all the way down through its branch, bough,
limb, into the trunk. Your trunk is literally *made of* everything you ever did.
Nothing is decorative; the tree's mass is your history.

## 3. One tree or a forest? (the identity question)

Issue #1 asks: is each repo its own tree (→ forest), or are all repos one tree?

| | 🌳 **One tree per person** (repos = branches) | 🌲🌲 **One tree per repo** (person = forest) |
| --- | --- | --- |
| Metaphor | *You* grow. Repos are things that grew out of you. | Repos grow; you are the gardener/terrain. |
| Section levels | Map cleanly: strata = *your* proficiency per sector | Murky: a repo doesn't have a proficiency level |
| Emotional pull | "This is me" — strong identity, one hero shot | "This is my portfolio" — cooler, more distant |
| Early days | One young tree — sympathetic | A field of saplings — looks sparse/sad |
| Big repos | Could dominate → mitigate with log-scaling | Naturally isolated |
| Shareability | One iconic silhouette, one time-lapse | Harder to frame one image |
| Scale limit | 100s of repos → branch clutter → mitigate with LOD + archival ("fallen leaves become soil") | Scales trivially |

**Recommendation: one person = one tree.** Repos are branches inside their sector's
bough. The *forest* is not lost — it returns one level up as the **community layer**:
every person is a tree, a team is a grove, and "walking the forest" becomes the
inspiration feature (see vision). This preserves both halves of the allegory instead
of spending the forest metaphor on repo count. (❓ [ADR-0001](decisions/0001-one-tree-per-person.md))

## 4. Roots = private knowledge

The most elegant resolution of "where does Obsidian fit":

- **Above ground = public evidence** (GitHub). Anyone can see it — it's already public.
- **Below ground = private knowledge** (Obsidian vault). Notes feed growth as the
  **root system**: only *metadata* (timestamps, tags, counts — never content) leaves
  the vault. Viewers see either nothing, or an anonymized root silhouette whose
  spread hints at how much unseen learning nourishes the visible tree.

This makes the privacy boundary *identical* to the ground plane. No settings page
can explain privacy better than "roots are underground." Root mass in a sector also
foreshadows growth ("lots of video notes, no video commits yet — a shoot is coming"),
which is a genuinely motivating signal. (❓ [ADR-0002](decisions/0002-roots-are-private-knowledge.md))

## 5. Growth mechanics (concept level — algorithm in [03-data-model.md](03-data-model.md))

1. **Events, not state.** Every harvested artifact becomes an immutable event in an
   append-only growth log. The tree is a pure function of the log: `tree = grow(events, seed)`.
2. **Deterministic.** Seeded randomness only. Same history → same tree, forever.
   This is what makes the time-lapse replay possible and the tree trustworthy.
3. **Activity grows, milestones promote.** ⚖️ The integrity rule:
   - *Within* a stratum, activity (commits, notes) extends and thickens branches —
     with logarithmic damping, so 1,000 commits ≠ 1,000× branch.
   - *Crossing* into the next stratum requires an explicit **milestone event**
     (self-declared level-up, certification, shipped outcome). Commits alone can
     take you to the ceiling of Experimenter; they cannot silently make you a
     Practitioner. The tree can't lie about competence. (❓ [ADR-0004](decisions/0004-milestones-gate-strata.md))
4. **Recency is foliage, history is wood.** Old activity lignifies into permanent
   structure; recent activity is what's green and glowing. A dormant sector keeps
   its wood (you *did* learn it) but its foliage turns autumnal. Honest but kind.
5. **Bounded beauty.** Leaf counts are capped per twig at render time (older leaves
   merge into foliage clusters — LOD), so a decade of history still renders at 60 fps.

## 6. Open questions (live list)

| # | Question | Current lean | Where |
| --- | --- | --- | --- |
| 1 | One tree per person vs per repo? | One per person; forest = community | [ADR-0001](decisions/0001-one-tree-per-person.md) |
| 2 | Are roots Obsidian/private knowledge? | Yes | [ADR-0002](decisions/0002-roots-are-private-knowledge.md) |
| 3 | Local-vs-cloud: sector or attribute? | Cross-cutting attribute (leaf material) | [ADR-0003](decisions/0003-local-vs-cloud-as-attribute.md) |
| 4 | How are strata crossings earned? | Explicit milestone events, not volume | [ADR-0004](decisions/0004-milestones-gate-strata.md) |
| 5 | Do blog posts / published articles count as events? | Yes eventually (RSS/sitemap harvest) — phase 3+ | backlog |
| 6 | Seasons tied to calendar or to activity? | Activity (foliage recency), calendar only for ambience | [02-visual-language.md](02-visual-language.md) |
| 7 | What exactly is the seed/planting moment shown at t=0 of the replay? | First ever AI-related commit | backlog |
