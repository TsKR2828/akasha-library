/**
 * search-tab.js — Search TAB
 * Phase 17-4
 *
 * Filter bar + result cards + MD/CSV export.
 * Clicking a result jumps to Editor TAB with that block focused.
 */

import {
  AppState, Bus, esc, downloadFile, getCharColor,
  TAG_PALETTE, TAG_CATEGORIES, debounce,
} from './data-model.js';

let _container = null;
let _filters = { q: '', character: '', plot: '', emotion: '', type: '', sort: 'order' };

/* ═══════════════════════════════════════════
   Entry Point
   ═══════════════════════════════════════════ */

export function initSearchTab(panelEl) {
  _container = panelEl;

  Bus.on('state:blocks', () => { if (isVisible()) render(); });
  Bus.on('state:characters', () => { if (isVisible()) render(); });
  Bus.on('tab:switched', tab => { if (tab === 'search') render(); });

  if (isVisible()) render();
}

function isVisible() {
  return document.getElementById('tab-search')?.classList.contains('active');
}

/* ═══════════════════════════════════════════
   Render
   ═══════════════════════════════════════════ */

function render() {
  if (!_container) return;
  const blocks = AppState.get('blocks') || [];
  const chars  = AppState.get('characters') || [];

  // Collect TAG suggestions
  const plotTags    = new Set();
  const emotionTags = new Set();
  for (const b of blocks) {
    if (b.tags && Array.isArray(b.tags)) {
      for (const [t, k] of b.tags) {
        if (k === 'plot')    plotTags.add(t);
        if (k === 'emotion') emotionTags.add(t);
      }
    }
  }

  _container.innerHTML = `
    <div class="search-layout-inner">

      <div class="search-filters">
        <input id="sf-q" placeholder="關鍵字 · keyword（搜原文 / 中譯 / 角色）" value="${esc(_filters.q)}">

        <select id="sf-character">
          <option value="">全部角色</option>
          ${chars.map(c => `<option value="${esc(c.id)}" ${c.id === _filters.character ? 'selected' : ''}>${esc(c.displayName)}</option>`).join('')}
        </select>

        <input id="sf-plot" list="plot-tags" placeholder="劇情 TAG" value="${esc(_filters.plot)}">
        <datalist id="plot-tags">${[...plotTags].map(t => `<option value="${esc(t)}">`).join('')}</datalist>

        <input id="sf-emotion" list="emotion-tags" placeholder="情緒 TAG" value="${esc(_filters.emotion)}">
        <datalist id="emotion-tags">${[...emotionTags].map(t => `<option value="${esc(t)}">`).join('')}</datalist>

        <select id="sf-type">
          <option value="">全部類型</option>
          <option value="dialogue"  ${_filters.type === 'dialogue'  ? 'selected' : ''}>對白</option>
          <option value="narration" ${_filters.type === 'narration' ? 'selected' : ''}>旁白</option>
          <option value="scene"     ${_filters.type === 'scene'     ? 'selected' : ''}>場景</option>
          <option value="choice"    ${_filters.type === 'choice'    ? 'selected' : ''}>選項</option>
          <option value="note"      ${_filters.type === 'note'      ? 'selected' : ''}>編註</option>
          <option value="command"   ${_filters.type === 'command'   ? 'selected' : ''}>指令</option>
        </select>

        <select id="sf-sort">
          <option value="order"     ${_filters.sort === 'order'     ? 'selected' : ''}>原順序</option>
          <option value="character" ${_filters.sort === 'character' ? 'selected' : ''}>依角色</option>
          <option value="length"    ${_filters.sort === 'length'    ? 'selected' : ''}>依長度</option>
        </select>

        <button id="sf-clear" class="search-clear">清除</button>
      </div>

      <div class="search-meta" id="search-meta"></div>
      <div class="search-results" id="search-results"></div>

      <div class="search-export-bar" id="search-export-bar" style="display:none">
        <span class="bar-label">匯出：</span>
        <button id="export-md">⇣ Markdown</button>
        <button id="export-csv">⇣ CSV</button>
        <span style="flex:1"></span>
        <button id="goto-reader" class="bar-btn-accent">→ 跳到閱讀 TAB</button>
      </div>

    </div>
  `;

  wireFilters();
  applyFilters();
}

function wireFilters() {
  const debouncedApply = debounce(applyFilters, 200);

  _container.querySelector('#sf-q').addEventListener('input', e => {
    _filters.q = e.target.value; debouncedApply();
  });
  _container.querySelector('#sf-character').addEventListener('change', e => {
    _filters.character = e.target.value; applyFilters();
  });
  _container.querySelector('#sf-plot').addEventListener('input', e => {
    _filters.plot = e.target.value; debouncedApply();
  });
  _container.querySelector('#sf-emotion').addEventListener('input', e => {
    _filters.emotion = e.target.value; debouncedApply();
  });
  _container.querySelector('#sf-type').addEventListener('change', e => {
    _filters.type = e.target.value; applyFilters();
  });
  _container.querySelector('#sf-sort').addEventListener('change', e => {
    _filters.sort = e.target.value; applyFilters();
  });
  _container.querySelector('#sf-clear').addEventListener('click', () => {
    _filters = { q: '', character: '', plot: '', emotion: '', type: '', sort: 'order' };
    render();
  });
}

/* ═══════════════════════════════════════════
   Filter + Render Results
   ═══════════════════════════════════════════ */

function applyFilters() {
  const blocks = AppState.get('blocks') || [];
  const chars  = AppState.get('characters') || [];
  const f = _filters;
  const q = f.q.toLowerCase();

  const filtered = blocks.filter(b => {
    // Type filter
    if (f.type && b.type !== f.type) return false;

    // Character filter
    if (f.character) {
      const cId = b.speakerId || (chars.find(c => c.displayName === b.speaker)?.id);
      if (cId !== f.character) return false;
    }

    // Plot / emotion TAG (substring match)
    if (f.plot) {
      const has = (b.tags || []).some(([t, k]) => k === 'plot' && t.toLowerCase().includes(f.plot.toLowerCase()));
      if (!has) return false;
    }
    if (f.emotion) {
      const has = (b.tags || []).some(([t, k]) => k === 'emotion' && t.toLowerCase().includes(f.emotion.toLowerCase()));
      if (!has) return false;
    }

    // Keyword
    if (q) {
      const fields = [b.text, b.original, b.zh, b.speaker, b.act, b.subtitle, b.command, b.value].filter(Boolean);
      const hay = fields.join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  // Sort
  if (f.sort === 'character') {
    filtered.sort((a, b) => (a.speaker || a.speakerId || '').localeCompare(b.speaker || b.speakerId || ''));
  } else if (f.sort === 'length') {
    const len = b => (b.text || b.original || b.zh || '').length;
    filtered.sort((a, b) => len(b) - len(a));
  }

  // Meta
  const $meta = _container.querySelector('#search-meta');
  $meta.innerHTML = filtered.length
    ? `<span class="result-count">${filtered.length}</span> 筆結果 · ${blocks.length} blocks 中`
    : `0 筆結果 · 嘗試清除篩選或改用其他關鍵字`;

  // Results
  const $results = _container.querySelector('#search-results');
  if (!filtered.length) {
    $results.innerHTML = renderEmpty();
  } else {
    $results.innerHTML = filtered.map((b, i) => renderResultCard(b, blocks.indexOf(b))).join('');
    $results.querySelectorAll('.result-card').forEach(card => {
      card.onclick = () => jumpToBlock(card.dataset.blockId);
    });
  }

  // Export bar
  const $bar = _container.querySelector('#search-export-bar');
  $bar.style.display = filtered.length ? '' : 'none';
  if (filtered.length) {
    _container.querySelector('#export-md').onclick    = () => exportMarkdown(filtered);
    _container.querySelector('#export-csv').onclick   = () => exportCsv(filtered);
    _container.querySelector('#goto-reader').onclick  = () => switchTo('reader');
  }
}

function renderResultCard(b, origIdx) {
  const chars = AppState.get('characters') || [];
  const ch = chars.find(c => c.id === b.speakerId) || chars.find(c => c.displayName === b.speaker);
  const charColor = ch?.color || getCharColor(b.speaker) || 'var(--gold-dim)';

  let typeLabel = ({
    dialogue: '對白', narration: '旁白', scene: '場景',
    choice: '選項', note: '編註', command: '指令',
  })[b.type] || b.type;

  let header = '';
  let body = '';

  if (b.type === 'dialogue') {
    header = `
      <span class="rc-dot" style="background:${charColor}"></span>
      <span class="rc-speaker">${esc(b.speaker || ch?.displayName || '?')}</span>
      ${ch?.displayName && b.speaker !== ch.displayName ? `<span class="rc-speaker-en">${esc(ch.displayName)}</span>` : ''}
    `;
    body = `
      ${b.original ? `<div class="rc-original">「${esc(b.original)}」</div>` : ''}
      ${b.zh       ? `<div class="rc-zh">「${esc(b.zh)}」</div>` : ''}
      ${(b.tags && b.tags.length) ? `
        <div class="rc-tags">${b.tags.map(([t, k]) => {
          const pal = TAG_PALETTE[k] || TAG_PALETTE.plot;
          return `<span class="tag" style="background:${pal.bg};color:${pal.fg};border:1px solid ${pal.bd}">${esc(t)}</span>`;
        }).join('')}</div>
      ` : ''}
    `;
  } else if (b.type === 'narration' || b.type === 'note') {
    header = `<span class="rc-type">${typeLabel}</span>`;
    body = `<div class="rc-narr">${esc(b.text || '')}</div>`;
  } else if (b.type === 'scene') {
    header = `<span class="rc-type">場景</span>`;
    body = `<div class="rc-scene">${esc(b.act || '')} ${esc(b.subtitle || '')}</div>`;
  } else if (b.type === 'choice') {
    header = `<span class="rc-type">選項</span>`;
    body = `<div class="rc-choice">${(b.options || []).map(o => `<div>• ${esc(o.text || '')} ${o.target ? `→ ${esc(o.target)}` : ''}</div>`).join('')}</div>`;
  } else if (b.type === 'command') {
    header = `<span class="rc-type">指令</span>`;
    body = `<div class="rc-cmd">#${esc(b.command || '')} : ${esc(b.value || '')}</div>`;
  }

  return `
    <div class="result-card" data-block-id="${esc(b.id)}" data-block-type="${b.type}">
      <div class="rc-header">
        ${header}
        <span style="flex:1"></span>
        <span class="rc-idx">#${origIdx + 1}</span>
        <span class="rc-id">${esc(b.id)}</span>
      </div>
      <div class="rc-body">${body}</div>
    </div>
  `;
}

function renderEmpty() {
  return `
    <div class="search-empty">
      <div class="search-empty-icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="M16 16l4 4"/>
        </svg>
      </div>
      <div class="search-empty-latin">Nullum Inventum</div>
      <div class="search-empty-zh">未找到符合條件的結果</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Jump to block in Editor TAB
   ═══════════════════════════════════════════ */

function jumpToBlock(blockId) {
  localStorage.setItem('se17_focusBlock', blockId);
  switchTo('editor');
  // Wait for tab switch animation
  setTimeout(() => {
    const card = document.querySelector(`#tab-editor [data-block-id="${blockId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.transition = 'box-shadow .4s';
      card.style.boxShadow = '0 0 0 2px var(--gold)';
      setTimeout(() => { card.style.boxShadow = ''; }, 1200);
    }
  }, 100);
  Bus.emit('search:jump-to-block', blockId);
}

function switchTo(tabId) {
  const btn = document.querySelector(`#tab-bar [data-tab="${tabId}"]`);
  if (btn) btn.click();
}

/* ═══════════════════════════════════════════
   Export
   ═══════════════════════════════════════════ */

function exportMarkdown(filtered) {
  const lines = filtered.map(b => {
    if (b.type === 'dialogue') {
      const tags = (b.tags || []).map(([t]) => t).join(', ');
      return `### ${b.speaker || b.speakerId || '?'}\n> ${b.original || ''}\n\n${b.zh || ''}\n\nTags: ${tags}`;
    }
    if (b.type === 'narration') return `*${b.text || ''}*`;
    if (b.type === 'scene')     return `## ${b.act || ''} ${b.subtitle || ''}`;
    if (b.type === 'note')      return `> _Note: ${b.text || ''}_`;
    if (b.type === 'choice')    return `### 選項\n${(b.options || []).map(o => `- ${o.text}`).join('\n')}`;
    if (b.type === 'command')   return `\`#${b.command}: ${b.value}\``;
    return '';
  });
  downloadFile(`search-results-${Date.now()}.md`, lines.join('\n\n---\n\n'), 'text/markdown');
  Bus.emit('toast', `已匯出 ${filtered.length} 筆 → Markdown`);
}

function exportCsv(filtered) {
  const header = 'ID,Type,Speaker,Original,Translation,Text,Tags';
  const rows = filtered.map(b => {
    const speaker = b.speaker || b.speakerId || '';
    const tags = (b.tags || []).map(([t]) => t).join('; ');
    return [
      b.id, b.type, speaker,
      (b.original || '').replace(/"/g, '""'),
      (b.zh || '').replace(/"/g, '""'),
      (b.text || '').replace(/"/g, '""'),
      tags,
    ].map(v => `"${v}"`).join(',');
  });
  downloadFile(`search-results-${Date.now()}.csv`, [header, ...rows].join('\n'), 'text/csv');
  Bus.emit('toast', `已匯出 ${filtered.length} 筆 → CSV`);
}
