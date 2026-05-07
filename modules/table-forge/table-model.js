// Table Forge — Normalized Table Model

let _idCounter = 0;
function uid() {
  return 't' + Date.now().toString(36) + (++_idCounter).toString(36);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^\w一-鿿぀-ゟ゠-ヿ]+/g, '_')
    .replace(/^_|_$/g, '') || 'col';
}

function uniqueColumnId(sheet, base) {
  const existing = new Set(sheet.columns.map(c => c.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(base + '_' + i)) i++;
  return base + '_' + i;
}

// --- Document ---

export function createDocument(title, sourceType) {
  return {
    id: uid(),
    title: title || 'Untitled',
    sourceType: sourceType || 'manual',
    sheets: [createSheet('Sheet 1')],
  };
}

export function createSheet(name) {
  return {
    id: uid(),
    name: name || 'Sheet 1',
    columns: [],
    rows: [],
  };
}

// --- Column ---

export function addColumn(sheet, name) {
  const slug = slugify(name);
  const id = uniqueColumnId(sheet, slug);
  const col = { id, name, type: 'string' };
  sheet.columns.push(col);
  for (const row of sheet.rows) {
    row.cells[id] = '';
  }
  return col;
}

export function removeColumn(sheet, columnId) {
  const idx = sheet.columns.findIndex(c => c.id === columnId);
  if (idx === -1) return false;
  sheet.columns.splice(idx, 1);
  for (const row of sheet.rows) {
    delete row.cells[columnId];
  }
  return true;
}

export function renameColumn(sheet, columnId, newName) {
  const col = sheet.columns.find(c => c.id === columnId);
  if (!col) return false;
  col.name = newName;
  return true;
}

// --- Row ---

export function addRow(sheet, cells) {
  const row = { id: uid(), cells: {} };
  for (const col of sheet.columns) {
    row.cells[col.id] = (cells && cells[col.id] != null) ? cells[col.id] : '';
  }
  sheet.rows.push(row);
  return row;
}

export function removeRow(sheet, rowId) {
  const idx = sheet.rows.findIndex(r => r.id === rowId);
  if (idx === -1) return false;
  sheet.rows.splice(idx, 1);
  return true;
}

// --- Cell ---

export function setCellValue(sheet, rowId, columnId, value) {
  const row = sheet.rows.find(r => r.id === rowId);
  if (!row) return false;
  if (!sheet.columns.some(c => c.id === columnId)) return false;
  row.cells[columnId] = value;
  return true;
}

// --- Query ---

export function getColumnValues(sheet, columnId) {
  if (!sheet.columns.some(c => c.id === columnId)) return null;
  return sheet.rows.map(r => r.cells[columnId] ?? '');
}

export function getSheet(doc, index) {
  return doc.sheets[index ?? 0] || null;
}
