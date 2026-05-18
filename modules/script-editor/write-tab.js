/**
 * write-tab.js — Write TAB enhancements
 * Phase 17-2
 *
 * Adds on top of the index.html skeleton:
 *  - Voice TTS preview panel (Web Speech API via core/voice.js)
 *  - BGM preset preview panel (core/bgm.js)
 *  - Character slot badges + right-click "assign Alt slot" menu
 */

import {
  AppState, Bus, ShortcutManager, esc, getCharColor,
} from './data-model.js';

/* ═══════════════════════════════════════════
   Voice TTS Preview Panel
   ═══════════════════════════════════════════ */

let _voiceModule = null;
let _voicesCache = [];
let _voiceState  = { speaking: false, paused: false, currentIdx: -1 };

async function _loadVoice() {
  if (_voiceModule) return _voiceModule;
  try {
    _voiceModule = await import('../../core/voice.js');
    _voicesCache = await _voiceModule.waitForVoices();

    // Subscribe to state changes
    _voiceModule.setStateListener((state, detail) => {
      if (state === 'speaking')      { _voiceState.speaking = true;  _voiceState.paused = false; }
      else if (state === 'paused')   { _voiceState.paused = true; }
      else if (state === 'idle')     { _voiceState = { speaking: false, paused: false, currentIdx: -1 }; }
      else if (state === 'queue-progress') {
        _voiceState.currentIdx = detail?.index ?? -1;
      }
      Bus.emit('voice:state', state, detail);
      _updateVoiceUI();
    });
  } catch (err) {
    console.error('[SE Write] Voice module failed to load:', err);
    _voiceModule = { _unavailable: true };
  }
  return _voiceModule;
}

export async function renderVoicePreview(container) {
  await _loadVoice();
  if (_voiceModule._unavailable) {
    container.innerHTML = '<div class="empty-preview">語音功能未啟用<br><span style="font-size:11px">需在設定中開啟 voice feature gate</span></div>';
    return;
  }

  const voice = AppState.get('voice') || { speed: 1.0, pitch: 1.0, voiceId: '', includeNarration: false };

  // Filter voices: prefer zh-*, ja-*, en-*
  const langs = ['zh', 'ja', 'en'];
  const filtered = _voicesCache.filter(v => langs.some(l => v.lang.toLowerCase().startsWith(l)));
  const ordered = filtered.length ? filtered : _voicesCache;

  container.innerHTML = `
    <div class="voice-panel">
      <div class="voice-controls">
        <button id="voice-play-all" title="從頭播放所有對白">▶ 全部</button>
        <button id="voice-pause"    title="暫停 / 繼續">⏸</button>
        <button id="voice-stop"     title="停止">⏹</button>
        <span class="spacer"></span>
        <span class="voice-status" id="voice-status">就緒</span>
      </div>

      <div class="voice-settings">
        <label>語音引擎</label>
        <select id="voice-select">
          <option value="">系統預設</option>
          ${ordered.map(v => `<option value="${esc(v.name)}" ${v.name === voice.voiceId ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}
        </select>

        <label>語速 <span id="voice-speed-val">${voice.speed.toFixed(2)}</span></label>
        <div class="voice-range-row">
          <input type="range" id="voice-speed" min="0.5" max="2" step="0.05" value="${voice.speed}">
          <span>${voice.speed.toFixed(2)}x</span>
        </div>

        <label>音高 <span id="voice-pitch-val">${voice.pitch.toFixed(2)}</span></label>
        <div class="voice-range-row">
          <input type="range" id="voice-pitch" min="0" max="2" step="0.05" value="${voice.pitch}">
          <span>${voice.pitch.toFixed(2)}</span>
        </div>

        <label style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <input type="checkbox" id="voice-include-narr" ${voice.includeNarration ? 'checked' : ''}>
          <span>朗讀旁白</span>
        </label>
      </div>

      <div class="voice-queue-list" id="voice-queue-list">
        <div style="font-size:11px;color:var(--text-tertiary);padding:6px 4px">點 ▶ 全部 開始播放</div>
      </div>
    </div>
  `;

  // Wire up
  container.querySelector('#voice-play-all').onclick = playAllDialogue;
  container.querySelector('#voice-pause').onclick    = toggleVoicePause;
  container.querySelector('#voice-stop').onclick     = stopVoice;

  container.querySelector('#voice-select').onchange = e => {
    const v = { ...(AppState.get('voice') || {}), voiceId: e.target.value };
    AppState.set('voice', v);
  };

  const $speed = container.querySelector('#voice-speed');
  $speed.oninput = e => {
    const v = { ...(AppState.get('voice') || {}), speed: +e.target.value };
    AppState.set('voice', v);
    container.querySelector('#voice-speed-val').textContent = (+e.target.value).toFixed(2);
    container.querySelector('.voice-range-row:nth-of-type(1) span').textContent = (+e.target.value).toFixed(2) + 'x';
  };

  const $pitch = container.querySelector('#voice-pitch');
  $pitch.oninput = e => {
    const v = { ...(AppState.get('voice') || {}), pitch: +e.target.value };
    AppState.set('voice', v);
    container.querySelector('#voice-pitch-val').textContent = (+e.target.value).toFixed(2);
    container.querySelector('.voice-range-row:nth-of-type(2) span').textContent = (+e.target.value).toFixed(2);
  };

  container.querySelector('#voice-include-narr').onchange = e => {
    const v = { ...(AppState.get('voice') || {}), includeNarration: e.target.checked };
    AppState.set('voice', v);
  };

  _renderVoiceQueueList();
  _updateVoiceUI();
}

function _renderVoiceQueueList() {
  const $list = document.getElementById('voice-queue-list');
  if (!$list) return;
  const blocks = AppState.get('blocks') || [];
  const includeNarr = AppState.get('voice')?.includeNarration;

  const speakable = blocks.filter(b =>
    b.type === 'dialogue' || (includeNarr && b.type === 'narration')
  );

  if (!speakable.length) {
    $list.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary);padding:6px 4px">無可朗讀的內容</div>';
    return;
  }

  $list.innerHTML = speakable.map((b, i) => {
    const color = b.type === 'dialogue' ? getCharColor(b.speaker) : 'var(--text-tertiary)';
    const speaker = b.type === 'dialogue' ? b.speaker : '旁白';
    const text = (b.text || '').slice(0, 30) + ((b.text || '').length > 30 ? '…' : '');
    return `<div class="voice-queue-item" data-idx="${i}">
      <span class="vq-num">${i + 1}</span>
      <span class="vq-speaker" style="color:${color}">${esc(speaker)}</span>
      <span class="vq-text">${esc(text)}</span>
    </div>`;
  }).join('');

  // Click to play from this point
  $list.querySelectorAll('.voice-queue-item').forEach(el => {
    el.onclick = () => playFromIndex(+el.dataset.idx);
  });
}

async function playAllDialogue() {
  await _loadVoice();
  if (_voiceModule._unavailable) return;
  return playFromIndex(0);
}

async function playFromIndex(startIdx) {
  const blocks = AppState.get('blocks') || [];
  const voiceCfg = AppState.get('voice') || {};
  const includeNarr = voiceCfg.includeNarration;

  const tasks = _voiceModule.blocksToVoiceTasks(blocks, {
    voiceId: voiceCfg.voiceId,
    speed: voiceCfg.speed ?? 1,
    pitch: voiceCfg.pitch ?? 1,
    includeNarration: includeNarr,
  });

  if (!tasks.length) {
    _setVoiceStatus('無可朗讀的內容');
    return;
  }

  _voiceModule.clearQueue();
  _voiceModule.enqueue(tasks);
  await _voiceModule.playQueue(startIdx);
}

function toggleVoicePause() {
  if (!_voiceModule || _voiceModule._unavailable) return;
  if (_voiceState.paused) _voiceModule.resume();
  else if (_voiceState.speaking) _voiceModule.pause();
}

function stopVoice() {
  if (!_voiceModule || _voiceModule._unavailable) return;
  _voiceModule.stopQueue();
  _voiceModule.clearQueue();
  _setVoiceStatus('已停止');
}

function _setVoiceStatus(text) {
  const $s = document.getElementById('voice-status');
  if ($s) $s.textContent = text;
}

function _updateVoiceUI() {
  const $pause = document.getElementById('voice-pause');
  const $status = document.getElementById('voice-status');
  if (!$pause || !$status) return;

  if (_voiceState.speaking && !_voiceState.paused) {
    $pause.textContent = '⏸';
    $pause.classList.add('active');
    $status.textContent = `朗讀中 (${_voiceState.currentIdx + 1})`;
  } else if (_voiceState.paused) {
    $pause.textContent = '▶';
    $pause.classList.add('active');
    $status.textContent = '已暫停';
  } else {
    $pause.textContent = '⏸';
    $pause.classList.remove('active');
    $status.textContent = '就緒';
  }

  // Highlight current playing item
  document.querySelectorAll('.voice-queue-item').forEach((el, i) => {
    el.classList.toggle('current', i === _voiceState.currentIdx);
  });
}

/* ═══════════════════════════════════════════
   BGM Preset Preview Panel
   ═══════════════════════════════════════════ */

let _bgmModule = null;
let _bgmState  = { playing: false, currentPreset: null };

async function _loadBgm() {
  if (_bgmModule) return _bgmModule;
  try {
    _bgmModule = await import('../../core/bgm.js');
    _bgmModule.setBgmStateListener((state, detail) => {
      if (state === 'playing') {
        _bgmState.playing = true;
        _bgmState.currentPreset = detail?.scoreId || detail?.preset || null;
      } else if (state === 'stopped' || state === 'idle') {
        _bgmState.playing = false;
        _bgmState.currentPreset = null;
      }
      Bus.emit('bgm:state', state, detail);
      _updateBgmUI();
    });
  } catch (err) {
    console.error('[SE Write] BGM module failed to load:', err);
    _bgmModule = { _unavailable: true };
  }
  return _bgmModule;
}

export async function renderBgmPreview(container) {
  await _loadBgm();
  if (_bgmModule._unavailable) {
    container.innerHTML = '<div class="empty-preview">BGM 功能未啟用<br><span style="font-size:11px">需在設定中開啟 bgm feature gate</span></div>';
    return;
  }

  const presets = _bgmModule.getPresets();

  container.innerHTML = `
    <div class="bgm-panel">
      <div class="bgm-controls">
        <button id="bgm-stop"   title="停止">⏹</button>
        <span class="spacer"></span>
        <span class="bgm-status" id="bgm-status">就緒</span>
      </div>

      <div class="bgm-settings">
        <label>音量 <span id="bgm-vol-val">60%</span></label>
        <input type="range" id="bgm-volume" min="0" max="1" step="0.05" value="0.6">
      </div>

      <div class="preset-grid" id="bgm-preset-grid">
        ${presets.map(p => `
          <div class="preset-card" data-id="${p.id}">
            <div class="pc-name">${esc(p.name)}</div>
            <div class="pc-inst">${esc(_bgmModule.INSTRUMENTS[p.instrument]?.label || p.instrument)}</div>
            <div class="pc-mood">${esc(p.mood)} · ${esc(p.scale)}</div>
          </div>
        `).join('')}
      </div>

      <div class="score-preview" id="score-preview" style="display:none">
        <div class="score-preview-title" id="score-preview-title">—</div>
        <div class="score-timeline" id="score-timeline"></div>
        <div class="score-meta" id="score-meta"></div>
      </div>
    </div>
  `;

  // Wire up preset cards
  container.querySelectorAll('.preset-card').forEach(card => {
    card.onclick = () => playPreset(card.dataset.id);
  });

  container.querySelector('#bgm-stop').onclick = stopBgm;

  const $vol = container.querySelector('#bgm-volume');
  $vol.oninput = e => {
    _bgmModule.setVolume(+e.target.value);
    container.querySelector('#bgm-vol-val').textContent = Math.round(e.target.value * 100) + '%';
  };

  _updateBgmUI();
}

async function playPreset(id) {
  await _loadBgm();
  if (_bgmModule._unavailable) return;

  if (_bgmState.playing) _bgmModule.stopScore();
  const preset = _bgmModule.getPresetById(id);
  if (!preset) return;

  _bgmModule.playPreset(id);
  _bgmState.currentPreset = id;

  // Render score preview
  const $sp    = document.getElementById('score-preview');
  const $title = document.getElementById('score-preview-title');
  const $tl    = document.getElementById('score-timeline');
  const $meta  = document.getElementById('score-meta');
  if ($sp && $tl) {
    $sp.style.display = '';
    $title.textContent = `${preset.name} · ${preset.tempo} BPM`;
    const score = _bgmModule.presetToScore(preset);
    const totalBeats = Math.max(...score.notes.map(n => n.time + n.duration), 1);
    $tl.innerHTML = score.notes.map((n, i) => {
      const left = (n.time / totalBeats) * 100;
      const width = Math.max((n.duration / totalBeats) * 100, 0.5);
      const top = 50 - (parseInt(n.pitch.match(/\d+/)?.[0] || 4) - 3) * 8;
      return `<div class="score-note" data-idx="${i}" style="left:${left}%;width:${width}%;top:${top}%;height:8px"></div>`;
    }).join('');
    $meta.innerHTML = `<span>${score.notes.length} 音符</span><span>${preset.scale}</span><span>reverb ${preset.effects.reverb}</span>`;
  }
}

function stopBgm() {
  if (!_bgmModule || _bgmModule._unavailable) return;
  _bgmModule.stopScore();
  _bgmState.playing = false;
  _bgmState.currentPreset = null;
}

function _updateBgmUI() {
  document.querySelectorAll('.preset-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === _bgmState.currentPreset);
  });
  const $status = document.getElementById('bgm-status');
  if ($status) $status.textContent = _bgmState.playing ? '播放中' : '就緒';
}

/* ═══════════════════════════════════════════
   Character List — slot badges + context menu
   ═══════════════════════════════════════════ */

export function renderCharListWithSlots(container) {
  const chars = AppState.get('characters') || [];
  if (!chars.length) {
    container.innerHTML = '<div class="empty-chars">尚未建立角色卡。<br>編輯器會自動偵測角色，<br>或點擊「+ 新增」手動建立。</div>';
    return;
  }

  const blocks = AppState.get('blocks') || [];
  const counts = {};
  for (const b of blocks) {
    if (b.speaker) counts[b.speaker] = (counts[b.speaker] || 0) + 1;
  }

  // Find which Alt slot each character occupies
  const shortcuts = ShortcutManager.getMap();
  const charToSlot = {};
  for (const [key, binding] of Object.entries(shortcuts)) {
    if (binding.type === 'character' && binding.charId) {
      charToSlot[binding.charId] = key.replace('Alt+', '');
    }
  }

  container.innerHTML = chars.map(c => {
    const n = counts[c.displayName] || 0;
    const aliasStr = c.aliases?.length ? c.aliases.join(', ') : '';
    const slot = charToSlot[c.id];
    const badge = slot ? `<span class="char-slot-badge" title="快捷鍵 Alt+${slot}">⌥${slot}</span>` : '';

    return `<div class="char-card" data-id="${c.id}">
      <span class="char-dot" style="background:${c.color || 'var(--gold)'}"></span>
      <div class="char-info">
        <div class="char-name">${esc(c.displayName)} ${badge}</div>
        ${aliasStr ? `<div class="char-aliases">${esc(aliasStr)}</div>` : ''}
      </div>
      <span class="char-count">${n}</span>
      <div class="char-actions">
        <button data-action="edit" data-id="${c.id}" title="編輯">&#9998;</button>
      </div>
    </div>`;
  }).join('');

  // Wire up edit button (delegated to outer module)
  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      Bus.emit('char:edit-requested', btn.dataset.id);
    });
  });

  // Right-click → context menu (assign Alt slot)
  container.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      _showCharContextMenu(e.clientX, e.clientY, card.dataset.id);
    });
  });
}

function _showCharContextMenu(x, y, charId) {
  // Remove any existing menu
  document.getElementById('char-ctx-menu')?.remove();

  const chars = AppState.get('characters') || [];
  const c = chars.find(ch => ch.id === charId);
  if (!c) return;

  const shortcuts = ShortcutManager.getMap();
  const usedSlots = new Set();
  for (const [key, binding] of Object.entries(shortcuts)) {
    if (binding.type === 'character') usedSlots.add(key);
  }

  const menu = document.createElement('div');
  menu.id = 'char-ctx-menu';
  menu.className = 'char-ctx-menu';
  menu.style.cssText = `
    position:fixed;left:${x}px;top:${y}px;z-index:300;
    background:var(--navy);border:1px solid var(--navy-line);border-radius:6px;
    box-shadow:var(--shadow-lift);padding:4px;min-width:180px;font-size:12px;
  `;

  const slots = [];
  for (let n = 3; n <= 9; n++) {
    const key = `Alt+${n}`;
    const b = shortcuts[key];
    const isCurrentChar = b?.charId === charId;
    const occupant = b?.type === 'character' ? b.label : null;
    slots.push(`
      <button class="ctx-slot" data-slot="${n}"
        style="display:block;width:100%;text-align:left;padding:6px 10px;
               border:none;background:${isCurrentChar ? 'var(--navy-light)' : 'transparent'};
               color:${isCurrentChar ? 'var(--gold)' : 'var(--text-secondary)'};
               font-size:12px;cursor:pointer;border-radius:3px">
        Alt+${n} ${occupant && !isCurrentChar ? `· <span style="opacity:.5">${esc(occupant)}</span>` : isCurrentChar ? '✓' : ''}
      </button>
    `);
  }

  menu.innerHTML = `
    <div style="padding:4px 10px;font-size:11px;color:var(--text-tertiary);border-bottom:1px solid var(--navy-line);margin-bottom:4px">
      指派 ${esc(c.displayName)} 至…
    </div>
    ${slots.join('')}
    <div style="height:1px;background:var(--navy-line);margin:4px 0"></div>
    <button class="ctx-clear" style="display:block;width:100%;text-align:left;padding:6px 10px;
      border:none;background:transparent;color:var(--text-tertiary);
      font-size:12px;cursor:pointer;border-radius:3px">
      清除快捷鍵綁定
    </button>
  `;

  document.body.appendChild(menu);

  menu.querySelectorAll('.ctx-slot').forEach(btn => {
    btn.onclick = () => {
      const slot = btn.dataset.slot;
      // Remove other slots bound to this char
      for (const [k, b] of Object.entries(shortcuts)) {
        if (b.type === 'character' && b.charId === charId) ShortcutManager.remove(k);
      }
      ShortcutManager.set(`Alt+${slot}`, { type: 'character', charId, label: c.displayName });
      menu.remove();
      Bus.emit('shortcuts:user-updated');
    };
  });

  menu.querySelector('.ctx-clear').onclick = () => {
    for (const [k, b] of Object.entries(shortcuts)) {
      if (b.type === 'character' && b.charId === charId) ShortcutManager.remove(k);
    }
    menu.remove();
    Bus.emit('shortcuts:user-updated');
  };

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', function onDocClick(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', onDocClick); }
    });
  }, 0);
}

/* ═══════════════════════════════════════════
   Subscribe to state for live updates
   ═══════════════════════════════════════════ */

Bus.on('state:blocks', () => {
  // Refresh queue list if voice panel is open
  if (document.getElementById('voice-queue-list')) _renderVoiceQueueList();
});
