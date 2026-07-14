# harvester/ — the phase-3 GitHub harvester

Turns real GitHub activity into growth events and appends them to
`data/growth-log.jsonl`. This is the "First rings" pipeline (docs/04 §1): a
nightly GitHub Action runs `harvest.mjs`, commits the new lines, and the tree
grows in `git log`. Zero npm dependencies (Node 18+; the only shared code is the
generator's tiny YAML parser).

```
harvester/
  harvest.mjs         # the CLI + the testable core (fetchJson is the network seam)
  bootstrap-local.mjs # one-time: seed the real log from THIS repo's git history, no network
  test-harvest.mjs    # zero-dep, no-network fixture tests
  fixtures/           # recorded API JSON the tests inject
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
