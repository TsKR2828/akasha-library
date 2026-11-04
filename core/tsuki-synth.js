/* ============================================================
   tsuki-synth.js — 零韻的樂器：用 tsuki-synth 引擎（WebAssembly）演奏 score.json
   ────────────────────────────────────────────────────────────
   流程：
     1. 使用者請零韻演奏 → isMusicRequest() 判斷 → 把 tsuki-synth 的
        SCORE_GUIDE.md 加進 system prompt（buildComposeBlock）
     2. 零韻回覆中附一個 ```tsuki-score``` 區塊 → extractScoreBlock()
     3. checkScoreForLibrary() 擋掉過長／含 layers 的樂譜
     4. renderScore() 丟給 core/tsuki-worker.js（背景執行緒 WebAssembly）→ WAV

   引擎與樂譜指南都在 private-assets/tsuki/（scripts/build-tsuki-wasm.js 產生），
   tsuki-synth 為專有授權，只在私有版；公開版 isTsukiAvailable() 會是 false。

   純函式（extractScoreBlock / scoreDurationSec / checkScoreForLibrary /
   isMusicRequest / stripScoreBlock）不碰 DOM，tests/ 直接 import 測試。
   ============================================================ */

export const MAX_SCORE_SECONDS = 90;
export const MAX_SCORE_EVENTS = 2000;
const FENCE_RE = /```tsuki-score\s*\n([\s\S]*?)```/i;

function baseUrl() {
  return new URL('../private-assets/tsuki/', import.meta.url).href;
}

/* ---------- 純函式 ---------- */

/** 使用者是不是在請零韻演奏／作曲 */
export function isMusicRequest(text) {
  const t = String(text || '');
  return /(演奏|彈奏|彈[一首段個]|作曲|譜曲|編曲|配樂|旋律|樂曲|曲子|小曲|音樂|來[一首段].{0,4}(曲|歌|音樂))/.test(t)
      || /\b(play|compose|perform)\b.{0,30}\b(song|tune|melody|music|piece)\b/i.test(t);
}

/** 從回覆中取出 ```tsuki-score``` 區塊 */
export function extractScoreBlock(text) {
  const m = FENCE_RE.exec(String(text || ''));
  if (!m) return { found: false };
  const raw = m[1].trim();
  try {
    const score = JSON.parse(raw);
    return { found: true, raw, score };
  } catch (err) {
    return { found: true, raw, error: 'JSON 格式錯誤：' + err.message };
  }
}

/** 顯示用文字：拿掉樂譜區塊 */
export function stripScoreBlock(text) {
  return String(text || '').replace(FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** 樂譜總長度（秒）：所有事件 time + duration 的最大值 */
export function scoreDurationSec(score) {
  const evs = Array.isArray(score?.events) ? score.events : [];
  let end = 0;
  for (const e of evs) {
    const t = Number(e?.time) || 0;
    const d = Number(e?.duration) || 0;
    if (t + d > end) end = t + d;
  }
  return end;
}

/** 圖書館端的安全限制（引擎本身的規格檢查交給 ScoreParser） */
export function checkScoreForLibrary(score) {
  const errors = [];
  if (!score || typeof score !== 'object' || Array.isArray(score)) return ['樂譜必須是 JSON 物件'];
  if (score.layers) errors.push('圖書館內演奏不支援 layers，請把所有事件寫在同一份樂譜');
  const evs = Array.isArray(score.events) ? score.events : null;
  if (!evs || evs.length === 0) errors.push('樂譜沒有任何 events');
  else if (evs.length > MAX_SCORE_EVENTS) errors.push(`事件太多（${evs.length}），上限 ${MAX_SCORE_EVENTS}`);
  const sec = scoreDurationSec(score);
  if (sec > MAX_SCORE_SECONDS) errors.push(`樂曲太長（${sec.toFixed(1)} 秒），上限 ${MAX_SCORE_SECONDS} 秒`);
  return errors;
}

/** 讀 WAV 檔頭取長度（秒），給播放卡片顯示用 */
export function wavDurationSec(buf) {
  try {
    const dv = new DataView(buf);
    let off = 12, rate = 0, block = 0;
    while (off + 8 <= dv.byteLength) {
      const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
      const size = dv.getUint32(off + 4, true);
      if (id === 'fmt ') { rate = dv.getUint32(off + 12, true); block = dv.getUint16(off + 20, true); }
      if (id === 'data' && rate && block) return size / block / rate;
      off += 8 + size + (size & 1);
    }
  } catch {}
  return 0;
}

/* ---------- 可用性與作曲指南 ---------- */

let availablePromise = null;
export function isTsukiAvailable() {
  if (!availablePromise) {
    availablePromise = fetch(baseUrl() + 'manifest.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(m => !!(m && m.files && m.files['tsukisynth.wasm']))
      .catch(() => false);
  }
  return availablePromise;
}

let guidePromise = null;
function loadGuide() {
  if (!guidePromise) {
    guidePromise = fetch(baseUrl() + 'SCORE_GUIDE.md')
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      // CLI 指令說明對零韻沒用，省 token
      .then(t => t.replace(/\n## Rendering[\s\S]*?(?=\n## )/, '\n'));
    guidePromise.catch(() => { guidePromise = null; });
  }
  return guidePromise;
}

/** 加進 system prompt 的作曲能力說明＋tsuki-synth 官方樂譜指南 */
export async function buildComposeBlock() {
  const guide = await loadGuide();
  return `

## 演奏能力（TsukiSynth）
你可以用圖書館裡的 TsukiSynth 物理建模合成器，為讀者作曲並當場演奏。
當讀者請你演奏、作曲、彈奏或來段音樂時：
1. 先用一兩句話說明你要演奏什麼（曲名、樂器、情緒），語氣維持你的角色。
2. 接著附上一個 \`\`\`tsuki-score 程式碼區塊，內容是完整、合法的 TsukiSynth Score v1 JSON（純 JSON，不可有註解或結尾逗號）。
3. 限制：總長度 ${MAX_SCORE_SECONDS} 秒以內（建議 15–45 秒）；不要使用 layers；時間一律用絕對秒數並依時間排序；只用指南列出的引擎、材質、槌頭與參數；meta.title 寫中文曲名。
4. 程式碼區塊之後不要再寫任何文字。
讀者沒有要求音樂時，照常對話，不要附樂譜。

以下是 TsukiSynth 官方樂譜寫作指南：
<tsuki_score_guide>
${guide}
</tsuki_score_guide>`;
}

/** 樂譜被引擎退回時，請零韻修正用的訊息 */
export function buildFixRequest(errorText) {
  return `剛才的樂譜無法演奏，引擎回報：\n${String(errorText || '').trim().slice(0, 1500)}\n\n請依 TsukiSynth 樂譜指南修正，只回覆修正後的完整 \`\`\`tsuki-score 程式碼區塊，不要其他文字。`;
}

/* ---------- 渲染 ---------- */

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./tsuki-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data?.id);
      if (!p) return;
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      p.resolve(e.data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, code: -1, messages: '渲染執行緒錯誤：' + (e.message || '') }); }
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/**
 * 渲染一份樂譜。
 * @returns {Promise<{ok:true, wav:ArrayBuffer, messages:string} | {ok:false, code:number, messages:string}>}
 */
export function renderScore(score, { timeoutMs = 120000 } = {}) {
  const scoreText = typeof score === 'string' ? score : JSON.stringify(score);
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, code: -2, messages: '渲染逾時' });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    getWorker().postMessage({ id, scoreText });
  });
}
