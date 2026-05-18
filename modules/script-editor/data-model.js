/**
 * data-model.js — Script Editor 4-TAB Shared Foundation
 * Phase 17-1
 *
 * Exports: AppState, Bus, parsers, validators, IndexedDB CRUD,
 *          localStorage utils, shortcut manager, TAG system, utilities
 */

/* ═══════════════════════════════════════════
   Event Bus — cross-tab pub/sub
   ═══════════════════════════════════════════ */
class EventBus {
  constructor() { this._m = {}; }
  on(evt, fn)  { (this._m[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { const a = this._m[evt]; if (a) this._m[evt] = a.filter(f => f !== fn); }
  emit(evt, ...args) { (this._m[evt] || []).forEach(fn => fn(...args)); }
  once(evt, fn) { const off = this.on(evt, (...a) => { off(); fn(...a); }); return off; }
}

export const Bus = new EventBus();

/* ═══════════════════════════════════════════
   Block Type Definitions
   ═══════════════════════════════════════════ */
export const BLOCK_TYPES = ['dialogue', 'narration', 'scene', 'choice', 'note', 'command'];
const SAFE_ID_RE = /^[a-zA-Z0-9_\-]+$/;

/* ═══════════════════════════════════════════
   TAG System (from Archive)
   ═══════════════════════════════════════════ */
export const TAG_PALETTE = {
  plot:    { bg: 'rgba(201,168,106,0.15)', fg: '#C9A86A', bd: '#C9A86A' },
  emotion: { bg: 'rgba(196,96,79,0.15)',   fg: '#c4604f', bd: 'rgba(196,96,79,0.25)' },
  theme:   { bg: 'rgba(138,128,196,0.12)', fg: '#a89cd8', bd: 'rgba(138,128,196,0.2)' },
  form:    { bg: 'rgba(123,142,201,0.15)', fg: '#7B8EC9', bd: '#7B8EC9' },
  role:    { bg: 'rgba(160,133,80,0.15)',  fg: '#A08550', bd: '#A08550' },
};
export const TAG_CATEGORIES = ['plot', 'emotion', 'theme', 'form', 'role'];

/* ═══════════════════════════════════════════
   AppState Singleton
   ═══════════════════════════════════════════ */
const _state = {
  workId:     null,
  filename:   'untitled.txt',
  format:     'plain-script',

  blocks:     [],
  characters: [],
  content:    '',

  undoStack:  [],
  redoStack:  [],

  activeTab:  'write',        // write | editor | search | reader
  previewTab: 'blocks',       // blocks | stats | layout | voice | bgm

  voice: { speed: 1.0, pitch: 1.0, voiceId: '', includeNarration: false },

  shortcuts:  {},
};

export const AppState = {
  get(key)       { return _state[key]; },
  set(key, val)  { const old = _state[key]; _state[key] = val; Bus.emit('state:' + key, val, old); },
  getAll()       { return { ..._state }; },
  merge(obj)     { for (const [k, v] of Object.entries(obj)) { _state[k] = v; Bus.emit('state:' + k, v); } },
};

/* ═══════════════════════════════════════════
   Utility Functions
   ═══════════════════════════════════════════ */
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush   = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel  = ()     => clearTimeout(t);
  return d;
}

export function downloadFile(name, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function generateId(prefix = 'blk') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

/* ═══════════════════════════════════════════
   Plain Script Parser
   ═══════════════════════════════════════════ */
const DIALOGUE_RE = /^([^#/\n][^：:]{0,20})[：:](.+)/;
const COMMAND_RE  = /^#(\w[\w.-]*)\s*[:：]\s*(.+)/;
const COMMENT_RE  = /^\s*\/\//;

export function parsePlainScript(content) {
  if (!content.trim()) return [];
  const lines = content.split('\n'), blocks = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || COMMENT_RE.test(line)) continue;

    const cmdMatch = line.match(COMMAND_RE);
    if (cmdMatch) {
      blocks.push({ id: generateId('cmd'), type: 'command',
        command: cmdMatch[1].trim(), value: cmdMatch[2].trim() });
      continue;
    }

    const dlgMatch = line.match(DIALOGUE_RE);
    if (dlgMatch) {
      const speaker = dlgMatch[1].trim(), text = dlgMatch[2].trim();
      if (/^(旁白|[Nn]arrator)$/.test(speaker)) {
        blocks.push({ id: generateId('nar'), type: 'narration', text });
      } else {
        blocks.push({
          id: generateId('dlg'), type: 'dialogue', speaker, text,
          speakerId: resolveCharacterId(speaker),
          tags: [],
          avg: { sprite: '', spriteData: null, position: 'center', bg: '', bgm: '', sfx: '' },
        });
      }
      continue;
    }

    blocks.push({ id: generateId('nar'), type: 'narration', text: line.trim() });
  }
  return blocks;
}

/* ═══════════════════════════════════════════
   Blocks → Plain Script (round-trip core)
   ═══════════════════════════════════════════ */
export function blocksToPlainScript(blocks) {
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'command':   out.push(`#${b.command}：${b.value}`);                           break;
      case 'narration': out.push(`旁白：${b.text || ''}`);                               break;
      case 'dialogue':  out.push(`${b.speaker || b.speakerId || '???'}：${b.text || b.zh || b.original || ''}`); break;
      case 'scene':     out.push(`#scene：${b.act || ''} ${b.subtitle || ''}`);          break;
      case 'choice':    out.push(`#choice：${(b.options || []).map(o => o.text).join(' / ')}`); break;
      case 'note':      out.push(`// ${b.text || ''}`);                                  break;
    }
  }
  return out.join('\n');
}

/* ═══════════════════════════════════════════
   Import Parsers
   ═══════════════════════════════════════════ */

/** JSONL → blocks */
export function parseJsonl(content) {
  const blocks = [];
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && o.type) { if (!o.id) o.id = generateId('imp'); blocks.push(o); }
    } catch { /* skip */ }
  }
  return blocks;
}

/** AVG JSON → blocks (full fidelity) */
export function parseAvgJson(text) {
  try {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : (obj.blocks || []);
    return arr.filter(b => b && b.type).map(b => {
      if (!b.id) b.id = generateId('avg');
      return b;
    });
  } catch { return []; }
}

/** TyranoScript .ks → blocks (best-effort) */
export function parseTyranoScript(text) {
  const blocks = [];
  let speaker = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line === '[p]' || line === '[l]') continue;

    // Speaker tag: #角色名
    const spk = line.match(/^#(.+)/);
    if (spk && !/^\[/.test(spk[1])) { speaker = spk[1].trim(); continue; }

    // [tag attr=val ...]
    const tagM = line.match(/^\[(\w+)\s*(.*?)\]$/);
    if (tagM) {
      const [, tag, attrs] = tagM;
      if (tag === 'cm' || tag === 'er') { speaker = null; continue; }
      const valRe = /(?:value|storage)="([^"]+)"/;
      if (tag === 'scene')   { blocks.push({ id: generateId('cmd'), type: 'command', command: 'scene',   value: (attrs.match(valRe) || [])[1] || attrs }); continue; }
      if (tag === 'playbgm') { blocks.push({ id: generateId('cmd'), type: 'command', command: 'bgm',     value: (attrs.match(valRe) || [])[1] || attrs }); continue; }
      if (tag === 'playse')  { blocks.push({ id: generateId('cmd'), type: 'command', command: 'se',      value: (attrs.match(valRe) || [])[1] || attrs }); continue; }
      blocks.push({ id: generateId('cmd'), type: 'command', command: tag, value: attrs || '' });
      continue;
    }

    // Text line
    const cleaned = line.replace(/\[p\]|\[l\]|\[r\]|\[cm\]|\[er\]/g, '').trim();
    if (!cleaned) continue;
    if (speaker) {
      blocks.push({ id: generateId('dlg'), type: 'dialogue', speaker, text: cleaned, tags: [], avg: {} });
    } else {
      blocks.push({ id: generateId('nar'), type: 'narration', text: cleaned });
    }
  }
  return blocks;
}

/** Markdown → blocks (recognises own export format) */
export function parseMarkdownScript(text) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^#{1,3}\s/.test(line) || line === '---') continue;

    const cmdM = line.match(/^`#([\w.-]+)\s*[:：]\s*(.+)`$/);
    if (cmdM) { blocks.push({ id: generateId('cmd'), type: 'command', command: cmdM[1], value: cmdM[2] }); continue; }

    const dlgM = line.match(/^\*\*(.+?)\*\*\s*[：:]\s*(.+)/);
    if (dlgM) {
      const [, sp, txt] = dlgM;
      if (/^(旁白|Narrator)$/.test(sp)) blocks.push({ id: generateId('nar'), type: 'narration', text: txt.trim() });
      else blocks.push({ id: generateId('dlg'), type: 'dialogue', speaker: sp.trim(), text: txt.trim(), tags: [], avg: {} });
      continue;
    }

    const narrM = line.match(/^\*(.+)\*$/);
    if (narrM) { blocks.push({ id: generateId('nar'), type: 'narration', text: narrM[1].trim() }); continue; }

    if (line.length > 1) blocks.push({ id: generateId('nar'), type: 'narration', text: line });
  }
  return blocks;
}

/** Auto-detect format + parse */
export function importBlocks(text, filename) {
  const ext = (filename || '').toLowerCase();
  let blocks = null, via = '';

  if (ext.endsWith('.blocks.jsonl') || ext.endsWith('.jsonl')) {
    blocks = parseJsonl(text); via = 'JSONL';
  } else if (ext.endsWith('.ks')) {
    blocks = parseTyranoScript(text); via = 'TyranoScript';
  } else if (ext.endsWith('.json')) {
    blocks = parseAvgJson(text); via = 'AVG JSON';
    if (!blocks.length) blocks = null;
  } else if (ext.endsWith('.md')) {
    blocks = parseMarkdownScript(text); via = 'Markdown';
    if (!blocks.length) blocks = null;
  }

  if (blocks && blocks.length) return { blocks, via };
  return { blocks: parsePlainScript(text), via: 'Plain Script' };
}

/* ═══════════════════════════════════════════
   Block Validation (ported from Archive)
   ═══════════════════════════════════════════ */
export function validateBlock(block, characters = []) {
  const e = [];
  if (!block.id) e.push('缺少 id');
  if (block.id && !SAFE_ID_RE.test(block.id)) e.push(`id「${block.id}」含有不安全字元`);
  if (!block.type) e.push('缺少 type');
  if (block.type && !BLOCK_TYPES.includes(block.type)) e.push(`未知 type「${block.type}」`);

  switch (block.type) {
    case 'dialogue':
      if (!block.speakerId && !block.speaker) e.push('缺少 speakerId / speaker');
      if (block.speakerId && characters.length && !characters.find(c => c.id === block.speakerId))
        e.push(`speakerId「${block.speakerId}」不存在於角色表`);
      if (!block.original && !block.zh && !block.text) e.push('對白文字為空');
      if (block.tags && !Array.isArray(block.tags)) e.push('tags 應為陣列');
      if (block.tags && block.tags.some(t => !Array.isArray(t) || t.length !== 2))
        e.push('tags 格式錯誤（應為 [[text, kind], …]）');
      break;
    case 'narration':
      if (!block.text) e.push('旁白文字為空');
      break;
    case 'scene':
      if (!block.act && !block.title) e.push('缺少幕場標記');
      break;
    case 'choice':
      if (!block.options || !Array.isArray(block.options)) e.push('缺少 options 陣列');
      else if (!block.options.length) e.push('選項不可為空');
      else block.options.forEach((o, i) => { if (!o.text) e.push(`選項 ${i + 1} 文字為空`); });
      break;
    case 'note':
      if (!block.text) e.push('筆記文字為空');
      break;
  }
  return e;
}

export function validateBlocks(blocks, characters = []) {
  if (!Array.isArray(blocks) || !blocks.length)
    return { valid: false, results: [{ index: 0, id: '(file)', errors: ['匯入資料不是有效的 block 陣列'] }] };

  const results = [];
  blocks.forEach((b, i) => {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      results.push({ index: i, id: `(line ${i + 1})`, errors: ['項目不是有效物件'] });
      return;
    }
    const errs = validateBlock(b, characters);
    if (errs.length) results.push({ index: i, id: b.id || `(line ${i + 1})`, errors: errs });
  });
  return { valid: !results.length, results };
}

/* ═══════════════════════════════════════════
   IndexedDB — Character CRUD
   ═══════════════════════════════════════════ */
const CHAR_DB_NAME    = 'script-editor-characters';
const CHAR_DB_VERSION = 1;
let _charDb = null;

function openCharDB() {
  if (_charDb) return Promise.resolve(_charDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CHAR_DB_NAME, CHAR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('characters'))
        db.createObjectStore('characters', { keyPath: 'id' });
    };
    req.onsuccess = () => { _charDb = req.result; resolve(_charDb); };
    req.onerror   = () => reject(req.error);
  });
}

export async function loadCharacters() {
  const db = await openCharDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('characters', 'readonly');
    const req = tx.objectStore('characters').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveCharacter(char) {
  const db = await openCharDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('characters', 'readwrite');
    tx.objectStore('characters').put(char);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function deleteCharacter(id) {
  const db = await openCharDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('characters', 'readwrite');
    tx.objectStore('characters').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/* ═══════════════════════════════════════════
   Character Utilities
   ═══════════════════════════════════════════ */
const CHAR_PALETTE = [
  '#C9A86A','#6aae7f','#7aa3cc','#c4604f','#b07acc',
  '#cc9a6a','#6accc0','#cc6a8a','#8a8acc','#aab06a',
];

export function resolveCharacterId(speakerName) {
  const chars = AppState.get('characters') || [];
  for (const c of chars) {
    if (c.displayName === speakerName) return c.id;
    if (c.aliases?.some(a => a === speakerName)) return c.id;
  }
  return null;
}

export function getCharColor(nameOrId) {
  const chars = AppState.get('characters') || [];
  for (const c of chars) {
    if (c.id === nameOrId || c.displayName === nameOrId || c.aliases?.includes(nameOrId))
      return c.color || 'var(--gold)';
  }
  return 'var(--text-tertiary)';
}

export function detectNewSpeakers(blocks) {
  const chars = AppState.get('characters') || [];
  const known = new Set();
  for (const c of chars) {
    known.add(c.displayName);
    c.aliases?.forEach(a => known.add(a));
  }
  const fresh = new Set();
  for (const b of blocks) {
    if (b.type === 'dialogue' && b.speaker && !known.has(b.speaker)) fresh.add(b.speaker);
  }
  return [...fresh];
}

export async function autoRegisterSpeakers(blocks) {
  const names = detectNewSpeakers(blocks);
  if (!names.length) return [];

  const chars = AppState.get('characters') || [];
  const added = [];

  for (const name of names) {
    const c = {
      id: generateId('char'),
      displayName: name,
      aliases: [],
      color: CHAR_PALETTE[chars.length % CHAR_PALETTE.length],
      createdAt: Date.now(),
    };
    chars.push(c);
    await saveCharacter(c);
    added.push(c);
  }

  AppState.set('characters', [...chars]);
  Bus.emit('characters:added', added);
  return added;
}

/* ═══════════════════════════════════════════
   localStorage Utilities
   ═══════════════════════════════════════════ */
const SP = 'se17_';   // storage prefix

function _wid() { return AppState.get('workId') || '_default'; }

export const Storage = {
  /* ── Blocks draft ── */
  saveDraft(blocks) {
    try { localStorage.setItem(`${SP}draft_${_wid()}`, JSON.stringify(blocks)); return true; }
    catch (e) { console.error('[SE] draft save:', e); return false; }
  },
  loadDraft() {
    try {
      const r = localStorage.getItem(`${SP}draft_${_wid()}`);
      if (!r) return null;
      const p = JSON.parse(r);
      return Array.isArray(p) ? p : null;
    } catch { return null; }
  },
  clearDraft() { localStorage.removeItem(`${SP}draft_${_wid()}`); },

  /* ── Notes (per character) ── */
  loadNotes() {
    try {
      const r = localStorage.getItem(`${SP}notes_${_wid()}`);
      return r ? JSON.parse(r) : {};
    } catch { return {}; }
  },
  saveNotes(notes) {
    try { localStorage.setItem(`${SP}notes_${_wid()}`, JSON.stringify(notes)); }
    catch (e) { console.error('[SE] notes save:', e); }
  },

  /* ── Focus block (cross-tab restore) ── */
  saveFocusBlock(id) { localStorage.setItem(`${SP}focusBlock`, id || ''); },
  loadFocusBlock()   { return localStorage.getItem(`${SP}focusBlock`) || null; },

  /* ── Plain Script text cache (Write tab) ── */
  savePlainText(text) {
    try { localStorage.setItem(`${SP}plain_${_wid()}`, text); } catch {}
  },
  loadPlainText() { return localStorage.getItem(`${SP}plain_${_wid()}`) || ''; },

  /* ── Shortcuts config ── */
  saveShortcuts(map) {
    try { localStorage.setItem(`${SP}shortcuts`, JSON.stringify(map)); }
    catch (e) { console.error('[SE] shortcuts save:', e); }
  },
  loadShortcuts() {
    try { const r = localStorage.getItem(`${SP}shortcuts`); return r ? JSON.parse(r) : null; }
    catch { return null; }
  },
};

/* ═══════════════════════════════════════════
   Shortcut Key Manager
   ═══════════════════════════════════════════ */
const DEFAULT_SHORTCUTS = {
  'Alt+1': { type: 'scene',     label: '場景' },
  'Alt+2': { type: 'narration', label: '旁白' },
  // Alt+3 ~ Alt+9 auto-bound to characters
};

export const ShortcutManager = {
  _map: {},

  init() {
    const saved = Storage.loadShortcuts();
    if (saved) { this._map = saved; } else { this.autoBind(); }
    AppState.set('shortcuts', { ...this._map });
  },

  /** Auto-bind Alt+3~9 to first 7 characters (order of creation) */
  autoBind() {
    this._map = { ...DEFAULT_SHORTCUTS };
    const chars = AppState.get('characters') || [];
    for (let i = 0; i < Math.min(chars.length, 7); i++) {
      this._map[`Alt+${i + 3}`] = {
        type: 'character', charId: chars[i].id, label: chars[i].displayName,
      };
    }
    Storage.saveShortcuts(this._map);
    AppState.set('shortcuts', { ...this._map });
    Bus.emit('shortcuts:updated', this._map);
  },

  getMap()       { return { ...this._map }; },
  resolve(combo) { return this._map[combo] || null; },

  set(key, binding) {
    this._map[key] = binding;
    Storage.saveShortcuts(this._map);
    AppState.set('shortcuts', { ...this._map });
    Bus.emit('shortcuts:updated', this._map);
  },

  remove(key) {
    delete this._map[key];
    Storage.saveShortcuts(this._map);
    AppState.set('shortcuts', { ...this._map });
    Bus.emit('shortcuts:updated', this._map);
  },

  /** Formatted labels for Alt+1 ~ Alt+9 (for status bar / tooltip) */
  getSlotLabels() {
    const labels = [];
    for (let n = 1; n <= 9; n++) {
      const b = this._map[`Alt+${n}`];
      labels.push(b ? `Alt+${n} ${b.label || b.type}` : null);
    }
    return labels;
  },
};

/* ═══════════════════════════════════════════
   SVG Icon Paths (shared across all tabs)
   ═══════════════════════════════════════════ */
export const ICONS = {
  pen:      '<path d="M16 4l4 4-12 12H4v-4z"/>',
  book:     '<path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/>',
  search:   '<circle cx="11" cy="11" r="7"/><path d="M16 16l4 4"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  trash:    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v12M6 12l6 6 6-6"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  upload:   '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  file:     '<path d="M5 3h11l4 4v14H5z"/><path d="M16 3v4h4"/>',
  filePlus: '<path d="M5 3h11l4 4v14H5z"/><path d="M16 3v4h4M12 11v6M9 14h6"/>',
  save:     '<path d="M5 3h12l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M15 3v6H9V3M7 21v-7h10v7"/>',
  play:     '<path d="M8 5v14l11-7z"/>',
  pause:    '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  stop:     '<rect x="6" y="6" width="12" height="12"/>',
  eye:      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  cog:      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  hashtag:  '<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>',
  curtain:  '<path d="M3 3h18M5 3v18M19 3v18M5 7c2 1 3 3 3 6s-1 5-3 6M19 7c-2 1-3 3-3 6s1 5 3 6M12 3v18"/>',
  music:    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  speaker:  '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>',
  layers:   '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  network:  '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="19" cy="16" r="2"/><path d="M7 7l5 11M17 7l-5 11M17 7v7"/>',
  quill:    '<path d="M20 2c-2 0-7 1-9 5-1 2-1.5 4-1.5 6H7l-2 4.5L3 22h2l1.5-3H12c0-2 .5-4 1.5-6 2-4 5-5 7-5l1-1c0-2-1-5-1.5-5z"/>',
  back:     '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check:    '<path d="M5 13l4 4L19 7"/>',
  copy:     '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>',
};

/** Build <svg> string from icon name. Usage: icon('pen') → SVG markup */
export function icon(name, size = 16, strokeWidth = 1.6) {
  const p = ICONS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}
