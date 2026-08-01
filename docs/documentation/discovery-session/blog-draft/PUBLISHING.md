# Publishing notes — discovery-session blog post

Target: webmemo.ch, via `markdown-wp-wm-linkedin-article-publisher`.

## House style followed

Matched the published posts in `ai-periodic-cube/docs/blog-posts/`:
`# Title` → italic dek → `---` → `##` sections. **No frontmatter** — those posts have
none, and the parser treats it as optional (title falls back to the first `# ` H1).

Filename is the slug: `visualizing-my-ai-learning-journey-with-ai.md`.
Rename the file to change the URL.

## Publish command

Slug is set from the filename **only in `--directory` mode**. In `--file` mode it is
left undefined and WordPress derives it from the title — so use `-d`:

```bash
cd c:\Users\w_sch\source\repos\markdown-wp-wm-linkedin-article-publisher
npx tsx src/cli/index.ts publish \
  -d ..\ai-learning-tree\docs\documentation\discovery-session\blog-draft\ \
  --platforms wordpress \
  --layout post-100-sidebar
```

`--platforms` defaults to `wordpress,linkedin,medium`, so pass it explicitly unless you
want the LinkedIn post to fire too. Note this publishes *every* `.md` in the folder —
`PUBLISHING.md` included. Move it out, or point `-f` at the single file and accept the
title-derived slug.

## Images — the part that needs a decision

The draft currently has **no images embedded**. This is deliberate; the publisher has
two constraints that make it a judgement call:

1. **Image paths resolve against `process.cwd()`**, not the markdown file's location
   (`wordpress-publisher.ts:105`). Relative paths like `../01-variant-A.png` will
   silently fail to upload from the publisher repo root — the post still publishes,
   with broken links.
2. **Captions are not supported.** No `<figure>`/`<figcaption>`, no Elementor image
   widget. An image becomes a bare `<img>` inside a text block, and no `alt_text` is
   sent to the media library.

Since this post is *about* eighteen images, captions matter. Two options:

- **Upload manually in WP admin** and paste the resulting URLs in — remote `http` URLs
  pass through untouched and you get real captions from the WP editor. Recommended.
- **Embed with absolute paths** if you want the uploader to do the work:
  `![Twelve form directions](c:/Users/w_sch/source/repos/ai-learning-tree/docs/documentation/discovery-session/05-moodboard-twelve-form-directions.png)`
  then add captions by hand afterwards.

Suggested placements, one per act:

| After section | Image |
|---|---|
| Act One | `04-trunk-rings-refined-the-funnel-problem.png` — the funnel that can't be a tree |
| Act Two | `05-moodboard-twelve-form-directions.png` — **the hero image** |
| Act Three | `07-envelope-glass-skin-and-rosettes.png` and/or `09-envelope-final-eight-sectors-respaced.png` |
| Act Four | `10-multi-axis-three-attribution-models.png` — three models side by side |
| Act Five | `12-rollup-body-boxes-vs-envelope.png` and `14-one-box-per-quarter-the-summary-unit.png` |
| Act Six | `17-final-whole-stack.png` — the finished object |

**Featured image:** the publisher never sets `featured_media`. Set it manually in WP
admin — use `05-moodboard-twelve-form-directions.png` (most distinctive) or
`17-final-whole-stack.png` (cleanest as a thumbnail).

## Set manually after publishing

Categories and tags are **not implemented** in the publisher — `postData` contains only
title, content, status, excerpt, slug, meta. The post lands in the WP default category.

From the controlled vocabulary in the publisher's `PRD.md`:

- **Category:** `Visualisierung` (or `Generative AI` / `Innovation`)
- **Tags:** `3D`, `Visualisierung`, `Analytics`, `Anleitung`

## Excerpt / meta description

No `excerpt:` is set, so the publisher auto-generates one from the first 150 characters
of stripped body text. That would produce a fragment of the dek. If you want control,
either set it in WP admin or add minimal frontmatter — note that adding `title:` while
keeping the body H1 would render the title twice, so drop the H1 if you go that route:

```yaml
---
excerpt: "1,749 commits, eighteen rejected 3D forms, and one sentence from an AI that explained why three of them failed."
---
```

## Open questions for Walter

1. **Dek wording** — currently *"What happens when you point a visualization at your own
   commit history — and let the AI argue back about which shapes lie."* Alternatives if
   you want it less combative.
2. **Closing CTA** links to `webmemo.ch/kontakt/` — verify that path, or swap for a
   newsletter/LinkedIn follow.
3. **Is the live tree linkable yet?** The post never links to a running demo. If
   `webmemo-code.github.io/ai-learning-tree/` is presentable, an early link would
   convert far better than a text-only read.
4. **LinkedIn version** — the publisher can cross-post, but this draft is ~1,800 words
   and reads as a long-form article. A separate 300-word LinkedIn teaser pointing back
   would likely outperform an auto-cross-post.
