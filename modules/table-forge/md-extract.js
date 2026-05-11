// Table Forge — Markdown Structure Extraction (Phase 9)
// Converts translation-core metadata into Table Forge documents.

import { createDocument, addColumn, addRow, getSheet } from './table-model.js';
import { extractMarkdownMeta } from '../../core/translation-core.js';

// 9-A: Chapter table

export function extractChapterTable(content) {
  const meta = extractMarkdownMeta(content);
  if (!meta.outline || meta.outline.length === 0) {
    return { error: '文件中沒有標題（heading），無法生成章節表。' };
  }

  const doc = createDocument('章節表', 'md-extract');
  const sheet = doc.sheets[0];

  addColumn(sheet, 'sectionNo');
  addColumn(sheet, 'level');
  addColumn(sheet, 'title');
  addColumn(sheet, 'parent');
  addColumn(sheet, 'lineStart');
  addColumn(sheet, 'lineEnd');
  addColumn(sheet, 'summary');

  const outline = meta.outline;
  for (let i = 0; i < outline.length; i++) {
    const h = outline[i];
    const lineEnd = i + 1 < outline.length ? outline[i + 1].line - 1 : '';
    addRow(sheet, {
      sectionno: String(i + 1),
      level: String(h.level),
      title: h.title,
      parent: findParent(outline, i),
      linestart: String(h.line),
      lineend: lineEnd !== '' ? String(lineEnd) : '',
      summary: '',
    });
  }

  return doc;
}

function findParent(outline, index) {
  const current = outline[index];
  for (let i = index - 1; i >= 0; i--) {
    if (outline[i].level < current.level) return outline[i].title;
  }
  return '';
}

// 9-B: Table inventory

export function extractTableInventory(content) {
  const meta = extractMarkdownMeta(content);
  if (!meta.tables || meta.tables.length === 0) {
    return { error: '文件中沒有 Markdown 表格。' };
  }

  const doc = createDocument('表格清單', 'md-extract');
  const sheet = doc.sheets[0];

  addColumn(sheet, 'tableId');
  addColumn(sheet, 'parentSection');
  addColumn(sheet, 'columns');
  addColumn(sheet, 'columnCount');
  addColumn(sheet, 'rowCount');
  addColumn(sheet, 'lineStart');
  addColumn(sheet, 'lineEnd');

  for (const t of meta.tables) {
    addRow(sheet, {
      tableid: String(t.index),
      parentsection: findParentSection(meta.outline, t.line),
      columns: t.columns.join(', '),
      columncount: String(t.columnCount),
      rowcount: String(t.rowCount),
      linestart: String(t.line),
      lineend: String(t.line + 1 + t.rowCount),
    });
  }

  return doc;
}

function findParentSection(outline, line) {
  if (!outline || !outline.length) return '';
  let best = null;
  for (const h of outline) {
    if (h.line <= line) best = h;
    else break;
  }
  return best ? best.title : '';
}

// 9-C: Outline

export function extractOutline(content) {
  const meta = extractMarkdownMeta(content);
  if (!meta.outline || meta.outline.length === 0) {
    return { error: '文件中沒有標題。' };
  }

  const doc = createDocument('大綱', 'md-extract');
  const sheet = doc.sheets[0];

  addColumn(sheet, 'level');
  addColumn(sheet, 'title');
  addColumn(sheet, 'line');

  for (const h of meta.outline) {
    addRow(sheet, {
      level: String(h.level),
      title: h.title,
      line: String(h.line),
    });
  }

  return doc;
}

// 9-C: Code fences

export function extractCodeFences(content) {
  const meta = extractMarkdownMeta(content);
  if (!meta.codeBlocks || meta.codeBlocks.length === 0) {
    return { error: '文件中沒有 code fence。' };
  }

  const doc = createDocument('Code Fence 清單', 'md-extract');
  const sheet = doc.sheets[0];

  addColumn(sheet, 'index');
  addColumn(sheet, 'lang');
  addColumn(sheet, 'lineStart');
  addColumn(sheet, 'lineEnd');
  addColumn(sheet, 'lineCount');
  addColumn(sheet, 'parentSection');

  for (const c of meta.codeBlocks) {
    addRow(sheet, {
      index: String(c.index),
      lang: c.lang || '',
      linestart: String(c.lineStart),
      lineend: String(c.lineEnd),
      linecount: String(c.lineCount),
      parentsection: findParentSection(meta.outline, c.lineStart),
    });
  }

  return doc;
}

// 9-C: Tasks

export function extractTasks(content) {
  const meta = extractMarkdownMeta(content);
  if (!meta.taskItems || meta.taskItems.length === 0) {
    return { error: '文件中沒有 task list。' };
  }

  const doc = createDocument('Task List', 'md-extract');
  const sheet = doc.sheets[0];

  addColumn(sheet, 'checked');
  addColumn(sheet, 'text');
  addColumn(sheet, 'line');

  for (const t of meta.taskItems) {
    addRow(sheet, {
      checked: t.checked ? '✓' : '',
      text: t.text,
      line: String(t.line),
    });
  }

  if (meta.taskSummary) doc.taskSummary = meta.taskSummary;
  return doc;
}

// 9-D: Writeback diff

export function generateWritebackDiff(oldText, newText) {
  const oldLines = oldText.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const newLines = newText.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const diff = [];
  let hasChanges = false;

  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = i < oldLines.length ? oldLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === n) {
      diff.push({ type: 'same', text: o });
    } else {
      hasChanges = true;
      if (o !== null) diff.push({ type: 'del', text: o });
      if (n !== null) diff.push({ type: 'add', text: n });
    }
  }

  return { diff, hasChanges };
}

// 9-E: Metadata columns

export function addMetadataColumns(doc) {
  const sheet = getSheet(doc);
  if (!sheet) return doc;

  if (!sheet.columns.some(c => c.id === 'source')) {
    addColumn(sheet, 'source');
    for (const row of sheet.rows) row.cells.source = 'auto';
  }
  if (!sheet.columns.some(c => c.id === 'editedby')) {
    addColumn(sheet, 'editedBy');
  }

  return doc;
}

// Detect available extractions for given content

export function detectAvailableExtractions(content) {
  const meta = extractMarkdownMeta(content);
  const available = [];

  if (meta.outline && meta.outline.length > 0) {
    available.push({ id: 'chapter', label: '章節表', count: meta.outline.length });
    available.push({ id: 'outline', label: '大綱', count: meta.outline.length });
  }
  if (meta.tables && meta.tables.length > 0) {
    available.push({ id: 'tables', label: '表格清單', count: meta.tables.length });
  }
  if (meta.codeBlocks && meta.codeBlocks.length > 0) {
    available.push({ id: 'codefence', label: 'Code Fences', count: meta.codeBlocks.length });
  }
  if (meta.taskItems && meta.taskItems.length > 0) {
    const s = meta.taskSummary;
    available.push({
      id: 'tasks',
      label: 'Tasks',
      count: meta.taskItems.length,
      extra: s ? `${s.done}/${s.total}` : '',
    });
  }

  return available;
}
