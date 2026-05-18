/**
 * overlays.js — 5 fullscreen overlays
 * Phase 17-6
 *
 *  1. Table Forge      — all dialogues as editable table
 *  2. Relationship Graph — force-directed character graph
 *  3. Sound Library    — BGM presets + assign to focused block
 *  4. Format Checker   — 15+ rules + click to jump
 *  5. Draft Generator  — templates + character → insert blocks
 */

import {
  AppState, Bus, esc, generateId, getCharColor, TAG_PALETTE,
  validateBlock, downloadFile, blocksToPlainScript,
} from './data-model.js';

/* ═══════════════════════════════════════════
   Overlay Shell
   ═══════════════════════════════════════════ */

let _root = null;

export function initOverlays(rootEl) {
  _root = rootEl;
  Bus.on('overlay:open', name => openOverlay(name));
}

function openOverlay(name) {
  closeOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.id = 'active-overlay';
  overlay.innerHTML = `
    <div class="overlay-shell">
      <header class="overlay-header">
        <h2 id="overlay-title">${esc(getTitle(name))}</h2>
        <span class="spacer"></span>
        <button class="overlay-close" id="overlay-close" title="關閉 (Esc)">✕</button>
      </header>
      <div class="overlay-body" id="overlay-body"></div>
    </div>
  `;
  _root.appendChild(overlay);

  const $body = overlay.querySelector('#overlay-body');
  switch (name) {
    case 'table-forge':   renderTableForge($body);   break;
    case 'relations':     renderRelations($body);     break;
    case 'sound-library': renderSoundLibrary($body); break;
    case 'format-check':  renderFormatCheck($body);  break;
    case 'draft-gen':     renderDraftGen($body);     break;
  }

  overlay.querySelector('#overlay-close').onclick = closeOverlay;
  overlay.onclick = e => { if (e.target === overlay) closeOverlay(); };
  document.addEventListener('keydown', onEscKey);
}

function closeOverlay() {
  document.getElementById('active-overlay')?.remove();
  document.removeEventListener('keydown', onEscKey);
}

function onEscKey(e) { if (e.key === 'Escape') closeOverlay(); }

function getTitle(name) {
  return ({
    'table-forge':   'Table Forge · 對白表格',
    'relations':     '角色關係圖',
    'sound-library': '音效庫',
    'format-check':  '劇本格式檢查',
    'draft-gen':     '初稿生成',
  })[name] || name;
}

/* ═══════════════════════════════════════════
   1. Table Forge
   ═══════════════════════════════════════════ */

function renderTableForge($body) {
  const update = () => {
    const blocks = AppState.get('blocks') || [];
    const chars = AppState.get('characters') || [];
    const dialogues = blocks.filter(b => b.type === 'dialogue');
    const filterChar = $body.querySelector('#tf-char')?.value || '';
    const filterText = ($body.querySelector('#tf-text')?.value || '').toLowerCase();

    const filtered = dialogues.filter(b => {
      if (filterChar && b.speakerId !== filterChar) return false;
      if (filterText) {
        const hay = (b.speaker + ' ' + (b.original || '') + ' ' + (b.zh || '')).toLowerCase();
        if (!hay.includes(filterText)) return false;
      }
      return true;
    });

    $body.querySelector('#tf-table-wrap').innerHTML = `
      <table class="tf-table">
        <thead>
          <tr>
            <th style="width:50px">#</th>
            <th style="width:140px">角色</th>
            <th>原文</th>
            <th>中譯</th>
            <th style="width:120px">TAGs</th>
            <th style="width:50px"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((b, i) => `
            <tr data-block-id="${esc(b.id)}">
              <td class="tf-idx">${i + 1}</td>
              <td>
                <select class="tf-speaker" data-field="speakerId">
                  ${chars.map(c => `<option value="${esc(c.id)}" ${c.id === b.speakerId ? 'selected' : ''}>${esc(c.displayName)}</option>`).join('')}
                </select>
              </td>
              <td><textarea class="tf-cell" data-field="original" rows="1">${esc(b.original || '')}</textarea></td>
              <td><textarea class="tf-cell" data-field="zh"       rows="1">${esc(b.zh       || '')}</textarea></td>
              <td class="tf-tags">${(b.tags || []).map(([t, k]) => {
                const p = TAG_PALETTE[k] || TAG_PALETTE.plot;
                return `<span class="tag" style="background:${p.bg};color:${p.fg};border:1px solid ${p.bd}">${esc(t)}</span>`;
              }).join('')}</td>
              <td><button class="tf-jump" data-id="${esc(b.id)}" title="跳到 Editor">↗</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="tf-summary">${filtered.length} / ${dialogues.length} 對白</div>
    `;

    // Wire cells
    $body.querySelectorAll('.tf-cell, .tf-speaker').forEach(el => {
      el.addEventListener('change', () => {
        const tr = el.closest('tr');
        const id = tr.dataset.blockId;
        const blocks = AppState.get('blocks') || [];
        const b = blocks.find(bb => bb.id === id);
        if (!b) return;
        b[el.dataset.field] = el.value;
        if (el.dataset.field === 'speakerId') {
          const c = (AppState.get('characters') || []).find(c => c.id === el.value);
          if (c) b.speaker = c.displayName;
        }
        AppState.set('blocks', [...blocks]);
        try { localStorage.setItem('se17_draft__default', JSON.stringify(blocks)); } catch {}
        Bus.emit('blocks:edited-external');
      });
    });

    $body.querySelectorAll('.tf-jump').forEach(btn => {
      btn.onclick = () => {
        localStorage.setItem('se17_focusBlock', btn.dataset.id);
        closeOverlay();
        document.querySelector('#tab-bar [data-tab="editor"]').click();
        setTimeout(() => {
          const card = document.querySelector(`#tab-editor [data-block-id="${btn.dataset.id}"]`);
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      };
    });
  };

  const chars = AppState.get('characters') || [];
  $body.innerHTML = `
    <div class="tf-toolbar">
      <select id="tf-char">
        <option value="">全部角色</option>
        ${chars.map(c => `<option value="${esc(c.id)}">${esc(c.displayName)}</option>`).join('')}
      </select>
      <input id="tf-text" placeholder="搜尋原文 / 中譯…" type="search">
      <span class="spacer"></span>
      <button id="tf-export-csv">⇣ CSV</button>
    </div>
    <div id="tf-table-wrap"></div>
  `;

  $body.querySelector('#tf-char').onchange = update;
  $body.querySelector('#tf-text').oninput  = update;
  $body.querySelector('#tf-export-csv').onclick = () => {
    const blocks = AppState.get('blocks') || [];
    const dialogues = blocks.filter(b => b.type === 'dialogue');
    const header = 'ID,Speaker,Original,Translation,Tags';
    const rows = dialogues.map(b => {
      const tags = (b.tags || []).map(([t]) => t).join(';');
      return [b.id, b.speaker, (b.original||'').replace(/"/g, '""'), (b.zh||'').replace(/"/g, '""'), tags]
        .map(v => `"${v}"`).join(',');
    });
    downloadFile(`table-forge-${Date.now()}.csv`, [header, ...rows].join('\n'), 'text/csv');
    Bus.emit('toast', `已匯出 ${dialogues.length} 筆 CSV`);
  };

  update();
}

/* ═══════════════════════════════════════════
   2. Relationship Graph
   ═══════════════════════════════════════════ */

function renderRelations($body) {
  const chars = AppState.get('characters') || [];
  if (!chars.length) {
    $body.innerHTML = '<div class="overlay-empty">尚未建立角色，無法生成關係圖</div>';
    return;
  }

  // Build nodes + edges from relationship_tags or aliases
  const nodes = chars.map((c, i) => ({
    id: c.id, label: c.displayName, color: c.color || 'var(--gold)',
    x: 0, y: 0, vx: 0, vy: 0,
    aliases: c.aliases || [],
  }));

  // Edges from relationship_tags (if exists) or co-occurrence in blocks
  const edges = [];
  const blocks = AppState.get('blocks') || [];

  // Co-occurrence in scenes
  const scenes = [];
  let cur = null;
  blocks.forEach(b => {
    if (b.type === 'scene') { cur = new Set(); scenes.push(cur); }
    else if (b.type === 'dialogue' && b.speakerId && cur) cur.add(b.speakerId);
  });

  const edgeMap = {};
  scenes.forEach(set => {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('|');
        edgeMap[key] = (edgeMap[key] || 0) + 1;
      }
    }
  });

  Object.entries(edgeMap).forEach(([key, weight]) => {
    const [a, b] = key.split('|');
    edges.push({ source: a, target: b, weight });
  });

  // Initial positions — circle layout
  const W = 800, H = 500;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.35;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    n.x = cx + Math.cos(angle) * R;
    n.y = cy + Math.sin(angle) * R;
  });

  $body.innerHTML = `
    <div class="rg-toolbar">
      <span class="rg-info">${nodes.length} 角色 · ${edges.length} 連結（依場次共現）</span>
      <span class="spacer"></span>
      <button id="rg-shuffle">🎲 重新排列</button>
    </div>
    <div class="rg-canvas-wrap">
      <svg class="rg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <g id="rg-edges">
          ${edges.map(e => {
            const s = nodes.find(n => n.id === e.source);
            const t = nodes.find(n => n.id === e.target);
            return `<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}"
              stroke="var(--gold-dim)" stroke-width="${Math.min(0.5 + e.weight * 0.4, 3)}"
              stroke-opacity="${Math.min(0.2 + e.weight * 0.1, 0.6)}"></line>`;
          }).join('')}
        </g>
        <g id="rg-nodes">
          ${nodes.map(n => `
            <g class="rg-node" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})">
              <circle r="22" fill="${n.color}" opacity="0.85"></circle>
              <text text-anchor="middle" dy="0.35em" fill="var(--navy-deep)"
                font-family="var(--font-serif-tc)" font-size="11" font-weight="700">
                ${esc(n.label.slice(0, 2))}
              </text>
              <text class="rg-label" text-anchor="middle" dy="38" fill="var(--cream)"
                font-family="var(--font-serif-tc)" font-size="11">
                ${esc(n.label)}
              </text>
            </g>
          `).join('')}
        </g>
      </svg>
    </div>
    <div class="rg-detail" id="rg-detail">
      點擊角色節點查看詳情
    </div>
  `;

  $body.querySelectorAll('.rg-node').forEach(node => {
    node.onclick = () => {
      const c = chars.find(ch => ch.id === node.dataset.id);
      if (!c) return;
      const dlgCount = blocks.filter(b => b.type === 'dialogue' && b.speakerId === c.id).length;
      const partners = edges.filter(e => e.source === c.id || e.target === c.id)
        .map(e => {
          const otherId = e.source === c.id ? e.target : e.source;
          const other = chars.find(ch => ch.id === otherId);
          return `${other?.displayName} (${e.weight}場)`;
        });

      $body.querySelector('#rg-detail').innerHTML = `
        <div class="rg-detail-card" style="border-left:4px solid ${c.color || 'var(--gold)'}">
          <div class="rg-detail-name">${esc(c.displayName)}</div>
          ${c.aliases?.length ? `<div class="rg-detail-aliases">別名：${esc(c.aliases.join(', '))}</div>` : ''}
          <div class="rg-detail-stats">
            <span>${dlgCount} 句對白</span>
            <span>·</span>
            <span>${partners.length} 個關係</span>
          </div>
          ${partners.length ? `<div class="rg-detail-partners">${esc(partners.join('、'))}</div>` : ''}
        </div>
      `;
    };
  });

  $body.querySelector('#rg-shuffle').onclick = () => {
    nodes.forEach(n => {
      n.x = 50 + Math.random() * (W - 100);
      n.y = 50 + Math.random() * (H - 100);
    });
    renderRelations($body);
  };
}

/* ═══════════════════════════════════════════
   3. Sound Library
   ═══════════════════════════════════════════ */

async function renderSoundLibrary($body) {
  let bgmModule = null;
  try { bgmModule = await import('../../core/bgm.js'); } catch { /* ignore */ }
  const presets = bgmModule?.getPresets() || [];

  // Pseudo-library entries (4 categories)
  const library = [
    ...presets.map(p => ({ ...p, category: 'preset', id: p.id, label: p.name, type: 'BGM' })),
    { id: 'sfx_door',    category: 'sfx',     label: '開門聲',  type: 'SFX',    mood: 'ambient' },
    { id: 'sfx_thunder', category: 'sfx',     label: '雷鳴',    type: 'SFX',    mood: 'dramatic' },
    { id: 'amb_rain',    category: 'ambient', label: '雨聲',    type: 'AMB',    mood: 'calm' },
    { id: 'amb_wind',    category: 'ambient', label: '風聲',    type: 'AMB',    mood: 'calm' },
    { id: 'voice_chant', category: 'voice',   label: '吟唱',    type: 'VOX',    mood: 'spiritual' },
  ];

  const focusedId = localStorage.getItem('se17_focusBlock');
  const blocks = AppState.get('blocks') || [];
  const focused = blocks.find(b => b.id === focusedId && b.type === 'dialogue');

  let filterType = '';
  let filterMood = '';
  let searchQ = '';

  const update = () => {
    const filtered = library.filter(item => {
      if (filterType && item.type !== filterType) return false;
      if (filterMood && item.mood !== filterMood) return false;
      if (searchQ && !((item.label + item.id).toLowerCase().includes(searchQ.toLowerCase()))) return false;
      return true;
    });

    $body.querySelector('#sl-grid').innerHTML = filtered.length ? filtered.map(item => `
      <div class="sl-card" data-id="${esc(item.id)}" data-category="${item.category}">
        <div class="sl-card-type">${esc(item.type)}</div>
        <div class="sl-card-name">${esc(item.label)}</div>
        <div class="sl-card-id">${esc(item.id)}</div>
        ${item.mood ? `<div class="sl-card-mood">${esc(item.mood)}</div>` : ''}
        <div class="sl-card-actions">
          ${item.category === 'preset' ? `<button class="sl-preview" data-id="${esc(item.id)}">▶ 試聽</button>` : ''}
          ${focused ? `<button class="sl-assign" data-id="${esc(item.id)}" data-target="${item.type === 'BGM' ? 'bgm' : 'sfx'}">📌 指派</button>` : ''}
        </div>
      </div>
    `).join('') : '<div class="overlay-empty">無符合條件的音效</div>';

    $body.querySelectorAll('.sl-preview').forEach(btn => {
      btn.onclick = () => bgmModule?.playPreset(btn.dataset.id);
    });

    $body.querySelectorAll('.sl-assign').forEach(btn => {
      btn.onclick = () => {
        if (!focused) return;
        const blocks = AppState.get('blocks') || [];
        const b = blocks.find(bb => bb.id === focused.id);
        if (!b) return;
        b.avg = { ...(b.avg || {}), [btn.dataset.target]: btn.dataset.id };
        AppState.set('blocks', [...blocks]);
        Bus.emit('blocks:edited-external');
        Bus.emit('toast', `${btn.dataset.target.toUpperCase()} → ${btn.dataset.id}`);
      };
    });
  };

  $body.innerHTML = `
    <div class="sl-toolbar">
      ${focused
        ? `<div class="sl-focused">目前指派目標：<strong>${esc(focused.speaker || focused.speakerId)}</strong> #${esc(focused.id)}</div>`
        : '<div class="sl-no-focus">未選擇對白 block — 在 Editor TAB 點 dialogue 後可指派音效</div>'
      }
      <span class="spacer"></span>
      <button id="sl-stop">⏹ 停止</button>
    </div>
    <div class="sl-filters">
      <select id="sl-type">
        <option value="">全部類型</option>
        <option value="BGM">BGM</option>
        <option value="SFX">SFX</option>
        <option value="AMB">AMB 環境</option>
        <option value="VOX">VOX 人聲</option>
      </select>
      <select id="sl-mood">
        <option value="">全部情緒</option>
        <option value="quiet_archive">靜謐</option>
        <option value="gentle">柔和</option>
        <option value="meditative">冥想</option>
        <option value="flowing">流動</option>
        <option value="calm">寧靜</option>
        <option value="dramatic">戲劇</option>
        <option value="ambient">氛圍</option>
        <option value="spiritual">神性</option>
      </select>
      <input id="sl-search" placeholder="🔍 搜尋音效 ID / 名稱…" type="search">
    </div>
    <div class="sl-grid" id="sl-grid"></div>
  `;

  $body.querySelector('#sl-type').onchange   = e => { filterType = e.target.value; update(); };
  $body.querySelector('#sl-mood').onchange   = e => { filterMood = e.target.value; update(); };
  $body.querySelector('#sl-search').oninput  = e => { searchQ    = e.target.value; update(); };
  $body.querySelector('#sl-stop').onclick    = () => bgmModule?.stopScore();

  update();
}

/* ═══════════════════════════════════════════
   4. Format Checker
   ═══════════════════════════════════════════ */

function renderFormatCheck($body) {
  const blocks = AppState.get('blocks') || [];
  const chars  = AppState.get('characters') || [];
  const charIds = new Set(chars.map(c => c.id));

  const issues = [];

  blocks.forEach((b, i) => {
    const loc = { blockId: b.id, blockIndex: i };

    // Structural errors
    if (b.type === 'dialogue') {
      if (!b.speakerId && !b.speaker) issues.push({ ...loc, severity: 'error', message: '對白缺少角色', rule: 'no-speaker' });
      if (!b.original && !b.zh && !b.text) issues.push({ ...loc, severity: 'error', message: '對白內容為空', rule: 'empty-dialogue' });
      if (b.speakerId && charIds.size && !charIds.has(b.speakerId)) issues.push({ ...loc, severity: 'error', message: `角色「${b.speakerId}」不在角色表`, rule: 'unknown-speaker' });
    }
    if (b.type === 'scene' && !b.act && !b.title) issues.push({ ...loc, severity: 'error', message: '場次缺少幕場標記', rule: 'no-act' });
    if (b.type === 'choice') {
      if (!b.options || b.options.length === 0) issues.push({ ...loc, severity: 'error', message: '選項 block 缺少選項', rule: 'no-options' });
      else b.options.forEach((opt, oi) => {
        if (!opt.text) issues.push({ ...loc, severity: 'error', message: `選項 ${oi + 1} 文字為空`, rule: 'empty-option' });
      });
    }

    // Warnings
    if (b.type === 'dialogue') {
      if (b.original && !b.zh) issues.push({ ...loc, severity: 'warning', message: '有原文但缺中譯', rule: 'missing-zh' });
      if (b.zh && !b.original) issues.push({ ...loc, severity: 'warning', message: '有中譯但缺原文', rule: 'missing-original' });
      if (!b.tags?.length)     issues.push({ ...loc, severity: 'warning', message: '對白缺 TAG', rule: 'no-tags' });
      if ((b.text || b.zh || b.original || '').length < 3) issues.push({ ...loc, severity: 'warning', message: '對白文字過短', rule: 'short-text' });
      // Consecutive same speaker
      if (i > 0 && blocks[i - 1].type === 'dialogue' && blocks[i - 1].speakerId === b.speakerId && b.speakerId)
        issues.push({ ...loc, severity: 'info', message: '與前一句同角色（可能可合併）', rule: 'consecutive-speaker' });
    }
    if (b.type === 'choice') {
      const blockIds = new Set(blocks.map(bb => bb.id));
      b.options?.forEach((opt, oi) => {
        if (!opt.target) issues.push({ ...loc, severity: 'warning', message: `選項 ${oi + 1} 缺跳轉目標`, rule: 'no-next' });
        else if (!blockIds.has(opt.target)) issues.push({ ...loc, severity: 'warning', message: `選項 ${oi + 1} target「${opt.target}」不存在`, rule: 'broken-link' });
      });
    }

    // AVG consistency
    if (b.type === 'dialogue' && b.avg) {
      if (b.avg.sprite && !b.avg.position) issues.push({ ...loc, severity: 'info', message: '有立繪但未指定位置', rule: 'sprite-no-pos' });
    }
  });

  // Empty-scene check
  const sceneIdxs = blocks.map((b, i) => b.type === 'scene' ? i : -1).filter(i => i >= 0);
  sceneIdxs.forEach((si, idx) => {
    const next = idx < sceneIdxs.length - 1 ? sceneIdxs[idx + 1] : blocks.length;
    if (!blocks.slice(si + 1, next).some(b => b.type === 'dialogue'))
      issues.push({ blockId: blocks[si].id, blockIndex: si, severity: 'info', message: '場次後無對白', rule: 'empty-scene' });
  });

  const errCount  = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  $body.innerHTML = `
    <div class="fc-summary">
      <div class="fc-stat fc-error"><span class="fc-num">${errCount}</span><span class="fc-lbl">錯誤</span></div>
      <div class="fc-stat fc-warn"> <span class="fc-num">${warnCount}</span><span class="fc-lbl">警告</span></div>
      <div class="fc-stat fc-info"> <span class="fc-num">${infoCount}</span><span class="fc-lbl">提示</span></div>
      <div class="fc-stat"><span class="fc-num">${blocks.length}</span><span class="fc-lbl">blocks</span></div>
    </div>
    <div class="fc-filters">
      <label><input type="checkbox" id="fc-show-err"  checked> 錯誤</label>
      <label><input type="checkbox" id="fc-show-warn" checked> 警告</label>
      <label><input type="checkbox" id="fc-show-info" checked> 提示</label>
      <span class="spacer"></span>
      <button id="fc-export">⇣ 匯出報告</button>
    </div>
    <div class="fc-list" id="fc-list"></div>
  `;

  const renderList = () => {
    const showErr  = $body.querySelector('#fc-show-err').checked;
    const showWarn = $body.querySelector('#fc-show-warn').checked;
    const showInfo = $body.querySelector('#fc-show-info').checked;

    const filtered = issues.filter(it =>
      (it.severity === 'error' && showErr) ||
      (it.severity === 'warning' && showWarn) ||
      (it.severity === 'info' && showInfo)
    );

    const $list = $body.querySelector('#fc-list');
    if (!filtered.length) {
      $list.innerHTML = '<div class="fc-clean">🎉 沒有問題！</div>';
      return;
    }
    $list.innerHTML = filtered.map(it => `
      <div class="fc-issue fc-${it.severity}" data-id="${esc(it.blockId)}">
        <div class="fc-issue-head">
          <span class="fc-sev">${({ error: '⚠', warning: '!', info: 'ⓘ' })[it.severity]}</span>
          <span class="fc-msg">${esc(it.message)}</span>
          <span class="fc-rule">${esc(it.rule)}</span>
        </div>
        <div class="fc-issue-meta">
          <span>#${it.blockIndex + 1}</span> · <span class="fc-id">${esc(it.blockId)}</span>
          <button class="fc-jump" data-id="${esc(it.blockId)}">→ Editor</button>
        </div>
      </div>
    `).join('');

    $list.querySelectorAll('.fc-jump').forEach(btn => {
      btn.onclick = () => {
        localStorage.setItem('se17_focusBlock', btn.dataset.id);
        closeOverlay();
        document.querySelector('#tab-bar [data-tab="editor"]').click();
        setTimeout(() => {
          const card = document.querySelector(`#tab-editor [data-block-id="${btn.dataset.id}"]`);
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      };
    });
  };

  $body.querySelector('#fc-show-err').onchange  = renderList;
  $body.querySelector('#fc-show-warn').onchange = renderList;
  $body.querySelector('#fc-show-info').onchange = renderList;

  $body.querySelector('#fc-export').onclick = () => {
    const md = [
      `# 劇本格式檢查報告`,
      ``,
      `**統計**：${errCount} 錯誤 / ${warnCount} 警告 / ${infoCount} 提示 · ${blocks.length} blocks`,
      ``,
      ...issues.map(it => `- ${it.severity.toUpperCase()} #${it.blockIndex + 1} \`${it.blockId}\` — ${it.message} (${it.rule})`),
    ].join('\n');
    downloadFile(`format-check-${Date.now()}.md`, md, 'text/markdown');
    Bus.emit('toast', '已匯出檢查報告');
  };

  renderList();
}

/* ═══════════════════════════════════════════
   5. Draft Generator
   ═══════════════════════════════════════════ */

const DRAFT_TEMPLATES = {
  opening: {
    label: '開場', desc: '旁白引導 → 場次宣告 → 首句對白',
    generate: (chars, opts) => [
      { type: 'narration', text: `【${opts.mood || ''}開場敘述——請填入場景描寫】` },
      { type: 'scene', act: `Akt ${opts.act || '1'} · Sz ${opts.scene || '1'}`, subtitle: opts.title || '【場次標題】' },
      ...(chars[0] ? [{ type: 'dialogue', speakerId: chars[0].id, speaker: chars[0].displayName, original: '', zh: '【首句對白】', tags: [], avg: {} }] : []),
    ],
  },
  exchange: {
    label: '對話交換', desc: '兩個角色 4 句對白往返',
    generate: (chars) => {
      const c1 = chars[0], c2 = chars[1];
      if (!c1 || !c2) return [];
      return [
        { type: 'dialogue', speakerId: c1.id, speaker: c1.displayName, original: '', zh: '【開頭—問】', tags: [], avg: {} },
        { type: 'dialogue', speakerId: c2.id, speaker: c2.displayName, original: '', zh: '【回應】', tags: [], avg: {} },
        { type: 'dialogue', speakerId: c1.id, speaker: c1.displayName, original: '', zh: '【追問 / 反駁】', tags: [], avg: {} },
        { type: 'dialogue', speakerId: c2.id, speaker: c2.displayName, original: '', zh: '【收尾】', tags: [], avg: {} },
      ];
    },
  },
  transition: {
    label: '場景轉換', desc: '結束旁白 → 新場景',
    generate: (chars, opts) => [
      { type: 'narration', text: '【上一場結束的旁白—時間流逝 / 情緒收尾】' },
      { type: 'scene', act: `Akt ${opts.act || '2'} · Sz ${opts.scene || '1'}`, subtitle: opts.title || '【新場景標題】' },
      { type: 'narration', text: '【新場景開場描寫】' },
    ],
  },
  choice: {
    label: '分歧選項', desc: '對白 → 2 選項 → 兩條路徑',
    generate: (chars) => {
      const c = chars[0];
      const opt1 = generateId('sc'), opt2 = generateId('sc');
      return [
        ...(c ? [{ type: 'dialogue', speakerId: c.id, speaker: c.displayName, original: '', zh: '【面臨抉擇的對白】', tags: [], avg: {} }] : []),
        { type: 'choice', options: [
          { text: '選擇 A', target: opt1 },
          { text: '選擇 B', target: opt2 },
        ]},
        { id: opt1, type: 'scene', act: '路徑 A', subtitle: '' },
        { type: 'narration', text: '【路徑 A 結果】' },
        { id: opt2, type: 'scene', act: '路徑 B', subtitle: '' },
        { type: 'narration', text: '【路徑 B 結果】' },
      ];
    },
  },
  ending: {
    label: '結局', desc: '高潮對白 → 收場旁白 → Fin 場景',
    generate: (chars) => [
      ...(chars[0] ? [{ type: 'dialogue', speakerId: chars[0].id, speaker: chars[0].displayName, original: '', zh: '【最後一句話】', tags: [['結局', 'plot']], avg: {} }] : []),
      { type: 'narration', text: '【幕落—收場敘述】' },
      { type: 'scene', act: 'Fin', subtitle: '— 終 —' },
    ],
  },
};

function renderDraftGen($body) {
  const chars = AppState.get('characters') || [];

  $body.innerHTML = `
    <div class="dg-toolbar">
      <span>選擇模板：</span>
      <select id="dg-template">
        ${Object.entries(DRAFT_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)} — ${esc(t.desc)}</option>`).join('')}
      </select>
    </div>

    <div class="dg-options">
      <label>幕 Act：<input id="dg-act" value="1" type="number" min="1" max="9"></label>
      <label>場 Scene：<input id="dg-scene" value="1" type="number" min="1" max="20"></label>
      <label>場景標題：<input id="dg-title" placeholder="例：莊嚴的審判殿"></label>
      <label>情緒 mood：
        <select id="dg-mood">
          <option value="">—</option>
          <option value="莊嚴">莊嚴</option>
          <option value="哀傷">哀傷</option>
          <option value="緊張">緊張</option>
          <option value="柔和">柔和</option>
          <option value="神秘">神秘</option>
        </select>
      </label>
    </div>

    <div class="dg-preview-wrap">
      <div class="dg-preview-title">預覽（將插入至目前 blocks 末尾）</div>
      <div class="dg-preview" id="dg-preview"></div>
    </div>

    <div class="dg-actions">
      <button id="dg-insert" class="dg-btn-primary">↓ 插入 blocks</button>
      <button id="dg-cancel">取消</button>
    </div>
  `;

  const update = () => {
    const tplKey = $body.querySelector('#dg-template').value;
    const tpl = DRAFT_TEMPLATES[tplKey];
    const opts = {
      act:   $body.querySelector('#dg-act').value,
      scene: $body.querySelector('#dg-scene').value,
      title: $body.querySelector('#dg-title').value,
      mood:  $body.querySelector('#dg-mood').value,
    };
    const draft = tpl.generate(chars, opts);

    const $preview = $body.querySelector('#dg-preview');
    if (!draft.length) {
      $preview.innerHTML = '<div class="dg-preview-empty">⚠ 此模板需要至少 1~2 個角色</div>';
      return;
    }
    $preview.innerHTML = draft.map((b, i) => {
      if (b.type === 'dialogue') {
        const c = chars.find(c => c.id === b.speakerId);
        const color = c?.color || 'var(--gold)';
        return `<div class="dg-blk dlg" style="border-left-color:${color}">
          <div class="dg-blk-speaker" style="color:${color}">${esc(c?.displayName || b.speaker || '?')}</div>
          <div class="dg-blk-text">${esc(b.zh || '')}</div>
        </div>`;
      }
      if (b.type === 'narration')
        return `<div class="dg-blk narr"><em>${esc(b.text)}</em></div>`;
      if (b.type === 'scene')
        return `<div class="dg-blk scn">${esc(b.act || '')} · ${esc(b.subtitle || '')}</div>`;
      if (b.type === 'choice')
        return `<div class="dg-blk choice">選項：${b.options.map(o => o.text).join(' / ')}</div>`;
      return '';
    }).join('');
  };

  $body.querySelector('#dg-template').onchange = update;
  $body.querySelector('#dg-act').oninput       = update;
  $body.querySelector('#dg-scene').oninput     = update;
  $body.querySelector('#dg-title').oninput     = update;
  $body.querySelector('#dg-mood').onchange     = update;

  $body.querySelector('#dg-insert').onclick = () => {
    const tplKey = $body.querySelector('#dg-template').value;
    const tpl = DRAFT_TEMPLATES[tplKey];
    const opts = {
      act:   $body.querySelector('#dg-act').value,
      scene: $body.querySelector('#dg-scene').value,
      title: $body.querySelector('#dg-title').value,
      mood:  $body.querySelector('#dg-mood').value,
    };
    const draft = tpl.generate(chars, opts);
    if (!draft.length) { Bus.emit('toast', '此模板需要角色'); return; }

    // Assign ids
    draft.forEach(b => { if (!b.id) b.id = generateId(b.type.slice(0, 3)); });
    const blocks = [...(AppState.get('blocks') || []), ...draft];
    AppState.set('blocks', blocks);
    try { localStorage.setItem('se17_draft__default', JSON.stringify(blocks)); } catch {}
    Bus.emit('blocks:edited-external');

    Bus.emit('toast', `已插入 ${draft.length} blocks`);
    closeOverlay();
  };

  $body.querySelector('#dg-cancel').onclick = closeOverlay;

  update();
}
