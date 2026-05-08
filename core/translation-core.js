/**
 * Translation Core — Phase 7
 * Format detection + structure extraction engine.
 * Converts external inputs into Akasha intermediate blocks.
 */

let jobCounter = 0;

// ── TransformJob factory (7-A) ──────────────────────────────

export function createJob(content, filename) {
  const id = `tj-${Date.now()}-${++jobCounter}`;
  const detected = detectFormat(content, filename);
  return {
    id,
    source: { content, filename: filename || 'untitled', type: detected.format, size: content.length },
    detected,
    blocks: [],
    metadata: {},
    status: 'pending',
    error: null,
    createdAt: Date.now(),
  };
}

export function transform(job) {
  job.status = 'analyzing';
  try {
    const { content } = job.source;
    const { format, subtype } = job.detected;
    switch (format) {
      case 'markdown':
        job.blocks = extractMarkdown(content);
        job.metadata = extractMarkdownMeta(content);
        break;
      case 'json':
        job.blocks = extractJson(content);
        job.metadata = extractJsonMeta(content);
        break;
      case 'jsonl':
        job.blocks = extractJsonl(content);
        job.metadata = { lineCount: content.trim().split('\n').length };
        break;
      case 'text':
        if (subtype === 'plain-script') {
          job.blocks = extractPlainScript(content);
          job.metadata = extractScriptMeta(job.blocks);
        } else {
          job.blocks = extractText(content);
          job.metadata = {};
        }
        break;
      case 'score':
        job.blocks = extractJson(content);
        job.metadata = { type: 'tsukisynth-score' };
        break;
      default:
        job.blocks = extractText(content);
        job.metadata = {};
    }
    job.status = 'done';
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  }
  return job;
}

export function translate(content, filename) {
  return transform(createJob(content, filename));
}

// ── Format detection (7-A) ──────────────────────────────────

const EXT_MAP = {
  '.score.json': 'score',
  '.md': 'markdown', '.markdown': 'markdown',
  '.json': 'json', '.jsonl': 'jsonl',
  '.csv': 'csv', '.tsv': 'tsv',
  '.py': 'python', '.js': 'javascript',
  '.txt': 'text', '.ks': 'tyranoscript',
};

export function detectFormat(content, filename) {
  const name = (filename || '').toLowerCase();

  for (const [ext, fmt] of Object.entries(EXT_MAP)) {
    if (name.endsWith(ext)) {
      return { format: fmt, subtype: detectSubtype(content, fmt), confidence: 0.9 };
    }
  }
  return detectByContent(content);
}

function detectSubtype(content, format) {
  if (format === 'markdown') {
    const parts = [];
    if (/^\s*\|.+\|/m.test(content) && /^\s*\|[\s:]*-{2,}/m.test(content)) parts.push('table');
    if (/^\s*-\s*\[[ xX]\]/m.test(content)) parts.push('tasklist');
    if (/^```/m.test(content)) parts.push('codefence');
    return parts.join('+') || 'prose';
  }
  if (format === 'json') {
    try {
      const d = JSON.parse(content);
      if (Array.isArray(d) && d.length && typeof d[0] === 'object' && d[0] !== null) return 'array-of-objects';
      if (Array.isArray(d)) return 'array';
      return 'object';
    } catch { return 'invalid'; }
  }
  if (format === 'text') {
    return isPlainScript(content) ? 'plain-script' : 'prose';
  }
  return null;
}

function detectByContent(content) {
  try { JSON.parse(content); return { format: 'json', subtype: detectSubtype(content, 'json'), confidence: 0.8 }; } catch {}

  const lines = content.trim().split('\n');
  if (lines.length >= 2) {
    let hit = 0;
    for (const l of lines.slice(0, 10)) { try { JSON.parse(l.trim()); hit++; } catch {} }
    if (hit >= Math.min(lines.length, 10) * 0.8)
      return { format: 'jsonl', subtype: null, confidence: 0.7 };
  }

  if (isPlainScript(content)) return { format: 'text', subtype: 'plain-script', confidence: 0.7 };
  if (/^#{1,6}\s/m.test(content) || (/^\s*\|.+\|/m.test(content) && /^\s*\|[\s:]*-/m.test(content)))
    return { format: 'markdown', subtype: detectSubtype(content, 'markdown'), confidence: 0.6 };

  return { format: 'text', subtype: 'prose', confidence: 0.3 };
}

function isPlainScript(content) {
  const lines = content.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  if (lines.length < 2) return false;
  const dlg = /^[^\s#].{0,20}[：:].+/;
  const cmd = /^#\w+:\s/;
  let hits = 0;
  for (const l of lines.slice(0, 20)) { if (dlg.test(l.trim()) || cmd.test(l.trim())) hits++; }
  return hits / Math.min(lines.length, 20) >= 0.5;
}

// ── Markdown extraction (7-B) ───────────────────────────────

function extractMarkdown(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let inCode = false, codeLang = '', codeLines = [];

  function flush() {
    if (para.length) { blocks.push({ type: 'paragraph', text: para.join('\n') }); para = []; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], tr = raw.trim();

    if (tr.startsWith('```')) {
      if (!inCode) { flush(); inCode = true; codeLang = tr.slice(3).trim(); codeLines = []; }
      else { blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') }); inCode = false; }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }
    if (!tr) { flush(); continue; }

    const tbl = parseTable(lines, i);
    if (tbl) { flush(); blocks.push({ type: 'table', head: tbl.head, body: tbl.body }); i = tbl.end - 1; continue; }

    const hm = tr.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { flush(); blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() }); continue; }

    const tk = tr.match(/^-\s*\[([ xX])\]\s+(.+)$/);
    if (tk) { flush(); blocks.push({ type: 'task', checked: tk[1] !== ' ', text: tk[2] }); continue; }

    const li = tr.match(/^\s*[-*+]\s+(.+)$/);
    if (li) { flush(); blocks.push({ type: 'list-item', text: li[1] }); continue; }

    const ol = tr.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ol) { flush(); blocks.push({ type: 'list-item', ordered: true, number: +ol[1], text: ol[2] }); continue; }

    if (/^[-*_]{3,}\s*$/.test(tr)) { flush(); blocks.push({ type: 'hr' }); continue; }

    para.push(tr);
  }
  flush();
  if (inCode) blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') });
  return blocks;
}

function parseTable(lines, start) {
  const isRow = l => /^\s*\|/.test(l) && /\|\s*$/.test(l);
  const isSep = l => /^\s*\|[\s:]*-{2,}[\s:|-]*\|\s*$/.test(l);
  const split = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  if (!isRow(lines[start]) || start + 1 >= lines.length || !isSep(lines[start + 1])) return null;
  const head = split(lines[start]);
  const body = [];
  let i = start + 2;
  while (i < lines.length && isRow(lines[i])) { body.push(split(lines[i])); i++; }
  return { head, body, end: i };
}

export function extractMarkdownMeta(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const outline = [], tables = [], codeBlocks = [], taskItems = [];
  let tblIdx = 0, codeIdx = 0, inCode = false, codeLang = '', codeStart = 0;

  const isRow = l => /^\s*\|/.test(l) && /\|\s*$/.test(l);
  const isSep = l => /^\s*\|[\s:]*-{2,}[\s:|-]*\|\s*$/.test(l);
  const split = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();

    if (tr.startsWith('```')) {
      if (!inCode) { inCode = true; codeLang = tr.slice(3).trim(); codeStart = i + 1; }
      else { codeBlocks.push({ index: codeIdx++, lang: codeLang, lineStart: codeStart, lineEnd: i, lineCount: i - codeStart }); inCode = false; }
      continue;
    }
    if (inCode) continue;

    const hm = tr.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { outline.push({ level: hm[1].length, title: hm[2].trim(), line: i + 1 }); continue; }

    if (isRow(tr) && i + 1 < lines.length && isSep(lines[i + 1].trim())) {
      const cols = split(tr);
      let rows = 0, j = i + 2;
      while (j < lines.length && isRow(lines[j])) { rows++; j++; }
      tables.push({ index: tblIdx++, columns: cols, columnCount: cols.length, rowCount: rows, line: i + 1 });
      i = j - 1;
      continue;
    }

    const tk = tr.match(/^-\s*\[([ xX])\]\s+(.+)$/);
    if (tk) taskItems.push({ checked: tk[1] !== ' ', text: tk[2], line: i + 1 });
  }

  return {
    outline, tables, codeBlocks, taskItems,
    taskSummary: taskItems.length ? { total: taskItems.length, done: taskItems.filter(t => t.checked).length } : null,
  };
}

// ── Plain Script extraction (7-C) ──────────────────────────

function extractPlainScript(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];

  for (const raw of lines) {
    const tr = raw.trim();
    if (!tr || tr.startsWith('//')) continue;

    const cmd = tr.match(/^#(\w+):\s*(.+)$/);
    if (cmd) { blocks.push({ type: 'command', command: cmd[1], value: cmd[2].trim() }); continue; }

    const dlg = tr.match(/^([^\s#][^：:]{0,20})[：:](.+)$/);
    if (dlg) {
      const speaker = dlg[1].trim(), text = dlg[2].trim();
      if (speaker === '旁白') {
        blocks.push({ type: 'narration', text });
      } else {
        blocks.push({ type: 'dialogue', speaker, text, speakerId: null, emotion: null, portrait: null, voice: null });
      }
      continue;
    }

    blocks.push({ type: 'narration', text: tr, uncertain: true });
  }
  return blocks;
}

function extractScriptMeta(blocks) {
  const speakers = new Map();
  let dialogueCount = 0, narrationCount = 0, commandCount = 0, uncertainCount = 0;
  for (const b of blocks) {
    if (b.type === 'dialogue') { dialogueCount++; speakers.set(b.speaker, (speakers.get(b.speaker) || 0) + 1); }
    else if (b.type === 'narration') { narrationCount++; if (b.uncertain) uncertainCount++; }
    else if (b.type === 'command') commandCount++;
  }
  return {
    speakers: [...speakers.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    dialogueCount, narrationCount, commandCount, uncertainCount,
    totalBlocks: blocks.length,
  };
}

// ── JSON extraction (7-D) ──────────────────────────────────

function extractJson(content) {
  let data;
  try { data = JSON.parse(content); } catch { return [{ type: 'paragraph', text: content }]; }

  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && data[0] !== null) {
    const keys = [...new Set(data.flatMap(o => Object.keys(o)))];
    const body = data.map(o => keys.map(k => {
      const v = o[k];
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    }));
    return [{ type: 'table', head: keys, body, tableCandidate: true }];
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const body = Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]);
    return [{ type: 'table', head: ['Key', 'Value'], body }];
  }

  return [{ type: 'paragraph', text: JSON.stringify(data, null, 2) }];
}

function extractJsonMeta(content) {
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      const m = { type: 'array', length: data.length };
      if (data.length && typeof data[0] === 'object' && data[0] !== null) {
        m.columns = [...new Set(data.flatMap(o => Object.keys(o)))];
        m.columnCount = m.columns.length;
        m.tableCandidate = true;
      }
      return m;
    }
    if (typeof data === 'object' && data !== null)
      return { type: 'object', keys: Object.keys(data), keyCount: Object.keys(data).length };
    return { type: typeof data };
  } catch { return { type: 'invalid' }; }
}

// ── JSONL extraction ────────────────────────────────────────

function extractJsonl(content) {
  const blocks = [];
  for (const line of content.trim().split('\n')) {
    const tr = line.trim();
    if (!tr) continue;
    try {
      const obj = JSON.parse(tr);
      if (obj.type === 'dialogue' || obj.type === 'narration' || obj.type === 'command') blocks.push(obj);
      else blocks.push({ type: 'json-line', data: obj });
    } catch {
      blocks.push({ type: 'paragraph', text: tr });
    }
  }
  return blocks;
}

// ── Text extraction ─────────────────────────────────────────

function extractText(content) {
  return content.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(Boolean)
    .map(p => ({ type: 'paragraph', text: p.trim() }));
}
