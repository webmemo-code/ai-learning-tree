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
  "kind": "commit",              // commit | note | milestone | shipped
  "sector": "build.pro-code",    // limb.sector, from taxonomy config
  "project": "ai-learning-tree", // → branch identity within the sector bough
  "weight": 1.0,                 // damped later; big refactor ≠ typo fix (heuristic: files touched)
  "attrs": { "runtime": "cloud", "lang": "TypeScript" },  // cross-cutting attributes
  "private": false               // true → contributes to roots only
}
```

- **Commits** (`kind: commit`): harvested via GitHub GraphQL API (public data only
  for other users; PAT for your own private repos, opt-in).
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
- **Stratum ceilings:** a sector's attractors are capped at the top of its current
  stratum band until a milestone raises the cap. Level-up = new sky opens =
  visible growth spurt upward (this *is* the blossom moment).
- **Determinism:** PRNG seeded from `(owner-seed, sector, event-id)`. `algoVersion`
  is recorded in every generated `tree.json`; changing the generator bumps the
  version so old renders remain reproducible (the algorithm itself is versioned
  history — see [04-roadmap-and-process.md](04-roadmap-and-process.md)).
- **Output:** `tree.json` — a pure geometry/metadata graph (nodes: segments, leaves,
  blossoms; each tagged with source event ids) consumed by the renderer. The
  renderer never touches raw sources; the generator never touches pixels. Clean seam.

## 5. Replay (time-lapse) for free

Because the generator is a pure function of a time-sorted log, replay is just
`grow(events.filter(e => e.ts <= t))` swept over `t` — practically: the generator
emits `bornAt` per segment/leaf, and the renderer animates a growth-front sweep.
No second code path, no cheating. The shareable 30-second journey clip falls out
of the architecture rather than being a feature bolted on.

## 6. Privacy stance (hard rules)

1. Note **content never leaves the vault** — the harvester emits path-hash + tags + ts only.
2. `private: true` events influence **roots only**; roots render for the owner,
   and for visitors only as an anonymized silhouette (or not at all — config).
3. Public tree pages embed only `tree.json` (geometry + public event refs), never the log's private lines.
4. For other users, default harvest scope = **public GitHub data only**; private-repo
   and vault scopes are explicit opt-ins with their own config keys.
