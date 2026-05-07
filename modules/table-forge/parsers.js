// Table Forge — Parsers (MD / JSON / CSV)

import { createDocument, createSheet, addColumn, addRow } from './table-model.js';

// --- Markdown Table ---

export function parseMarkdownTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const tableLines = [];
  for (const line of lines) {
    if (line.startsWith('|') || line.includes('|')) {
      tableLines.push(line);
    } else if (tableLines.length > 0) {
      break;
    }
  }

  if (tableLines.length < 3) {
    return { error: '找不到有效的 Markdown 表格（至少需要 header + separator + 一列資料）' };
  }

  const headerLine = tableLines[0];
  const sepLine = tableLines[1];

  if (!/^[\s|:-]+$/.test(sepLine)) {
    return { error: '第二列不是有效的 separator（應為 |---|---|）' };
  }

  const headers = parseMdRow(headerLine);
  if (headers.length === 0) {
    return { error: 'Header 列沒有欄位' };
  }

  const doc = createDocument('Markdown Import', 'markdown');
  const sheet = doc.sheets[0];

  for (const name of headers) {
    addColumn(sheet, name || 'col');
  }

  for (let i = 2; i < tableLines.length; i++) {
    const values = parseMdRow(tableLines[i]);
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

// --- CSV (PapaParse) ---

export function parseCSV(text, Papa) {
  if (!Papa) {
    return { error: 'PapaParse 未載入' };
  }

  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    return { error: 'CSV 解析失敗：' + result.errors[0].message };
  }

  const rows = result.data;
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

// --- Auto-detect ---

export function autoDetectAndParse(text, Papa) {
  const trimmed = text.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const result = parseJSON(trimmed);
    if (!result.error) return result;
  }

  if (looksLikeMarkdownTable(trimmed)) {
    const result = parseMarkdownTable(trimmed);
    if (!result.error) return result;
  }

  if (Papa && looksLikeCSV(trimmed)) {
    const result = parseCSV(trimmed, Papa);
    if (!result.error) return result;
  }

  return { error: '無法辨識格式。支援 Markdown Table、JSON Array、CSV。' };
}

function looksLikeMarkdownTable(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return lines.length >= 3 && lines[0].includes('|') && /^[\s|:-]+$/.test(lines[1].trim());
}

function looksLikeCSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return false;
  const commaCount = (lines[0].match(/,/g) || []).length;
  return commaCount >= 1;
}
