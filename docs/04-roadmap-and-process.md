# Roadmap & process

*Issue #1's explicit task: "conceive the processes needed to manage such a long-term
growing project." A tree project should itself grow like a tree: slowly, in rings,
without dying back each winter.*

## 1. Phases (each one demo-able, each one a ring)

| Phase | Name | Outcome (demo) | Exit criterion |
| --- | --- | --- | --- |
| **1** 🌱 | **Seed** *(now)* | Concept docs + visual mood sketch (interactive 3D) | Walter signs off on allegory + look direction (ADRs 1–4 decided) |
| **2** 🌿 | **Sapling** | Static prototype: full visual language on *hand-written mock* growth log | The mock tree makes people say "I want one" |
| **3** 🌳 | **First rings** | Real pipeline: GitHub harvester → growth log → Walter's actual tree, auto-updating nightly | Tree updates itself for 4 weeks unattended |
| **4** 🍄 | **Roots** | Obsidian metadata harvest + root system rendering + privacy controls | Vault feeds roots with zero content leakage |
| **5** 🌸 | **Bloom** | Polish: time-lapse replay, sound, camera choreography, filters, LOD, share/embed | The 30-second clip exists and gets shared |
| **6** 🌲🌲 | **Forest** | Public template: anyone hooks up their GitHub (+ optional vault); community grove view | A stranger grows a tree without our help |

Phase 1 is deliberately *paper + sketch only*. The most expensive mistakes in a
long-term visual project are metaphor mistakes, and they're free to fix now.

## 2. Working process (the gardening rules)

### Decisions
- **ADRs** in [docs/decisions/](decisions/) — every ❓ in the concept doc becomes a
  numbered ADR: *Proposed → Accepted/Rejected*, with the why. Metaphor decisions are
  architecture here; they get the same rigor as tech decisions.
- Concept docs are **living**; ADRs are **append-only history**. (Docs say *what is*,
  ADRs say *why it became so* — the rings of the project.)

### Issues & labels
- `concept` · `visual` · `data` · `pipeline` · `render` · `process` — one label per
  aspect, plus phase milestones (`phase-1-seed`, `phase-2-sapling`, …).
- Issue #1 stays open as the north-star issue until phase 2 ships, then gets a
  closing comment linking the docs it spawned.

### Automation (from phase 3)
- **Nightly harvest** — GitHub Action (cron) runs the harvester, appends to
  `data/growth-log.jsonl`, commits with `AUTO | Nightly growth harvest`. The
  tree's growth is literally visible in `git log`.
- **Snapshot releases** — monthly tagged release with the rendered `tree.json` +
  a beauty-shot PNG: the project's own growth rings, browsable forever.
- **CI** — generator determinism test (same log + seed + algoVersion ⇒ byte-identical
  `tree.json`) is the one test that must never break.

### Versioning discipline
- `algoVersion` (generator) is **semver and sacred**: any change that alters geometry
  from the same log is a **major** bump, recorded in the ADR log. Old snapshots must
  replay identically forever — a tree that retroactively changes shape betrays trust.
- Taxonomy versions likewise (`default-v1`): sectors may be *added* freely (new azimuth
  from reserved space); renames/merges need a migration note in the log.

### Dogfooding
- This repo maps to `build.pro-code` in Walter's own tree from day one. If working
  on the tree doesn't grow the tree, the pipeline is broken. The feedback loop is
  the project's heartbeat.

## 3. Path to "anyone can plant one"

Two deployment shapes, decided at phase 6 (not before — avoid premature platform-building):

| | **A. Template repo** (GitHub-native) | **B. Hosted app** |
| --- | --- | --- |
| Onboarding | Use template → edit `tree.config.yml` → Action builds → GitHub Pages serves | OAuth with GitHub → tree appears |
| Cost/ops | Zero for us; user owns everything | Server, auth, storage, moderation |
| Privacy | Data never leaves the user's own repo — easiest possible story | We hold user data — hardest story |
| Vault support | Natural (their vault repo, their Action secret) | Needs upload/sync — awkward |
| Community grove | Federated: an index repo aggregates published `tree.json` URLs | Native, but centralizes |
| Fit | **Phase 6 recommendation** | Only if template shows traction |

Recommendation: **A first.** It matches the project's ethos (your evidence, your
repo, your tree), costs nothing to operate, and the grove can still emerge from an
opt-in registry of published trees. *The grove's coordination system — who decides
which tree grows where — is specified in [05-grove.md](05-grove.md) (planting log +
phyllotaxis placement, ADR-0006/0007).*

## 4. Now / next — the living TODO

*Updated 2026-07-18, after the growth-mechanics arc landed (#24 generator 3.0.0
+ ADR-0009 activity-filled bands → #25/#27 + part of #26 the seo, workflows and
copy blossoms → #26/#28/#29 classification cleanup). Height now rises daily
with work inside each earned band, private GitHub work grows canopy as
aggregate geometry, the real tree carries FOUR blossoms (pro-code, seo,
workflows, copy — all Experimenter), and the unclassified bucket is empty for
the first time.*

Next steps, roughly in value order — each tracked as a labeled issue per §2
(the doc keeps the narrative, the issue carries the discussion):

1. **Dawn mode** 🌅 (#43) — the daylight rig deferred in [02 §1](02-visual-language.md):
   golden hour is the acacia's home lighting, and the savanna sunrise is the
   poster shot. Renderer-only (a second lighting/sky preset in acacia-sketch).
2. **Thorn & Lace** (#44) — concept 4 of [the board](../prototypes/acacia-look/README.md):
   the close-up material pass on the new skeleton — zigzag elbow emphasis, tiny
   non-glowing thorns, bipinnate lace leaf billboards. After dawn mode; it's
   polish, not direction.
3. **Refresh the shared clip** 🎥 (#45) — the phase-5 exit artifact predates the
   species change; record a new 30-second acacia replay (the pad-lift moment is
   now the climax) and use it wherever the old clip lives.
4. **Watch the band-fill pacing** (#47) — ADR-0009's `BAND_FILL_WEIGHT = 60` is a
   first calibration; after a few weeks of daily-lift observation, judge
   whether a band fills too fast/slow. Retuning it is an algoVersion MAJOR
   bump, so batch it with the next geometry change if one comes.
5. **First Practitioner milestone when it's true** (#48) — `build.pro-code` leads at
   ~fill 54% of the Understory; when a level-3 claim is genuinely earned, one
   entry in [data/milestones.yml](../data/milestones.yml) opens the Canopy.
6. **Monthly snapshot ritual** (§2 Automation, #49) — first tagged release with the
   acacia beauty shot; the project's own growth rings start with the new species.

## 5. Long-term risks & mitigations

| Risk | Mitigation |
| --- | --- |
| API drift (GitHub GraphQL, Obsidian internals) | Harvester is a thin adapter per source; log schema is ours and stable |
| Visual scope creep before metaphor is fixed | Phase gates: no shader work until ADRs 1–4 are Accepted |
| Motivation dip (solo long-term project) | Monthly snapshot ritual + the tree itself as the progress bar |
| Taxonomy churn ("more fields may come") | Reserved azimuth space; additive-only default taxonomy |
| Big-history performance | LOD budget defined in phase 2 with *mock* worst-case log (10k events) before real data exists |
