# ADR-0002 — Roots represent private knowledge (Obsidian) and learning inputs

- **Status:** Proposed — awaiting Walter's call
- **Date:** 2026-07-13
- **Context:** Obsidian participation is planned but notes are private; the tree
  needs a place for learning that produced no public artifact. Several candidate
  meanings existed for roots (foundations, courses, local-AI practice, data
  integrations).

## Decision (proposed)

The **ground plane is the privacy boundary**. Above ground grows from public
evidence (GitHub). Below ground, the **root system** grows from private knowledge:
Obsidian note metadata (timestamps, tags, counts — never content) plus manually
logged learning inputs (courses, books). Root azimuths mirror the sector compass,
so heavy note-taking in a sector foreshadows the shoot that will later rise there.

Visibility: owner sees full roots (via the "roots reveal" camera move); visitors
see nothing or an anonymized silhouette — config choice.

## Why

1. Privacy explained by the metaphor itself — nothing to configure to *understand*.
2. Botanically true: roots feed growth invisibly, often preceding it. "Lots of
   video notes, no video commits yet" rendering as root mass is a genuinely
   motivating signal.
3. Keeps one clean rule: *public evidence above, private knowledge below.*

## Consequences

- Requires the vault to be reachable as a git repo ([obsidian-git](https://github.com/Vinzent03/obsidian-git)) or via a
  local harvester; metadata-only emission is a hard rule ([03-data-model.md](../03-data-model.md) §6).
- Local-vs-cloud needs a different home (see ADR-0003) since roots are taken.
- A "roots reveal" camera sequence enters the visual scope (phase 4).
