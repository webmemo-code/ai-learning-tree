# Quickstart — run the tree on your own computer

**You probably don't need this page.** If you just want to *see* the tree, open
the **[live viewer](https://webmemo-code.github.io/ai-learning-tree/)** — it's a
normal web page, always showing the latest collected work, nothing to install.

This page is for when you want a copy on your own machine: to poke at the
viewer, preview a change to the settings file, or look at the tree without an
internet connection. It assumes you've never done this before, so it spells
everything out.

Rough time: **10 minutes** the first time, half a minute every time after that.

## What you'll need

| | Why | Do I need it? |
| --- | --- | --- |
| A **terminal** | To type the two commands below | Yes — it's already on your computer (Windows: *Terminal* or *PowerShell*; macOS: *Terminal*; Linux: you know where it is) |
| **Python** | To start a tiny web server on your own machine | Yes — macOS and Linux have it; on Windows, install it from [python.org](https://www.python.org/downloads/) if `python` isn't found |
| **Node 22 or newer** | Only for rebuilding the tree data and running the tests | **No**, not for just looking. Get it from [nodejs.org](https://nodejs.org/) if you need it later |
| **Git** | To copy the project down and keep it up to date | Optional — see the two ways below |

Good news: there is **nothing to install inside the project**. No `npm install`,
no build step, no accounts. The project deliberately has zero dependencies, and
the finished tree data (`data/tree.json`) is already included.

### A word on the terminal

The terminal is a window where you type commands instead of clicking. Two
things are worth knowing:

- **`cd something`** means "go into the folder called *something*".
- You run a command by typing it and pressing Enter. Copy-paste works.

That's genuinely all you need for this page.

## Step 1 — get a copy of the project

**Option A — with Git** (best if you'll come back to this; one command updates
your copy later):

```
git clone https://github.com/webmemo-code/ai-learning-tree.git
cd ai-learning-tree
```

The first line downloads the project into a new folder; the second moves you
into it. To update your copy later, run `git pull` from inside that folder.

**Option B — without Git** (perfectly fine for a look around): on the
[project page](https://github.com/webmemo-code/ai-learning-tree), click the
green **Code** button → **Download ZIP**, then unpack it. In your terminal, `cd`
into the unpacked folder. To update later, download it again.

Either way, you should now be *inside* the project folder — the one containing
`README.md`, `data/` and `prototypes/`. Check with `ls` (macOS/Linux) or `dir`
(Windows); if you don't see those, you're in the wrong place.

## Step 2 — start the little web server

Still inside the project folder, type:

```
python -m http.server 8123
```

If that says "command not found", try `python3` instead:

```
python3 -m http.server 8123
```

Nothing dramatic happens — you'll see a line like *"Serving HTTP on ... port
8123"*. That's success. **Leave this window open**; the server runs for as long
as it does. (`Ctrl+C` stops it when you're done.)

## Step 3 — open it in your browser

Go to **<http://127.0.0.1:8123/>**. The tree appears. That address just means
"my own computer, door number 8123" — nothing is being sent over the internet.

> ### The one rule: start the server from the project's top folder
>
> The viewer reaches back up the folders to find `data/tree.json`, so the server
> has to be started from the top of the project — where `data/` and
> `prototypes/` sit side by side. If you start it *inside* one of the sketch
> folders, or double-click the HTML file to open it directly, you'll get a
> polite error panel instead of a tree. If that happens: stop the server with
> `Ctrl+C`, `cd` back up to the project folder, and start it again.

## What else is in there

Once the server is running, these addresses work too:

| Address (on port 8123) | What you'll see |
| --- | --- |
| `/` | Jumps straight to the main tree viewer — the same thing as the live site |
| `/prototypes/acacia-sketch/` | **The main viewer**: the acacia at night, the replay, the timeline, filters, the roots reveal, sound, clip recording |
| `/prototypes/grove-sketch/` | A flat map, seen from above, of an imaginary grove of several trees |
| `/prototypes/grove-walk/` | A grove you can walk through: drag to look around, W/A/S/D keys to move |
| `/prototypes/acacia-look/` | A still concept board — the only one that also works by just double-clicking the file |
| `/prototypes/mood-sketch/` | Retired ([#46](https://github.com/webmemo-code/ai-learning-tree/issues/46)) — sends you to the main viewer |

## Optional: tweak the viewer with the address bar

You can switch a few things on and off by adding them to the end of the
address. Add the first one with a `?`, any further ones with an `&` — for
example `…/acacia-sketch/?data=mock&reel=1`.

| Add this | What it does |
| --- | --- |
| `?data=mock` | Shows a made-up, fuller example tree instead of the real one — handy for seeing what a grown tree looks like |
| `?reel=1` | Starts the 30-second replay straight away |
| `?roots=1` | Starts underground, in the roots view |
| `?hud=0` | Hides all the on-screen panels — a clean picture for a screenshot |
| `?filter=<field>` | Starts with one field highlighted, e.g. `?filter=seo` or `?filter=pro-code` |
| `?dpr=1` | Draws in lower resolution — try this if the animation stutters on an older machine |

The walkable grove also takes `?grove=<address>` (to walk a real grove, e.g.
`?grove=../../grove/fixtures/demo-grove`) and `?stroll=0` (stops the camera
wandering on its own).

## Optional: rebuild the tree after changing something

**Skip this unless you've edited something.** The tree data that ships with the
project is already up to date. You only need this after changing
`tree.config.yml` (the settings file), the growth log, or the program that
builds the tree — and it needs Node installed.

```
node generator/build.mjs
```

That reads the growth log plus the settings and writes a fresh
`data/tree.json`. Reload the browser tab afterwards to see the result.

To check you haven't broken anything, run the same tests the project runs
automatically on every change:

```
node generator/test-determinism.mjs    # the important one: same input ⇒ identical tree
node generator/test-contribution.mjs
node harvester/test-harvest.mjs
node harvester/test-vault.mjs
node grove/test-place.mjs
node grove/test-ceremony.mjs
```

Each prints its own result. No complaints means all good.

## When something goes wrong

| What you see | What it means → what to do |
| --- | --- |
| "Couldn't load the tree · HTTP 404" | The server was started in the wrong folder → stop it (`Ctrl+C`), `cd` to the project's top folder, start it again |
| An error panel mentioning `file://` | You opened the HTML file by double-clicking → go back to Step 2 and view it through the server instead |
| `python: command not found` | Try `python3` instead; on Windows, install Python from [python.org](https://www.python.org/downloads/) |
| "Address already in use" | Something else is using door 8123 → pick another number: `python -m http.server 8124`, then visit `http://127.0.0.1:8124/` |
| Your change to the settings file doesn't show up | The tree data is built, not read live → run `node generator/build.mjs`, then reload the page |
| The build complains after a settings edit | The settings reader is strict and hand-written → read the notes at the top of [tree.config.yml](tree.config.yml). On Windows, keep the file's line endings as they are (the project enforces this via `.gitattributes`) |

Still stuck? Open an
[issue](https://github.com/webmemo-code/ai-learning-tree/issues) — a
description of what you typed and what you saw is enough.
