#!/usr/bin/env node
// backfill-notebooks.mjs — ONE-TIME import of the low-code era into the growth log.
//
// Why this is a script and not a harvest source (issue #58, option C1):
// the notebooks live on a Google Drive mount (H:\My Drive) that exists on Walter's
// machine and nowhere else — not in GitHub Actions. They are also finished history:
// the last one is June 2025, when pro-code took over. So this runs ONCE, locally,
// and its output is committed as static historical information. It is not wired
// into harvest.yml and must never be.
//
// Evidence model. These events are harvested from dated files, not recalled — which
// is what keeps them on the right side of vision principle 1 ("evidence, not vibes").
// But the evidence is weaker than a commit, and the log says so: every event carries
// `source: "notebook"` and `attrs.evidence: "file-mtime"`, so a reader can always tell
// a filesystem timestamp from a git SHA.
//
// What it does NOT emit:
//   - .ipynb_checkpoints/ autosaves — Jupyter's editor noise, not authored work
//   - byte-identical copies of the same notebook in two folders (Drive sync artifacts)
//   - notebook CONTENT of any kind. Only a name, a date, a sector and a size bucket.
//     Cell source, outputs and any embedded keys stay on the drive (docs/03 §6).
//
// Usage:
//   node harvester/backfill-notebooks.mjs --dry-run     # print events, write nothing
//   node harvester/backfill-notebooks.mjs               # append to data/growth-log.jsonl
//   node harvester/backfill-notebooks.mjs --roots "D:\a,D:\b"

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = resolve(repoRoot, 'data/growth-log.jsonl');

const DEFAULT_ROOTS = [
  'H:\\My Drive\\Colab Notebooks',
  'H:\\My Drive\\Colab-Notebooks',
  'H:\\My Drive\\Anaconda',
  'H:\\My Drive\\Tools AI',
];

// Sector routing. The low-code era is not one topic: the Flickr→Instagram notebooks
// are automation, the Knowledge-Graph and schema ones are SEO, the Gemini image one
// is image work. Routing by path/name keeps that texture instead of dumping 25 events
// onto a single flank. Order matters — first match wins, so the more specific tool
// names come before the generic words they contain.
//
// NOTE on build.low-code: none of these route there, and that is deliberate. Per the
// ADR-0003 precedent ("local vs cloud is an attribute, not a sector"), the tooling
// mode a piece of work was done IN cuts across every field of practice — a notebook
// can be low-code AND about SEO. Making it a sector would steal the event from its
// real field and flatten 25 notebooks into one meaningless spike. So the era is
// carried by `attrs.tooling: "low-code"` on every event, and the sector stays honest
// about the subject. See docs/research/no-code-low-code-taxonomy-analysis.md §5.
const ROUTES = [
  [/knowledge.?graph|google-kg|schema|switzerland-tourism|meteoblue/i, 'distribute.seo'],
  [/linkedin/i,                                                        'create.copy'],
  // flickr/instagram before the image words: getListFlickrPhotos is an API call to
  // build a posting queue, not image work — "Photos" here is the noun in an endpoint.
  [/instagram|flickr|posting|uploader|email-extractor/i,               'automate.workflows'],
  [/gemini|vertex|image.?recognition|generate_images/i,                'create.images'],
  [/agent|multi-agent|analyzer|recommender|content_analyzer/i,         'automate.workflows'],
];
// Unrouted notebooks fall to low-code as the honest "I know it was this era but not
// what field" bucket — the same role `unclassified` plays for repos.
const FALLBACK_SECTOR = 'build.low-code';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rootsArg = args.find((a) => a.startsWith('--roots'));
const roots = rootsArg
  ? (rootsArg.includes('=') ? rootsArg.split('=')[1] : args[args.indexOf(rootsArg) + 1])
      .split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ROOTS;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    // Jupyter's autosave sidecar: a *-checkpoint.ipynb per edit session. Counting it
    // would double every notebook and inflate the era it is meant to measure.
    if (e.isDirectory()) { if (e.name !== '.ipynb_checkpoints') walk(p, out); continue; }
    if (e.name.toLowerCase().endsWith('.ipynb')) out.push(p);
  }
  return out;
}

function sectorFor(path) {
  const hay = path.replace(/\\/g, '/');
  for (const [re, sector] of ROUTES) if (re.test(hay)) return sector;
  return FALLBACK_SECTOR;
}

// Weight from size, log-damped and clamped — mirrors how commit weight is derived
// (a 4 MB notebook is a big output blob, not 500x the learning of a 8 KB one).
function weightFor(bytes) {
  const kb = Math.max(1, bytes / 1024);
  return Math.round(Math.min(3.0, 0.6 + Math.log10(kb) * 0.8) * 100) / 100;
}

const files = roots.flatMap((r) => (existsSync(r) ? walk(r) : []));
if (!files.length) {
  console.error(`backfill: no .ipynb found under:\n  ${roots.join('\n  ')}`);
  console.error('If the Drive letter differs on this machine, pass --roots "X:\\path,Y:\\path".');
  process.exit(1);
}

// Dedup by CONTENT hash: the same notebook exists under both Anaconda\Repos and
// Tools AI because Drive was reorganized, not because it was authored twice. Keep
// the earliest-dated copy — that is when the work actually happened.
const byHash = new Map();
for (const f of files) {
  let st, hash;
  try {
    st = statSync(f);
    hash = createHash('sha256').update(readFileSync(f)).digest('hex');
  } catch { continue; }
  // A notebook has a SPAN, not an instant: created in January, last run in June.
  // Use the EARLIER of ctime/mtime as the event date — the tree is about when work
  // started, and mtime on a synced drive can be a re-sync rather than an edit.
  const ts = new Date(Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs));
  const prev = byHash.get(hash);
  if (!prev || ts < prev.ts) byHash.set(hash, { path: f, ts, size: st.size });
}

const events = [...byHash.values()]
  .map(({ path, ts, size }) => {
    const name = basename(path, '.ipynb');
    return {
      // Deterministic id from the content hash prefix, so re-running the backfill
      // dedups against what is already in the log instead of duplicating it.
      id: `nb:${createHash('sha256').update(name + ts.toISOString()).digest('hex').slice(0, 12)}`,
      ts: ts.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      source: 'notebook',
      kind: 'commit',
      sector: sectorFor(path),
      project: name,
      weight: weightFor(size),
      // evidence: file-mtime marks this as weaker provenance than a git SHA.
      // private: true — these are local files, never published; they may lift
      // geometry as an aggregate but their names must not reach tree.json
      // (ADR-0009 / ADR-0010, same contract as private repos).
      // tooling: the era marker. This is what makes the low-code period visible
      // without stealing events from their real sector (ADR-0003 precedent).
      attrs: { runtime: 'local', lang: 'Python', evidence: 'file-mtime', tooling: 'low-code' },
      private: true,
    };
  })
  .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

const bySector = {};
for (const e of events) bySector[e.sector] = (bySector[e.sector] || 0) + 1;
console.error(`backfill: ${files.length} file(s) scanned -> ${events.length} unique notebook(s)`);
console.error(`  span    ${events[0].ts.slice(0, 10)} -> ${events[events.length - 1].ts.slice(0, 10)}`);
console.error(`  sectors ${Object.entries(bySector).map(([s, n]) => `${s} (${n})`).join(', ')}`);

if (dryRun) {
  for (const e of events) process.stdout.write(JSON.stringify(e) + '\n');
  console.error('backfill: dry-run, nothing written.');
  process.exit(0);
}

const existing = existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : [];
const haveIds = new Set(existing.map((l) => { try { return JSON.parse(l).id; } catch { return null; } }));
const fresh = events.filter((e) => !haveIds.has(e.id));
if (!fresh.length) {
  console.error('backfill: every notebook event is already in the log — nothing to do.');
  process.exit(0);
}

const merged = [...existing, ...fresh.map((e) => JSON.stringify(e))]
  .map((l) => ({ l, ts: JSON.parse(l).ts, id: JSON.parse(l).id }))
  .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0) || (a.id < b.id ? -1 : 1))
  .map((r) => r.l);

writeFileSync(LOG, merged.join('\n') + '\n');
console.error(`backfill: appended ${fresh.length} event(s) -> ${LOG}`);
console.error('Now run: node generator/build.mjs');
