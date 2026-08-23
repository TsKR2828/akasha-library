import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import * as XLSX from "xlsx";
import { STORAGE_KEY, MSG_TYPES } from "../../../core/export/bridge.js";
import { payloadToCells } from "../../../core/export/fromPayload.js";
import {
  parseDelimitedText,
  colLabel,
  cellId,
  parseCellRef,
  evaluateFormula,
  sheetToAOA,
  xlsxCellToRaw,
  widthsToCols,
  colsToWidths,
  rowWindow,
} from "./lib/spreadsheet-utils.js";
import { decodeBuffer } from "../../../core/text-decode.js";
// Design tokens + shared component classes (.deskbar/.btn/.panel/.mh-menu…) —
// Tabularium 儀器類模組維持深色（不隨殼的淺色模式反轉），見 HANDOFF §4。
import "../../../assets/styles/shared.css";

const DEFAULT_ROWS = 50;
const DEFAULT_COLS = 26;
const MAX_ROWS = 10000;
const MAX_COLS = 200;
const DRAFT_KEY = "akasha-spreadsheet-draft";
const DRAFT_DEBOUNCE_MS = 2000;

const DEFAULT_COL_WIDTH = 100;
const ROW_HEIGHT = 28;

const defaultCellStyle = () => ({
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  bg: "",
  color: "",
  fontSize: 13,
});

export default function SpreadsheetEditor() {
  const [sheets, setSheets] = useState([
    { name: "工作表1", cells: {}, styles: {}, colWidths: {} },
  ]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selection, setSelection] = useState({ r: 0, c: 0 });
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [resizingCol, setResizingCol] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);
  const [notification, setNotification] = useState(null);
  const [gridRows, setGridRows] = useState(DEFAULT_ROWS);
  const [gridCols, setGridCols] = useState(DEFAULT_COLS);
  const [sourceFilename, setSourceFilename] = useState(null);
  const [draftBanner, setDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [scrollTop, setScrollTop] = useState(0); // 虛擬捲動：目前捲動位置，決定可見列窗口
  const [viewportHeight, setViewportHeight] = useState(0); // 虛擬捲動：容器可視高度
  const inputRef = useRef(null);
  const formulaRef = useRef(null);
  const tableRef = useRef(null);
  const skipDirtyRef = useRef(true); // 跳過掛載時的第一次 sheets 變化，避免一開頁就標記為「未儲存」
  const autosaveTimerRef = useRef(null);
  const snapshotRef = useRef(null); // 破壞性操作（刪列/刪欄/範圍清除）前的單步快照，供 Ctrl+Z 還原

  const sheet = sheets[activeSheet];
  const cells = sheet.cells;
  const styles = sheet.styles;
  const colWidths = sheet.colWidths;

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const recalcGrid = (cellsObj) => {
    let maxR = 0, maxC = 0;
    Object.keys(cellsObj).forEach((id) => {
      const ref = parseCellRef(id);
      if (ref) { maxR = Math.max(maxR, ref.r + 1); maxC = Math.max(maxC, ref.c + 1); }
    });
    setGridRows(Math.max(DEFAULT_ROWS, maxR));
    setGridCols(Math.max(DEFAULT_COLS, maxC));
  };

  const updateSheet = (key, val) => {
    setSheets((prev) =>
      prev.map((s, i) => (i === activeSheet ? { ...s, [key]: val } : s))
    );
  };

  const getColWidth = (c) => colWidths[c] ?? DEFAULT_COL_WIDTH;

  // 破壞性操作前存單步快照（不做完整 undo stack，Ctrl+Z 只還原最近一次）
  const snapshotSheet = () => {
    snapshotRef.current = {
      sheetIndex: activeSheet,
      cells: { ...cells },
      styles: { ...styles },
      colWidths: { ...colWidths },
    };
  };

  const undoLastDestructive = () => {
    const snap = snapshotRef.current;
    if (!snap) { showNotif("沒有可還原的操作"); return; }
    setSheets((prev) =>
      prev.map((s, i) =>
        i === snap.sheetIndex
          ? { ...s, cells: snap.cells, styles: snap.styles, colWidths: snap.colWidths }
          : s
      )
    );
    setActiveSheet(snap.sheetIndex);
    snapshotRef.current = null;
    showNotif("已還原上一步操作");
  };

  // 公式求值：交給 spreadsheet-utils.js 的遞迴下降 parser + 直接求值器
  // （不用 new Function/eval）。SUM/AVERAGE/IF/COUNT/MIN/MAX/CONCAT/ROUND/ABS/LEN，
  // 支援巢狀函式呼叫、範圍 A1:B3（僅函式引數位置）、比較運算子、#循環! 偵測。
  const getDisplay = useCallback(
    (id) => {
      const raw = cells[id];
      if (raw === undefined || raw === "") return "";
      return evaluateFormula(raw, cells);
    },
    [cells]
  );

  const isSelected = (r, c) => selection.r === r && selection.c === c;
  const isInRange = (r, c) => {
    if (!rangeStart || !rangeEnd) return isSelected(r, c);
    const minR = Math.min(rangeStart.r, rangeEnd.r);
    const maxR = Math.max(rangeStart.r, rangeEnd.r);
    const minC = Math.min(rangeStart.c, rangeEnd.c);
    const maxC = Math.max(rangeStart.c, rangeEnd.c);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const commitEdit = () => {
    if (editing) {
      const newCells = { ...cells, [editing]: editValue };
      updateSheet("cells", newCells);
      setEditing(null);
    }
  };

  const startEdit = (r, c, initial = "") => {
    const id = cellId(r, c);
    setEditing(id);
    setEditValue(cells[id] || initial);
    setFormulaBarValue(cells[id] || initial);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCellClick = (r, c, e) => {
    if (editing) commitEdit();
    setSelection({ r, c });
    setRangeStart({ r, c });
    setRangeEnd({ r, c });
    const id = cellId(r, c);
    setFormulaBarValue(cells[id] || "");
    setContextMenu(null);
  };

  const handleCellDoubleClick = (r, c) => {
    startEdit(r, c);
  };

  const handleMouseDown = (r, c, e) => {
    if (e.button === 2) return;
    setRangeStart({ r, c });
    setRangeEnd({ r, c });
  };

  const handleMouseEnter = (r, c, e) => {
    if (e.buttons === 1 && rangeStart) {
      setRangeEnd({ r, c });
    }
  };

  const handleKeyDown = (e) => {
    if (editing) {
      if (e.key === "Enter") {
        commitEdit();
        setSelection((s) => ({ r: Math.min(s.r + 1, gridRows - 1), c: s.c }));
      } else if (e.key === "Escape") {
        setEditing(null);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        setSelection((s) => ({ r: s.r, c: Math.min(s.c + 1, gridCols - 1) }));
      }
      return;
    }
    const { r, c } = selection;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelection({ r: Math.min(r + 1, gridRows - 1), c }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelection({ r: Math.max(r - 1, 0), c }); }
    else if (e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); setSelection({ r, c: Math.min(c + 1, gridCols - 1) }); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setSelection({ r, c: Math.max(c - 1, 0) }); }
    else if (e.key === "Enter") { startEdit(r, c); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      const hasRange = rangeStart && rangeEnd && (rangeStart.r !== rangeEnd.r || rangeStart.c !== rangeEnd.c);
      const newCells = { ...cells };
      if (hasRange) {
        snapshotSheet(); // 範圍清除是破壞性操作，先存單步快照供 Ctrl+Z 還原
        const minR = Math.min(rangeStart.r, rangeEnd.r), maxR = Math.max(rangeStart.r, rangeEnd.r);
        const minC = Math.min(rangeStart.c, rangeEnd.c), maxC = Math.max(rangeStart.c, rangeEnd.c);
        for (let rr = minR; rr <= maxR; rr++) {
          for (let cc = minC; cc <= maxC; cc++) {
            delete newCells[cellId(rr, cc)];
          }
        }
      } else {
        const id = cellId(r, c);
        delete newCells[id];
      }
      updateSheet("cells", newCells);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      startEdit(r, c, e.key);
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      e.preventDefault();
      undoLastDestructive();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const hasRange = rangeStart && rangeEnd && (rangeStart.r !== rangeEnd.r || rangeStart.c !== rangeEnd.c);
      if (hasRange) {
        const minR = Math.min(rangeStart.r, rangeEnd.r), maxR = Math.max(rangeStart.r, rangeEnd.r);
        const minC = Math.min(rangeStart.c, rangeEnd.c), maxC = Math.max(rangeStart.c, rangeEnd.c);
        const tsv = [];
        for (let rr = minR; rr <= maxR; rr++) {
          const rowVals = [];
          for (let cc = minC; cc <= maxC; cc++) {
            const id = cellId(rr, cc);
            const val = cells[id] || "";
            rowVals.push(String(getDisplay(id) || val));
          }
          tsv.push(rowVals.join("\t"));
        }
        navigator.clipboard?.writeText(tsv.join("\n"));
      } else {
        const id = cellId(r, c);
        const val = cells[id] || "";
        navigator.clipboard?.writeText(String(getDisplay(id) || val));
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      navigator.clipboard?.readText().then((text) => {
        const rows = text.split("\n").map((row) => row.split("\t"));
        const newCells = { ...cells };
        rows.forEach((rowData, ri) => {
          rowData.forEach((val, ci) => {
            const id = cellId(r + ri, c + ci);
            if (r + ri < gridRows && c + ci < gridCols) {
              newCells[id] = val;
            }
          });
        });
        updateSheet("cells", newCells);
      });
    }
  };

  useEffect(() => {
    recalcGrid(cells);
  }, [cells]);

  // 虛擬捲動：只監聽表格容器的捲動位置與可視高度，選取/範圍/編輯狀態一律用絕對列索引，
  // 完全不受窗口化影響——捲出視窗再捲回，選取狀態依然在（見卡片要求）。
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 虛擬捲動：選取/編輯列在視窗外時主動捲回，並「同步」把 scrollTop state 一併更新——
  // useLayoutEffect + setScrollTop 讓下一次 render 立刻用新捲動位置算窗口，
  // 保證選取/編輯中的那一列必定已渲染（autoFocus 正常觸發），窗口不必為此撐大。
  // deps 含 editing 與 selection.c：startEdit 只改 editing、橫向導航只改 selection.c，
  // 兩者都必須重新觸發捲入檢查。
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el || !viewportHeight) return;
    const rowTop = selection.r * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    let newTop = null;
    if (rowTop < el.scrollTop) {
      newTop = rowTop;
    } else if (rowBottom > el.scrollTop + viewportHeight) {
      newTop = rowBottom - viewportHeight;
    }
    if (newTop !== null) {
      el.scrollTop = newTop;
      setScrollTop(newTop);
    }
  }, [selection.r, selection.c, editing, viewportHeight]);

  useEffect(() => {
    const id = cellId(selection.r, selection.c);
    if (!editing) setFormulaBarValue(cells[id] || "");
  }, [selection, cells, editing]);

  // 開啟時偵測是否有上次未儲存的自動儲存草稿（掛載時跑一次即可）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const hasContent = Array.isArray(draft?.sheets) &&
        draft.sheets.some((s) => s.cells && Object.keys(s.cells).length > 0);
      if (hasContent) {
        setPendingDraft(draft);
        setDraftBanner(true);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (err) {
      console.warn("讀取自動儲存草稿失敗：", err);
    }
  }, []);

  // 編輯內容 debounce 2 秒寫入 localStorage 草稿（含 sheets/styles/來源檔名），quota 超限時靜默降級
  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const hasContent = sheets.some((s) => Object.keys(s.cells || {}).length > 0);
        if (!hasContent) {
          // 還原列正在顯示中（或使用者尚未決定還原/捨棄）：現在的 sheets 只是初始空白狀態，
          // 不能因為它是空的就把 localStorage 裡使用者真正的草稿清掉。
          if (draftBanner || pendingDraft) return;
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        const draft = {
          sheets: sheets.map((s) => ({ name: s.name, cells: s.cells, styles: s.styles, colWidths: s.colWidths })),
          sourceFilename,
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (err) {
        // 例如 localStorage 容量已滿（QuotaExceededError）：不打斷使用者，靜默降級，只留 console 記錄
        console.warn("自動儲存草稿失敗（可能超出 localStorage 容量）：", err);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [sheets, sourceFilename, draftBanner, pendingDraft]);

  // 追蹤「尚未存書庫的變更」，供離開頁面時攔截警告
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    setIsDirty(true);
  }, [sheets]);

  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setSheets(pendingDraft.sheets);
    setActiveSheet(0);
    setSourceFilename(pendingDraft.sourceFilename || null);
    setDraftBanner(false);
    setPendingDraft(null);
    showNotif("已還原上次未儲存的內容");
  };

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 忽略 */ }
    setDraftBanner(false);
    setPendingDraft(null);
  };

  // 深淺模式跟隨殼：載入時讀取父層 data-mode，之後聽 MODE_CHANGE（同 script-editor 模式）
  useEffect(() => {
    try {
      const parentMode = window.parent?.document?.documentElement?.getAttribute("data-mode");
      if (parentMode) document.documentElement.setAttribute("data-mode", parentMode);
    } catch { /* cross-origin 時維持預設 */ }
    const onModeMsg = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === MSG_TYPES.MODE_CHANGE && e.data.mode) {
        document.documentElement.setAttribute("data-mode", e.data.mode);
      }
    };
    window.addEventListener("message", onModeMsg);
    return () => window.removeEventListener("message", onModeMsg);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STORAGE_KEY);
    try {
      const payload = JSON.parse(raw);
      const imported = payloadToCells(payload);
      setSheets((prev) => [
        ...prev,
        { name: imported.name, cells: imported.cells, styles: imported.styles, colWidths: {} },
      ]);
      setActiveSheet((prev) => prev + 1);
      showNotif(`已匯入：${imported.name}`);
    } catch (e) {
      console.error("Import payload failed:", e);
    }
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type !== MSG_TYPES.OPEN_SPREADSHEET || !event.data.data) return;
      try {
        const data = new Uint8Array(event.data.data);
        const filename = event.data.filename || "import.xlsx";
        const ext = filename.split(".").pop().toLowerCase();
        if (ext === "xlsx" || ext === "xls") {
          // cellStyles: true 是 !cols 欄寬能被 parse 出來的必要條件（SheetJS 0.20.3）
          const wb = XLSX.read(data, { type: "array", cellStyles: true });
          let oversize = false;
          const newSheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const newCells = {};
            const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
            const dataRows = range.e.r - range.s.r + 1;
            const dataCols = range.e.c - range.s.c + 1;
            if (dataRows > MAX_ROWS || dataCols > MAX_COLS) { oversize = true; }
            const limitR = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
            const limitC = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
            for (let r = range.s.r; r <= limitR; r++) {
              for (let c = range.s.c; c <= limitC; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cellValue = xlsxCellToRaw(ws[addr]);
                if (cellValue !== undefined) newCells[cellId(r, c)] = cellValue;
              }
            }
            return { name, cells: newCells, styles: {}, colWidths: colsToWidths(ws["!cols"]) };
          });
          if (oversize) {
            showNotif('檔案過大，已截斷至 ' + MAX_ROWS + '×' + MAX_COLS);
          }
          if (newSheets.length > 0) {
            setSheets(newSheets);
            setActiveSheet(0);
            setSourceFilename(filename);
            showNotif(`已匯入 ${filename}（${newSheets.length} 個工作表）`);
          }
        } else {
          // 與 importFile 同樣的編碼問題：固定 UTF-8 解碼會讓 Big5 等編碼的檔案亂碼，改用 decodeBuffer 自動偵測。
          const { text } = decodeBuffer(data.buffer);
          const rows = parseDelimitedText(text);
          const dataRows = rows.length;
          const dataCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
          if (dataRows > MAX_ROWS || dataCols > MAX_COLS) {
            showNotif('檔案過大（' + dataRows + '×' + dataCols + '），最多支援 ' + MAX_ROWS + '×' + MAX_COLS);
            return;
          }
          const newCells = {};
          rows.forEach((vals, r) => {
            vals.forEach((v, c) => {
              if (v !== "") newCells[cellId(r, c)] = v;
            });
          });
          setSheets((prev) => prev.map((s, i) =>
            i === activeSheet ? { ...s, cells: { ...s.cells, ...newCells } } : s
          ));
          setSourceFilename(filename);
          showNotif(`已匯入 ${filename}`);
        }
      } catch (err) {
        showNotif("匯入失敗：檔案格式錯誤");
        console.error(err);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeSheet]);

  const getCellStyle = (id) => styles[id] || defaultCellStyle();
  const updateCellStyle = (prop, value) => {
    const targets = [];
    if (rangeStart && rangeEnd) {
      for (let r = Math.min(rangeStart.r, rangeEnd.r); r <= Math.max(rangeStart.r, rangeEnd.r); r++) {
        for (let c = Math.min(rangeStart.c, rangeEnd.c); c <= Math.max(rangeStart.c, rangeEnd.c); c++) {
          targets.push(cellId(r, c));
        }
      }
    } else {
      targets.push(cellId(selection.r, selection.c));
    }
    const newStyles = { ...styles };
    targets.forEach((id) => {
      newStyles[id] = { ...defaultCellStyle(), ...newStyles[id], [prop]: value };
    });
    updateSheet("styles", newStyles);
  };

  const toggleStyle = (prop) => {
    const id = cellId(selection.r, selection.c);
    const current = getCellStyle(id);
    updateCellStyle(prop, !current[prop]);
  };

  const addSheet = () => {
    const name = `工作表${sheets.length + 1}`;
    setSheets([...sheets, { name, cells: {}, styles: {}, colWidths: {} }]);
    setActiveSheet(sheets.length);
  };

  const renameSheet = (idx) => {
    const newName = prompt("輸入工作表名稱：", sheets[idx].name);
    if (newName) {
      setSheets(sheets.map((s, i) => (i === idx ? { ...s, name: newName } : s)));
    }
  };

  const handleContextMenu = (e, r, c) => {
    e.preventDefault();
    setSelection({ r, c });
    setContextMenu({ x: e.clientX, y: e.clientY, r, c });
  };

  const shiftRefs = (val, rowDelta, colDelta, fromRow, fromCol) => {
    if (typeof val !== "string" || !val.startsWith("=")) return val;
    return val.replace(/([A-Z]+)(\d+)/g, (match, colStr, row) => {
      let c = 0;
      for (const ch of colStr) c = c * 26 + (ch.charCodeAt(0) - 64);
      c -= 1;
      let r = parseInt(row) - 1;
      if (rowDelta !== 0 && r >= fromRow) r += rowDelta;
      if (colDelta !== 0 && c >= fromCol) c += colDelta;
      if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return "#REF!";
      return colLabel(c) + (r + 1);
    });
  };

  const insertRow = (at) => {
    if (gridRows >= MAX_ROWS) { showNotif("已達列數上限 " + MAX_ROWS); setContextMenu(null); return; }
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref) {
        const newR = ref.r >= at ? ref.r + 1 : ref.r;
        newCells[cellId(newR, ref.c)] = shiftRefs(val, 1, 0, at, 0);
        if (styles[id]) newStyles[cellId(newR, ref.c)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setGridRows((prev) => prev + 1);
    setContextMenu(null);
  };

  const insertCol = (at) => {
    if (gridCols >= MAX_COLS) { showNotif("已達欄數上限 " + MAX_COLS); setContextMenu(null); return; }
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref) {
        const newC = ref.c >= at ? ref.c + 1 : ref.c;
        newCells[cellId(ref.r, newC)] = shiftRefs(val, 0, 1, 0, at);
        if (styles[id]) newStyles[cellId(ref.r, newC)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setGridCols((prev) => prev + 1);
    setContextMenu(null);
  };

  const deleteRow = (at) => {
    snapshotSheet(); // 破壞性操作，先存單步快照供 Ctrl+Z 還原
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref && ref.r !== at) {
        const newR = ref.r > at ? ref.r - 1 : ref.r;
        newCells[cellId(newR, ref.c)] = shiftRefs(val, -1, 0, at, 0);
        if (styles[id]) newStyles[cellId(newR, ref.c)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setContextMenu(null);
  };

  const deleteCol = (at) => {
    snapshotSheet(); // 破壞性操作，先存單步快照供 Ctrl+Z 還原
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref && ref.c !== at) {
        const newC = ref.c > at ? ref.c - 1 : ref.c;
        newCells[cellId(ref.r, newC)] = shiftRefs(val, 0, -1, 0, at);
        if (styles[id]) newStyles[cellId(ref.r, newC)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setContextMenu(null);
  };

  const handleColResizeStart = (e, c) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(c);
    setDragStartX(e.clientX);
    setDragStartWidth(getColWidth(c));
  };

  useEffect(() => {
    if (resizingCol === null) return;
    const onMove = (e) => {
      const diff = e.clientX - dragStartX;
      const newWidth = Math.max(40, dragStartWidth + diff);
      updateSheet("colWidths", { ...colWidths, [resizingCol]: newWidth });
    };
    const onUp = () => setResizingCol(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [resizingCol, dragStartX, dragStartWidth]);

  // ===== 匯出 XLSX =====
  // 樣式（粗斜體/底色等 cell style）不會寫進匯出檔：SheetJS 社群版（xlsx npm 套件）只能「讀」
  // 儲存格樣式，不支援「寫」樣式進 xlsx，這是套件本身的限制，非本模組漏做。
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    sheets.forEach((sh) => {
      const { aoa, formulas, maxC } = sheetToAOA(sh.cells);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let fi = 0; fi < formulas.length; fi++) {
        const addr = XLSX.utils.encode_cell({ r: formulas[fi].r, c: formulas[fi].c });
        if (ws[addr]) ws[addr].f = formulas[fi].f;
      }
      ws["!cols"] = widthsToCols(sh.colWidths, maxC);
      XLSX.utils.book_append_sheet(wb, ws, sh.name);
    });
    XLSX.writeFile(wb, "試算表.xlsx");
    showNotif("已匯出 .xlsx！");
  };

  // ===== 匯出 CSV =====
  const exportCSV = () => {
    let maxR = 0, maxC = 0;
    Object.keys(cells).forEach((id) => {
      const ref = parseCellRef(id);
      if (ref) { maxR = Math.max(maxR, ref.r); maxC = Math.max(maxC, ref.c); }
    });
    const rows = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const v = getDisplay(cellId(r, c));
        const s = String(v ?? "");
        row.push(s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s);
      }
      rows.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${sheet.name}.csv`; a.click();
    URL.revokeObjectURL(url);
    showNotif("已匯出 CSV！");
  };

  // ===== 存書庫（IndexedDB，供其他模組後續開啟）=====
  // 公式必須以 cell.f 寫入 xlsx（而非只寫 evaluateFormula() 後的常數），否則重新開啟時公式已永久蒸發成死值。
  // 「開啟已存書庫檔案」與「匯入 XLSX」兩條既有路徑都已經支援讀回 cell.f 還原成 '=...' 字串，
  // 這裡只需比照 exportXLSX 的寫法把公式一併寫進 workbook，即可讓存書庫→重新開啟全程保公式。
  // 舊檔（存書庫修復前存的）沒有 .f，讀回時就照舊落回 cell.v 的常數值，向下相容。
  const saveToLibrary = async () => {
    try {
      const wb = XLSX.utils.book_new();
      sheets.forEach((sh) => {
        const { aoa, formulas, maxC } = sheetToAOA(sh.cells);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        for (let fi = 0; fi < formulas.length; fi++) {
          const addr = XLSX.utils.encode_cell({ r: formulas[fi].r, c: formulas[fi].c });
          if (ws[addr]) ws[addr].f = formulas[fi].f;
        }
        ws["!cols"] = widthsToCols(sh.colWidths, maxC);
        XLSX.utils.book_append_sheet(wb, ws, sh.name);
      });
      const arrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = "試算表_" + new Date().toISOString().slice(0, 10) + ".xlsx";
      const { saveFileEntry, saveFileBlob } = await import("../../../core/storage.js");
      const entry = await saveFileEntry({ name: filename, type: "xlsx", size: blob.size });
      await saveFileBlob(entry.id, blob);
      showNotif("已存入書庫：" + filename);
      if (window.parent !== window) {
        window.parent.postMessage({ type: "akasha-file-opened", entry }, location.origin);
      }
      // 已安全落地到書庫，草稿與「未儲存」標記可以清了
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* 忽略 */ }
      setIsDirty(false);
    } catch (err) {
      console.error("Save to library failed:", err);
      showNotif("存入書庫失敗：" + err.message);
    }
  };

  // ===== 匯入（xlsx / csv / tsv） =====
  const importFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv,.tsv,.txt";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = new Uint8Array(ev.target.result);
            // cellStyles: true 是 !cols 欄寬能被 parse 出來的必要條件（SheetJS 0.20.3）
            const wb = XLSX.read(data, { type: "array", cellStyles: true });
            let fileOversize = false;
            const newSheets = wb.SheetNames.map((name) => {
              const ws = wb.Sheets[name];
              const newCells = {};
              const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
              const dRows = range.e.r - range.s.r + 1;
              const dCols = range.e.c - range.s.c + 1;
              if (dRows > MAX_ROWS || dCols > MAX_COLS) { fileOversize = true; }
              const limitR = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
              const limitC = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
              for (let r = range.s.r; r <= limitR; r++) {
                for (let c = range.s.c; c <= limitC; c++) {
                  const addr = XLSX.utils.encode_cell({ r, c });
                  const cellValue = xlsxCellToRaw(ws[addr]);
                  if (cellValue !== undefined) newCells[cellId(r, c)] = cellValue;
                }
              }
              return { name, cells: newCells, styles: {}, colWidths: colsToWidths(ws["!cols"]) };
            });
            if (fileOversize) {
              showNotif('檔案過大，已截斷至 ' + MAX_ROWS + '×' + MAX_COLS);
            }
            if (newSheets.length > 0) {
              setSheets(newSheets);
              setActiveSheet(0);
              setSourceFilename(file.name);
              showNotif(`已匯入 ${file.name}（${newSheets.length} 個工作表）`);
            }
          } catch (err) {
            showNotif("匯入失敗：檔案格式錯誤");
            console.error(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // readAsText 預設用 UTF-8 解碼，Big5 等編碼的 CSV/TSV 會整份亂碼。
        // 改用 ArrayBuffer + core/text-decode.js 的 decodeBuffer 自動偵測編碼（BOM → UTF-8 嚴格 → Big5/Shift-JIS/GB18030 等回退評分）。
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const { text } = decodeBuffer(ev.target.result);
            const rows = parseDelimitedText(text);
            const fDataRows = rows.length;
            const fDataCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
            if (fDataRows > MAX_ROWS || fDataCols > MAX_COLS) {
              showNotif('檔案過大（' + fDataRows + '×' + fDataCols + '），最多支援 ' + MAX_ROWS + '×' + MAX_COLS);
              return;
            }
            const newCells = {};
            rows.forEach((vals, r) => {
              vals.forEach((v, c) => {
                if (v !== "") {
                  newCells[cellId(r, c)] = v;
                }
              });
            });
            updateSheet("cells", { ...cells, ...newCells });
            setSourceFilename(file.name);
            showNotif(`已匯入 ${file.name}`);
          } catch (err) {
            showNotif("匯入失敗：檔案格式錯誤");
            console.error(err);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    };
    input.click();
  };

  const currentId = cellId(selection.r, selection.c);
  const currentStyle = getCellStyle(currentId);

  // 虛擬捲動：純依 scrollTop/viewportHeight 算可見列窗口（rowWindow 抽在 lib，含測試）。
  // 選取列「不」併入窗口——選取/編輯列必在窗口內的保證，由上方 useLayoutEffect 的
  // scrollTop 同步負責；窗口大小因此永遠有上限，滾輪深捲不會爆量渲染。
  // r 仍是絕對列索引，handleCellClick/範圍反白/鍵盤導航完全不用改。
  const ROW_OVERSCAN = 15;
  const { startRow, endRow, topSpacerHeight, bottomSpacerHeight } = rowWindow({
    scrollTop,
    viewportHeight,
    gridRows,
    selectionRow: selection.r,
    rowHeight: ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
  });
  const visibleRowIndexes = [];
  for (let r = startRow; r <= endRow; r++) visibleRowIndexes.push(r);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--text-primary)",
        background: "var(--hall-bg)",
        overflow: "hidden",
        position: "relative",
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setContextMenu(null)}
    >
      {/* 書桌列 — .deskbar：模組唯一 chrome，禁止出現模組名字 */}
      <header className="deskbar">
        <div className="desk-status">
          <span className="desk-dot" style={{ background: "var(--ink-tabularium)" }}></span>
          <span>{currentId} · {sheet.name}</span>
        </div>
        <div className="desk-actions">
          <button className="btn" onClick={importFile} title="從電腦開啟 XLSX / CSV / TSV 檔案">匯入 XLSX/CSV</button>
          <ExportMenu onCSV={exportCSV} onXLSX={exportXLSX} />
          <button className="btn btn--gold" onClick={saveToLibrary} title="把目前試算表存進圖書館（IndexedDB），供其他模組開啟">存書庫</button>
        </div>
      </header>

      {/* 未儲存草稿還原列 — 非 alert，操作前先讓使用者選擇 */}
      {draftBanner && (
        <div style={{
          background: "var(--navy-light)",
          borderBottom: "1px solid var(--gold-line)",
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
        }}>
          <span style={{ color: "var(--text-primary)" }}>偵測到上次未儲存的內容</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn--gold" onClick={restoreDraft}>還原</button>
          <button className="btn" onClick={discardDraft}>捨棄</button>
        </div>
      )}

      {/* 格式工具列（B/I/U · 對齊 · 字級 · 底色/文字色）— .ss-toolbar：桌面版換行，@media 768px 以下改橫向捲動省垂直空間 */}
      <div className="ss-toolbar" style={{
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
        padding: "4px 12px",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        <ToolBtn label="B" active={currentStyle.bold} onClick={() => toggleStyle("bold")}
          style={{ fontWeight: 800, width: 30 }} />
        <ToolBtn label="I" active={currentStyle.italic} onClick={() => toggleStyle("italic")}
          style={{ fontStyle: "italic", width: 30 }} />
        <ToolBtn label="U" active={currentStyle.underline} onClick={() => toggleStyle("underline")}
          style={{ textDecoration: "underline", width: 30 }} />
        <Divider />
        <ToolBtn label="◀" active={currentStyle.align === "left"} onClick={() => updateCellStyle("align", "left")} style={{ width: 30 }} />
        <ToolBtn label="▬" active={currentStyle.align === "center"} onClick={() => updateCellStyle("align", "center")} style={{ width: 30 }} />
        <ToolBtn label="▶" active={currentStyle.align === "right"} onClick={() => updateCellStyle("align", "right")} style={{ width: 30 }} />
        <Divider />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginRight: 2 }}>字級</span>
        <select value={currentStyle.fontSize} onChange={(e) => updateCellStyle("fontSize", Number(e.target.value))}
          style={{ border: "1px solid var(--navy-line)", borderRadius: 4, padding: "2px 4px", fontSize: 12, background: "var(--navy-deep)", color: "var(--text-primary)" }}>
          {[10, 11, 12, 13, 14, 16, 18, 20, 24].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Divider />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>底色</span>
        <input type="color" value={currentStyle.bg || "#ffffff"}
          onChange={(e) => updateCellStyle("bg", e.target.value)}
          style={{ width: 24, height: 24, border: "none", cursor: "pointer", background: "none" }} />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>文字</span>
        <input type="color" value={currentStyle.color || "#000000"}
          onChange={(e) => updateCellStyle("color", e.target.value)}
          style={{ width: 24, height: 24, border: "none", cursor: "pointer", background: "none" }} />
      </div>

      {/* 公式列（名稱框＋fx）— 進內容區頂，style guide 06 儀器規格；.ss-formula-bar：@media 768px 以下換行，輸入框佔滿全寬 */}
      <div className="ss-formula-bar" style={{
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{
          background: "var(--navy-deep)",
          border: "1px solid var(--navy-line)",
          borderRadius: 4,
          height: 28,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          fontSize: 12,
          minWidth: 50,
          justifyContent: "center",
          color: "var(--ink-tabularium)",
        }}>
          {currentId}
        </div>
        <span style={{ color: "var(--ink-tabularium)", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-serif-en)", fontStyle: "italic" }}>fx</span>
        <input
          ref={formulaRef}
          className="ss-formula-input"
          value={editing ? editValue : formulaBarValue}
          onChange={(e) => {
            if (editing) {
              setEditValue(e.target.value);
              setFormulaBarValue(e.target.value);
            } else {
              setFormulaBarValue(e.target.value);
            }
          }}
          onFocus={() => {
            if (!editing) startEdit(selection.r, selection.c);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit();
              formulaRef.current?.blur();
            } else if (e.key === "Escape") {
              setEditing(null);
              formulaRef.current?.blur();
            }
          }}
          style={{
            height: 28,
            border: "1px solid var(--navy-line)",
            borderRadius: 4,
            padding: "0 10px",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            outline: "none",
            background: "var(--navy-deep)",
            color: "var(--text-primary)",
          }}
          placeholder="輸入數值或公式（例如 =SUM(A1:A10)）"
        />
      </div>

      {/* 表格 */}
      <div
        ref={tableRef}
        className="ss-table-container"
        style={{ flex: 1, overflow: "auto", position: "relative", WebkitOverflowScrolling: "touch" }}
      >
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{
                width: 45, minWidth: 45, background: "var(--navy-light)",
                border: "1px solid var(--navy-line)", position: "sticky", top: 0, left: 0, zIndex: 3,
              }} />
              {Array.from({ length: gridCols }, (_, c) => (
                <th key={c} style={{
                  width: getColWidth(c), minWidth: getColWidth(c), maxWidth: getColWidth(c),
                  background: "var(--navy-light)", border: "1px solid var(--navy-line)", padding: "4px 0",
                  fontSize: 12, fontWeight: 600, color: "var(--ink-tabularium)",
                  position: "sticky", top: 0, zIndex: 2, userSelect: "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {colLabel(c)}
                    <div
                      onMouseDown={(e) => handleColResizeStart(e, c)}
                      style={{ position: "absolute", right: -2, top: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 5 }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
                <td colSpan={gridCols + 1} style={{ padding: 0, border: "none", height: topSpacerHeight }} />
              </tr>
            )}
            {visibleRowIndexes.map((r) => (
              <tr key={r}>
                <td style={{
                  background: "var(--navy-light)", border: "1px solid var(--navy-line)", textAlign: "center",
                  fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500,
                  position: "sticky", left: 0, zIndex: 1, width: 45, padding: "2px 0",
                }}>
                  {r + 1}
                </td>
                {Array.from({ length: gridCols }, (_, c) => {
                  const id = cellId(r, c);
                  const st = getCellStyle(id);
                  const inRange = isInRange(r, c);
                  const sel = isSelected(r, c);
                  const isEdit = editing === id;
                  return (
                    <td
                      key={c}
                      onClick={(e) => handleCellClick(r, c, e)}
                      onDoubleClick={() => handleCellDoubleClick(r, c)}
                      onMouseDown={(e) => handleMouseDown(r, c, e)}
                      onMouseEnter={(e) => handleMouseEnter(r, c, e)}
                      onContextMenu={(e) => handleContextMenu(e, r, c)}
                      style={{
                        width: getColWidth(c), minWidth: getColWidth(c), maxWidth: getColWidth(c),
                        height: ROW_HEIGHT,
                        border: sel ? "2px solid var(--ink-tabularium)" : inRange ? "1px solid var(--ink-tabularium)" : "1px solid var(--navy-line)",
                        background: inRange && !sel ? "rgba(90,138,74,0.14)" : st.bg || "var(--navy)",
                        padding: 0, position: "relative", overflow: "hidden", cursor: "cell",
                      }}
                    >
                      {isEdit ? (
                        <input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => { setEditValue(e.target.value); setFormulaBarValue(e.target.value); }}
                          onBlur={commitEdit}
                          style={{
                            width: "100%", height: "100%", border: "none", outline: "none",
                            padding: "0 4px", fontSize: st.fontSize,
                            fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? "italic" : "normal",
                            fontFamily: "var(--font-mono)",
                            background: "rgba(90,138,74,0.12)", color: "var(--text-primary)", boxSizing: "border-box",
                          }}
                          autoFocus
                        />
                      ) : (
                        <div style={{
                          padding: "0 5px", fontSize: st.fontSize,
                          fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? "italic" : "normal",
                          textDecoration: st.underline ? "underline" : "none", textAlign: st.align,
                          color: st.color || "var(--text-primary)", lineHeight: `${ROW_HEIGHT}px`,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {getDisplay(id)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
                <td colSpan={gridCols + 1} style={{ padding: 0, border: "none", height: bottomSpacerHeight }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 工作表分頁 — .ss-sheet-tabs：@media 768px 以下橫向捲動，避免分頁擠壓換行 */}
      <div className="ss-sheet-tabs" style={{
        background: "var(--navy-light)", borderTop: "1px solid var(--navy-line)",
        padding: "4px 12px", display: "flex", alignItems: "center", gap: 4,
      }}>
        {sheets.map((s, i) => (
          <div
            key={i}
            className="ss-sheet-tab"
            onClick={() => { setActiveSheet(i); setContextMenu(null); }}
            onDoubleClick={() => renameSheet(i)}
            style={{
              padding: "5px 16px",
              background: i === activeSheet ? "var(--navy)" : "transparent",
              border: i === activeSheet ? "1px solid var(--navy-line)" : "1px solid transparent",
              borderBottom: i === activeSheet ? "1px solid var(--navy)" : "1px solid var(--navy-line)",
              borderRadius: "6px 6px 0 0", cursor: "pointer",
              fontSize: 12, fontWeight: i === activeSheet ? 600 : 400,
              color: i === activeSheet ? "var(--ink-tabularium)" : "var(--text-secondary)", transition: "all 0.15s",
            }}
          >
            {s.name}
          </div>
        ))}
        <div
          onClick={addSheet}
          style={{ padding: "4px 10px", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)", borderRadius: 4, lineHeight: 1 }}
          onMouseEnter={(e) => e.target.style.background = "var(--navy-hover)"}
          onMouseLeave={(e) => e.target.style.background = "transparent"}
        >
          +
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-tertiary)" }}>
          {Object.keys(cells).filter((k) => cells[k] !== "").length} 個儲存格 · {sheet.name} · 公式引擎：SUM · AVERAGE · IF · COUNT · MIN · MAX · CONCAT · ROUND · ABS · LEN
        </span>
      </div>

      {/* 右鍵選單 */}
      {contextMenu && (
        <div className="mh-menu open" style={{
          position: "fixed", left: contextMenu.x, top: contextMenu.y, right: "auto",
          minWidth: 190,
        }}>
          <CtxItem label="在上方插入列" onClick={() => insertRow(contextMenu.r)} />
          <CtxItem label="在下方插入列" onClick={() => insertRow(contextMenu.r + 1)} />
          <CtxItem label="刪除此列" onClick={() => deleteRow(contextMenu.r)} />
          <hr className="mh-menu-hr" />
          <CtxItem label="在左側插入欄" onClick={() => insertCol(contextMenu.c)} />
          <CtxItem label="在右側插入欄" onClick={() => insertCol(contextMenu.c + 1)} />
          <CtxItem label="刪除此欄" onClick={() => deleteCol(contextMenu.c)} />
          <hr className="mh-menu-hr" />
          <CtxItem label="清除儲存格" onClick={() => {
            const id = cellId(contextMenu.r, contextMenu.c);
            const newCells = { ...cells };
            delete newCells[id];
            updateSheet("cells", newCells);
            setContextMenu(null);
          }} />
        </div>
      )}

      {/* 通知／toast — 沿用 shared.css .toast 語彙（bottom-center，模組既有位置） */}
      {notification && (
        <div style={{
          position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 9,
          background: "var(--navy-light)", border: "1px solid var(--gold-line)",
          color: "var(--text-primary)", padding: "0 16px", height: 34, borderRadius: "var(--r-soft)",
          fontSize: 13, fontWeight: 500, boxShadow: "0 8px 24px -10px rgba(0,0,0,0.7)",
          zIndex: 200, animation: "tf-ss-fadein 0.2s ease",
        }}>
          <span className="toast__dot"></span>
          {notification}
        </div>
      )}

      <style>{`
        @keyframes tf-ss-fadein { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        td:hover { background: rgba(90,138,74,0.08) !important; }
        .ss-toolbar { flex-wrap: wrap; }
        .ss-formula-bar { flex-wrap: nowrap; }
        .ss-formula-input { flex: 1; }
        .ss-sheet-tabs { flex-wrap: nowrap; }
        /* 響應式：窄螢幕（手機）改橫向捲動/全寬，避免格式工具列與分頁列擠壓換行吃掉垂直空間 */
        @media (max-width: 768px) {
          .ss-toolbar {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .ss-formula-bar {
            flex-wrap: wrap;
          }
          .ss-formula-input {
            flex: 1 1 100%;
          }
          .ss-sheet-tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .ss-sheet-tab {
            flex-shrink: 0;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
}

function ExportMenu({ onCSV, onXLSX }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mh-more">
      <button className="btn" onClick={() => setOpen(!open)} title="將試算表匯出為 CSV 或 XLSX">匯出 ▾</button>
      {open && (
        <div className={"mh-menu" + (open ? " open" : "")}>
          <CtxItem label="匯出為 .xlsx" onClick={() => { onXLSX(); setOpen(false); }} />
          <CtxItem label="匯出為 .csv" onClick={() => { onCSV(); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function ToolBtn({ label, icon, onClick, active, style = {} }) {
  return (
    <button
      className="btn btn--ghost"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        height: 26, padding: "0 8px",
        border: active ? "1px solid var(--ink-tabularium)" : "1px solid transparent",
        borderRadius: 5,
        background: active ? "rgba(90,138,74,0.16)" : "transparent",
        fontSize: 12, color: active ? "var(--ink-tabularium)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400, ...style,
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "var(--navy-line)", margin: "0 4px" }} />;
}

function CtxItem({ label, onClick }) {
  return (
    <button className="btn" onClick={onClick} style={{ width: "100%", justifyContent: "flex-start" }}>
      {label}
    </button>
  );
}

