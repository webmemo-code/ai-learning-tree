# Data model & growth pipeline

*How real-world activity becomes tree geometry. Companion to [01-concept.md](01-concept.md) §5.*

## 1. Pipeline overview

```
  SOURCES                 HARVEST                  LOG                    GROW                 RENDER
┌──────────────┐   ┌────────────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
│ GitHub API   │──▶│ harvester (Action, │──▶│ growth-log   │──▶│ deterministic    │──▶│ three.js     │
│ (commits,    │   │ nightly cron)      │   │ .jsonl       │   │ tree generator   │   │ scene w/     │
│ repos, topics│   │ - classify sector  │   │ append-only, │   │ (seeded, pure    │   │ bloom, LOD,  │
├──────────────┤   │ - dedupe           │   │ committed to │   │ fn of log)       │   │ replay       │
│ Obsidian     │──▶│ - weight           │   │ this repo    │   │ tree.json        │   │              │
│ vault (git-  │   │ - strip content    │   └──────────────┘   │ (geometry graph) │   └──────────────┘
│ synced)      │   │   (metadata only!) │          ▲           └──────────────────┘
├──────────────┤   └────────────────────┘          │
│ milestones.  │───────────────────────────────────┘  (milestones are hand-authored events)
│ yml (manual) │
└──────────────┘
```

The GitHub box covers more than commits: with `harvest.collaboration: true` the
harvester also reads pull requests, their reviews, and issues (§2). Each list
endpoint is floored by its **own** high-water mark in the log (one per `commit` /
`pr` / `issue` family; reviews fold into the `pr` family) — see
[harvester/README.md](../harvester/README.md#the-cursor-in-log-design-no-state-file).

Key property: **the tree is a pure function of the growth log** — `grow(events, seed, algoVersion)`.
The log is the source of truth and lives in git, so the tree's history is itself
version-controlled. Rebuilding from scratch is always possible and always identical.

## 2. The growth event (one schema for everything)

```jsonc
// data/growth-log.jsonl — one event per line, append-only, sorted by ts
{
  "id": "gh:webmemo-code/ai-learning-tree:abdc221",   // stable, dedupable
  "ts": "2026-07-12T14:03:22Z",
  "source": "github",            // github | obsidian | manual | blog (later)
  "kind": "commit",              // commit | pr | review | issue | note | milestone | shipped
  "sector": "build.pro-code",    // limb.sector, from taxonomy config
  "project": "ai-learning-tree", // → branch identity within the sector bough
  "weight": 1.0,                 // damped later; big refactor ≠ typo fix (heuristic: files touched)
  "attrs": { "runtime": "cloud", "lang": "TypeScript" },  // cross-cutting attributes
  "private": false               // true → contributes to roots only
}
```

- **Commits** (`kind: commit`): harvested from the GitHub REST API (public data only
  for other users; PAT for your own private repos, opt-in). Id: `gh:{owner}/{repo}:{sha7}`.
  Weight from files touched: `clamp(0.4 + log₂(1 + files) · 0.5, 0.4, 3.0)`.
- **Collaboration** (`kind: pr | review | issue`): opt-in via `harvest.collaboration`
  (**off** when the key is absent). Only the owner's own PRs, reviews and issues
  count — someone else's PR is *their* growth. Ids are
  `…:pr{n}`, `…:pr{n}r{reviewId}`, `…:i{n}`, which can never collide with a `sha7`
  (`p`, `r` and `i` are not hex digits). Flat per-kind weights, chosen to sit in the
  same 0.4–3.0 band as commit weights so the mix is comparable on one axis:

  | kind | weight | why |
  | --- | --- | --- |
  | `pr` | 1.5 | packaging work for others, not just saving it — heavier than a typical commit |
  | `review` | 1.0 | real work and the strongest maturity signal, but it produces no artifact of its own |
  | `issue` | 0.6 | cheap to open, yet it signals planning ahead of code |

  A PR's own commits are harvested **as well**. That double count is intended: the
  `pr` event is not a re-count of the code, it is a count of the collaboration act
  layered on top of it.
- **Notes** (`kind: note`): the Obsidian vault is just a git repo (via
  [obsidian-git](https://github.com/Vinzent03/obsidian-git)) → *same harvester*.
  Only path-hash, timestamps, and tags are emitted. `private: true` always.
- **Milestones** (`kind: milestone`): hand-authored in `data/milestones.yml` —
  the only way a sector crosses into the next stratum (integrity rule). Example:

```yaml
# data/milestones.yml
- ts: 2026-05-30
  sector: distribute.geo
  level: 3            # → Practitioner: bough may now grow into the canopy band
  evidence: "https://www.webmemo.ch/geo-audit-workflow/"   # URL only — prose goes in note
  note: "GEO workflow in production — repeatable audit, used weekly"
```

- **Shipped** (`kind: shipped`): fruit 🍎 — launched site, published article,
  released tool. Later harvestable from blog RSS/sitemaps.

## 3. Sector classification (how a commit knows where it belongs)

Priority chain, first match wins:

1. **Explicit repo mapping** in `tree.config.yml` (`repos: {ai-periodic-cube: build.pro-code}`)
2. **GitHub topics** on the repo (`topic-map: {comfyui: automate.visual, seo: distribute.seo}`)
3. **Obsidian tags** for notes (`#ai/video → create.video`)
4. **Default bucket** `unclassified` → rendered as faint gray shoots at the trunk
   base — visible nagging to classify them (never silently dropped)

Classification is resolved **per repo, once per run**, so a repo's PRs, reviews and
issues land in the same sector as its commits. Because the log is append-only and
keyed by event id, re-mapping a repo does *not* re-classify rows already written —
they keep their frozen sector until new events land, or until a one-off reclassify
pass rewrites them (see PR #18/#55 for the approach).

```yaml
# tree.config.yml (per-user; this repo carries Walter's as the reference instance)
owner: webmemo-code
seed: "webmemo-code"          # determinism anchor
taxonomy: default-v1           # or inline custom sectors
repos:
  ai-learning-tree:  build.pro-code
  ai-periodic-cube:  build.pro-code
vault:
  enabled: true
  tag-map:
    "ai/seo":  distribute.seo
    "ai/geo":  distribute.geo
```

## 4. Growth algorithm (generator sketch)

Two candidate families, both proven (see [prior-art](research/prior-art.md)):

| | **L-systems** (grammar rewriting) | **Space colonization** (Runions et al.) |
| --- | --- | --- |
| Look | Stylized, regular, "designed" | Organic, competitive, "grown" |
| Control | High (grammar = law) | Emergent (steer via attractor clouds) |
| Fit here | Good for limb skeleton | **Perfect for growth-toward-strata** |

**Recommended hybrid:** a fixed **scaffold** (trunk + 4 limb directions + 10 sector
azimuth wedges — hand-tuned for silhouette beauty) + **space colonization inside
each sector wedge**, where attractor points are spawned from growth events:
an event drops attractors into its sector's wedge at the height band its current
stratum allows. Branches literally *colonize the space your work opened up*.

- **Thickness:** strand/pipe model — child cross-sections sum into the parent
  (da Vinci's rule), so the trunk physically accumulates the whole history.
- **Damping:** attractor count per project ~ `log₂(1 + commits)` — prevents
  monster branches; keeps asymmetry honest but bounded.
- **Stratum ceilings:** a sector's height ceiling lives inside its current
  stratum band and *rises with log-damped activity* accrued since the band was
  unlocked — daily entries lift the pad day by day until it brushes the band
  top; only a milestone opens the next band. Level-up = new sky opens = the pad
  climbs on from the new band's floor (this *is* the blossom moment). The top
  band (Expert/Emergent) never clamps: past that threshold the tree keeps
  growing ([ADR-0009](decisions/0009-activity-fills-the-band.md)).
- **Determinism:** PRNG seeded from `(owner-seed, sector, event-id)`. `algoVersion`
  is recorded in every generated `tree.json`; changing the generator bumps the
  version so old renders remain reproducible (the algorithm itself is versioned
  history — see [04-roadmap-and-process.md](04-roadmap-and-process.md)).
- **Output:** `tree.json` — a pure geometry/metadata graph (nodes: segments, leaves,
  blossoms; each tagged with source event ids) consumed by the renderer. The
  renderer never touches raw sources; the generator never touches pixels. Clean seam.
- **Contribution meadow:** `tree.json` also carries a `contribution` array — one
  entry per non-empty **absolute-UTC-week × sector** bucket (a GitHub-style density
  field unrolled onto the ground ring): `{ sector, weekTs (that week's UTC Monday,
  YYYY-MM-DD), count, weight, privCount, privWeight, level (1..4, log-damped to the
  field max), born (the same ts→born normalization the canopy uses) }`. Weeks are
  anchored at the first epoch Monday (1970-01-05) so a bucket never shifts as new
  events append. Buckets aggregate **every classified GitHub-source event** — the
  gate in `grow()` is `source === 'github'`, not `kind === 'commit'`, so with
  `harvest.collaboration` on, PRs, reviews and issues land in the buckets alongside
  commits and their weights add to the blade height. Milestones (source `manual`)
  keep their blossom signal and vault notes (source `obsidian`) stay roots-only
  (ADR-0002/ADR-0010), so neither enters the above-ground meadow; unclassified
  events are skipped too (they keep their gray-shoots signal). Gated by
  `privacy.contributions` (see §6).

  > **Drift note (2026-08-29).** ADR-0010 (2026-07-20) wrote this rule as
  > "GitHub-source **commits** only", which was an accurate description of a
  > `source === 'github'` gate *at the time* — commits were then the only
  > GitHub-source kind. PR #57 (2026-07-31) added `pr`/`review`/`issue` events with
  > the same source, so they began entering the meadow without the prose ever
  > saying so. In the current log that is 3063 bucketed events against 1880
  > classified commits. The behaviour above is what ships; if the intent was
  > commits-only blades, the fix belongs in `grow()`, not here.

## 5. Replay (time-lapse) for free

Because the generator is a pure function of a time-sorted log, replay is just
`grow(events.filter(e => e.ts <= t))` swept over `t` — practically: the generator
emits `bornAt` per segment/leaf, and the renderer animates a growth-front sweep.
No second code path, no cheating. The shareable 30-second journey clip falls out
of the architecture rather than being a feature bolted on.

## 6. Privacy stance (hard rules)

1. Note **content never leaves the vault** — the harvester emits path-hash + tags + ts only.
   Collaboration events are held to the same line: a `pr`/`review`/`issue` event carries
   the §2 schema fields and its number, never a title, body, branch name or label text.
2. `private: true` events never emit ids/refs into `tree.json`. Vault notes
   (knowledge) influence **roots only**; roots render for the owner, and for
   visitors only as an anonymized silhouette (or not at all — config). Private
   **GitHub commits** (work) additionally lift limb height and canopy as
   *aggregate geometry* when `harvest.private-repos` is opted in — pads grown
   from private work carry no event references
   ([ADR-0009](decisions/0009-activity-fills-the-band.md)).
3. Public tree pages embed only `tree.json` (geometry + public event refs), never the log's private lines.
   The `contribution` meadow obeys this too: private work may enter a bucket only as a weekly
   per-sector **aggregate** (count + weight), never as ids/names — gated by the `privacy.contributions`
   knob (`public-only` default excludes private events entirely; `combined` folds them in and reports
   their `privCount`/`privWeight` share; `hidden` omits the array), a separate axis from `privacy.roots`.
4. For other users, default harvest scope = **public GitHub data only**; private-repo
   and vault scopes are explicit opt-ins with their own config keys.
