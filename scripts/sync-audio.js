#!/usr/bin/env node
/**
 * sync-audio.js — 把 tsuki-synth 音色庫收編進劇本工房（v3-1 / v3-2）
 *
 * 用法：
 *   node scripts/sync-audio.js --tsuki ../tsuki-synth --cli <TsukiSynthCLI 路徑>
 *   node scripts/sync-audio.js --tsuki ../tsuki-synth --catalog-only
 *
 *   也可用環境變數 TSUKI_SYNTH_DIR / TSUKI_SYNTH_CLI 代替參數。
 *
 * 產出：
 *   1. modules/script-editor/src/lib/soundCatalog.json  ← 公開 metadata（會 commit）
 *      只有 id / 名稱 / 類型 / 長度等描述，沒有任何音訊。
 *   2. private-assets/audio/{bgm,sfx}/<id>.mp3          ← 音檔（.gitignore，不 commit）
 *      private-assets/audio/manifest.json              ← 來源與雜湊紀錄
 *
 * tsuki-synth 為專有授權，音檔只能出現在私有版：
 *   - private-assets/ 已列入 .gitignore
 *   - scripts/build.js --mode=public 會排除 private-assets/
 *
 * 循環音（sound_type: "loop"）處理：
 *   CLI 渲染結果含殘響尾巴（例：16 秒的循環渲染出 24 秒）。直接循環會在接縫斷掉，
 *   所以把超過循環長度的尾巴疊回開頭（tail wrap），再截成剛好一個循環長度，
 *   最後依原本峰值重新正規化，確保不破音。
 *
 * 需要：ffmpeg（含 libmp3lame）。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_OUT = join(ROOT, 'modules', 'script-editor', 'src', 'lib', 'soundCatalog.json');
const AUDIO_OUT = join(ROOT, 'private-assets', 'audio');

/* ── args ─────────────────────────────────────────── */
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const TSUKI = resolve(arg('--tsuki') || process.env.TSUKI_SYNTH_DIR || join(ROOT, '..', 'tsuki-synth'));
const CLI = arg('--cli') || process.env.TSUKI_SYNTH_CLI;
const CATALOG_ONLY = args.includes('--catalog-only');

const libPath = join(TSUKI, 'sound_library', 'sound_names.json');
if (!existsSync(libPath)) {
  console.error(`找不到 ${libPath}\n請用 --tsuki 指定 tsuki-synth 資料夾。`);
  process.exit(1);
}
const library = JSON.parse(readFileSync(libPath, 'utf8')).library || [];

/* ── 1. 公開 catalog ─────────────────────────────── */
const CATALOG_KEYS = ['id', 'name', 'name_zh', 'sound_type', 'primary_type', 'subcategory',
  'world', 'mood', 'energy', 'duration_sec', 'engine', 'tags'];
const catalog = library.map(e => Object.fromEntries(CATALOG_KEYS.map(k => [k, e[k] ?? null])));
writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 1) + '\n');
console.log(`catalog: ${catalog.length} 個聲音 → ${CATALOG_OUT.replace(ROOT + '/', '')}`);
if (CATALOG_ONLY) process.exit(0);

if (!CLI || !existsSync(CLI)) {
  console.error('需要 TsukiSynthCLI：請用 --cli 指定執行檔路徑（或設定 TSUKI_SYNTH_CLI）。');
  process.exit(1);
}
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
catch { console.error('需要 ffmpeg（含 libmp3lame）。'); process.exit(1); }

/* ── WAV 讀寫（PCM 16/24/32 與 float32） ─────────── */
function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是 WAV');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const sampleRate = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      if (format === 0xFFFE && size >= 26) format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels, sampleRate, bits };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV 缺 fmt 或 data');
  const { format, channels, bits } = fmt;
  const bps = bits / 8;
  const frames = Math.floor(data.length / (bps * channels));
  const ch = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bps;
      let v;
      if (format === 3 && bits === 32) v = data.readFloatLE(p);
      else if (bits === 16) v = data.readInt16LE(p) / 32768;
      else if (bits === 24) v = data.readIntLE(p, 3) / 8388608;
      else if (bits === 32) v = data.readInt32LE(p) / 2147483648;
      else throw new Error(`不支援 ${bits}-bit WAV`);
      ch[c][i] = v;
    }
  }
  return { sampleRate: fmt.sampleRate, channels: ch };
}

function writeWavFloat(path, sampleRate, ch) {
  const n = ch[0].length, c = ch.length;
  const buf = Buffer.alloc(44 + n * c * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * c * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(c, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * c * 4, 28);
  buf.writeUInt16LE(c * 4, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * c * 4, 40);
  let p = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { buf.writeFloatLE(ch[k][i], p); p += 4; }
  writeFileSync(path, buf);
}

const peakOf = (ch) => ch.reduce((m, a) => { for (const v of a) { const x = Math.abs(v); if (x > m) m = x; } return m; }, 0);

/** 把超過 loopFrames 的尾巴疊回開頭，截成剛好一個循環，峰值維持原值 */
function wrapLoop(ch, loopFrames) {
  const before = peakOf(ch);
  const out = ch.map(a => {
    const o = new Float32Array(loopFrames);
    for (let i = 0; i < a.length; i++) o[i % loopFrames] += a[i];
    return o;
  });
  const after = peakOf(out);
  if (after > 0 && before > 0) {
    const g = before / after;
    for (const o of out) for (let i = 0; i < o.length; i++) o[i] *= g;
  }
  return out;
}

function loopSeconds(entry, score) {
  const m = score?.meta || {};
  const bpm = Number(m.loop_bpm || score?.global?.bpm);
  const bars = Number(m.loop_bars);
  const beatsPerBar = Number(String(score?.global?.time_signature || '4/4').split('/')[0]) || 4;
  if (bpm > 0 && bars > 0) return (bars * beatsPerBar * 60) / bpm;
  return Number(entry.duration_sec) || null;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* ── 2. 渲染 + 轉檔 ──────────────────────────────── */
rmSync(AUDIO_OUT, { recursive: true, force: true });
mkdirSync(join(AUDIO_OUT, 'bgm'), { recursive: true });
mkdirSync(join(AUDIO_OUT, 'sfx'), { recursive: true });
const work = join(tmpdir(), `akasha-sync-audio-${process.pid}`);
mkdirSync(work, { recursive: true });

const sounds = [];
const failed = [];
let source = null;

for (const entry of library) {
  const scorePath = join(TSUKI, entry.score_file || '');
  if (!entry.score_file || !existsSync(scorePath)) { failed.push(`${entry.id}：找不到樂譜 ${entry.score_file}`); continue; }
  const dir = join(work, entry.id);
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync(CLI, [scorePath, '--output', dir], { stdio: 'pipe' });
  } catch (e) {
    failed.push(`${entry.id}：CLI 渲染失敗 ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    continue;
  }
  const wavName = readdirSync(dir).find(f => f.endsWith('.wav'));
  if (!wavName) { failed.push(`${entry.id}：CLI 沒有產出 WAV`); continue; }
  const wavPath = join(dir, wavName);
  const renderJson = join(dir, wavName + '.render.json');
  const render = existsSync(renderJson) ? JSON.parse(readFileSync(renderJson, 'utf8')) : {};
  if (!source && render.configured_source_commit) {
    source = {
      repo: 'TsKR2828/tsuki-synth',
      commit: String(render.configured_source_commit).slice(0, 7),
      commit_full: render.configured_source_commit,
      dirty: render.configured_source_dirty ?? null,
      renderer_version: render.renderer_version ?? null,
      compiler: render.compiler ?? null,
      target: render.target ?? null,
    };
  }

  const isLoop = entry.sound_type === 'loop';
  const kind = isLoop ? 'bgm' : 'sfx';
  const wav = readWav(readFileSync(wavPath));
  let ch = wav.channels;
  let looped = false;
  if (isLoop) {
    const score = JSON.parse(readFileSync(scorePath, 'utf8'));
    const sec = loopSeconds(entry, score);
    const frames = sec ? Math.round(sec * wav.sampleRate) : 0;
    if (frames > 0 && frames < ch[0].length) { ch = wrapLoop(ch, frames); looped = true; }
  }
  const prepared = join(dir, 'prepared.wav');
  writeWavFloat(prepared, wav.sampleRate, ch);

  const rel = `${kind}/${entry.id}.mp3`;
  const mp3 = join(AUDIO_OUT, rel);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', prepared, '-codec:a', 'libmp3lame', '-q:a', '2', mp3]);

  sounds.push({
    id: entry.id,
    type: kind,
    sound_type: entry.sound_type,
    file: rel,
    duration_sec: Number((ch[0].length / wav.sampleRate).toFixed(6)),
    loop_tail_wrapped: looped,
    wav_sha256: render.wav_sha256 || null,
    mp3_sha256: sha256(readFileSync(mp3)),
  });
  process.stdout.write(`  ✓ ${kind} ${entry.id}${looped ? '（循環尾巴已疊回）' : ''}\n`);
}

rmSync(work, { recursive: true, force: true });

const manifest = {
  contract: 'akasha tsuki-synth audio manifest v1',
  generated_at: new Date().toISOString(),
  license_note: 'TsukiSynth — Proprietary, all rights reserved. 僅供私有版使用，不得公開散布。',
  source,
  sounds,
};
writeFileSync(join(AUDIO_OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

console.log(`\naudio: ${sounds.length}/${library.length} 個聲音 → private-assets/audio/`);
if (failed.length) {
  console.error(`\n${failed.length} 個失敗：`);
  failed.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
