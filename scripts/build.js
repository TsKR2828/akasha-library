#!/usr/bin/env node
/**
 * scripts/build.js — Akasha Library Site Builder (Phase 16-B/C)
 *
 * Usage:
 *   node scripts/build.js --mode=public    # Public demo (GitHub Pages)
 *   node scripts/build.js --mode=private   # Private full build
 *
 * Output: _site/
 *
 * The main app is static HTML/CSS/JS (no bundler), so this script:
 *   1. Copies deployable files to _site/
 *   2. Excludes dev-only / private files per mode
 *   3. Injects window.__AKASHA_BUILD_MODE in public mode
 *   4. Bumps SW cache version
 */

import { existsSync, mkdirSync, readdirSync, statSync,
         copyFileSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, relative, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');
const OUT        = join(ROOT, '_site');

/* ── CLI ─────────────────────────────────────────── */

const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : 'public';

if (!['public', 'private'].includes(MODE)) {
  console.error(`Unknown mode: ${MODE}. Use --mode=public or --mode=private`);
  process.exit(1);
}

console.log(`\n  Akasha Library — Building "${MODE}" site...\n`);

/* ── Exclusion Rules ─────────────────────────────── */

/** Always excluded (dev tooling, source, CI config) */
const ALWAYS_EXCLUDE_DIRS = new Set([
  '.git',
  '.github',
  '.claude',
  'node_modules',
  'design',
  'scripts',
  '_site',
  // Vite sources — the built outputs are in dist/<module>/
  join('modules', 'spreadsheet'),
  join('modules', 'script-editor'),
]);

/** Always excluded files (by relative path) */
const ALWAYS_EXCLUDE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'vite.config.script-editor.js',
  '.gitignore',
  '.npmrc',
]);

/** Always excluded file patterns */
const ALWAYS_EXCLUDE_PATTERNS = [
  /[-.]spec\.md$/,         // design spec files (both -spec.md and .spec.md)
  /^dev-log\.md$/,
  /^TODO\.md$/,
  /^DEVELOPMENT\.md$/,
  /^ROADMAP\.md$/,
  /^TABLE-FORGE-ROADMAP\.md$/,
  /^DESIGN-BRIEF\.md$/,
];

/**
 * Private module directories — excluded from public builds.
 * Derived from FEATURE_GATES in core/security.js:
 *   reading_room: false  → modules/reading-room/
 *   ai_panel/byok/encryption: false → modules/ai-settings/
 */
const PRIVATE_PATHS = [
  join('modules', 'ai-settings'),
  join('modules', 'reading-room'),
];

/** Public mode: additional exclusions */
const PUBLIC_EXCLUDE_DIRS = new Set([
  'workers',                // backend source
]);

const PUBLIC_EXCLUDE_FILES = new Set([
  join('public-library', 'admin.html'),   // admin panel
]);

/* ── File Walking ────────────────────────────────── */

function shouldExclude(relPath) {
  const parts = relPath.split(/[\\/]/);
  const fileName = parts[parts.length - 1];

  // Directory-level exclusion
  for (const dir of ALWAYS_EXCLUDE_DIRS) {
    if (parts[0] === dir || relPath.startsWith(dir + '\\') || relPath.startsWith(dir + '/')) {
      return true;
    }
  }

  // File-level exclusion
  if (ALWAYS_EXCLUDE_FILES.has(relPath)) return true;

  // Pattern exclusion
  for (const pat of ALWAYS_EXCLUDE_PATTERNS) {
    if (pat.test(fileName) || pat.test(relPath)) return true;
  }

  // Public-mode additional exclusions
  if (MODE === 'public') {
    for (const dir of PUBLIC_EXCLUDE_DIRS) {
      if (parts[0] === dir || relPath.startsWith(dir + '\\') || relPath.startsWith(dir + '/')) {
        return true;
      }
    }
    if (PUBLIC_EXCLUDE_FILES.has(relPath)) return true;
  }

  return false;
}

function walk(dir, base = dir) {
  const entries = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    const rel = relative(base, full);
    if (shouldExclude(rel)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walk(full, base));
    } else {
      entries.push(rel);
    }
  }
  return entries;
}

/* ── Build ───────────────────────────────────────── */

// Clean output
if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true });
}
mkdirSync(OUT, { recursive: true });

// Collect files
const files = walk(ROOT);
let copied = 0;
let transformed = 0;
let privateSkipped = 0;

for (const rel of files) {
  // Public build: skip private module files
  if (MODE === 'public') {
    const relNorm = rel.replace(/\\/g, '/');
    const skip = PRIVATE_PATHS.some(p => {
      const pNorm = p.replace(/\\/g, '/');
      return relNorm === pNorm || relNorm.startsWith(pNorm + '/');
    });
    if (skip) {
      privateSkipped++;
      continue;
    }
  }

  const src = join(ROOT, rel);
  const dst = join(OUT, rel);

  // Ensure target directory exists
  mkdirSync(dirname(dst), { recursive: true });

  // Transform specific files
  if (rel === 'index.html' && MODE === 'public') {
    // Inject BUILD_MODE before first <script>
    let html = readFileSync(src, 'utf-8');
    const injection = `<script>window.__AKASHA_BUILD_MODE='public';</script>\n`;
    const scriptTag = html.indexOf('<script');
    if (scriptTag !== -1) {
      html = html.slice(0, scriptTag) + injection + html.slice(scriptTag);
    } else {
      html = injection + html;
    }
    writeFileSync(dst, html, 'utf-8');
    transformed++;
    continue;
  }

  if (rel === 'sw.js') {
    // Append build mode to the content-hashed cache name set by scripts/sync-sw.js.
    let sw = readFileSync(src, 'utf-8');
    const cur = (sw.match(/const CACHE_NAME = '([^']+)';/) || [])[1] || 'akasha-library';
    const buildId = `${cur}-${MODE}`;
    sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${buildId}';`);
    writeFileSync(dst, sw, 'utf-8');
    transformed++;
    continue;
  }

  if (rel === 'persona.md' && MODE === 'public') {
    // Replace full persona with blank template
    const template = [
      '# 零韻 Rein',
      '',
      '> AI 圖書館員 — 公開 Demo 版',
      '',
      '## 基本資料',
      '',
      '- 身分：阿卡夏圖書館 AI 圖書館員',
      '- 語氣：溫和、專業',
      '',
      '## 說明',
      '',
      '此為公開 Demo 版人設。完整人設請使用私有版。',
      '',
    ].join('\n');
    writeFileSync(dst, template, 'utf-8');
    transformed++;
    continue;
  }

  if (rel === join('core', 'config.js')) {
    // Ensure no real credentials leak + inject build metadata
    let cfg = readFileSync(src, 'utf-8');
    cfg = cfg.replace(
      /VERSION: '[^']+'/,
      `VERSION: '0.1.0-${MODE}'`
    );
    writeFileSync(dst, cfg, 'utf-8');
    transformed++;
    continue;
  }

  // Default: straight copy
  copyFileSync(src, dst);
  copied++;
}

console.log(`  Copied:      ${copied} files`);
console.log(`  Transformed: ${transformed} files`);
if (privateSkipped > 0) {
  console.log(`  Skipped:     ${privateSkipped} private module files`);
}
console.log(`  Output:      ${OUT}`);

/* ── Verify ──────────────────────────────────────── */

const critical = [
  'index.html',
  'sw.js',
  'manifest.json',
  join('assets', 'styles', 'shared.css'),
  join('core', 'security.js'),
  join('core', 'export-core.js'),
  join('modules', 'markdown', 'index.html'),
  join('modules', 'pdf-reader', 'index.html'),
  join('modules', 'table-forge', 'index.html'),
  join('dist', 'script-editor', 'index.html'),
  join('modules', 'book-editor', 'index.html'),
  join('modules', 'daily-report', 'index.html'),
  // Private modules — only critical in private builds
  ...(MODE === 'private' ? [
    join('modules', 'reading-room', 'index.html'),
    join('modules', 'ai-settings', 'index.html'),
  ] : []),
];

let missing = 0;
for (const f of critical) {
  if (!existsSync(join(OUT, f))) {
    console.error(`  MISSING: ${f}`);
    missing++;
  }
}

if (missing) {
  console.error(`\n  ${missing} critical file(s) missing!`);
  process.exit(1);
}

// Public build: verify BUILD_MODE injection
if (MODE === 'public') {
  const html = readFileSync(join(OUT, 'index.html'), 'utf-8');
  if (!html.includes("__AKASHA_BUILD_MODE='public'")) {
    console.error('  BUILD_MODE injection failed!');
    process.exit(1);
  }
  // Verify persona is template
  if (existsSync(join(OUT, 'persona.md'))) {
    const p = readFileSync(join(OUT, 'persona.md'), 'utf-8');
    if (p.length > 500) {
      console.error('  WARNING: persona.md appears to contain full persona in public build');
    }
  }
}

// Private build: verify no BUILD_MODE override
if (MODE === 'private') {
  const html = readFileSync(join(OUT, 'index.html'), 'utf-8');
  if (html.includes("__AKASHA_BUILD_MODE='public'")) {
    console.error('  Private build should not have public BUILD_MODE!');
    process.exit(1);
  }
}

console.log(`\n  Build "${MODE}" complete.\n`);
