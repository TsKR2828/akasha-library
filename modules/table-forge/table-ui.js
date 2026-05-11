// Table Forge — UI Controller

import {
  createDocument, getSheet,
  addColumn, removeColumn, renameColumn,
  addRow, removeRow, setCellValue,
} from './table-model.js';

import { parseMarkdownTable, parseJSON, parseCSV, autoDetectAndParse, parseReaderPayload } from './parsers.js';
import { exportMarkdown, exportJSON, exportCSV } from './exporters.js';
import { STORAGE_KEY as READER_STORAGE_KEY } from '../../core/export/bridge.js';
import {
  extractChapterTable, extractTableInventory, extractOutline,
  extractCodeFences, extractTasks, detectAvailableExtractions,
  addMetadataColumns, generateWritebackDiff,
} from './md-extract.js';

// --- State ---

let currentDoc = null;
let currentExportFormat = 'markdown';

// --- DOM refs ---

const $importPanel    = document.getElementById('import-panel');
const $importTextarea = document.getElementById('import-textarea');
const $importError    = document.getElementById('import-error');
const $importFile     = document.getElementById('import-file');

const $btnParse        = document.getElementById('btn-parse');
const $btnToggleImport = document.getElementById('btn-toggle-import');
const $btnToggleExport = document.getElementById('btn-toggle-export');
const $btnClear        = document.getElementById('btn-clear');

const $tableArea      = document.getElementById('table-area');
const $emptyState     = document.getElementById('empty-state');
const $tableContainer = document.getElementById('table-container');

const $exportPanel   = document.getElementById('export-panel');
const $exportPreview = document.getElementById('export-preview');
const $btnExportMd   = document.getElementById('btn-export-md');
const $btnExportJson = document.getElementById('btn-export-json');
const $btnExportCsv  = document.getElementById('btn-export-csv');
const $btnCopy       = document.getElementById('btn-copy');
const $btnDownload   = document.getElementById('btn-download');

const $toast = document.getElementById('toast');

const $btnExtract     = document.getElementById('btn-extract');
const $extractPanel   = document.getElementById('extract-panel');
const $extractButtons = document.getElementById('extract-buttons');
const $btnMeta        = document.getElementById('btn-meta');
const $btnDiff        = document.getElementById('btn-diff');

// --- Import ---

$btnParse.addEventListener('click', () => {
  const text = $importTextarea.value.trim();
  if (!text) { showError('請先貼上資料'); return; }
  const result = autoDetectAndParse(text, window.Papa);
  if (result.error) { showError(result.error); return; }
  loadDocument(result);
});

$importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const ext = file.name.split('.').pop().toLowerCase();
    let result;
    if (ext === 'json') {
      result = parseJSON(text);
    } else if (ext === 'csv' || ext === 'tsv') {
      result = parseCSV(text, window.Papa);
    } else {
      result = autoDetectAndParse(text, window.Papa);
    }
    if (result.error) { showError(result.error); return; }
    result.title = file.name;
    loadDocument(result);
  };
  reader.readAsText(file, 'UTF-8');
  $importFile.value = '';
});

$btnToggleImport.addEventListener('click', () => {
  $importPanel.classList.toggle('hidden');
});

$btnClear.addEventListener('click', () => {
  currentDoc = null;
  $tableContainer.innerHTML = '';
  $emptyState.style.display = '';
  $exportPanel.classList.add('hidden');
  $importPanel.classList.remove('hidden');
  $extractPanel.classList.add('hidden');
  $exportPreview.textContent = '';
  $importTextarea.value = '';
  showError('');
  currentExportFormat = 'markdown';
  updateHeaderButtons();
});

function showError(msg) {
  $importError.textContent = msg;
}

function loadDocument(doc) {
  currentDoc = doc;
  if (!doc._originalMd) doc._originalMd = exportMarkdown(doc);
  showError('');
  $importPanel.classList.add('hidden');
  $extractPanel.classList.add('hidden');
  $emptyState.style.display = 'none';
  renderTable();
  updateHeaderButtons();
}

function updateHeaderButtons() {
  const hasDoc = currentDoc !== null;
  $btnToggleExport.disabled = !hasDoc;
  $btnClear.disabled = !hasDoc;
  $btnMeta.disabled = !hasDoc;
}

// --- Table Rendering ---

function renderTable() {
  const sheet = getSheet(currentDoc);
  if (!sheet || sheet.columns.length === 0) {
    $tableContainer.innerHTML = '';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'tf-table-wrap';

  const table = document.createElement('table');
  table.className = 'tf-table';

  // thead
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  for (const col of sheet.columns) {
    const th = document.createElement('th');
    th.textContent = col.name;
    th.dataset.colId = col.id;
    th.addEventListener('dblclick', () => startEditHeader(th, col.id));
    headRow.appendChild(th);
  }

  const thActions = document.createElement('th');
  thActions.className = 'col-actions';
  headRow.appendChild(thActions);
  thead.appendChild(headRow);

  // col delete row (under header)
  const delColRow = document.createElement('tr');
  for (const col of sheet.columns) {
    const td = document.createElement('td');
    td.className = 'col-actions';
    const btn = document.createElement('button');
    btn.className = 'tf-del-btn';
    btn.textContent = '×';
    btn.title = '刪除欄';
    btn.addEventListener('click', () => {
      removeColumn(sheet, col.id);
      renderTable();
      refreshExportPreview();
    });
    td.appendChild(btn);
    delColRow.appendChild(td);
  }
  const emptyTd = document.createElement('td');
  emptyTd.className = 'col-actions';
  delColRow.appendChild(emptyTd);
  thead.appendChild(delColRow);

  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');

  for (const row of sheet.rows) {
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;

    for (const col of sheet.columns) {
      const td = document.createElement('td');
      td.textContent = row.cells[col.id] ?? '';
      td.dataset.colId = col.id;
      td.tabIndex = 0;
      td.addEventListener('dblclick', () => startEditCell(td, row.id, col.id));
      tr.appendChild(td);
    }

    const tdAction = document.createElement('td');
    tdAction.className = 'row-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'tf-del-btn';
    delBtn.textContent = '×';
    delBtn.title = '刪除列';
    delBtn.addEventListener('click', () => {
      removeRow(sheet, row.id);
      renderTable();
      refreshExportPreview();
    });
    tdAction.appendChild(delBtn);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);

  // action buttons
  const actions = document.createElement('div');
  actions.className = 'tf-table-actions';

  const addRowBtn = document.createElement('button');
  addRowBtn.className = 'tf-add-row';
  addRowBtn.textContent = '+ 新增列';
  addRowBtn.addEventListener('click', () => {
    addRow(sheet);
    renderTable();
    refreshExportPreview();
  });

  const addColBtn = document.createElement('button');
  addColBtn.className = 'tf-add-col';
  addColBtn.textContent = '+ 新增欄';
  addColBtn.addEventListener('click', () => {
    const name = prompt('欄位名稱：');
    if (name === null || name.trim() === '') return;
    addColumn(sheet, name.trim());
    renderTable();
    refreshExportPreview();
  });

  actions.appendChild(addRowBtn);
  actions.appendChild(addColBtn);

  $tableContainer.innerHTML = '';
  $tableContainer.appendChild(wrap);
  $tableContainer.appendChild(actions);
}

// --- Inline Editing ---

function startEditCell(td, rowId, colId) {
  if (td.contentEditable === 'true') return;
  td.contentEditable = 'true';
  td.focus();
  selectAll(td);

  const finish = () => {
    td.contentEditable = 'false';
    const sheet = getSheet(currentDoc);
    setCellValue(sheet, rowId, colId, td.textContent);
    refreshExportPreview();
  };

  td.addEventListener('blur', finish, { once: true });
  td.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      td.blur();
    }
    if (e.key === 'Escape') {
      const sheet = getSheet(currentDoc);
      const row = sheet.rows.find(r => r.id === rowId);
      td.textContent = row ? (row.cells[colId] ?? '') : '';
      td.contentEditable = 'false';
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      td.blur();
      const next = e.shiftKey ? td.previousElementSibling : td.nextElementSibling;
      if (next && !next.classList.contains('row-actions')) {
        next.dispatchEvent(new MouseEvent('dblclick'));
      }
    }
  });
}

function startEditHeader(th, colId) {
  if (th.contentEditable === 'true') return;
  const original = th.textContent;
  th.contentEditable = 'true';
  th.focus();
  selectAll(th);

  const finish = () => {
    th.contentEditable = 'false';
    const newName = th.textContent.trim();
    if (newName && newName !== original) {
      const sheet = getSheet(currentDoc);
      renameColumn(sheet, colId, newName);
      refreshExportPreview();
    } else {
      th.textContent = original;
    }
  };

  th.addEventListener('blur', finish, { once: true });
  th.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); th.blur(); }
    if (e.key === 'Escape') { th.textContent = original; th.contentEditable = 'false'; }
  });
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// --- Export ---

$btnToggleExport.addEventListener('click', () => {
  $exportPanel.classList.toggle('hidden');
  if (!$exportPanel.classList.contains('hidden')) {
    refreshExportPreview();
  }
});

$btnExportMd.addEventListener('click', () => { currentExportFormat = 'markdown'; refreshExportPreview(); highlightExportBtn(); });
$btnExportJson.addEventListener('click', () => { currentExportFormat = 'json'; refreshExportPreview(); highlightExportBtn(); });
$btnExportCsv.addEventListener('click', () => { currentExportFormat = 'csv'; refreshExportPreview(); highlightExportBtn(); });

function highlightExportBtn() {
  [$btnExportMd, $btnExportJson, $btnExportCsv, $btnDiff].forEach(b => b.classList.remove('btn--gold'));
  const map = { markdown: $btnExportMd, json: $btnExportJson, csv: $btnExportCsv, diff: $btnDiff };
  map[currentExportFormat]?.classList.add('btn--gold');
}

function refreshExportPreview() {
  if (!currentDoc || $exportPanel.classList.contains('hidden')) return;
  if (currentExportFormat === 'diff') { showDiffPreview(); return; }
  const text = generateExport();
  $exportPreview.textContent = text;
}

function generateExport() {
  if (!currentDoc) return '';
  switch (currentExportFormat) {
    case 'markdown': return exportMarkdown(currentDoc);
    case 'json':     return exportJSON(currentDoc);
    case 'csv':      return exportCSV(currentDoc, window.Papa);
    default:         return '';
  }
}

$btnCopy.addEventListener('click', async () => {
  const text = generateExport();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('已複製到剪貼簿');
  } catch {
    showToast('複製失敗');
  }
});

$btnDownload.addEventListener('click', () => {
  const text = generateExport();
  if (!text) return;
  const extMap = { markdown: 'md', json: 'json', csv: 'csv' };
  const mimeMap = { markdown: 'text/markdown', json: 'application/json', csv: 'text/csv' };
  const ext = extMap[currentExportFormat] || 'txt';
  const mime = mimeMap[currentExportFormat] || 'text/plain';
  const base = (currentDoc.title || 'table').replace(/\.[^.]+$/, '');
  downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), base + '.' + ext);
});

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
}

// --- Toast ---

let toastTimer = 0;
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 1800);
}

// --- Extract (Phase 9) ---

const EXTRACTORS = {
  chapter: extractChapterTable,
  outline: extractOutline,
  tables: extractTableInventory,
  codefence: extractCodeFences,
  tasks: extractTasks,
};

$btnExtract.addEventListener('click', () => {
  const text = $importTextarea.value.trim();
  if (!text) { showError('請先貼上 Markdown 內容'); return; }
  const available = detectAvailableExtractions(text);
  if (available.length === 0) {
    showError('內容中沒有可抽取的結構（需要標題、表格、code fence 或 task list）');
    return;
  }
  showError('');
  renderExtractButtons(available, text);
  $extractPanel.classList.remove('hidden');
});

function renderExtractButtons(available, content) {
  $extractButtons.innerHTML = '';
  for (const item of available) {
    const btn = document.createElement('button');
    btn.className = 'extract-btn';
    const extra = item.extra ? ' · ' + item.extra : '';
    btn.innerHTML = item.label + ' <span class="count">(' + item.count + extra + ')</span>';
    btn.addEventListener('click', () => {
      const fn = EXTRACTORS[item.id];
      if (!fn) return;
      const result = fn(content);
      if (result.error) { showError(result.error); return; }
      result._originalSource = content;
      loadDocument(result);
      showToast(item.label + ' 已抽取');
    });
    $extractButtons.appendChild(btn);
  }
}

// --- Metadata (Phase 9) ---

$btnMeta.addEventListener('click', () => {
  if (!currentDoc) return;
  addMetadataColumns(currentDoc);
  renderTable();
  refreshExportPreview();
  showToast('已加入 metadata 欄位');
});

// --- Diff Preview (Phase 9) ---

$btnDiff.addEventListener('click', () => {
  currentExportFormat = 'diff';
  highlightExportBtn();
  showDiffPreview();
  $exportPanel.classList.remove('hidden');
});

function showDiffPreview() {
  if (!currentDoc || !currentDoc._originalMd) {
    $exportPreview.textContent = '（無原始資料可比對）';
    return;
  }
  const currentMd = exportMarkdown(currentDoc);
  const { diff, hasChanges } = generateWritebackDiff(currentDoc._originalMd, currentMd);
  if (!hasChanges) {
    $exportPreview.textContent = '（無變更）';
    return;
  }
  $exportPreview.innerHTML = '';
  for (const d of diff) {
    const div = document.createElement('div');
    div.className = 'diff-line' + (d.type === 'del' ? ' diff-del' : d.type === 'add' ? ' diff-add' : ' diff-same');
    div.textContent = (d.type === 'del' ? '- ' : d.type === 'add' ? '+ ' : '  ') + d.text;
    $exportPreview.appendChild(div);
  }
}

// --- Reader Bridge ---

function checkReaderPayload() {
  const raw = sessionStorage.getItem(READER_STORAGE_KEY);
  if (!raw) return;
  sessionStorage.removeItem(READER_STORAGE_KEY);
  try {
    const payload = JSON.parse(raw);
    const result = parseReaderPayload(payload);
    if (result.error) { showError(result.error); return; }
    loadDocument(result);
  } catch {
    showError('Reader payload 解析失敗');
  }
}

window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'akasha-reader-payload') {
    const result = parseReaderPayload(e.data.payload);
    if (result.error) { showError(result.error); return; }
    loadDocument(result);
    return;
  }
  if (e.data.type === 'akasha-export-to-table-forge') {
    const { text, format } = e.data;
    if (!text) return;
    let result;
    if (format === 'csv') {
      result = parseCSV(text, window.Papa);
    } else if (format === 'json') {
      result = parseJSON(text);
    } else {
      result = autoDetectAndParse(text, window.Papa);
    }
    if (result.error) { showError(result.error); return; }
    result.title = e.data.title || 'Reader Import';
    loadDocument(result);
  }
  // AI context request from App Shell
  if (e.data.type === 'akasha-ai-get-context') {
    let content = '';
    let fileName = '';
    if (currentDoc) {
      content = exportMarkdown(currentDoc);
      if (content.length > 12000) content = content.slice(0, 12000) + '\n…（內容已截斷）';
      fileName = currentDoc.title || '';
    }
    window.parent.postMessage({
      type: 'akasha-ai-context-response',
      module: 'table-forge',
      fileName,
      fileType: 'table',
      content,
    }, location.origin);
  }
});

// --- Init ---

highlightExportBtn();
checkReaderPayload();
