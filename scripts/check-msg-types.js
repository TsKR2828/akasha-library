#!/usr/bin/env node
/**
 * scripts/check-msg-types.js — guard against the MSG_TYPES "two sources of truth" trap.
 *
 * core/export/bridge.js exports the canonical MSG_TYPES object. index.html cannot
 * `import` it for an early classic-script section that must still work under file://
 * (see the comment block at the top of that section), so that section hardcodes a
 * handful of MSG_TYPES values as string literals and keeps a manually-synced
 * cross-reference comment listing `'<literal>'(...) = MSG_TYPES.<KEY>`.
 *
 * This script reads both sides, compares them key by key, and fails loudly the
 * moment someone edits one without the other.
 *
 *   node scripts/check-msg-types.js
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = join(ROOT, 'core/export/bridge.js');
const INDEX = join(ROOT, 'index.html');

function parseBridgeMsgTypes(src) {
  const start = src.indexOf('export const MSG_TYPES = {');
  if (start === -1) throw new Error('MSG_TYPES export not found in core/export/bridge.js');
  const end = src.indexOf('\n};', start);
  if (end === -1) throw new Error('Could not find end of MSG_TYPES object in core/export/bridge.js');
  const body = src.slice(start, end);

  const map = new Map();
  const re = /^\s*([A-Z0-9_]+):\s*'([^']*)'/gm;
  let m;
  while ((m = re.exec(body))) {
    map.set(m[1], m[2]);
  }
  return map;
}

function parseIndexHtmlLiteralCopy(src) {
  const markerLine = "postMessage type 對照表";
  const markerIdx = src.indexOf(markerLine);
  if (markerIdx === -1) {
    throw new Error(`Could not find "${markerLine}" cross-reference comment block in index.html`);
  }
  // The cross-reference block is a run of consecutive `//` comment lines.
  const lineStart = src.lastIndexOf('\n', markerIdx) + 1;
  const afterMarker = src.slice(lineStart);
  const lines = afterMarker.split('\n');
  const blockLines = [];
  for (const line of lines) {
    if (/^\s*\/\//.test(line)) blockLines.push(line);
    else break;
  }
  const block = blockLines.join('\n');

  const map = new Map();
  const re = /^\s*\/\/\s+'([^']*)'\([^)]*\)\s*=\s*MSG_TYPES\.([A-Z0-9_]+)/gm;
  let m;
  while ((m = re.exec(block))) {
    map.set(m[2], m[1]);
  }
  if (map.size === 0) {
    throw new Error('Cross-reference comment block in index.html matched but yielded no entries — regex may be stale');
  }
  return map;
}

const bridgeSrc = readFileSync(BRIDGE, 'utf-8');
const indexSrc = readFileSync(INDEX, 'utf-8');

const bridgeMap = parseBridgeMsgTypes(bridgeSrc);
const htmlMap = parseIndexHtmlLiteralCopy(indexSrc);

const diffs = [];

for (const [key, htmlValue] of htmlMap) {
  if (!bridgeMap.has(key)) {
    diffs.push(`  MSG_TYPES.${key} — listed in index.html cross-reference (value '${htmlValue}') but no longer exists in core/export/bridge.js`);
    continue;
  }
  const bridgeValue = bridgeMap.get(key);
  if (bridgeValue !== htmlValue) {
    diffs.push(`  MSG_TYPES.${key} — bridge.js = '${bridgeValue}', index.html literal copy = '${htmlValue}'`);
  }
}

if (diffs.length) {
  console.error(`MSG_TYPES out of sync between core/export/bridge.js and index.html (${diffs.length} mismatch${diffs.length > 1 ? 'es' : ''}):`);
  diffs.forEach(d => console.error(d));
  console.error('\nFix: update the literal(s) and/or the cross-reference comment at index.html (search "postMessage type 對照表") to match core/export/bridge.js MSG_TYPES.');
  process.exit(1);
}

console.log(`MSG_TYPES-SYNC OK — ${htmlMap.size} cross-referenced keys match core/export/bridge.js`);
