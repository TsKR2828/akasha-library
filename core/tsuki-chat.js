/* ============================================================
   tsuki-chat.js — 零韻聊天框裡的「演奏卡片」
   ────────────────────────────────────────────────────────────
   appendScoreCard(scrollEl, { score, raw }, { autoplay, fix })
     • 背景渲染（core/tsuki-synth.js → WebAssembly worker）
     • ▶ 播放／■ 停止、⬇ WAV、存書庫（.score.json，可在 Code & Data 開啟）、查看樂譜
     • 引擎退回樂譜時，若有 fix(errorText) → 請零韻修正一次再渲染
   unlockTsukiAudio()：在使用者按「送出」的當下建立 AudioContext，
     之後非同步渲染完才能自動播放（瀏覽器自動播放政策）。
   ============================================================ */

import { renderScore, checkScoreForLibrary, extractScoreBlock, wavDurationSec, scoreDurationSec, isTsukiAvailable } from './tsuki-synth.js';

let audioCtx = null;
let current = null; // { src, card }

export function unlockTsukiAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch {}
}

function stopCurrent() {
  if (current) {
    try { current.src.stop(); } catch {}
    current.card?.classList.remove('is-playing');
    const b = current.card?.querySelector('.ai-score-play');
    if (b) b.textContent = '▶ 播放';
    current = null;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtSec(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} 秒`;
}

function engineSummary(score) {
  const set = new Set((score.events || []).map(e => e.engine).filter(Boolean));
  const zh = { string: '弦', cimbalom: '揚琴', beam: '鋼舌鼓', plate: '水鑼', fm: 'FM', piano: '鋼琴' };
  return [...set].map(x => zh[x] || x).join('・');
}

function safeName(title) {
  return String(title || '零韻的小曲').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

/**
 * @param {HTMLElement} scrollEl  #aiChatScroll
 * @param {{score?:object, raw?:string, error?:string}} block  extractScoreBlock 的結果
 * @param {{autoplay?:boolean, fix?:(errText:string)=>Promise<string>, lazy?:boolean}} opts
 */
export function appendScoreCard(scrollEl, block, opts = {}) {
  const card = el('div', 'ai-score-card');
  const head = el('div', 'ai-score-head');
  const title = el('div', 'ai-score-title', '♪ ' + (block.score?.meta?.title || '零韻的小曲'));
  const meta = el('div', 'ai-score-meta', '');
  head.append(title, meta);
  const status = el('div', 'ai-score-status', '');
  const actions = el('div', 'ai-score-actions');
  const playBtn = el('button', 'ai-score-btn ai-score-play', '▶ 播放');
  const wavBtn = el('button', 'ai-score-btn', '⬇ WAV');
  const saveBtn = el('button', 'ai-score-btn', '存書庫');
  const srcBtn = el('button', 'ai-score-btn', '樂譜 ▸');
  for (const b of [playBtn, wavBtn, saveBtn, srcBtn]) b.type = 'button';
  actions.append(playBtn, wavBtn, saveBtn, srcBtn);
  const pre = el('pre', 'ai-score-src');
  pre.hidden = true;
  card.append(head, status, actions, pre);
  scrollEl.appendChild(card);
  scrollEl.scrollTop = scrollEl.scrollHeight;

  let state = { score: block.score, raw: block.raw, wav: null, buffer: null };
  let fixUsed = false;

  const setStatus = (t, kind = '') => { status.textContent = t; status.dataset.kind = kind; status.hidden = !t; };
  const setReady = (ready) => { playBtn.disabled = wavBtn.disabled = !ready; };
  const refreshMeta = () => {
    const s = state.score;
    const sec = state.wav ? wavDurationSec(state.wav) : scoreDurationSec(s || {});
    const eng = s ? engineSummary(s) : '';
    meta.textContent = [sec ? fmtSec(sec) : '', eng].filter(Boolean).join(' · ');
    title.textContent = '♪ ' + (s?.meta?.title || '零韻的小曲');
    pre.textContent = state.raw || '';
  };
  refreshMeta();
  setReady(false);
  saveBtn.disabled = !state.score;

  async function doRender(autoplay) {
    if (block.error && !state.score) return fail(block.error);
    const limits = checkScoreForLibrary(state.score);
    if (limits.length) return fail(limits.join('\n'));
    setStatus('演奏準備中…（TsukiSynth 物理建模渲染）', 'busy');
    const t0 = performance.now();
    const res = await renderScore(state.score);
    if (!res.ok) return fail(res.messages || '渲染失敗', res.code);
    state.wav = res.wav;
    try {
      unlockTsukiAudio();
      state.buffer = await audioCtx.decodeAudioData(res.wav.slice(0));
    } catch (err) {
      return fail('音訊解碼失敗：' + err.message);
    }
    refreshMeta();
    setReady(true);
    setStatus(`已渲染（${((performance.now() - t0) / 1000).toFixed(1)} 秒）`, 'ok');
    if (autoplay) play();
  }

  async function fail(msg, code) {
    setReady(false);
    // 樂譜被引擎退回（code 1/2）或 JSON 壞掉 → 請零韻修正一次
    if (opts.fix && !fixUsed && (code === 1 || code === 2 || code === undefined)) {
      fixUsed = true;
      setStatus('樂譜有誤，零韻正在修正…', 'busy');
      try {
        const reply = await opts.fix(msg);
        const next = extractScoreBlock(reply);
        if (next.found && next.score) {
          state = { score: next.score, raw: next.raw, wav: null, buffer: null };
          block = next;
          saveBtn.disabled = false;
          refreshMeta();
          return doRender(opts.autoplay);
        }
        msg = next.error || '修正後的回覆沒有樂譜';
      } catch (err) {
        msg = '修正失敗：' + err.message;
      }
    }
    setStatus('無法演奏：' + String(msg).trim(), 'error');
  }

  function play() {
    if (!state.buffer) return;
    if (current && current.card === card) { stopCurrent(); return; }
    stopCurrent();
    unlockTsukiAudio();
    const src = audioCtx.createBufferSource();
    src.buffer = state.buffer;
    src.connect(audioCtx.destination);
    src.onended = () => { if (current && current.src === src) stopCurrent(); };
    src.start();
    current = { src, card };
    card.classList.add('is-playing');
    playBtn.textContent = '■ 停止';
  }

  playBtn.addEventListener('click', () => {
    if (state.buffer) play();
    else if (opts.lazy && !status.dataset.kind) doRender(true);
  });
  wavBtn.addEventListener('click', () => {
    if (!state.wav) return;
    const url = URL.createObjectURL(new Blob([state.wav], { type: 'audio/wav' }));
    const a = el('a');
    a.href = url;
    a.download = safeName(state.score?.meta?.title) + '.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  saveBtn.addEventListener('click', async () => {
    if (!state.score) return;
    try {
      const { saveFileEntry, saveFileBlob } = await import('./storage.js');
      const text = JSON.stringify(state.score, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const entry = await saveFileEntry({ name: safeName(state.score.meta?.title) + '.score.json', type: 'json', size: blob.size });
      await saveFileBlob(entry.id, blob);
      saveBtn.textContent = '✓ 已存';
      saveBtn.disabled = true;
      if (window.showNoteToast) window.showNoteToast('樂譜已存入書庫');
    } catch (err) {
      if (window.showNoteToast) window.showNoteToast('存書庫失敗：' + err.message);
    }
  });
  srcBtn.addEventListener('click', () => {
    pre.hidden = !pre.hidden;
    srcBtn.textContent = pre.hidden ? '樂譜 ▸' : '樂譜 ▾';
  });

  if (opts.lazy) {
    // 對話紀錄裡的舊卡片：按 ▶ 才渲染
    playBtn.disabled = false;
    setStatus('', '');
    isTsukiAvailable().then(ok => {
      if (!ok) { setReady(false); setStatus('此版本不含 TsukiSynth 引擎（私有版限定），無法演奏', 'error'); }
    });
  } else {
    doRender(!!opts.autoplay);
  }
  return card;
}
