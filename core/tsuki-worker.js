/* ============================================================
   tsuki-worker.js — 在背景執行緒用 WebAssembly 跑 tsuki-synth 渲染引擎
   ────────────────────────────────────────────────────────────
   由 core/tsuki-synth.js 以 module worker 啟動。
   引擎檔在 private-assets/tsuki/（scripts/build-tsuki-wasm.js 產生，只在私有版）。

   訊息：
     → { id, scoreText }
     ← { id, ok: true,  wav: ArrayBuffer, messages }
     ← { id, ok: false, code, messages }
   code：1 樂譜解析失敗、2 渲染失敗、-1 引擎載入失敗
   ============================================================ */

const BASE = new URL('../private-assets/tsuki/', self.location.href).href;
let modulePromise = null;

function getModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [mod, wasm] = await Promise.all([
        import(BASE + 'tsukisynth.mjs'),
        fetch(BASE + 'tsukisynth.wasm').then(r => {
          if (!r.ok) throw new Error('tsukisynth.wasm HTTP ' + r.status);
          return r.arrayBuffer();
        }),
      ]);
      // 直接給 wasmBinary：module worker 沒有 importScripts，Emscripten 自己抓檔會失敗
      return mod.default({ wasmBinary: wasm, print: () => {}, printErr: () => {} });
    })();
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

self.onmessage = async (event) => {
  const { id, scoreText } = event.data || {};
  let M;
  try {
    M = await getModule();
  } catch (err) {
    self.postMessage({ id, ok: false, code: -1, messages: '引擎載入失敗：' + (err && err.message || err) });
    return;
  }
  const scorePath = '/work/score.json';
  const outPath = '/work/out.wav';
  try {
    try { M.FS.mkdirTree('/work'); } catch {}
    M.FS.writeFile(scorePath, scoreText);
    try { M.FS.unlink(outPath); } catch {}
    const rc = M.ccall('tsuki_render', 'number', ['string', 'string'], [scorePath, outPath]);
    const messages = M.ccall('tsuki_last_message', 'string', [], []) || '';
    if (rc !== 0) {
      self.postMessage({ id, ok: false, code: rc, messages });
      return;
    }
    const bytes = M.FS.readFile(outPath);
    const wav = bytes.slice().buffer;   // 複製出 WASM 記憶體再轉移
    try { M.FS.unlink(outPath); } catch {}
    self.postMessage({ id, ok: true, wav, messages }, [wav]);
  } catch (err) {
    self.postMessage({ id, ok: false, code: 2, messages: String(err && err.message || err) });
  }
};
