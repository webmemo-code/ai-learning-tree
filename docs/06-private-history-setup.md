# Private history: HARVEST_TOKEN setup

*How to let the nightly harvest see private repos. Companion to
[03-data-model.md](03-data-model.md) §6 and the token table in
[../harvester/README.md](../harvester/README.md).*

Out of the box, the nightly harvest runs on the ambient Actions `GITHUB_TOKEN`
and grows the tree from **public** activity only — zero secrets to configure.
Growing private history takes two independent gates (docs/03 §6): a token that
can *see* the private repos (this page), and a config flag that says you *want*
them in the log (§3 below). Either one alone changes nothing.

## 1. Create the fine-grained PAT (~3 minutes)

1. Logged in as the tree's owner, go to **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**
   (direct: <https://github.com/settings/personal-access-tokens/new>).
2. Fill in:
   - **Token name:** something recognizable, e.g. `ai-learning-tree-harvest`.
   - **Expiration:** 90 days is a sane default. Set a rotation reminder — when
     the token expires, the nightly run does NOT break; it silently falls back
     to public-only harvesting (the failure mode is *missing private growth*,
     not a red workflow).
   - **Resource owner:** the account that owns the repos to harvest.
   - **Repository access:** *All repositories* — or *Only select repositories*
     to whitelist which private repos may ever reach the log.
   - **Permissions → Repository permissions:** **Contents: Read-only** (which
     auto-selects **Metadata: Read-only**). Nothing else — the harvester reads
     commit metadata only, so this is the minimal scope.
3. Generate and copy the `github_pat_…` value. It is shown exactly once.

A classic PAT with `repo` scope also works, but grants far more than needed —
prefer fine-grained.

## 2. Add the repo secret

In this repo: **Settings → Secrets and variables → Actions → New repository
secret**, name it exactly `HARVEST_TOKEN`, paste the token as the value.

That's the whole plumbing. Precedence is `HARVEST_TOKEN` > `GITHUB_TOKEN` >
none: the harvester picks the PAT up automatically on the next run, and since
it's a real *user* token, `/user/repos` works directly (no installation-token
fallback needed) and returns private repos too.

## 3. Opt in via config (the second gate)

Seeing private repos is deliberately not enough. In `tree.config.yml`:

```yaml
harvest:
  private-repos: true
```

Without this flag the token change is invisible — private repos are listed but
skipped (`skipped N private` in the run log). With it, their commits enter the
growth log with `private: true`.

**Read before flipping the flag:** `data/growth-log.jsonl` lives in this
**public** repo. Events are metadata-only — never a commit message, file path,
diff, or patch (the test suite enforces this) — but a private repo's **name**
does appear as the event's `project` field. Enable only if you're comfortable
with private repo names being public. Vault notes are a separate, stricter
pipeline with its own privacy modes (docs/decisions/0005).

## 4. Verify

Dispatch the **Nightly growth harvest** workflow manually (Actions → Nightly
growth harvest → Run workflow) and check the job log:

- first harvester line says `token=HARVEST_TOKEN` (not `GITHUB_TOKEN`),
- no "falling back to public repo list" line follows,
- with the config flag on, the scan summary counts previously-skipped repos
  and their first full history lands in one `AUTO | Nightly growth harvest`
  commit (the cursor-in-log design means the backfill happens exactly once).

## 5. Rotation & revocation

- **Rotate:** generate a new token, overwrite the `HARVEST_TOKEN` secret,
  delete the old token. No code or workflow change.
- **Revoke / step back to public-only:** delete the secret (or let the token
  expire). The harvest keeps running on `GITHUB_TOKEN`. Already-logged private
  events stay in the log — the log is append-only; remove their lines by hand
  if you also want them gone. Mind the cursor-in-log design
  ([../harvester/README.md](../harvester/README.md)): deleting a repo's lines
  makes its history re-harvest from scratch on the next run, so only stay
  clean if the token can no longer see the repo (or the config flag is off).
