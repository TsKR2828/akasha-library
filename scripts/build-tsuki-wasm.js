#!/usr/bin/env node
/**
 * build-tsuki-wasm.js — 把 tsuki-synth 渲染引擎編成 WebAssembly，讓零韻能在圖書館裡演奏
 *
 * 用法：
 *   node scripts/build-tsuki-wasm.js --tsuki ../tsuki-synth
 *   （或設定環境變數 TSUKI_SYNTH_DIR；em++ 需在 PATH，或用 EMXX 指定路徑）
 *
 * 需要：
 *   - tsuki-synth checkout（含 libs/JUCE submodule：git submodule update --init libs/JUCE）
 *   - Emscripten（em++）
 *   不需要先用 CMake 編譯 tsuki-synth。
 *
 * 產出（全部在 private-assets/tsuki/，已列入 .gitignore、公開版 build 排除）：
 *   tsukisynth.mjs / tsukisynth.wasm  渲染引擎
 *   SCORE_GUIDE.md / score.schema.json 零韻作曲時讀的樂譜規格（tsuki-synth 文件，同屬專有授權）
 *   manifest.json                      來源 commit、編譯器版本、雜湊
 *
 * 做法：
 *   引擎程式碼一行不改。只有 JUCE 8 的 juce_core 在 WebAssembly 平台缺幾個實作，
 *   build 時複製一份 juce_core 到暫存資料夾補上（見 JUCE_PATCHES），不動 tsuki-synth 的 submodule。
 *   驗證：tsuki-synth tools/crossplatform_verify.py 比對原生 CLI，5 個 probe 全在登記容差內
 *   （2026-11-03，max |delta| −124.5 dBFS，限值 −120）。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync, copyFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HERE = join(ROOT, 'scripts', 'tsuki-wasm');
const OUT = join(ROOT, 'private-assets', 'tsuki');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const TSUKI = resolve(arg('--tsuki') || process.env.TSUKI_SYNTH_DIR || join(ROOT, '..', 'tsuki-synth'));
const EMXX = process.env.EMXX || (process.platform === 'win32' ? 'em++.bat' : 'em++');

const JUCE = join(TSUKI, 'libs', 'JUCE', 'modules');
for (const p of [join(TSUKI, 'src', 'score', 'ScoreRenderer.h'), join(JUCE, 'juce_core', 'juce_core.cpp'), join(TSUKI, 'data', 'materials.json')]) {
  if (!existsSync(p)) {
    console.error(`找不到 ${p}\n請用 --tsuki 指定 tsuki-synth 資料夾，並確認已執行 git submodule update --init libs/JUCE`);
    process.exit(1);
  }
}
let emVersion;
try { emVersion = execFileSync(EMXX, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).split('\n')[0].trim(); }
catch { console.error('找不到 em++（Emscripten）。請先安裝 Emscripten，或用環境變數 EMXX 指定路徑。'); process.exit(1); }

/* ── JUCE 8 juce_core 的 WebAssembly 相容修補（只改暫存副本） ── */
const JUCE_PATCHES = [
  {
    file: 'native/juce_ThreadPriorities_native.h',
    find: '       #if JUCE_LINUX || JUCE_BSD\n',
    replace: '       #if JUCE_LINUX || JUCE_BSD || JUCE_WASM  /* akasha WASM patch：WASM 無執行緒優先權，比照 Linux 全 0 */\n',
  },
  {
    file: 'native/juce_SystemStats_wasm.cpp',
    prepend: '#include <emscripten.h> /* akasha WASM patch：舊版 Emscripten 需顯式引入 emscripten_get_now */\n',
  },
  {
    file: 'juce_core.cpp',
    find: '#elif JUCE_WASM\n #include "native/juce_SystemStats_wasm.cpp"\n',
    replace: '#elif JUCE_WASM\n #include "native/juce_Files_wasm_akasha.cpp"  /* akasha WASM patch */\n #include "native/juce_SystemStats_wasm.cpp"\n',
  },
];

const JUCE_FILES_WASM = `// akasha WASM patch：JUCE 8 的 WASM 平台缺少以下檔案系統實作，這裡補最小版本。
// 只在 Emscripten MEMFS 上使用（渲染器讀 score.json、寫 WAV），不碰真實磁碟。
namespace juce
{
File File::getSpecialLocation (const SpecialLocationType type)
{
    switch (type)
    {
        case tempDirectory:            return File ("/tmp");
        case currentExecutableFile:
        case currentApplicationFile:
        case invokedExecutableFile:
        case hostApplicationPath:      return File ("/tsukisynth.wasm");
        default:                       return File ("/home/web_user");
    }
}

bool File::copyInternal (const File& dest) const
{
    FileInputStream in (*this);
    if (dest.deleteFile())
    {
        {
            FileOutputStream out (dest);
            if (out.failedToOpen()) return false;
            if (out.writeFromInputStream (in, -1) == getSize()) return true;
        }
        dest.deleteFile();
    }
    return false;
}

bool File::isSymbolicLink() const          { return false; }
String File::getNativeLinkedTarget() const { return {}; }

// 渲染器不需要列目錄；回傳空清單
class DirectoryIterator::NativeIterator::Pimpl {};
DirectoryIterator::NativeIterator::NativeIterator (const File&, const String&) {}
DirectoryIterator::NativeIterator::~NativeIterator() {}
bool DirectoryIterator::NativeIterator::next (String&, bool*, bool*, int64*, Time*, Time*, bool*) { return false; }

// WASM 不支援 mmap：address 維持 nullptr，呼叫端改走一般讀取
void MemoryMappedFile::openInternal (const File&, AccessMode, bool) {}
MemoryMappedFile::~MemoryMappedFile() {}
}
`;

const work = join(tmpdir(), `akasha-tsuki-wasm-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'obj'), { recursive: true });
const patched = join(work, 'juce_patched');
cpSync(join(JUCE, 'juce_core'), join(patched, 'juce_core'), { recursive: true });
for (const p of JUCE_PATCHES) {
  const f = join(patched, 'juce_core', p.file);
  let s = readFileSync(f, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';   // JUCE 原始檔可能是 CRLF
  if (p.prepend) s = p.prepend.replace(/\n/g, eol) + s;
  else {
    const find = p.find.replace(/\n/g, eol);
    if (!s.includes(find)) { console.error(`JUCE 修補失敗：${p.file} 找不到預期內容（JUCE 版本變了？）`); process.exit(1); }
    s = s.replace(find, p.replace.replace(/\n/g, eol));
  }
  writeFileSync(f, s);
}
writeFileSync(join(patched, 'juce_core', 'native', 'juce_Files_wasm_akasha.cpp'), JUCE_FILES_WASM);

/* ── materials.json 內嵌 ── */
const materials = readFileSync(join(TSUKI, 'data', 'materials.json'));
const bytes = Array.from(materials).join(',');
writeFileSync(join(work, 'TsukiWasmData.cpp'),
  `namespace TsukiWasmData {\nstatic const unsigned char data[] = {${bytes},0};\n` +
  `extern const char* materials_json; const char* materials_json = (const char*) data;\n` +
  `extern const int materials_jsonSize; const int materials_jsonSize = ${materials.length};\n}\n`);

/* ── 編譯 ── */
const DEFS = [
  'JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1', 'JUCE_MODULE_AVAILABLE_juce_core=1',
  'JUCE_MODULE_AVAILABLE_juce_audio_basics=1', 'JUCE_MODULE_AVAILABLE_juce_audio_formats=1',
  'JUCE_STANDALONE_APPLICATION=1', 'JUCE_USE_CURL=0', 'JUCE_WEB_BROWSER=0',
  'JUCE_LITTLE_ENDIAN=1',   // JUCE 沒替 WASM 定義位元組順序；不設會把 WAV 檔頭寫反
  'NDEBUG=1', '_NDEBUG=1',
].map(d => '-D' + d);
const INC = [join(HERE, 'shim'), patched, JUCE, join(TSUKI, 'src')].map(d => '-I' + d);
const UNITS = [
  join(patched, 'juce_core', 'juce_core.cpp'),
  join(JUCE, 'juce_audio_basics', 'juce_audio_basics.cpp'),
  join(JUCE, 'juce_audio_formats', 'juce_audio_formats.cpp'),
  join(work, 'TsukiWasmData.cpp'),
  join(HERE, 'TsukiWasm.cpp'),
];
const em = (a) => execFileSync(EMXX, a, { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
const objs = [];
for (const u of UNITS) {
  const o = join(work, 'obj', u.split(/[\\/]/).pop().replace(/\.cpp$/, '.o'));
  process.stdout.write(`  compile ${u.split(/[\\/]/).pop()} … `);
  try { em(['-std=gnu++17', '-O3', ...DEFS, ...INC, '-c', u, '-o', o]); }
  catch (e) { console.error('\n' + String(e.stderr || e.message).slice(0, 3000)); process.exit(1); }
  objs.push(o);
  console.log('ok');
}
mkdirSync(OUT, { recursive: true });
process.stdout.write('  link … ');
try {
  em(['-O3', ...objs, '-o', join(OUT, 'tsukisynth.mjs'),
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createTsukiSynth',
    '-sENVIRONMENT=web,worker', '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=1',
    '-sEXPORTED_FUNCTIONS=_tsuki_render,_tsuki_last_message',
    '-sEXPORTED_RUNTIME_METHODS=FS,ccall']);
} catch (e) { console.error('\n' + String(e.stderr || e.message).slice(0, 3000)); process.exit(1); }
console.log('ok');

/* ── 作曲規格 + manifest ── */
copyFileSync(join(TSUKI, 'SCORE_GUIDE.md'), join(OUT, 'SCORE_GUIDE.md'));
copyFileSync(join(TSUKI, 'scores', 'schema', 'score.schema.json'), join(OUT, 'score.schema.json'));
let commit = null, dirty = null;
try {
  commit = execFileSync('git', ['-C', TSUKI, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['-C', TSUKI, 'status', '--porcelain', '--', 'src', 'data', 'libs'], { encoding: 'utf8' }).trim() !== '';
} catch {}
const sha = (f) => createHash('sha256').update(readFileSync(join(OUT, f))).digest('hex');
const manifest = {
  contract: 'akasha tsuki-synth wasm manifest v1',
  generated_at: new Date().toISOString(),
  license_note: 'TsukiSynth — Proprietary, all rights reserved. 僅供私有版使用，不得公開散布。',
  source: { repo: 'TsKR2828/tsuki-synth', commit: commit && commit.slice(0, 7), commit_full: commit, dirty },
  compiler: emVersion,
  files: Object.fromEntries(['tsukisynth.mjs', 'tsukisynth.wasm', 'SCORE_GUIDE.md', 'score.schema.json'].map(f => [f, sha(f)])),
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
rmSync(work, { recursive: true, force: true });
console.log(`\ntsuki-synth WASM → private-assets/tsuki/（tsuki-synth ${manifest.source.commit}${dirty ? ' · dirty' : ''}）`);
