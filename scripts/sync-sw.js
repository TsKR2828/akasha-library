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

function distAsset(mod, ext) {
  const dir = join(ROOT, 'dist', mod, 'assets');
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find(n => n.endsWith(ext));
  return f ? `./dist/${mod}/assets/${f}` : null;
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

// 1. Point the hashed dist entries at the actual current filenames.
for (const [mod, ext] of [['script-editor', '.js'], ['script-editor', '.css'],
                          ['spreadsheet', '.js'], ['spreadsheet', '.css']]) {
  const actual = distAsset(mod, ext);
  if (!actual) continue;
  const re = new RegExp(`'\\./dist/${mod}/assets/[^']*\\${ext}'`, 'g');
  sw = sw.replace(re, `'${actual}'`);
}

// 2. Verify every (non-icon) precached file exists.
const list = sw.slice(sw.indexOf('LOCAL_ASSETS'), sw.indexOf('];', sw.indexOf('LOCAL_ASSETS')));
const assets = [...list.matchAll(/'(\.\/[^']+)'/g)].map(m => m[1]).filter(p => p !== './');
const optional = p => p.includes('/icons/');
const missing = assets.filter(p => !optional(p) && !existsSync(join(ROOT, p)));

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
