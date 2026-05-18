/**
 * reader-tab.js — Reader TAB
 * Phase 17-5
 *
 * Continuous reading layout with scene grouping.
 * Features:
 *  - Scene TOC sidebar + IntersectionObserver active highlight
 *  - Click TOC item → smooth scroll to scene
 *  - Distinct styles per block type (dialogue / narration / scene / choice / note)
 *  - TAG hover (title attribute)
 *  - Choice → click option → jump to target block
 *  - Optional PDF export via window.print
 */

import {
  AppState, Bus, esc, getCharColor, TAG_PALETTE,
} from './data-model.js';

let _container = null;     // .reader-layout container
let _tocEl     = null;
let _bodyEl    = null;
let _observer  = null;

/* ═══════════════════════════════════════════
   Entry
   ═══════════════════════════════════════════ */

export function initReaderTab(panelEl) {
  _container = panelEl;

  Bus.on('state:blocks', () => { if (isVisible()) render(); });
  Bus.on('state:characters', () => { if (isVisible()) render(); });
  Bus.on('tab:switched', tab => { if (tab === 'reader') render(); });

  if (isVisible()) render();
}

function isVisible() {
  return document.getElementById('tab-reader')?.classList.contains('active');
}

/* ═══════════════════════════════════════════
   Render
   ═══════════════════════════════════════════ */

function render() {
  if (!_container) return;
  const blocks = AppState.get('blocks') || [];

  if (!blocks.length) {
    _container.innerHTML = `
      <div class="reader-empty">
        <div class="reader-empty-title">無內容</div>
        <div class="reader-empty-msg">先去 Write TAB 寫稿或 Editor TAB 新增 blocks</div>
      </div>
    `;
    return;
  }

  // Group blocks by scene
  const groups = [];
  let cur = null;
  blocks.forEach(b => {
    if (b.type === 'scene' || (b.type === 'command' && b.command === 'scene')) {
      const sceneBlock = b.type === 'scene' ? b : {
        id: b.id,
        type: 'scene',
        act: b.value || '',
        subtitle: '',
      };
      cur = { scene: sceneBlock, blocks: [] };
      groups.push(cur);
    } else {
      if (!cur) {
        cur = { scene: { id: '_preamble', act: 'Prolog', subtitle: '' }, blocks: [] };
        groups.push(cur);
      }
      cur.blocks.push(b);
    }
  });

  // First-appearance tracking (for char notes hint - optional)
  const firstApp = {};
  const seen = new Set();
  blocks.forEach(b => {
    if (b.type === 'dialogue' && b.speakerId && !seen.has(b.speakerId)) {
      seen.add(b.speakerId);
      firstApp[b.id] = b.speakerId;
    }
  });

  // Title from filename
  const title = (AppState.get('filename') || 'untitled').replace(/\.\w+$/, '');

  _container.innerHTML = `
    <aside class="reader-toc" id="reader-toc">
      <div class="toc-header">Lectio · 場景目錄</div>
      ${groups.map(g => {
        const [actLabel, sceneLabel] = (g.scene.act || '').split('·').map(s => s.trim());
        return `
          <div class="toc-item" data-scene-id="${esc(g.scene.id)}">
            <span class="toc-dot"></span>
            <div class="toc-label">
              <div class="toc-act">${esc(actLabel || g.scene.act || '')}</div>
              ${sceneLabel ? `<div class="toc-scene">${esc(sceneLabel)}</div>` : ''}
              ${g.scene.subtitle ? `<div class="toc-subtitle">${esc(g.scene.subtitle)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
      <div class="toc-actions">
        <button id="reader-print" title="列印 / 匯出 PDF (window.print)">⇣ Print / PDF</button>
      </div>
    </aside>

    <div class="reader-body" id="reader-body">
      <div class="reader-inner">
        <div class="reader-title-block">
          <div class="reader-title-en">${esc(title)}</div>
          <div class="reader-title-meta">Script Editor · Akasha Library</div>
        </div>

        ${groups.map((g, i) => renderSceneGroup(g, i, firstApp)).join('')}

        <div class="reader-end-mark">— Fin —</div>
      </div>
    </div>
  `;

  _tocEl  = _container.querySelector('#reader-toc');
  _bodyEl = _container.querySelector('#reader-body');

  // Wire TOC clicks
  _tocEl.querySelectorAll('.toc-item').forEach(item => {
    item.onclick = () => scrollToScene(item.dataset.sceneId);
  });

  // Wire choice options
  _bodyEl.querySelectorAll('[data-choice-target]').forEach(el => {
    el.onclick = () => scrollToBlock(el.dataset.choiceTarget);
  });

  // Wire print
  _container.querySelector('#reader-print').onclick = handlePrint;

  // IntersectionObserver for active scene highlight
  setupObserver();
}

function renderSceneGroup(g, idx, firstApp) {
  return `
    <section class="scene-section" data-scene-id="${esc(g.scene.id)}">
      ${idx > 0 ? '<hr class="scene-divider">' : ''}
      <header class="scene-header">
        <div class="scene-act">${esc(g.scene.act || '')}</div>
        ${g.scene.subtitle ? `<div class="scene-subtitle">${esc(g.scene.subtitle)}</div>` : ''}
      </header>
      <div class="scene-body">
        ${g.blocks.map(b => renderBlock(b, firstApp)).join('')}
      </div>
    </section>
  `;
}

function renderBlock(b, firstApp) {
  if (b.type === 'narration') {
    return `<div class="reader-narration">${esc(b.text || '')}</div>`;
  }

  if (b.type === 'note') {
    return `<div class="reader-note">（${esc(b.text || '')}）</div>`;
  }

  if (b.type === 'dialogue') {
    const chars = AppState.get('characters') || [];
    const ch = chars.find(c => c.id === b.speakerId) || chars.find(c => c.displayName === b.speaker);
    const color = ch?.color || getCharColor(b.speaker) || 'var(--gold-dim)';
    const speakerName = b.speaker || ch?.displayName || '?';
    const isFirst = firstApp[b.id] === b.speakerId;

    const tags = (b.tags || []).map(([t, k]) => {
      const pal = TAG_PALETTE[k] || TAG_PALETTE.plot;
      return `<span class="tag" title="${esc(k)}" style="background:${pal.bg};color:${pal.fg};border:1px solid ${pal.bd}">${esc(t)}</span>`;
    }).join('');

    return `
      <div class="reader-dialogue ${isFirst ? 'first-appearance' : ''}">
        <div class="rd-speaker" style="color:${color}">
          <span class="rd-dot" style="background:${color}"></span>
          ${esc(speakerName)}
          ${isFirst ? '<span class="rd-first">⊕ 首次出場</span>' : ''}
        </div>
        ${b.original ? `<div class="rd-original">${esc(b.original)}</div>` : ''}
        ${b.zh       ? `<div class="rd-zh">${esc(b.zh)}</div>` : ''}
        ${b.text && !b.original && !b.zh ? `<div class="rd-zh">${esc(b.text)}</div>` : ''}
        ${tags ? `<div class="rd-tags">${tags}</div>` : ''}
      </div>
    `;
  }

  if (b.type === 'choice') {
    return `
      <div class="reader-choice">
        <div class="rc-label">— 選擇 —</div>
        ${(b.options || []).map((o, i) => `
          <div class="rc-option" ${o.target ? `data-choice-target="${esc(o.target)}"` : ''}>
            <span class="rc-bullet">${i + 1}.</span>
            <span class="rc-text">${esc(o.text || '')}</span>
            ${o.target ? `<span class="rc-arrow">→ ${esc(o.target)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  if (b.type === 'command') {
    return `<div class="reader-command">[${esc(b.command || '')}: ${esc(b.value || '')}]</div>`;
  }

  return '';
}

/* ═══════════════════════════════════════════
   Scroll utilities
   ═══════════════════════════════════════════ */

function scrollToScene(sceneId) {
  const el = _bodyEl.querySelector(`.scene-section[data-scene-id="${sceneId}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToBlock(blockId) {
  // Find block in editor — for reader, find related scene since blocks don't have data attribute here
  const blocks = AppState.get('blocks') || [];
  const idx = blocks.findIndex(b => b.id === blockId);
  if (idx < 0) {
    Bus.emit('toast', `找不到 target: ${blockId}`);
    return;
  }
  // Find nearest scene before this block
  for (let j = idx; j >= 0; j--) {
    if (blocks[j].type === 'scene') {
      scrollToScene(blocks[j].id);
      return;
    }
  }
  // No scene found, scroll top
  _bodyEl.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════
   IntersectionObserver — active scene highlight
   ═══════════════════════════════════════════ */

function setupObserver() {
  if (_observer) _observer.disconnect();
  if (!_bodyEl) return;

  _observer = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) {
      const sceneId = visible[0].target.dataset.sceneId;
      highlightToc(sceneId);
    }
  }, {
    root: _bodyEl,
    threshold: 0.1,
    rootMargin: '-20% 0px -60% 0px',
  });

  _bodyEl.querySelectorAll('.scene-section').forEach(el => _observer.observe(el));
}

function highlightToc(sceneId) {
  _tocEl.querySelectorAll('.toc-item').forEach(it => {
    it.classList.toggle('active', it.dataset.sceneId === sceneId);
  });
}

/* ═══════════════════════════════════════════
   Print / PDF Export
   ═══════════════════════════════════════════ */

function handlePrint() {
  // Add print-specific class to body before print, remove after
  document.body.classList.add('reader-printing');
  try {
    window.print();
  } finally {
    setTimeout(() => document.body.classList.remove('reader-printing'), 500);
  }
}
