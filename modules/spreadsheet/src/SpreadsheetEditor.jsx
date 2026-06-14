import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { STORAGE_KEY } from "../../../core/export/bridge.js";
import { payloadToCells } from "../../../core/export/fromPayload.js";
import { parseDelimitedText, toNumericValue } from "./lib/spreadsheet-utils.js";

const ROWS = 50;
const COLS = 26;
const colLabel = (i) => String.fromCharCode(65 + i);
const cellId = (r, c) => `${colLabel(c)}${r + 1}`;
const parseCellRef = (ref) => {
  const m = ref.match(/^([A-Z])(\d+)$/);
  if (!m) return null;
  return { r: parseInt(m[2]) - 1, c: m[1].charCodeAt(0) - 65 };
};

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
  const inputRef = useRef(null);
  const formulaRef = useRef(null);
  const tableRef = useRef(null);

  const sheet = sheets[activeSheet];
  const cells = sheet.cells;
  const styles = sheet.styles;
  const colWidths = sheet.colWidths;

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const updateSheet = (key, val) => {
    setSheets((prev) =>
      prev.map((s, i) => (i === activeSheet ? { ...s, [key]: val } : s))
    );
  };

  const getColWidth = (c) => colWidths[c] ?? DEFAULT_COL_WIDTH;

  // Formula evaluation
  const evaluate = useCallback(
    (expr, cellsRef, visited = new Set()) => {
      if (expr === undefined || expr === null || expr === "") return "";
      const s = String(expr);
      if (!s.startsWith("=")) {
        const n = Number(s);
        return s === "" ? "" : isNaN(n) ? s : n;
      }

      const formula = s.slice(1).trim().toUpperCase();

      const expandRange = (rangeStr) => {
        const [startRef, endRef] = rangeStr.split(":");
        const s1 = parseCellRef(startRef), s2 = parseCellRef(endRef);
        if (!s1 || !s2) return [];
        const vals = [];
        for (let r = Math.min(s1.r, s2.r); r <= Math.max(s1.r, s2.r); r++) {
          for (let c = Math.min(s1.c, s2.c); c <= Math.max(s1.c, s2.c); c++) {
            const id = cellId(r, c);
            if (visited.has(id)) return ["#循環!"];
            visited.add(id);
            const v = evaluate(cellsRef[id], cellsRef, new Set(visited));
            const numeric = toNumericValue(v);
            if (numeric !== null) vals.push(numeric);
          }
        }
        return vals;
      };

      const expandNumericArgs = (args) => {
        if (args.includes(":")) return expandRange(args);
        const vals = [];
        for (const token of args.split(",")) {
          const ref = parseCellRef(token.trim());
          if (!ref) continue;
          const id = cellId(ref.r, ref.c);
          if (visited.has(id)) return ["#循環!"];
          const nextVisited = new Set(visited);
          nextVisited.add(id);
          const value = evaluate(cellsRef[id], cellsRef, nextVisited);
          if (value === "#循環!") return ["#循環!"];
          const numeric = toNumericValue(value);
          if (numeric !== null) vals.push(numeric);
        }
        return vals;
      };

      let m = formula.match(/^SUM\((.+)\)$/);
      if (m) {
        const vals = expandNumericArgs(m[1]);
        if (vals.includes("#循環!")) return "#循環!";
        return vals.reduce((a, b) => a + b, 0);
      }

      m = formula.match(/^AVERAGE\((.+)\)$/);
      if (m) {
        const vals = expandNumericArgs(m[1]);
        if (vals.includes("#循環!")) return "#循環!";
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      }

      m = formula.match(/^COUNT\((.+)\)$/);
      if (m) {
        const vals = expandNumericArgs(m[1]);
        if (vals.includes("#循環!")) return "#循環!";
        return vals.length;
      }

      m = formula.match(/^MAX\((.+)\)$/);
      if (m) {
        const vals = expandNumericArgs(m[1]);
        if (vals.includes("#循環!")) return "#循環!";
        return vals.length ? Math.max(...vals) : 0;
      }

      m = formula.match(/^MIN\((.+)\)$/);
      if (m) {
        const vals = expandNumericArgs(m[1]);
        if (vals.includes("#循環!")) return "#循環!";
        return vals.length ? Math.min(...vals) : 0;
      }

      m = formula.match(/^IF\((.+)\)$/);
      if (m) {
        const args = [];
        let depth = 0, cur = "";
        for (const ch of m[1]) {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === "," && depth === 0) { args.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        args.push(cur.trim());
        if (args.length === 3) {
          const cond = evaluate("=" + args[0], cellsRef, new Set(visited));
          return cond ? evaluate("=" + args[1], cellsRef, new Set(visited)) : evaluate("=" + args[2], cellsRef, new Set(visited));
        }
      }

      m = formula.match(/^CONCAT\((.+)\)$/);
      if (m) {
        return m[1].split(",").map((r) => {
          const ref = parseCellRef(r.trim());
          if (!ref) return r.trim().replace(/^"|"$/g, "");
          const id = cellId(ref.r, ref.c);
          return String(evaluate(cellsRef[id], cellsRef, new Set(visited)));
        }).join("");
      }

      const ref = parseCellRef(formula);
      if (ref) {
        const id = cellId(ref.r, ref.c);
        if (visited.has(id)) return "#循環!";
        visited.add(id);
        return evaluate(cellsRef[id], cellsRef, new Set(visited));
      }

      try {
        let expanded = formula.replace(/[A-Z]\d+/g, (match) => {
          const ref = parseCellRef(match);
          if (!ref) return "0";
          const id = cellId(ref.r, ref.c);
          if (visited.has(id)) return "0";
          visited.add(id);
          const v = evaluate(cellsRef[id], cellsRef, new Set(visited));
          return typeof v === "number" ? v : isNaN(Number(v)) ? "0" : Number(v);
        });
        expanded = expanded.replace(/>=/g, ">=").replace(/<=/g, "<=").replace(/(?<!=)>(?!=)/g, ">").replace(/(?<!=)<(?!=)/g, "<");
        // Security: validate expression contains only safe math characters
        // (digits, operators, parens, whitespace, decimal) — blocks code injection
        if (!/^[\d\s+\-*/%().><=!&|,?:e]+$/i.test(expanded.trim())) return "#不安全!";
        const result = new Function(`"use strict"; return (${expanded})`)();
        return typeof result === "boolean" ? result : (isNaN(result) ? "#錯誤!" : result);
      } catch {
        return "#錯誤!";
      }
    },
    []
  );

  const getDisplay = useCallback(
    (id) => {
      const raw = cells[id];
      if (raw === undefined || raw === "") return "";
      return evaluate(raw, cells);
    },
    [cells, evaluate]
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
        setSelection((s) => ({ r: Math.min(s.r + 1, ROWS - 1), c: s.c }));
      } else if (e.key === "Escape") {
        setEditing(null);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        setSelection((s) => ({ r: s.r, c: Math.min(s.c + 1, COLS - 1) }));
      }
      return;
    }
    const { r, c } = selection;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelection({ r: Math.min(r + 1, ROWS - 1), c }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelection({ r: Math.max(r - 1, 0), c }); }
    else if (e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); setSelection({ r, c: Math.min(c + 1, COLS - 1) }); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setSelection({ r, c: Math.max(c - 1, 0) }); }
    else if (e.key === "Enter") { startEdit(r, c); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      const id = cellId(r, c);
      const newCells = { ...cells };
      delete newCells[id];
      updateSheet("cells", newCells);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      startEdit(r, c, e.key);
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const id = cellId(r, c);
      const val = cells[id] || "";
      navigator.clipboard?.writeText(String(getDisplay(id) || val));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      navigator.clipboard?.readText().then((text) => {
        const rows = text.split("\n").map((row) => row.split("\t"));
        const newCells = { ...cells };
        rows.forEach((rowData, ri) => {
          rowData.forEach((val, ci) => {
            const id = cellId(r + ri, c + ci);
            if (r + ri < ROWS && c + ci < COLS) {
              newCells[id] = val;
            }
          });
        });
        updateSheet("cells", newCells);
      });
    }
  };

  useEffect(() => {
    const id = cellId(selection.r, selection.c);
    if (!editing) setFormulaBarValue(cells[id] || "");
  }, [selection, cells, editing]);

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
      if (event.data?.type !== "akasha-open-spreadsheet" || !event.data.data) return;
      try {
        const data = new Uint8Array(event.data.data);
        const filename = event.data.filename || "import.xlsx";
        const ext = filename.split(".").pop().toLowerCase();
        if (ext === "xlsx" || ext === "xls") {
          const wb = XLSX.read(data, { type: "array" });
          const newSheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const newCells = {};
            const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
            for (let r = range.s.r; r <= Math.min(range.e.r, ROWS - 1); r++) {
              for (let c = range.s.c; c <= Math.min(range.e.c, COLS - 1); c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = ws[addr];
                if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
                  newCells[cellId(r, c)] = String(cell.v);
                }
              }
            }
            return { name, cells: newCells, styles: {}, colWidths: {} };
          });
          if (newSheets.length > 0) {
            setSheets(newSheets);
            setActiveSheet(0);
            showNotif(`已匯入 ${filename}（${newSheets.length} 個工作表）`);
          }
        } else {
          const text = new TextDecoder().decode(data);
          const rows = parseDelimitedText(text);
          const newCells = {};
          rows.slice(0, ROWS).forEach((vals, r) => {
            vals.forEach((v, c) => {
              if (c < COLS && v !== "") newCells[cellId(r, c)] = v;
            });
          });
          setSheets((prev) => prev.map((s, i) =>
            i === activeSheet ? { ...s, cells: { ...s.cells, ...newCells } } : s
          ));
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
    return val.replace(/([A-Z])(\d+)/g, (match, col, row) => {
      let c = col.charCodeAt(0) - 65;
      let r = parseInt(row) - 1;
      if (rowDelta !== 0 && r >= fromRow) r += rowDelta;
      if (colDelta !== 0 && c >= fromCol) c += colDelta;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return "#REF!";
      return colLabel(c) + (r + 1);
    });
  };

  const insertRow = (at) => {
    const wouldOverflow = Object.keys(cells).some((id) => {
      const ref = parseCellRef(id);
      return ref && ref.r === ROWS - 1 && cells[id] !== "";
    });
    if (wouldOverflow) { showNotif("最後一列有資料，無法插入"); setContextMenu(null); return; }
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref) {
        const newR = ref.r >= at ? Math.min(ref.r + 1, ROWS - 1) : ref.r;
        newCells[cellId(newR, ref.c)] = shiftRefs(val, 1, 0, at, 0);
        if (styles[id]) newStyles[cellId(newR, ref.c)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setContextMenu(null);
  };

  const insertCol = (at) => {
    const wouldOverflow = Object.keys(cells).some((id) => {
      const ref = parseCellRef(id);
      return ref && ref.c === COLS - 1 && cells[id] !== "";
    });
    if (wouldOverflow) { showNotif("最後一欄有資料，無法插入"); setContextMenu(null); return; }
    const newCells = {};
    const newStyles = {};
    Object.entries(cells).forEach(([id, val]) => {
      const ref = parseCellRef(id);
      if (ref) {
        const newC = ref.c >= at ? Math.min(ref.c + 1, COLS - 1) : ref.c;
        newCells[cellId(ref.r, newC)] = shiftRefs(val, 0, 1, 0, at);
        if (styles[id]) newStyles[cellId(ref.r, newC)] = styles[id];
      }
    });
    updateSheet("cells", newCells);
    updateSheet("styles", newStyles);
    setContextMenu(null);
  };

  const deleteRow = (at) => {
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
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    sheets.forEach((sh) => {
      let maxR = 0, maxC = 0;
      Object.keys(sh.cells).forEach((id) => {
        const ref = parseCellRef(id);
        if (ref) { maxR = Math.max(maxR, ref.r); maxC = Math.max(maxC, ref.c); }
      });
      const aoa = [];
      for (let r = 0; r <= maxR; r++) {
        const row = [];
        for (let c = 0; c <= maxC; c++) {
          const id = cellId(r, c);
          const raw = sh.cells[id];
          if (raw === undefined || raw === "") { row.push(""); continue; }
          const display = evaluate(raw, sh.cells);
          row.push(display);
        }
        aoa.push(row);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
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
            const wb = XLSX.read(data, { type: "array" });
            const newSheets = wb.SheetNames.map((name) => {
              const ws = wb.Sheets[name];
              const newCells = {};
              const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
              for (let r = range.s.r; r <= Math.min(range.e.r, ROWS - 1); r++) {
                for (let c = range.s.c; c <= Math.min(range.e.c, COLS - 1); c++) {
                  const addr = XLSX.utils.encode_cell({ r, c });
                  const cell = ws[addr];
                  if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
                    newCells[cellId(r, c)] = String(cell.v);
                  }
                }
              }
              return { name, cells: newCells, styles: {}, colWidths: {} };
            });
            if (newSheets.length > 0) {
              setSheets(newSheets);
              setActiveSheet(0);
              showNotif(`已匯入 ${file.name}（${newSheets.length} 個工作表）`);
            }
          } catch (err) {
            showNotif("匯入失敗：檔案格式錯誤");
            console.error(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target.result;
          const rows = parseDelimitedText(text);
          const newCells = {};
          rows.slice(0, ROWS).forEach((vals, r) => {
            vals.forEach((v, c) => {
              if (c < COLS && v !== "") {
                newCells[cellId(r, c)] = v;
              }
            });
          });
          updateSheet("cells", { ...cells, ...newCells });
          showNotif(`已匯入 ${file.name}`);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const currentId = cellId(selection.r, selection.c);
  const currentStyle = getCellStyle(currentId);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'IBM Plex Sans', 'Noto Sans TC', system-ui, sans-serif",
        fontSize: 13,
        color: "#1a1a2e",
        background: "#f0f0f5",
        overflow: "hidden",
        position: "relative",
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setContextMenu(null)}
    >
      {/* 頂部列 */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "#e8e8f0",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="20" height="20" rx="3" stroke="#4ecca3" strokeWidth="2"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="#4ecca3" strokeWidth="1.5"/>
            <line x1="2" y1="15" x2="22" y2="15" stroke="#4ecca3" strokeWidth="1.5"/>
            <line x1="9" y1="2" x2="9" y2="22" stroke="#4ecca3" strokeWidth="1.5"/>
            <line x1="16" y1="2" x2="16" y2="22" stroke="#4ecca3" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.5px" }}>試算表</span>
        </div>
        <div style={{ flex: 1 }} />
        <ToolBtn label="匯入檔案" icon="📂" onClick={importFile} />
        <div style={{ position: "relative" }}>
          <ExportMenu onCSV={exportCSV} onXLSX={exportXLSX} />
        </div>
      </div>

      {/* 工具列 */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #ddd",
        padding: "4px 12px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
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
        <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>字級</span>
        <select value={currentStyle.fontSize} onChange={(e) => updateCellStyle("fontSize", Number(e.target.value))}
          style={{ border: "1px solid #ddd", borderRadius: 4, padding: "2px 4px", fontSize: 12, background: "#fafafa" }}>
          {[10, 11, 12, 13, 14, 16, 18, 20, 24].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Divider />
        <span style={{ fontSize: 11, color: "#888" }}>底色</span>
        <input type="color" value={currentStyle.bg || "#ffffff"}
          onChange={(e) => updateCellStyle("bg", e.target.value)}
          style={{ width: 24, height: 24, border: "none", cursor: "pointer", background: "none" }} />
        <span style={{ fontSize: 11, color: "#888" }}>文字</span>
        <input type="color" value={currentStyle.color || "#000000"}
          onChange={(e) => updateCellStyle("color", e.target.value)}
          style={{ width: 24, height: 24, border: "none", cursor: "pointer", background: "none" }} />
      </div>

      {/* 公式列 */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #ddd",
        padding: "3px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{
          background: "#f0f0f5",
          border: "1px solid #ccc",
          borderRadius: 4,
          padding: "3px 10px",
          fontWeight: 600,
          fontSize: 12,
          minWidth: 50,
          textAlign: "center",
          color: "#1a1a2e",
        }}>
          {currentId}
        </div>
        <span style={{ color: "#4ecca3", fontWeight: 700, fontSize: 14 }}>𝑓𝑥</span>
        <input
          ref={formulaRef}
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
            flex: 1,
            border: "1px solid #ddd",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
          }}
          placeholder="輸入數值或公式（例如 =SUM(A1:A10)）"
        />
      </div>

      {/* 表格 */}
      <div ref={tableRef} style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{
                width: 45, minWidth: 45, background: "#e8e8f0",
                border: "1px solid #ccc", position: "sticky", top: 0, left: 0, zIndex: 3,
              }} />
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c} style={{
                  width: getColWidth(c), minWidth: getColWidth(c), maxWidth: getColWidth(c),
                  background: "#e8e8f0", border: "1px solid #ccc", padding: "4px 0",
                  fontSize: 12, fontWeight: 600, color: "#555",
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
            {Array.from({ length: ROWS }, (_, r) => (
              <tr key={r}>
                <td style={{
                  background: "#e8e8f0", border: "1px solid #ccc", textAlign: "center",
                  fontSize: 11, color: "#777", fontWeight: 500,
                  position: "sticky", left: 0, zIndex: 1, width: 45, padding: "2px 0",
                }}>
                  {r + 1}
                </td>
                {Array.from({ length: COLS }, (_, c) => {
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
                        border: sel ? "2px solid #4ecca3" : inRange ? "1px solid #4ecca3" : "1px solid #e0e0e0",
                        background: inRange && !sel ? "rgba(78,204,163,0.08)" : st.bg || "#fff",
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
                            fontFamily: "'IBM Plex Mono', monospace",
                            background: "rgba(78,204,163,0.06)", boxSizing: "border-box",
                          }}
                          autoFocus
                        />
                      ) : (
                        <div style={{
                          padding: "0 5px", fontSize: st.fontSize,
                          fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? "italic" : "normal",
                          textDecoration: st.underline ? "underline" : "none", textAlign: st.align,
                          color: st.color || "#1a1a2e", lineHeight: `${ROW_HEIGHT}px`,
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
          </tbody>
        </table>
      </div>

      {/* 工作表分頁 */}
      <div style={{
        background: "#e8e8f0", borderTop: "1px solid #ccc",
        padding: "4px 12px", display: "flex", alignItems: "center", gap: 4,
      }}>
        {sheets.map((s, i) => (
          <div
            key={i}
            onClick={() => { setActiveSheet(i); setContextMenu(null); }}
            onDoubleClick={() => renameSheet(i)}
            style={{
              padding: "5px 16px",
              background: i === activeSheet ? "#fff" : "transparent",
              border: i === activeSheet ? "1px solid #ccc" : "1px solid transparent",
              borderBottom: i === activeSheet ? "1px solid #fff" : "1px solid #ccc",
              borderRadius: "6px 6px 0 0", cursor: "pointer",
              fontSize: 12, fontWeight: i === activeSheet ? 600 : 400,
              color: i === activeSheet ? "#1a1a2e" : "#666", transition: "all 0.15s",
            }}
          >
            {s.name}
          </div>
        ))}
        <div
          onClick={addSheet}
          style={{ padding: "4px 10px", cursor: "pointer", fontSize: 16, color: "#888", borderRadius: 4, lineHeight: 1 }}
          onMouseEnter={(e) => e.target.style.background = "#ddd"}
          onMouseLeave={(e) => e.target.style.background = "transparent"}
        >
          +
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#999" }}>
          {Object.keys(cells).filter((k) => cells[k] !== "").length} 個儲存格 · {sheet.name}
        </span>
      </div>

      {/* 右鍵選單 */}
      {contextMenu && (
        <div style={{
          position: "fixed", left: contextMenu.x, top: contextMenu.y,
          background: "#fff", border: "1px solid #ddd", borderRadius: 8,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, padding: "4px 0", minWidth: 180,
        }}>
          <CtxItem label="在上方插入列" onClick={() => insertRow(contextMenu.r)} />
          <CtxItem label="在下方插入列" onClick={() => insertRow(contextMenu.r + 1)} />
          <CtxItem label="刪除此列" onClick={() => deleteRow(contextMenu.r)} />
          <div style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />
          <CtxItem label="在左側插入欄" onClick={() => insertCol(contextMenu.c)} />
          <CtxItem label="在右側插入欄" onClick={() => insertCol(contextMenu.c + 1)} />
          <CtxItem label="刪除此欄" onClick={() => deleteCol(contextMenu.c)} />
          <div style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />
          <CtxItem label="清除儲存格" onClick={() => {
            const id = cellId(contextMenu.r, contextMenu.c);
            const newCells = { ...cells };
            delete newCells[id];
            updateSheet("cells", newCells);
            setContextMenu(null);
          }} />
        </div>
      )}

      {/* 通知 */}
      {notification && (
        <div style={{
          position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", color: "#4ecca3", padding: "8px 20px", borderRadius: 8,
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 200, animation: "fadeIn 0.2s ease",
        }}>
          {notification}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #f0f0f5; }
        ::-webkit-scrollbar-thumb { background: #c0c0cc; border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: #a0a0b0; }
        td:hover { background: rgba(78,204,163,0.04) !important; }
      `}</style>
    </div>
  );
}

function ExportMenu({ onCSV, onXLSX }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <ToolBtn label="匯出 ▾" icon="💾" onClick={() => setOpen(!open)} />
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          background: "#fff", border: "1px solid #ddd", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, padding: "4px 0", minWidth: 150,
        }}>
          <CtxItem label="匯出為 .xlsx" onClick={() => { onXLSX(); setOpen(false); }} />
          <CtxItem label="匯出為 .csv" onClick={() => { onCSV(); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function ToolBtn({ label, icon, onClick, active, style = {} }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 8px", border: active ? "1px solid #4ecca3" : "1px solid transparent",
        borderRadius: 5,
        background: active ? "rgba(78,204,163,0.12)" : hovered ? "rgba(0,0,0,0.06)" : "transparent",
        cursor: "pointer", fontSize: 12, color: active ? "#1a7a5a" : "#444",
        fontWeight: active ? 600 : 400, transition: "all 0.15s", ...style,
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "#ddd", margin: "0 4px" }} />;
}

function CtxItem({ label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "7px 16px", fontSize: 13, cursor: "pointer",
        background: hovered ? "#f0f0f5" : "transparent",
        color: "#333", transition: "background 0.1s",
      }}
    >
      {label}
    </div>
  );
}
