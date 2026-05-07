// Table Forge — Parsers (MD / JSON / CSV)

import { createDocument, createSheet, addColumn, addRow } from './table-model.js';

// --- Markdown Table ---

export function parseMarkdownTable(text) {
  const allLines = text.split('\n');

  let headerIdx = -1;
  for (let i = 0; i < allLines.length - 1; i++) {
    const line = allLines[i].trim();
    const next = allLines[i + 1].trim();
    if (line.includes('|') && /^[\s|:-]+$/.test(next) && next.includes('-')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { error: '找不到 Markdown 表格。\n格式範例：\n| name | value |\n|---|---|\n| a | b |' };
  }

  const headerLine = allLines[headerIdx].trim();
  const headers = parseMdRow(headerLine);
  if (headers.length === 0) {
    return { error: 'Header 列沒有欄位' };
  }

  const dataLines = [];
  for (let i = headerIdx + 2; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line.includes('|')) break;
    dataLines.push(line);
  }

  if (dataLines.length === 0) {
    return { error: '表格只有 header 沒有資料列' };
  }

  const doc = createDocument('Markdown Import', 'markdown');
  const sheet = doc.sheets[0];

  for (const name of headers) {
    addColumn(sheet, name || 'col');
  }

  for (const line of dataLines) {
    const values = parseMdRow(line);
    const cells = {};
    for (let j = 0; j < sheet.columns.length; j++) {
      cells[sheet.columns[j].id] = (j < values.length) ? values[j] : '';
    }
    addRow(sheet, cells);
  }

  return doc;
}

function parseMdRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(cell => cell.trim());
}

// --- JSON ---

export function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: 'JSON 解析失敗：' + e.message };
  }

  if (!Array.isArray(data)) {
    return { error: '根層必須是 Array' };
  }

  if (data.length === 0) {
    return { error: 'Array 是空的，沒有資料可匯入' };
  }

  if (isArrayOfArrays(data)) {
    return parseJsonAoA(data);
  }

  if (isArrayOfObjects(data)) {
    return parseJsonAoO(data);
  }

  return { error: '不支援的 JSON 格式（需要 Array of Objects 或 Array of Arrays）' };
}

function isArrayOfArrays(data) {
  return data.length > 0 && data.every(item => Array.isArray(item));
}

function isArrayOfObjects(data) {
  let objectCount = 0;
  for (const item of data) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      objectCount++;
    }
  }
  return objectCount > data.length / 2;
}

function parseJsonAoO(data) {
  const doc = createDocument('JSON Import', 'json');
  const sheet = doc.sheets[0];

  const keySet = new Map();
  for (const obj of data) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const key of Object.keys(obj)) {
      if (!keySet.has(key)) {
        keySet.set(key, addColumn(sheet, key));
      }
    }
  }

  for (const obj of data) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      addRow(sheet);
      continue;
    }
    const cells = {};
    for (const [key, col] of keySet) {
      const val = obj[key];
      cells[col.id] = normalizeJsonValue(val);
    }
    addRow(sheet, cells);
  }

  return doc;
}

function parseJsonAoA(data) {
  const doc = createDocument('JSON Import', 'json');
  const sheet = doc.sheets[0];

  const headerRow = data[0];
  const isHeaderStrings = headerRow.every(h => typeof h === 'string');

  if (isHeaderStrings && data.length > 1) {
    for (const name of headerRow) {
      addColumn(sheet, name || 'col');
    }
    for (let i = 1; i < data.length; i++) {
      const cells = {};
      for (let j = 0; j < sheet.columns.length; j++) {
        cells[sheet.columns[j].id] = (j < data[i].length) ? normalizeJsonValue(data[i][j]) : '';
      }
      addRow(sheet, cells);
    }
  } else {
    const maxCols = Math.max(...data.map(r => r.length));
    for (let j = 0; j < maxCols; j++) {
      addColumn(sheet, 'col_' + (j + 1));
    }
    for (const arr of data) {
      const cells = {};
      for (let j = 0; j < sheet.columns.length; j++) {
        cells[sheet.columns[j].id] = (j < arr.length) ? normalizeJsonValue(arr[j]) : '';
      }
      addRow(sheet, cells);
    }
  }

  return doc;
}

function normalizeJsonValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// --- CSV (PapaParse with inline fallback) ---

function detectDelimiter(text) {
  const firstLine = text.split('\n')[0] || '';
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

function parseCsvBasic(text, delimiter) {
  const sep = delimiter || detectDelimiter(text);
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      cell = '';
      if (row.length > 1 || row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row.some(c => c !== '')) rows.push(row);

  return rows;
}

export function parseCSV(text, Papa, delimiter) {
  let rows;

  if (Papa) {
    const opts = { header: false, skipEmptyLines: true };
    if (delimiter) opts.delimiter = delimiter;
    const result = Papa.parse(text, opts);
    if (result.errors.length > 0 && result.data.length === 0) {
      return { error: 'CSV 解析失敗：' + result.errors[0].message };
    }
    rows = result.data;
  } else {
    rows = parseCsvBasic(text, delimiter);
  }

  if (rows.length === 0) {
    return { error: 'CSV 是空的' };
  }

  const doc = createDocument('CSV Import', 'csv');
  const sheet = doc.sheets[0];

  const headerRow = rows[0];
  for (const name of headerRow) {
    addColumn(sheet, name || 'col');
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = {};
    for (let j = 0; j < sheet.columns.length; j++) {
      cells[sheet.columns[j].id] = (j < rows[i].length) ? rows[i][j] : '';
    }
    addRow(sheet, cells);
  }

  return doc;
}

// --- Reader Payload ---

export function parseReaderPayload(payload) {
  if (!payload || !payload.blocks) {
    return { error: 'Reader payload 無效' };
  }

  const tableBlocks = payload.blocks.filter(b => b.type === 'table');
  if (tableBlocks.length === 0) {
    return { error: 'Reader payload 中沒有表格資料' };
  }

  const doc = createDocument(payload.filename || 'Reader Import', 'markdown');
  const sheet = doc.sheets[0];

  for (const tableBlock of tableBlocks) {
    for (const name of tableBlock.head) {
      const colName = name || 'col';
      if (!sheet.columns.some(c => c.name === colName)) {
        addColumn(sheet, colName);
      }
    }

    for (const row of tableBlock.body) {
      const cells = {};
      for (let j = 0; j < tableBlock.head.length; j++) {
        const colName = tableBlock.head[j] || 'col';
        const col = sheet.columns.find(c => c.name === colName);
        if (col && j < row.length) {
          cells[col.id] = String(row[j] ?? '');
        }
      }
      addRow(sheet, cells);
    }
  }

  return doc;
}

// --- Auto-detect ---

export function autoDetectAndParse(text, Papa) {
  const trimmed = text.trim();
  const detected = [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    detected.push('JSON');
    const result = parseJSON(trimmed);
    if (!result.error) return result;
  }

  if (containsMarkdownTable(trimmed)) {
    detected.push('Markdown Table');
    const result = parseMarkdownTable(trimmed);
    if (!result.error) return result;
  }

  if (looksLikeTSV(trimmed)) {
    detected.push('TSV');
    if (Papa) {
      const result = parseCSV(trimmed, Papa, '\t');
      if (!result.error) return result;
    }
  }

  if (looksLikeCSV(trimmed)) {
    detected.push('CSV');
    if (Papa) {
      const result = parseCSV(trimmed, Papa);
      if (!result.error) return result;
    }
  }

  let msg = '無法解析為表格。';
  if (detected.length > 0) {
    msg += `\n偵測到可能是 ${detected.join(' / ')}，但解析失敗。`;
  }
  msg += '\n\n支援格式：';
  msg += '\n• Markdown Table（整段文章中有 table 也行）';
  msg += '\n• JSON Array of Objects / Arrays';
  msg += '\n• CSV（逗號分隔）';
  msg += '\n• TSV（Tab 分隔，如 Excel / Sheets 複製）';
  return { error: msg };
}

function containsMarkdownTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1].trim();
    if (line.includes('|') && /^[\s|:-]+$/.test(next) && next.includes('-')) {
      return true;
    }
  }
  return false;
}

function looksLikeTSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return false;
  const tabCount = (lines[0].match(/\t/g) || []).length;
  return tabCount >= 1;
}

function looksLikeCSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return false;
  const commaCount = (lines[0].match(/,/g) || []).length;
  return commaCount >= 1;
}
