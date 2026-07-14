# harvester/ — the growth-event harvesters

Turns real activity into growth events and appends them to
`data/growth-log.jsonl`. Two independent harvesters share this directory and
the log's schema/merge machinery, but never each other's data:

- **`harvest.mjs`** (phase 3, "First rings") — real GitHub activity, public by
  default. See the sections below.
- **`vault.mjs`** (phase 4, "Roots") — Obsidian vault note *metadata only*,
  always private. See "Vault harvesting (phase 4 — Roots)" further down.

Zero npm dependencies (Node 18+; the only shared code is the generator's tiny
YAML parser, plus vault.mjs importing harvest.mjs's log-merge helpers).

```
harvester/
  harvest.mjs         # GitHub CLI + testable core (fetchJson is the network seam)
  vault.mjs           # Obsidian vault CLI + testable core (git + fs are the only seams, no network)
  bootstrap-local.mjs # one-time: seed the real log from THIS repo's git history, no network
  test-harvest.mjs    # zero-dep, no-network fixture tests (GitHub side)
  test-vault.mjs      # zero-dep, no-network tests (vault side) — builds a real temp git repo
  fixtures/           # recorded API JSON the GitHub tests inject
  fixtures/vault/     # a tiny committed fixture vault the vault tests turn into a temp git repo
```

## Usage

### Local run

```bash
# preview what would be appended, write nothing:
node harvester/harvest.mjs --dry-run

# harvest for real (appends + re-sorts data/growth-log.jsonl):
node harvester/harvest.mjs

# scope to one repo, or override the per-repo cursor with a floor date:
node harvester/harvest.mjs --repo webmemo-code/ai-learning-tree --dry-run
node harvester/harvest.mjs --since 2026-01-01T00:00:00Z
```

Behind a proxy (like this sandbox) Node needs the CA bundle:
`NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node harvester/harvest.mjs --dry-run`.

Exit codes: `0` on success **and** on "no new growth" (nothing to do is not a
failure); `1` only if the GitHub fetch itself fails (rate limit, auth, network) —
in which case nothing is written.

### Actions run (nightly)

The workflow (authored separately, outside this directory) should:

1. `actions/checkout` with write permission (`contents: write`).
2. `node harvester/harvest.mjs` with `GITHUB_TOKEN` in the env (the default
   Actions token is enough for public repos + this repo).
3. Commit any change to `data/growth-log.jsonl` as `CHORE | Nightly growth harvest`
   (docs/04 §2), then run the generator + snapshot as desired.

The harvester prints progress to **stderr** and (in `--dry-run`) the candidate
JSONL to **stdout**, so `... --dry-run > preview.jsonl` captures just the events.

## Token scopes (for the workflow author)

| Env var | Who sets it | Scope it grants |
| --- | --- | --- |
| *(none)* | — | Public GitHub API, **60 req/hr** anonymous limit. Works, but rate-limits fast. |
| `GITHUB_TOKEN` | GitHub Actions, automatically | Public repos + this repo, ~1000 req/hr. **The nightly default.** |
| `HARVEST_TOKEN` | You, as a repo secret (opt-in PAT) | Whatever the PAT can read — including **private** repos. Needed only to grow private history. |

Precedence: `HARVEST_TOKEN` > `GITHUB_TOKEN` > none. A private repo's commits are
harvested **only when** the token can see the repo **and** `harvest.private-repos:
true` in `tree.config.yml` (two independent gates — docs/03 §6). For a private PAT,
`repo` (or fine-grained *Contents: read*) scope is enough; the harvester only reads
commit metadata.

## The cursor-in-log design (no state file)

The log **is** the state. There is no separate cursor/checkpoint file to drift out
of sync. On each run the harvester scans the existing log, finds the newest
`gh:{owner}/{repo}:*` event per repo, and asks GitHub for commits `since` that
timestamp. The boundary commit (equal ts) comes back too but is dropped by id
dedupe. Consequences:

- Delete a repo's lines → its history re-harvests from scratch next run.
- Nothing is ever double-counted; running twice in a row appends nothing.
- Existing lines are re-emitted **byte-for-byte** and only re-sorted (append-only
  in spirit); an event that arrives late simply slots into ts order.

Per-commit detail (for the weight heuristic) is fetched **only** for genuinely-new
commits — the ones we already have never cost an API call.

## Classification chain (docs/03 §3)

First match wins, per commit's repo:

1. **`repos:`** explicit mapping in `tree.config.yml` — highest confidence.
2. **`topic-map:`** — the repo's GitHub topics, first mapped topic wins.
3. **`unclassified`** — never dropped; renders as faint gray shoots nagging you to
   add a mapping.

**Weight** = `clamp(0.4 + log₂(1 + files_touched) · 0.5, 0.4, 3.0)` — a big refactor
outweighs a typo, but no single commit can grow a monster branch.

**Milestones**: `data/milestones.yml` (hand-authored) is merged every run into
`kind: milestone` events with id `manual:{date}-{sector}-l{level}`. The dedup key is
**ts + sector + level** (the `data/README.md` contract), so you can freely edit an
entry's `note`/`evidence` prose without minting a duplicate.

## Privacy guarantees (docs/03 §6) — what is NEVER emitted

Metadata only. An emitted event carries exactly the §2 schema fields
(`id, ts, source, kind, sector, project, weight, attrs, private`) and nothing else.
The harvester reads a commit's `files.length` for the weight and throws everything
else away. It **never** emits:

- commit **message** subjects or bodies,
- **file paths**, filenames, `diff`s, or `patch`es,
- raw SHAs beyond the 7-char id fragment.

`test-harvest.mjs` enforces this: the fixtures deliberately stuff `SECRET …` text
and `src/secret/private-path-*.ts` paths into every commit message and file patch,
and the test fails if any of it — or any forbidden key — survives into an event.

## The fixture-test story

`test-harvest.mjs` runs with **no network**. It injects `harvester/fixtures/*`
into `harvest.mjs`'s `fetchJson` seam (the thin-adapter boundary, docs/04 §risk)
via a fake that also records every requested URL, then asserts:

- classification chain order (explicit map beats topic beats unclassified),
- forks skipped (and never even fetched), other owners' repos filtered out,
- private repos skipped without `private-repos: true`, included (with `private:
  true`) when opted in,
- cursor: the right `since=` is sent per repo, and already-logged commits are
  neither re-emitted nor re-fetched,
- weight heuristic bounds (0-file → 0.4, 100-file → 3.0 clamp),
- milestone merge + dedupe (edited note text does not re-add),
- ts sort ascending + a second run being byte-identical (idempotence),
- the privacy scan above.

```bash
node harvester/test-harvest.mjs   # -> "✓ all green — N passed, 0 failed"
```

## bootstrap-local.mjs (one-time seed)

Seeds the real log from **this repo's local git history** — no network — so the
tree has real rings the moment phase 3 lands, before the first nightly run:

```bash
node harvester/bootstrap-local.mjs           # preview, writes nothing
node harvester/bootstrap-local.mjs --write    # OVERWRITE data/growth-log.jsonl
```

It **overwrites** (does not merge): the phase-2 mock log is disposable and must not
bleed into the real one. Commit events use `git log --numstat` file counts for the
weight and the committer date (UTC); `data/milestones.yml` is merged in if present.
Same schema and privacy rules as the live harvester.

## Vault harvesting (phase 4 — Roots)

`vault.mjs` turns an Obsidian vault's **own git history** (it syncs via
[obsidian-git](https://github.com/Vinzent03/obsidian-git)) into `kind: note`
growth events, appended into the same `data/growth-log.jsonl` the GitHub side
writes to. It is the only source that feeds `private: true` events — per
docs/03-data-model.md §6 and docs/decisions/0002, those contribute to **roots
only** and never grow above-ground wood or leaves.

```bash
# preview what would be appended, write nothing:
node harvester/vault.mjs --vault ../vault --dry-run

# harvest for real (appends + re-sorts data/growth-log.jsonl):
node harvester/vault.mjs --vault ../vault

# no --vault: falls back to tree.config.yml's vault.path (default ../vault),
# and respects vault.enabled — skips silently (exit 0) when it's false.
node harvester/vault.mjs
```

`--vault <path>` always **forces** a run (even if `vault.enabled: false` in
config) — handy for a one-off local test against a real checkout. Without
`--vault`, the config's `enabled` flag decides: `false` prints "vault
harvesting disabled" and exits `0` (not an error — a fresh clone with no vault
configured yet must not fail here); `true` but the checkout is missing or
isn't a git repo exits `1` with a clear message, same as a genuine harvest
failure would.

### Input: a LOCAL git checkout, never the network

`vault.mjs` never makes an HTTP request. It reads the vault as a **local git
checkout** — in Actions that's a sibling directory checked out by
`.github/workflows/harvest.yml`'s "Checkout vault" step (gated on `VAULT_TOKEN`,
see below); locally it's whatever `--vault` or `tree.config.yml`'s `vault.path`
points at (default `../vault`, a sibling of this repo).

### Event granularity and the deleted-note case

One event per **(note, commit-day)** — `id: obs:{sha256(vault-relative-path)
.slice(0,12)}:{YYYYMMDD}`. The path itself is hashed and discarded immediately;
nothing downstream of that hash ever sees it. `ts` is that day's **latest**
commit touching the note (same-day commits collapse into one event). A note
that has since been **deleted** still keeps its historical (note, day) events
(you did write something that day), but at damped `weight: 0.6` instead of
`1.0`, with `attrs.tags: []` and `sector: unclassified` — because tags are read
from the **current working-tree copy**, and a deleted note has none to read.
This is intentional: we don't cache a deleted note's last-known tags anywhere,
so its original topic can't leak after the fact either.

### The tag allow-list: why unmapped tags are dropped, not passed through

`vault.mjs` reads a note's frontmatter `tags:` and inline `#tags` **locally**,
but only tags that are keys in `tree.config.yml`'s `vault.tag-map` ever reach
`attrs.tags` — sorted, and with the sector picked from the alphabetically-first
mapped tag if a note carries more than one. Everything else about the note
(title, body, any tag not in the map) is discarded the instant it's read.

The reasoning: an *unmapped* tag is still a topic name chosen for a private
vault — `#medical-history`, `#job-search`, whatever it might be — that was
never explicitly declared safe to surface. Emitting raw tag strings and hoping
none of them are sensitive would make every future tag an accidental privacy
decision. Emitting only allow-listed tags keeps that decision explicit and
auditable in one file: add a line to `vault.tag-map` when you're sure a tag is
safe to expose as a sector label, and until then the note simply falls into
`unclassified` — same nagging-shoots behavior as an unmapped GitHub repo
(docs/03 §3 rule 4), never a silently leaked topic.

### Cursor + dedupe (same design as the GitHub side)

No separate cursor file: `vault.mjs` scans the log for the newest already-logged
`obs:` event's `ts`, floors it to UTC midnight, and passes that as `git log
--since=` — coarser than an exact timestamp so a same-day commit added after a
previous run is never missed. Whether or not that day gets rescanned, an
already-logged `(note, day)` id is skipped by the same `buildOutput` dedupe
`harvest.mjs` uses, so re-running is always idempotent.

### VAULT_TOKEN setup (for the workflow)

| Env var / config | Who sets it | Purpose |
| --- | --- | --- |
| `tree.config.yml` `vault.enabled` | You | Master on/off switch. `false` by default. |
| `tree.config.yml` `vault.repo` | You | The vault's git location — `owner/repo`, a `git@...` SSH URL, or an `https://...` URL; the workflow extracts `owner/repo` from any of these for `actions/checkout`. |
| `VAULT_TOKEN` (repo secret) | You | A PAT with read access to the vault repo (private, presumably). Used both to check it out and as the checkout's auth token. |

`.github/workflows/harvest.yml` checks out the vault **only** when both
`VAULT_TOKEN` is set and `vault.enabled: true` — see that workflow's "Check
vault harvesting availability" step for why the check happens in a `run:`
script rather than a step `if:` (GitHub Actions doesn't reliably support
referencing `secrets.*` directly in `if:` conditions). A fork or a clone
without the secret configured is a **silent no-op** here, not a failure.

### Privacy guarantees enforced

Every note event is `private: true`, asserted (not merely set — see
`assertPrivate` in `vault.mjs`) before it can leave the module. `test-vault.mjs`
builds a real temp git repo from `fixtures/vault/` — including secret-looking
body text (`SECRET ...`), an unmapped tag (`#medical-history`), a note in a
subfolder, and a note that gets deleted partway through the vault's history —
and scans **every** emitted event for every fixture filename, folder name,
title word, `SECRET`, and the unmapped tag, failing if any of it survives.

```bash
node harvester/test-vault.mjs   # -> "✓ all green — N passed, 0 failed"
```
