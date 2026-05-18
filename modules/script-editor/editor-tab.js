/**
 * editor-tab.js — Editor TAB
 * Phase 17-3
 *
 * Block card list editor with:
 *  - 6 block types (dialogue / narration / scene / choice / note / command)
 *  - TAG editing (5 categories, batch add)
 *  - AVG panel (sprite import + position + BG/BGM/SFX + 16:9 preview)
 *  - JSON preview pane
 *  - Add / delete / focus / move blocks
 *  - Auto-sync to AppState.blocks + write-back to Plain Script
 */

import {
  AppState, Bus, esc, generateId, getCharColor, validateBlock,
  TAG_PALETTE, TAG_CATEGORIES, blocksToPlainScript, icon,
} from './data-model.js';

const BLOCK_META = {
  scene:     { color: 'var(--success)',         label: 'SCENE',     zh: '場次', icon: 'curtain' },
  narration: { color: 'var(--text-secondary)',  label: 'NARRATION', zh: '旁白', icon: 'pen' },
  dialogue:  { color: 'var(--gold)',            label: 'DIALOGUE',  zh: '對白', icon: 'quill' },
  choice:    { color: '#7B8EC9',                label: 'CHOICE',    zh: '選項', icon: 'network' },
  command:   { color: 'var(--text-secondary)',  label: 'COMMAND',   zh: '指令', icon: 'cog' },
  note:      { color: 'var(--gold-dim)',        label: 'NOTE',      zh: '編註', icon: 'file' },
};

const AVG_POSITIONS = [['left', '左'], ['center', '中'], ['right', '右']];

let _container   = null;     // .editor-block-list
let _sidePanel   = null;     // .editor-side-panel
let _focusedId   = null;
let _tagAdderState = {};     // { [blockId]: { open, kind, text } }

/* ═══════════════════════════════════════════
   Entry Point
   ═══════════════════════════════════════════ */

export function initEditorTab(panelEl, sideEl) {
  _container = panelEl;
  _sidePanel = sideEl;

  // Restore focus from Storage
  _focusedId = localStorage.getItem('se17_focusBlock') || null;

  // Subscribe to state changes
  Bus.on('state:blocks', () => { if (isVisible()) render(); });
  Bus.on('state:characters', () => { if (isVisible()) render(); });
  Bus.on('tab:switched', tab => { if (tab === 'editor') render(); });

  // Initial render if tab visible
  if (isVisible()) render();
}

function isVisible() {
  return document.getElementById('tab-editor')?.classList.contains('active');
}

/* ═══════════════════════════════════════════
   Block list renderer
   ═══════════════════════════════════════════ */

function render() {
  if (!_container) return;
  const blocks = AppState.get('blocks') || [];

  // Toolbar
  const toolbar = `
    <div class="editor-bar">
      <div class="editor-bar-add">
        <span class="bar-label">新增：</span>
        ${Object.entries(BLOCK_META).map(([type, m]) => `
          <button class="bar-add-btn" data-add="${type}" title="新增${m.zh}">
            <span style="color:${m.color}">+${m.zh}</span>
          </button>
        `).join('')}
      </div>
      <span class="spacer"></span>
      <button class="bar-btn" id="editor-write-back" title="寫回 Plain Script 至 Write TAB">
        ⇆ 寫回 Write
      </button>
      <span class="editor-bar-stat" id="editor-stat">${blocks.length} blocks</span>
    </div>
  `;

  // Block list
  const list = blocks.length
    ? blocks.map((b, i) => renderBlockCard(b, i)).join('')
    : `<div class="empty-blocks" style="padding:60px 20px;text-align:center;color:var(--text-tertiary);font-size:13px">
        無 blocks。<br>使用上方工具列新增區塊，或先去 Write TAB 寫稿後自動解析。
      </div>`;

  _container.innerHTML = toolbar + list;

  // Wire up toolbar
  _container.querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addBlock(btn.dataset.add);
  });
  _container.querySelector('#editor-write-back').onclick = writeBackToPlainScript;

  // Wire up block cards
  _container.querySelectorAll('[data-block-id]').forEach(card => {
    const id = card.dataset.blockId;
    wireBlockCard(card, id);
  });

  renderSidePanel();
}

function renderBlockCard(b, idx) {
  const meta = BLOCK_META[b.type] || BLOCK_META.command;
  const errors = validateBlock(b, AppState.get('characters') || []);
  const charDot = b.type === 'dialogue' ? getCharColor(b.speaker || b.speakerId) : meta.color;
  const isFocused = b.id === _focusedId && b.type === 'dialogue';

  const errorBanner = errors.length
    ? `<div class="block-err">${errors.map(e => `<div>⚠ ${esc(e)}</div>`).join('')}</div>`
    : '';

  // Type-specific body
  let body = '';
  if (b.type === 'dialogue') {
    body = renderDialogueBody(b);
  } else if (b.type === 'narration' || b.type === 'note') {
    body = `<textarea class="bc-textarea" data-field="text" rows="2" placeholder="${b.type === 'narration' ? '旁白文字' : '編註內容'}">${esc(b.text || '')}</textarea>`;
  } else if (b.type === 'scene') {
    body = `
      <input class="bc-input mono" data-field="act" value="${esc(b.act || '')}" placeholder="幕場標記，如 Akt 1 · Sz 2">
      <input class="bc-input" data-field="subtitle" value="${esc(b.subtitle || '')}" placeholder="場景副標">
    `;
  } else if (b.type === 'choice') {
    const opts = b.options || [];
    body = `
      <div class="bc-choice-list">
        ${opts.map((o, i) => `
          <div class="bc-choice-row" data-opt-idx="${i}">
            <input class="bc-input" data-field="opt-text" data-opt-idx="${i}" value="${esc(o.text || '')}" placeholder="選項 ${i + 1} 文字">
            <input class="bc-input mono short" data-field="opt-target" data-opt-idx="${i}" value="${esc(o.target || '')}" placeholder="target id">
            <button class="bc-opt-remove" data-opt-idx="${i}">✕</button>
          </div>
        `).join('')}
        <button class="bc-opt-add">+ 新增選項</button>
      </div>
    `;
  } else if (b.type === 'command') {
    body = `
      <div class="bc-cmd-row">
        <input class="bc-input mono short" data-field="command" value="${esc(b.command || '')}" placeholder="命令名稱">
        <input class="bc-input mono" data-field="value" value="${esc(b.value || '')}" placeholder="值">
      </div>
    `;
  }

  // TAG row (dialogue only)
  let tagRow = '';
  if (b.type === 'dialogue') {
    const tags = b.tags || [];
    tagRow = `
      <div class="bc-tag-row">
        ${tags.map(([t, k], i) => {
          const pal = TAG_PALETTE[k] || TAG_PALETTE.plot;
          return `<span class="tag" style="background:${pal.bg};color:${pal.fg};border:1px solid ${pal.bd}">
            ${esc(t)}
            <button class="tag-remove" data-tag-idx="${i}">✕</button>
          </span>`;
        }).join('')}
        <button class="bc-tag-add">+ TAG</button>
      </div>
    `;
  }

  return `
    <div class="block-edit-card ${isFocused ? 'focused' : ''} ${errors.length ? 'errored' : ''}"
      data-block-id="${b.id}" data-block-type="${b.type}"
      style="border-left:3px solid ${errors.length ? 'var(--danger)' : charDot}">
      <div class="bc-header">
        <span class="bc-type" style="color:${meta.color}">· ${meta.label}</span>
        ${b.type === 'dialogue' ? renderSpeakerSelect(b) : ''}
        <span style="flex:1"></span>
        <span class="bc-id">#${esc(b.id)}</span>
        <button class="bc-move-up" title="上移">▲</button>
        <button class="bc-move-down" title="下移">▼</button>
        <button class="bc-remove" title="刪除">🗑</button>
      </div>
      ${errorBanner}
      ${body}
      ${tagRow}
    </div>
  `;
}

function renderSpeakerSelect(b) {
  const chars = AppState.get('characters') || [];
  return `
    <select class="bc-speaker" data-field="speakerId">
      <option value="">— 選擇角色 —</option>
      ${chars.map(c => `
        <option value="${esc(c.id)}" ${c.id === b.speakerId ? 'selected' : ''}>
          ${esc(c.displayName)} (${esc(c.id)})
        </option>
      `).join('')}
    </select>
  `;
}

function renderDialogueBody(b) {
  return `
    <textarea class="bc-textarea" data-field="original" rows="1" placeholder="原文（德 / 英 / 義…）">${esc(b.original || b.text || '')}</textarea>
    <textarea class="bc-textarea" data-field="zh" rows="1" placeholder="中譯">${esc(b.zh || '')}</textarea>
  `;
}

/* ═══════════════════════════════════════════
   Block Card wiring
   ═══════════════════════════════════════════ */

function wireBlockCard(card, id) {
  const blocks = AppState.get('blocks') || [];
  const idx = blocks.findIndex(b => b.id === id);
  if (idx < 0) return;

  // Focus on click (dialogue)
  card.onclick = e => {
    if (e.target.matches('input, textarea, select, button')) return;
    if (blocks[idx].type === 'dialogue') setFocus(id);
  };

  // Field updates
  card.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('input', () => updateBlockField(id, el));
    el.addEventListener('change', () => updateBlockField(id, el));
  });

  // Move / remove
  card.querySelector('.bc-move-up').onclick   = () => moveBlock(id, -1);
  card.querySelector('.bc-move-down').onclick = () => moveBlock(id,  1);
  card.querySelector('.bc-remove').onclick    = () => removeBlock(id);

  // Choice options
  card.querySelectorAll('.bc-opt-remove').forEach(btn => {
    btn.onclick = () => removeOption(id, +btn.dataset.optIdx);
  });
  card.querySelector('.bc-opt-add')?.addEventListener('click', () => addOption(id));

  // Tags
  card.querySelectorAll('.tag-remove').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); removeTag(id, +btn.dataset.tagIdx); };
  });
  card.querySelector('.bc-tag-add')?.addEventListener('click', () => openTagAdder(id, card));
}

function updateBlockField(id, el) {
  const blocks = AppState.get('blocks') || [];
  const idx = blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const b = blocks[idx];
  const field = el.dataset.field;

  if (field === 'speakerId') {
    const ch = (AppState.get('characters') || []).find(c => c.id === el.value);
    b.speakerId = el.value;
    if (ch) b.speaker = ch.displayName;
  } else if (field === 'opt-text') {
    const optIdx = +el.dataset.optIdx;
    if (!b.options) b.options = [];
    b.options[optIdx] = { ...(b.options[optIdx] || {}), text: el.value };
  } else if (field === 'opt-target') {
    const optIdx = +el.dataset.optIdx;
    if (!b.options) b.options = [];
    b.options[optIdx] = { ...(b.options[optIdx] || {}), target: el.value };
  } else {
    b[field] = el.value;
  }

  AppState.set('blocks', [...blocks]);
  saveDraft();
  refreshCard(id);
  if (id === _focusedId) renderSidePanel();
}

function addBlock(type) {
  const blocks = AppState.get('blocks') || [];
  const newBlock = createDefaultBlock(type);
  const insertAt = _focusedId
    ? blocks.findIndex(b => b.id === _focusedId) + 1
    : blocks.length;
  blocks.splice(insertAt, 0, newBlock);
  AppState.set('blocks', [...blocks]);
  saveDraft();
  if (newBlock.type === 'dialogue') setFocus(newBlock.id);
  render();
}

function createDefaultBlock(type) {
  const id = generateId(type.slice(0, 3));
  if (type === 'dialogue') {
    const chars = AppState.get('characters') || [];
    return {
      id, type: 'dialogue',
      speakerId: chars[0]?.id || '', speaker: chars[0]?.displayName || '',
      original: '', zh: '', tags: [],
      avg: { sprite: '', spriteData: null, position: 'center', bg: '', bgm: '', sfx: '' },
    };
  }
  if (type === 'narration') return { id, type: 'narration', text: '' };
  if (type === 'scene')     return { id, type: 'scene', act: '', subtitle: '' };
  if (type === 'choice')    return { id, type: 'choice', options: [{ text: '', target: '' }] };
  if (type === 'note')      return { id, type: 'note', text: '' };
  if (type === 'command')   return { id, type: 'command', command: '', value: '' };
  return { id, type };
}

function removeBlock(id) {
  if (!confirm('確定刪除此 block？')) return;
  const blocks = (AppState.get('blocks') || []).filter(b => b.id !== id);
  AppState.set('blocks', blocks);
  saveDraft();
  if (id === _focusedId) _focusedId = null;
  render();
}

function moveBlock(id, delta) {
  const blocks = AppState.get('blocks') || [];
  const idx = blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= blocks.length) return;
  const [item] = blocks.splice(idx, 1);
  blocks.splice(newIdx, 0, item);
  AppState.set('blocks', [...blocks]);
  saveDraft();
  render();
}

function addOption(id) {
  const blocks = AppState.get('blocks') || [];
  const b = blocks.find(b => b.id === id);
  if (!b) return;
  b.options = [...(b.options || []), { text: '', target: '' }];
  AppState.set('blocks', [...blocks]);
  refreshCard(id);
}

function removeOption(id, optIdx) {
  const blocks = AppState.get('blocks') || [];
  const b = blocks.find(b => b.id === id);
  if (!b || !b.options) return;
  b.options.splice(optIdx, 1);
  AppState.set('blocks', [...blocks]);
  refreshCard(id);
}

function removeTag(id, tagIdx) {
  const blocks = AppState.get('blocks') || [];
  const b = blocks.find(b => b.id === id);
  if (!b || !b.tags) return;
  b.tags.splice(tagIdx, 1);
  AppState.set('blocks', [...blocks]);
  saveDraft();
  refreshCard(id);
}

function openTagAdder(blockId, card) {
  // Close existing inline tag adder
  card.querySelector('.tag-adder-inline')?.remove();

  const addBtn = card.querySelector('.bc-tag-add');
  if (!addBtn) return;

  const adder = document.createElement('span');
  adder.className = 'tag-adder-inline';
  adder.innerHTML = `
    <select class="ta-kind">
      ${TAG_CATEGORIES.map(k => `<option value="${k}">${k}</option>`).join('')}
    </select>
    <input class="ta-text" placeholder="TAG 名稱…" autofocus>
    <button class="ta-add">+</button>
    <button class="ta-close">✕</button>
  `;
  addBtn.replaceWith(adder);

  const $kind = adder.querySelector('.ta-kind');
  const $text = adder.querySelector('.ta-text');
  const submit = () => {
    const t = $text.value.trim();
    if (!t) { close(); return; }
    const blocks = AppState.get('blocks') || [];
    const b = blocks.find(bb => bb.id === blockId);
    if (b) {
      b.tags = [...(b.tags || []), [t, $kind.value]];
      AppState.set('blocks', [...blocks]);
      saveDraft();
    }
    $text.value = '';
    refreshCard(blockId);
    // keep open for batch
    setTimeout(() => {
      const newCard = _container.querySelector(`[data-block-id="${blockId}"]`);
      if (newCard) openTagAdder(blockId, newCard);
    }, 0);
  };
  const close = () => refreshCard(blockId);

  adder.querySelector('.ta-add').onclick = submit;
  adder.querySelector('.ta-close').onclick = close;
  $text.onkeydown = e => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  };
  $text.focus();
}

function refreshCard(id) {
  const blocks = AppState.get('blocks') || [];
  const idx = blocks.findIndex(b => b.id === id);
  if (idx < 0) return;
  const oldCard = _container.querySelector(`[data-block-id="${id}"]`);
  if (!oldCard) return;
  const html = renderBlockCard(blocks[idx], idx);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const newCard = tmp.firstElementChild;
  oldCard.replaceWith(newCard);
  wireBlockCard(newCard, id);
}

/* ═══════════════════════════════════════════
   Side Panel — AVG + JSON preview
   ═══════════════════════════════════════════ */

function setFocus(id) {
  _focusedId = id;
  localStorage.setItem('se17_focusBlock', id || '');
  // Update card highlights without full re-render
  _container.querySelectorAll('.block-edit-card').forEach(c => {
    c.classList.toggle('focused', c.dataset.blockId === id);
  });
  renderSidePanel();
}

function renderSidePanel() {
  if (!_sidePanel) return;

  const blocks = AppState.get('blocks') || [];
  const focused = blocks.find(b => b.id === _focusedId);

  if (!focused || focused.type !== 'dialogue') {
    _sidePanel.innerHTML = `
      <div class="side-empty">
        <div class="side-empty-title">AVG 面板</div>
        <div class="side-empty-msg">
          選擇一個 dialogue block<br>編輯立繪 / 位置 / BGM…
        </div>
      </div>
    `;
    return;
  }

  const avg = focused.avg || {};
  _sidePanel.innerHTML = `
    <div class="side-section">
      <div class="side-section-title">立繪預覽 16:9</div>
      ${renderSpritePreview(focused)}
    </div>

    <div class="side-section">
      <div class="side-section-title">AVG · 視聽資料</div>

      <div class="avg-field">
        <div class="avg-label">Sprite · 立繪 <button class="avg-import" id="avg-import-btn">📷 Import</button>
          <input type="file" id="avg-sprite-file" accept="image/*" style="display:none">
        </div>
        <input class="avg-input mono" id="avg-sprite" value="${esc(avg.sprite || '')}" placeholder="sprite_id">
        ${avg.spriteData ? `
          <div class="avg-sprite-preview">
            <img src="${avg.spriteData}" alt="${esc(avg.sprite || 'sprite')}">
            <span>已匯入</span>
            <button id="avg-clear-sprite">✕</button>
          </div>
        ` : ''}
      </div>

      <div class="avg-field">
        <div class="avg-label">Position · 位置</div>
        <div class="avg-pos-row">
          ${AVG_POSITIONS.map(([v, l]) => `
            <button class="avg-pos ${avg.position === v ? 'active' : ''}" data-pos="${v}">${l}</button>
          `).join('')}
        </div>
      </div>

      <div class="avg-field">
        <div class="avg-label">Background · 背景</div>
        <input class="avg-input mono" id="avg-bg" value="${esc(avg.bg || '')}" placeholder="bg_id">
      </div>

      <div class="avg-field">
        <div class="avg-label">BGM · 音樂</div>
        <input class="avg-input mono" id="avg-bgm" value="${esc(avg.bgm || '')}" placeholder="bgm_id">
      </div>

      <div class="avg-field">
        <div class="avg-label">SFX · 音效</div>
        <input class="avg-input mono" id="avg-sfx" value="${esc(avg.sfx || '')}" placeholder="sfx_id">
      </div>
    </div>

    <div class="side-section">
      <div class="side-section-title">JSON Preview</div>
      ${renderJsonPreview(focused)}
    </div>
  `;

  wireSidePanel(focused);
}

function renderSpritePreview(b) {
  const avg = b.avg || {};
  const posX = { left: '15%', center: '50%', right: '85%' }[avg.position || 'center'];
  const chars = AppState.get('characters') || [];
  const ch = chars.find(c => c.id === b.speakerId);
  const charColor = ch?.color || 'var(--gold-dim)';
  const initial = (ch?.displayName || '?')[0];

  return `
    <div class="sprite-preview">
      ${avg.bg ? `<div class="sp-bg-label">BG: ${esc(avg.bg)}</div>` : ''}
      <div class="sp-sprite-wrap" style="left:${posX}">
        ${avg.spriteData
          ? `<img src="${avg.spriteData}" alt="${esc(avg.sprite || 'sprite')}">`
          : `<div class="sp-placeholder" style="background:${charColor}">${esc(initial)}</div>`
        }
        <div class="sp-sprite-name">${esc(avg.sprite || 'no sprite')}</div>
        <div class="sp-position">${esc(avg.position || 'center')}</div>
      </div>
      <div class="sp-indicators">
        ${avg.bgm ? `<span>♪ ${esc(avg.bgm)}</span>` : ''}
        ${avg.sfx ? `<span>◊ ${esc(avg.sfx)}</span>` : ''}
      </div>
      <div class="sp-aspect">16 : 9</div>
    </div>
  `;
}

function renderJsonPreview(b) {
  const out = { ...b };
  delete out.id;
  return `<pre class="json-preview">${esc(JSON.stringify(out, null, 2))}</pre>`;
}

function wireSidePanel(focused) {
  const updateAvg = (key, val) => {
    const blocks = AppState.get('blocks') || [];
    const b = blocks.find(bb => bb.id === focused.id);
    if (!b) return;
    b.avg = { ...(b.avg || {}), [key]: val };
    AppState.set('blocks', [...blocks]);
    saveDraft();
    renderSidePanel();
    refreshCard(focused.id);
  };

  // Sprite import
  const $importBtn  = _sidePanel.querySelector('#avg-import-btn');
  const $spriteFile = _sidePanel.querySelector('#avg-sprite-file');
  if ($importBtn && $spriteFile) {
    $importBtn.onclick = () => $spriteFile.click();
    $spriteFile.onchange = e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert(`檔案格式不支援（${file.type || '未知'}）。請選擇圖片檔。`);
        return;
      }
      const MAX = 512 * 1024;
      if (file.size > MAX) {
        alert(`立繪檔案過大（${(file.size / 1024).toFixed(0)} KB）。上限 512 KB。`);
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const blocks = AppState.get('blocks') || [];
        const b = blocks.find(bb => bb.id === focused.id);
        if (!b) return;
        b.avg = {
          ...(b.avg || {}),
          spriteData: ev.target.result,
          sprite: b.avg?.sprite || file.name.replace(/\.[^.]+$/, ''),
        };
        AppState.set('blocks', [...blocks]);
        saveDraft();
        renderSidePanel();
      };
      reader.readAsDataURL(file);
    };
  }

  _sidePanel.querySelector('#avg-clear-sprite')?.addEventListener('click', () => {
    const blocks = AppState.get('blocks') || [];
    const b = blocks.find(bb => bb.id === focused.id);
    if (!b) return;
    b.avg = { ...(b.avg || {}), spriteData: null };
    AppState.set('blocks', [...blocks]);
    renderSidePanel();
  });

  _sidePanel.querySelector('#avg-sprite')?.addEventListener('input', e => updateAvg('sprite', e.target.value));
  _sidePanel.querySelector('#avg-bg')?.addEventListener('input',     e => updateAvg('bg',     e.target.value));
  _sidePanel.querySelector('#avg-bgm')?.addEventListener('input',    e => updateAvg('bgm',    e.target.value));
  _sidePanel.querySelector('#avg-sfx')?.addEventListener('input',    e => updateAvg('sfx',    e.target.value));

  _sidePanel.querySelectorAll('.avg-pos').forEach(btn => {
    btn.onclick = () => updateAvg('position', btn.dataset.pos);
  });
}

/* ═══════════════════════════════════════════
   Write back to Plain Script
   ═══════════════════════════════════════════ */

function writeBackToPlainScript() {
  const blocks = AppState.get('blocks') || [];
  if (!blocks.length) {
    Bus.emit('toast', '無 blocks 可寫回');
    return;
  }
  const text = blocksToPlainScript(blocks);

  // Push to textarea (Write tab)
  const $editor = document.getElementById('script-editor');
  if ($editor) {
    $editor.value = text;
    // Trigger change events
    AppState.set('content', text);
    try { localStorage.setItem('se17_plain__default', text); } catch {}
  }

  Bus.emit('toast', `已寫回 ${blocks.length} blocks → Write TAB`);
}

function saveDraft() {
  const blocks = AppState.get('blocks') || [];
  try { localStorage.setItem('se17_draft__default', JSON.stringify(blocks)); } catch {}
  // Notify Write TAB to sync textarea
  Bus.emit('blocks:edited-external');
}
