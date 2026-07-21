#!/usr/bin/env node
// capture-hero.mjs — shoot the acacia viewer headlessly and write the hero PNG.
//
//   node .github/scripts/capture-hero.mjs <out.png>
//
// Run by the Pages deploy workflow AFTER checkout, so the shot always shows the
// tree.json being deployed — including each nightly harvest's growth. The PNG
// is written into the workspace (assets/, gitignored) and shipped inside the
// Pages artifact only; it is never committed, so git history carries no
// nightly binary churn. The README embeds the deployed URL.
//
// Playwright is installed by the workflow OUTSIDE the workspace (npm --prefix)
// so node_modules never leaks into the Pages artifact; PW_PREFIX points there.
// SwiftShader flags give the runner a software-GL WebGL context.
//
// Local testing: PW_PREFIX=<dir-with-node_modules> PW_EXECUTABLE=<chromium>
// (and optionally PW_CDN_LOCAL=<dir with three.module.js + examples/jsm/> to
// serve the CDN modules locally when outbound network is restricted).

import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const PW_PREFIX = process.env.PW_PREFIX || '/tmp/pw';
const require = createRequire(PW_PREFIX.endsWith('/') ? PW_PREFIX : PW_PREFIX + '/');
const { chromium } = require('playwright-core');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2] || 'assets/tree-latest.png');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(repoRoot, p === '/' ? 'index.html' : p);
  if (!f.startsWith(repoRoot) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(8123, r));

const browser = await chromium.launch({
  executablePath: process.env.PW_EXECUTABLE || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

// optional local CDN substitute for restricted-network test runs
if (process.env.PW_CDN_LOCAL) {
  const cdn = process.env.PW_CDN_LOCAL;
  await page.route('https://cdn.jsdelivr.net/**', (route) => {
    const u = new URL(route.request().url());
    let local = null;
    if (u.pathname.endsWith('/build/three.module.js')) local = join(cdn, 'three.module.js');
    else if (u.pathname.endsWith('/build/three.core.js')) local = join(cdn, 'three.core.js');
    else { const m = u.pathname.match(/examples\/jsm\/(.+)$/); if (m) local = join(cdn, 'examples/jsm', m[1]); }
    if (local && existsSync(local)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(local, 'utf8') });
    return route.fulfill({ status: 404, body: '' });
  });
}

let errors = 0;
page.on('pageerror', (e) => { errors++; console.error('pageerror:', String(e).slice(0, 300)); });
await page.goto('http://127.0.0.1:8123/prototypes/acacia-sketch/index.html?hud=0&dpr=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(15000); // tree.json fetch + shader warmup + intro easing fully settled
if (errors) { console.error(`capture aborted: ${errors} page error(s)`); process.exit(1); }
await page.screenshot({ path: out });
await browser.close();
srv.close();
console.log('hero captured →', out);
