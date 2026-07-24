# ai-learning-tree

## Memory (index read at session start; leaves read on demand)

The repo includes a curated memory directory at [docs/claude-memory/](docs/claude-memory/) that travels with the code so every machine the user works from has the same context. Treat these files as authoritative project memory:

1. Read [docs/claude-memory/MEMORY.md](docs/claude-memory/MEMORY.md) at the start of any session in this repo. It is a one-line index pointing to per-topic memory files.
2. When a linked memory looks relevant to the task at hand, read the linked file in full before acting on it.
3. **Editing rule:** if a session learns something durable (a new feedback rule, a new SDK gotcha, etc.) that belongs in cross-machine memory, edit the appropriate file in `docs/claude-memory/` and update `MEMORY.md` to reference it. Treat changes there like any other code change — branch, PR, review. Do NOT mirror this content into the harness-managed `~/.claude/projects/.../memory/` directory; that location stays per-machine and is allowed to drift from the canonical in-repo copy.
4. Memory file format inside `docs/claude-memory/`: YAML frontmatter with `name`, `description`, and `metadata.type` (one of `user`, `feedback`, `project`, `reference`), followed by the body. Cross-references between memory files use `[[name-slug]]` syntax matching the `name:` field.

