#!/usr/bin/env node
/**
 * scripts/sync-sw.js — keep sw.js precache in sync with built assets.
 *
 *   node scripts/sync-sw.js          # patch sw.js: refresh dist hashes + cache name, then verify
 *   node scripts/sync-sw.js --check  # verify only (no write); exit 1 if out of sync or a file is missing
 *
 * Why: after a Vite rebuild the hashed dist filenames change, but sw.js's
 * precache list still referenced the old names — the "fixed-but-not-live" class
 * of bug (npm test passed while the Service Worker pointed at a deleted file).
 * This rewrites those entries from the actual dist output and derives CACHE_NAME
 * from a content hash of every precached file, so the cache busts whenever any
 * asset changes and never busts when nothing changed (idempotent).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'sw.js');
const CHECK = process.argv.includes('--check');

const VITE_MODULES = ['spreadsheet', 'script-editor'];

// All current dist/<mod>/assets/*.js|*.css for a Vite module — entry files
// (referenced from index.html via <script src>/<link href>) PLUS every other
// hashed chunk sitting next to them (e.g. dynamically-imported storage-*.js).
// Scanning the directory (rather than grabbing the first match) is what makes
// this correct when a module has more than one asset of the same extension.
function distModuleAssets(mod) {
  const modDir = join(ROOT, 'dist', mod);
  const htmlPath = join(modDir, 'index.html');
  const assetsDir = join(modDir, 'assets');
  if (!existsSync(htmlPath) || !existsSync(assetsDir)) return null;

  const html = readFileSync(htmlPath, 'utf-8');
  const referenced = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']\.\/assets\/([^"']+)["']/g)) referenced.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href=["']\.\/assets\/([^"']+)["']/g)) referenced.add(m[1]);

  const onDisk = readdirSync(assetsDir).filter(n => n.endsWith('.js') || n.endsWith('.css'));

  const missingEntries = [...referenced].filter(f => !onDisk.includes(f));
  if (missingEntries.length) {
    console.error(`sync-sw: dist/${mod}/index.html references missing asset(s): ${missingEntries.join(', ')}`);
    process.exit(1);
  }

  return [...new Set([...referenced, ...onDisk])].sort()
    .map(f => `./dist/${mod}/assets/${f}`);
}

const TEXT_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.jsonl', '.md', '.svg', '.txt', '.xml',
]);

function hashFileContent(filePath) {
  const bytes = readFileSync(filePath);
  if (!TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) return bytes;
  return Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

let sw = readFileSync(SW, 'utf-8');
const original = sw;
const EOL = sw.includes('\r\n') ? '\r\n' : '\n';

// 1. Replace the dist/<mod>/assets/* block (everything right after the
//    module's index.html entry) with the full, current set of hashed assets.
for (const mod of VITE_MODULES) {
  const assets = distModuleAssets(mod);
  if (!assets) continue;
  const escMod = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `('\\./dist/${escMod}/index\\.html',\\r?\\n)((?:[ \\t]*'\\./dist/${escMod}/assets/[^']*',\\r?\\n)*)`
  );
  const m = sw.match(re);
  if (!m) continue;
  const indentMatch = m[2].match(/^([ \t]*)/);
  const indent = indentMatch && indentMatch[1] ? indentMatch[1] : '  ';
  const newBlock = assets.map(a => `${indent}'${a}',${EOL}`).join('');
  sw = sw.replace(re, m[1] + newBlock);
}

// 2. Verify every (non-icon) precached file exists.
const list = sw.slice(sw.indexOf('LOCAL_ASSETS'), sw.indexOf('];', sw.indexOf('LOCAL_ASSETS')));
const assets = [...list.matchAll(/'(\.\/[^']+)'/g)].map(m => m[1]).filter(p => p !== './');
const optional = p => p.includes('/icons/');
const missing = assets.filter(p => !optional(p) && !existsSync(join(ROOT, p)));

// 2b. Reverse check: every dist/<mod>/assets/*.js|*.css that actually exists
//     on disk must be represented in the precache list — catches new chunks
//     (e.g. a fresh dynamic-import split) that step 1 didn't have a chance to
//     add because the working tree wasn't re-synced after the build.
const extra = [];
for (const mod of VITE_MODULES) {
  const assetsDir = join(ROOT, 'dist', mod, 'assets');
  if (!existsSync(assetsDir)) continue;
  for (const f of readdirSync(assetsDir)) {
    if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
    const rel = `./dist/${mod}/assets/${f}`;
    if (!assets.includes(rel)) extra.push(rel);
  }
}

// 3. Derive CACHE_NAME from a content hash of all precached files (excluding sw.js itself).
const h = createHash('sha256');
for (const p of assets) {
  if (p === './sw.js') continue;
  const fp = join(ROOT, p);
  if (existsSync(fp)) { h.update(p); h.update(hashFileContent(fp)); }
}
const cacheName = 'akasha-library-' + h.digest('hex').slice(0, 10);
sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${cacheName}';`);

// 4. Act / report.
if (missing.length) {
  console.error(`SW precache references ${missing.length} missing file(s):`);
  missing.forEach(m => console.error('  ' + m));
  process.exit(1);
}
if (CHECK) {
  if (extra.length) {
    console.error(`SW precache is missing ${extra.length} built asset(s) that exist in dist/:`);
    extra.forEach(m => console.error('  ' + m));
    console.error('Run: node scripts/sync-sw.js');
    process.exit(1);
  }
  if (sw !== original) {
    console.error('sw.js is OUT OF SYNC with built assets. Run: node scripts/sync-sw.js');
    process.exit(1);
  }
  console.log(`SW-INTEGRITY OK — ${assets.length} assets, ${cacheName}`);
} else if (sw !== original) {
  writeFileSync(SW, sw);
  console.log(`sw.js synced — ${assets.length} assets, ${cacheName}`);
} else {
  console.log(`sw.js already in sync — ${assets.length} assets, ${cacheName}`);
}
