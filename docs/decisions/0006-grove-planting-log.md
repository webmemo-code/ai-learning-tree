# ADR-0006 — Grove membership is an append-only planting log; joining is a PR

- **Status:** Accepted *(Walter, 2026-07-14 — phase-6 build unlocked)*
- **Date:** 2026-07-14
- **Context:** Phase 6 turns single trees into shared forests. ADR-0001 reserved
  the forest metaphor for the community layer; [04-roadmap-and-process.md](../04-roadmap-and-process.md)
  §3 chose GitHub-native federation (template repo, no server). What was never
  decided: **how membership in a shared grove is recorded, verified, moderated,
  and undone** — the coordination substrate that placement ([ADR-0007](0007-grove-placement-phyllotaxis.md))
  computes over. Full concept: [05-grove.md](../05-grove.md).

## Decision

A grove is a repo whose only coordination state is **`plantings.jsonl`, an
append-only event log** — the same discipline as the tree's own growth log:

1. **One event per line**; the **file order is authoritative** (it defines spiral
   slot order). Event kinds: `planted`, `clearing`, `transplanted`, `felled`,
   `renamed`, `reserved`. Unknown kinds are ignored (forward-compatible).
2. **Joining is a pull request** appending one `planted` line ("the planting
   ceremony"). CI validates mechanics — PR author owns the named tree repo, the
   `tree.json` URL lives under that owner, no duplicate planting, target clearing
   exists and has capacity. A human **grove keeper** merges. Moderation lives
   exactly at the merge button and nowhere else.
3. **The log stores pointers, not evidence**: `owner/repo` + published `tree.json`
   URL + clearing + timestamp. No tree data is copied into the grove.
4. **History is never rewritten; order is never disturbed.** Leaving = `felled`
   (the slot keeps a stump). True erasure = replacing the line with a `reserved`
   tombstone that consumes the slot invisibly, so no later tree ever shifts.
5. **Groves are bounded, scale is federated**: a grove that outgrows its clearings
   spawns sibling groves; a grove *directory* (append-only list of grove URLs) is
   the forest-of-forests index.

## Why

1. **It reuses the project's one load-bearing trick.** Append-only log → pure
   function → deterministic artifact is exactly how a tree earns trust
   ([03-data-model.md](../03-data-model.md)); the grove earns it the same way.
   No second coordination mechanism to reason about, version, or defend.
2. **Git already provides the hard parts**: ordering (merge sequence), audit trail
   (history), identity (PR author), access control (keeper), conflict resolution
   (append-only lines merge trivially).
3. **Moderation without machinery.** Every community boundary eventually needs a
   human "no". Putting it at PR merge — where maintainers already say no — adds
   zero new roles, dashboards, or servers.
4. **Privacy stays already-solved.** The grove holds public pointers to files that
   ADR-0005 already hardened; there is nothing new to leak.

## Consequences

- A grove template repo needs: `grove.yml`, an empty `plantings.jsonl`, the CI
  validation Action, and the grove renderer page (phase-6 build).
- The keeper role must be documented (transfer, absence) — template README.
- `reserved` tombstones mean the *parser* must tolerate lines with no tree id.
- Slot order = line order means **the log file is the single source of truth**;
  tooling must never sort, dedupe, or "clean up" the file.

## Alternatives considered

- **Central registry service / OAuth app:** rejected — a server, an operator, and
  custody of user associations, against 04 §3's explicit recommendation.
- **Groves as GitHub teams/orgs:** rejected — ties community shape to paid org
  structures and leaks employment topology; a log line is lighter and freer.
- **Signed attestations (sigstore etc.) for ownership:** deferred (G4 in
  [05-grove.md](../05-grove.md) §8) — PR-author-owns-repo is sufficient for v1 and
  the log format doesn't preclude adding attestation fields additively.
