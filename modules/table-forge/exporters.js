// Table Forge — Exporters (MD / JSON / CSV)

import { getSheet } from './table-model.js';

// --- Markdown ---

export function exportMarkdown(doc) {
  const sheet = getSheet(doc);
  if (!sheet || sheet.columns.length === 0) return '';

  const cols = sheet.columns;
  const header = '| ' + cols.map(c => escapeMdCell(c.name)).join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';

  const rows = sheet.rows.map(row => {
    const cells = cols.map(c => escapeMdCell(String(row.cells[c.id] ?? '')));
    return '| ' + cells.join(' | ') + ' |';
  });

  return [header, sep, ...rows].join('\n') + '\n';
}

function escapeMdCell(val) {
  return val
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

// --- JSON ---

export function exportJSON(doc) {
  const sheet = getSheet(doc);
  if (!sheet || sheet.columns.length === 0) return '[]';

  const cols = sheet.columns;
  const result = sheet.rows.map(row => {
    const obj = {};
    for (const col of cols) {
      obj[col.name] = row.cells[col.id] ?? '';
    }
    return obj;
  });

  return JSON.stringify(result, null, 2);
}

// --- CSV (PapaParse) ---

export function exportCSV(doc, Papa) {
  const sheet = getSheet(doc);
  if (!sheet || sheet.columns.length === 0) return '';

  if (!Papa) {
    return exportCSVFallback(sheet);
  }

  const cols = sheet.columns;
  const fields = cols.map(c => c.name);
  const data = sheet.rows.map(row =>
    cols.map(c => String(row.cells[c.id] ?? ''))
  );

  return Papa.unparse({ fields, data });
}

function exportCSVFallback(sheet) {
  const cols = sheet.columns;

  const escapeCSV = (val) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = cols.map(c => escapeCSV(c.name)).join(',');
  const rows = sheet.rows.map(row =>
    cols.map(c => escapeCSV(row.cells[c.id] ?? '')).join(',')
  );

  return [header, ...rows].join('\n') + '\n';
}
