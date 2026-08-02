# Taxonomy review — `build.no-code` and `build.low-code`

Conceptual analysis for issue #58. Written 2026-08-02.

**Recommendation in one line:** keep both sectors, drop the assumption that every
sector is fed by the same harvester, and give BUILD a second evidence source — because
the low-code era turns out to be densely documented, and the no-code era genuinely
is not.

---

## 1. What the drive actually contains

The issue says "I don't have much documentation about those projects, though." That is
half right, and the half that is wrong changes the recommendation.

`H:` is mounted (a Google Drive mount). I searched it. The two eras are **not**
symmetric.

### Low-code — richly evidenced

29 Jupyter/Colab notebooks, with real timestamps, spanning **September 2023 → June 2025**:

| Date | Notebook | Reads as |
| --- | --- | --- |
| 2023-09-21 | `LinkedIn Test.ipynb` | first contact |
| 2024-01-02 → 01-04 | `simple-uploader`, `getListFlickrPhotos`, `posting_content`, `post-to-instagram-working-manual-prototype` | a build sprint over four days |
| 2024-02-10 → 02-20 | `post-to-instagram-local-testing` → `-live` → `-live-v2` | **local → live → v2: a shipping arc** |
| 2024-04-15 | `Research with Multi-Agent Group Chat.ipynb` | agent experimentation, early |
| 2024-12-07 | `LinkedIn-Post-Performance-Analyzer.ipynb` | Demo → Analyzer, two days apart |
| 2025-01-05 | `Switzerland-Tourism_API`, `Meteoblue_API` | API integration practice |
| 2025-06-13 | `Google-KG-Retriever.ipynb` | the last notebook |

That last one matters: `google-knowledge-graph-retriever` is now a **GitHub repo mapped
to `distribute.seo`**. The notebook is its ancestor. Same for `posting_to_instagram` →
`flickr-to-instagram-automation`. The low-code notebooks are not a dead branch — they
are the **root system of repos that are already in the tree**, which is a very on-metaphor
thing to discover.

`H:\My Drive\Anaconda\` also holds a working folder with `README.md`,
`config_insta_posting.py`, `.gitattributes`, and git plumbing directories — a local repo
that never went to GitHub. (No readable `.git/HEAD`, so no commit log; the file
timestamps are the usable signal.)

### No-code — essentially unevidenced

Searching for Lovable, Bolt, and Make.com returns **only tool-reference notes**, never
project artifacts:

- `Obsidian-AI\03-AI-Dev-Tools\Lovable - IDE.md` — tagged `#status/tryout`, describes
  what Lovable *is* (endorses Supabase, integrates Firecrawl). Nothing about what Walter
  built with it.
- `Workflow Automation\Make.com.md` — tagged `#NoCode`, "a workflow automation tool with
  a GUI. It's comparable to n8n." Again: the tool, not the work.
- `OpenBolt - DEV.md` — same shape.

No project folders, no exported Make.com scenario blueprints, no screenshots. The
prototypes lived **inside those SaaS tools** and stayed there. That is the actual
finding, and it is not a documentation failure — it is what no-code *is*. The platform
owns the artifact. You get a URL, not a file.

---

## 2. Reframing the question

The issue poses a binary: include the unstructured data, or delete the two sectors.
I think both options are wrong, because they share a premise worth rejecting.

**The premise:** a sector is only legitimate if the nightly harvester can measure it.

That premise is not in the design. It crept in because GitHub was the first source
wired up and it works well. But `docs/00-vision.md` principle 1 says *"evidence, not
vibes — verifiable artifacts (commits, notes, declared milestones)."* Three sources,
and **two of them are not commits.** `data/milestones.yml` already exists, is
hand-authored, requires an `evidence` URL, and already carries three real entries.

So the honest question is not *"can we harvest no-code?"* It is:

> **What kind of evidence does each kind of work leave, and does the tree accept it?**

| Era | Artifact left behind | Harvestable? | Right instrument |
| --- | --- | --- | --- |
| Prompting in ChatGPT | conversation, mostly ephemeral | no | milestone |
| No-code (Lovable/Bolt/Make) | a running app inside a SaaS platform | no | milestone + evidence URL |
| Low-code (notebooks) | dated `.ipynb` files on a drive | **yes, with a second harvester** | file-mtime harvest |
| Pro-code (GitHub) | commits | yes, already working | commit harvest |

Deleting no-code and low-code would encode the *instrument's* blind spot as a *fact about
Walter's history*. That is precisely the error the discovery session just spent a whole
afternoon learning to avoid — the radial-envelope panel says it outright:

> work that avoids the dev setup never produces a commit, so a commit-derived view
> cannot observe it at all

The tree already knows how to say "this is missing." Deleting the sectors would make it
say something false instead: that the journey began with pro-code. It did not. It began
in 2023, in a notebook, two and a half years before the first GitHub commit
(2026-07-13).

---

## 3. Three options

### Option A — Delete both sectors

Drop `build.no-code` and `build.low-code`; the tree covers pro-code only.

- **For:** honest about the instrument; simplest; the taxonomy stops advertising two
  permanently flat flanks; the time-axis board already does this (8 sectors, not 10).
- **Against:** it deletes the *beginning of the story*. The 2023–2025 notebook era is
  the most relatable part of the journey for the audience the vision doc targets — the
  73% of Experimenters. They are not in pro-code. Telling them the tree starts at
  "Claude Code and GitHub" removes the rung they would actually step on.
- **Cost:** `default-v1` is append-only (`generator/taxonomy.mjs` header). Removing
  sectors requires `default-v2` plus a migration note. Not free.

### Option B — Backfill everything as hand-authored data

Reconstruct the no-code and low-code projects into a hand-written log.

- **For:** complete story.
- **Against:** for no-code, there is nothing to reconstruct *from* — it would be memory,
  not evidence. That directly violates principle 1 and is exactly the "inflated by
  hand-waving" failure the ADR-0004 integrity rule exists to prevent. The tree's whole
  value is that it cannot be inflated.

### Option C — Two evidence tiers, one tree ← **recommended**

Keep both sectors. Accept that they are fed differently, and make that visible rather
than hiding it.

**C1 — Low-code gets a real harvester.** A second harvest source reading a configured
local/Drive path for `.ipynb` files, emitting one activity event per notebook per
modification date. Same growth-log schema, different `source` field (`notebook` vs
`commit`). This is genuinely harvested evidence — dated files, not recollection — so it
satisfies principle 1. It yields ~29 events across 21 months and would grow the low-code
flank into a real bough with a natural taper: dense in early 2024, thinning through 2025,
stopping in June 2025 when pro-code takes over.

**C2 — No-code gets milestones only.** Three or four `data/milestones.yml` entries with
evidence URLs — the Lovable app, the Bolt prototype, the Make.com scenario. If a
deployed URL still resolves, that is the evidence. If not, a dated Obsidian note or a
screenshot committed to the repo works. This is what milestones are *for*: declared,
evidenced, ceremonial. No-code becomes a short, real, honestly-thin limb.

**C3 — Make the sparseness legible.** Render sectors fed only by milestones differently
— a limb with blossoms but few leaves. Leaves come from activity; a sector with real
milestones and no harvestable activity should look *deliberately* sparse, not dead. This
is already close to ADR-0009's "activity fills the band" and does not fight the metaphor:
in a real acacia, a limb that stopped growing years ago is still structurally there.

**The payoff is the shape itself.** Under C, the BUILD limb tells the story the issue
narrates in prose: no-code starts first and stays stubby (three tryouts, a ceiling hit
fast — *"I felt very limited"*), low-code grows a real bough through 2024 and tapers
mid-2025, pro-code erupts late and overtakes everything. **That is a visible succession,
and it is the single most legible learning narrative in the whole dataset.** Delete two
sectors and you delete the succession — you are left with one limb that was always tall,
which says nothing about learning at all.

---

## 4. On the Obsidian vault

Worth flagging separately: `H:\My Drive\Obsidian\Obsidian-AI\` is a substantial,
tag-structured vault (`#domain/tools`, `#status/tryout`, `#NoCode`, `#WorkflowAutomation`),
and `tree.config.yml` already reserves `vault.tag-map` for "Obsidian tag mapping, notes
only, phase 4."

The vault will not fix the no-code gap — those notes describe tools, not projects. But
it is a real second evidence source for the *roots* (ADR-0002, private knowledge), and
the tag vocabulary is already close to the taxonomy. That is a phase-4 conversation, not
this issue, but it is closer to hand than the config comment implies.

---

## 5. Recommendation

**Option C.** Concretely, in order:

1. **Keep the sectors.** No `default-v2` migration needed; this is the cheapest path
   and the append-only rule stays intact.
2. **Author 3–4 no-code milestones** in `data/milestones.yml` with whatever evidence
   URLs still resolve. Walter's to write — I should not invent them.
3. **Spec the notebook harvester** (C1) as its own issue. It is a contained piece of
   work: walk a configured path, read `.ipynb` mtimes, emit growth-log events with
   `source: notebook`.
4. **Then revisit the renderer** (C3) once there is real low-code data to look at —
   the sparse-limb treatment is easier to judge against a rendered bough than in the
   abstract.

The one thing I would not do is delete the sectors. The tree's most valuable property
is that its shape can be trusted, and a shape that begins in mid-2026 is not the shape
of this learning journey.

### Open questions for Walter

1. **Do the no-code prototypes still exist anywhere?** A live Lovable/Bolt URL or a
   Make.com scenario still in the account would upgrade C2 from "declared" to
   "linked evidence."
2. **Is the notebook set on `H:` complete,** or is there more on the local machine or
   in Google Colab's cloud storage? The harvester's value scales with coverage.
3. **Should the notebook harvester also read the `Anaconda\` working folder?** It has a
   README and Python files but no readable git history — file mtimes only.
4. **Was there Make.com work beyond the one tryout?** It is tagged `#NoCode` and sits
   under `04-Agents-Automation\Workflow Automation\`, so depending on what was built it
   might belong in `automate.workflows` rather than `build.no-code` — which would make
   the no-code limb even shorter, and that is fine if it is true.
