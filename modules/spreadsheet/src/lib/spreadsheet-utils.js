export function toNumericValue(value) {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

export function parseDelimitedText(text, delimiter) {
  const separator = delimiter || detectDelimiter(text);
  const input = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
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
    } else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.length > 1 || row.some(value => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.length > 1 || row.some(value => value !== "")) rows.push(row);
  return rows;
}

// ===== 儲存格座標 =====

export function colLabel(i) {
  let label = "";
  let n = i;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function cellId(r, c) {
  return `${colLabel(c)}${r + 1}`;
}

export function parseCellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10) - 1, c: c - 1 };
}

// ===== 公式引擎：遞迴下降 parser + 直接求值（不用 new Function / eval） =====
//
// 語法（優先順序由低到高）：
//   expression  := comparison
//   comparison  := additive (('='|'<>'|'<'|'<='|'>'|'>=') additive)*
//   additive    := term (('+'|'-') term)*
//   term        := unary (('*'|'/'|'%') unary)*
//   unary       := ('-'|'+') unary | power
//   power       := primary ('^' unary)?      // 右結合
//   primary     := NUMBER | STRING | '(' expression ')' | IDENT '(' args ')' | 儲存格參照
//   argument    := 儲存格參照 ':' 儲存格參照 | expression   // 範圍只在函式引數位置合法
//
// 循環偵測：visited 是「從根儲存格到目前節點」的路徑集合，每次解引用儲存格時
// 用「path ∪ {id}」建立新分支往下傳，不會互相污染兄弟分支，也不會漏抓深層循環。

class FormulaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const T = {
  NUM: "NUM", STR: "STR", IDENT: "IDENT",
  LPAREN: "LPAREN", RPAREN: "RPAREN", COMMA: "COMMA", COLON: "COLON",
  PLUS: "PLUS", MINUS: "MINUS", STAR: "STAR", SLASH: "SLASH", PERCENT: "PERCENT", CARET: "CARET",
  EQ: "EQ", NE: "NE", LT: "LT", LE: "LE", GT: "GT", GE: "GE",
  EOF: "EOF",
};

function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = "";
      while (j < n && src[j] !== quote) { value += src[j]; j++; }
      tokens.push({ type: T.STR, value });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      if (src[j] === "e" || src[j] === "E") {
        let k = j + 1;
        if (src[k] === "+" || src[k] === "-") k++;
        if (/[0-9]/.test(src[k] || "")) {
          j = k;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
      }
      tokens.push({ type: T.NUM, value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: T.IDENT, value: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }

    if (ch === "(") { tokens.push({ type: T.LPAREN }); i++; continue; }
    if (ch === ")") { tokens.push({ type: T.RPAREN }); i++; continue; }
    if (ch === ",") { tokens.push({ type: T.COMMA }); i++; continue; }
    if (ch === ":") { tokens.push({ type: T.COLON }); i++; continue; }
    if (ch === "+") { tokens.push({ type: T.PLUS }); i++; continue; }
    if (ch === "-") { tokens.push({ type: T.MINUS }); i++; continue; }
    if (ch === "*") { tokens.push({ type: T.STAR }); i++; continue; }
    if (ch === "/") { tokens.push({ type: T.SLASH }); i++; continue; }
    if (ch === "%") { tokens.push({ type: T.PERCENT }); i++; continue; }
    if (ch === "^") { tokens.push({ type: T.CARET }); i++; continue; }
    if (ch === "<") {
      if (src[i + 1] === "=") { tokens.push({ type: T.LE }); i += 2; }
      else if (src[i + 1] === ">") { tokens.push({ type: T.NE }); i += 2; }
      else { tokens.push({ type: T.LT }); i++; }
      continue;
    }
    if (ch === ">") {
      if (src[i + 1] === "=") { tokens.push({ type: T.GE }); i += 2; }
      else { tokens.push({ type: T.GT }); i++; }
      continue;
    }
    if (ch === "=") { tokens.push({ type: T.EQ }); i++; continue; }

    throw new FormulaError("#錯誤!");
  }
  tokens.push({ type: T.EOF });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  expect(type) {
    const tok = this.next();
    if (tok.type !== type) throw new FormulaError("#錯誤!");
    return tok;
  }

  parseExpression() { return this.parseComparison(); }

  parseComparison() {
    let left = this.parseAdditive();
    while ([T.EQ, T.NE, T.LT, T.LE, T.GT, T.GE].includes(this.peek().type)) {
      const op = this.next().type;
      const right = this.parseAdditive();
      left = { type: "compare", op, left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseTerm();
    while (this.peek().type === T.PLUS || this.peek().type === T.MINUS) {
      const op = this.next().type;
      const right = this.parseTerm();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  parseTerm() {
    let left = this.parseUnary();
    while ([T.STAR, T.SLASH, T.PERCENT].includes(this.peek().type)) {
      const op = this.next().type;
      const right = this.parseUnary();
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === T.MINUS) { this.next(); return { type: "unary", op: T.MINUS, operand: this.parseUnary() }; }
    if (this.peek().type === T.PLUS) { this.next(); return { type: "unary", op: T.PLUS, operand: this.parseUnary() }; }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (this.peek().type === T.CARET) {
      this.next();
      const exp = this.parseUnary(); // 右結合：2^3^2 = 2^(3^2)
      return { type: "binop", op: T.CARET, left: base, right: exp };
    }
    return base;
  }

  parsePrimary() {
    const tok = this.peek();
    if (tok.type === T.NUM) { this.next(); return { type: "num", value: tok.value }; }
    if (tok.type === T.STR) { this.next(); return { type: "str", value: tok.value }; }
    if (tok.type === T.LPAREN) {
      this.next();
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      return expr;
    }
    if (tok.type === T.IDENT) {
      this.next();
      if (this.peek().type === T.LPAREN) {
        this.next();
        const args = [];
        if (this.peek().type !== T.RPAREN) {
          args.push(this.parseArgument());
          while (this.peek().type === T.COMMA) { this.next(); args.push(this.parseArgument()); }
        }
        this.expect(T.RPAREN);
        return { type: "call", name: tok.value, args };
      }
      if (!parseCellRef(tok.value)) throw new FormulaError("#錯誤!");
      return { type: "ref", id: tok.value };
    }
    throw new FormulaError("#錯誤!");
  }

  // 範圍（A1:B3）只在函式引數位置合法
  parseArgument() {
    const tok = this.peek();
    const nextTok = this.tokens[this.pos + 1];
    if (tok.type === T.IDENT && parseCellRef(tok.value) && nextTok && nextTok.type === T.COLON) {
      this.next(); // 起始儲存格
      this.next(); // ':'
      const toTok = this.expect(T.IDENT);
      if (!parseCellRef(toTok.value)) throw new FormulaError("#錯誤!");
      return { type: "range", from: tok.value, to: toTok.value };
    }
    return this.parseExpression();
  }
}

function readCell(id, cellsRef, visited) {
  if (visited.has(id)) throw new FormulaError("#循環!");
  const branch = new Set(visited);
  branch.add(id);
  const value = evalCellContent(cellsRef[id], cellsRef, branch);
  if (typeof value === "string" && value.startsWith("#")) throw new FormulaError(value);
  return value;
}

function toArithmeticNumber(value) {
  if (typeof value === "string" && value.startsWith("#")) throw new FormulaError(value);
  const n = toNumericValue(value);
  return n === null ? 0 : n;
}

function compareValues(op, l, r) {
  const ln = typeof l === "number" ? l : toNumericValue(l);
  const rn = typeof r === "number" ? r : toNumericValue(r);
  const bothNumeric = ln !== null && rn !== null;
  const a = bothNumeric ? ln : String(l);
  const b = bothNumeric ? rn : String(r);
  switch (op) {
    case T.EQ: return a === b;
    case T.NE: return a !== b;
    case T.LT: return a < b;
    case T.LE: return a <= b;
    case T.GT: return a > b;
    case T.GE: return a >= b;
    default: throw new FormulaError("#錯誤!");
  }
}

// 聚合函式（SUM/AVERAGE/COUNT/MAX/MIN）共用：把引數（範圍或純量表達式）展開成數字陣列，
// 非數字的值直接跳過（保留既有語意）。
function aggregateNumbers(argNodes, cellsRef, visited) {
  const vals = [];
  for (const arg of argNodes) {
    if (arg.type === "range") {
      const s1 = parseCellRef(arg.from);
      const s2 = parseCellRef(arg.to);
      if (!s1 || !s2) continue;
      for (let r = Math.min(s1.r, s2.r); r <= Math.max(s1.r, s2.r); r++) {
        for (let c = Math.min(s1.c, s2.c); c <= Math.max(s1.c, s2.c); c++) {
          const n = toNumericValue(readCell(cellId(r, c), cellsRef, visited));
          if (n !== null) vals.push(n);
        }
      }
    } else {
      const n = toNumericValue(evalNode(arg, cellsRef, visited));
      if (n !== null) vals.push(n);
    }
  }
  return vals;
}

function evalArgScalar(argNode, cellsRef, visited) {
  if (argNode.type === "range") throw new FormulaError("#錯誤!");
  return evalNode(argNode, cellsRef, visited);
}

function evalCall(node, cellsRef, visited) {
  const { name, args } = node;
  switch (name) {
    case "SUM":
      return aggregateNumbers(args, cellsRef, visited).reduce((a, b) => a + b, 0);
    case "AVERAGE": {
      const vals = aggregateNumbers(args, cellsRef, visited);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    case "COUNT":
      return aggregateNumbers(args, cellsRef, visited).length;
    case "MAX": {
      const vals = aggregateNumbers(args, cellsRef, visited);
      return vals.length ? Math.max(...vals) : 0;
    }
    case "MIN": {
      const vals = aggregateNumbers(args, cellsRef, visited);
      return vals.length ? Math.min(...vals) : 0;
    }
    case "IF": {
      if (args.length !== 3) throw new FormulaError("#錯誤!");
      const cond = evalArgScalar(args[0], cellsRef, visited);
      return cond ? evalArgScalar(args[1], cellsRef, visited) : evalArgScalar(args[2], cellsRef, visited);
    }
    case "CONCAT":
      return args.map((arg) => {
        const v = evalArgScalar(arg, cellsRef, visited);
        return v === "" || v === undefined || v === null ? "" : String(v);
      }).join("");
    case "ROUND": {
      if (args.length < 1 || args.length > 2) throw new FormulaError("#錯誤!");
      const value = toArithmeticNumber(evalArgScalar(args[0], cellsRef, visited));
      const digits = args.length === 2 ? toArithmeticNumber(evalArgScalar(args[1], cellsRef, visited)) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    case "ABS": {
      if (args.length !== 1) throw new FormulaError("#錯誤!");
      return Math.abs(toArithmeticNumber(evalArgScalar(args[0], cellsRef, visited)));
    }
    case "LEN": {
      if (args.length !== 1) throw new FormulaError("#錯誤!");
      const v = evalArgScalar(args[0], cellsRef, visited);
      return String(v === undefined || v === null ? "" : v).length;
    }
    default:
      throw new FormulaError("#錯誤!");
  }
}

function evalNode(node, cellsRef, visited) {
  switch (node.type) {
    case "num": return node.value;
    case "str": return node.value;
    case "ref": return readCell(node.id, cellsRef, visited);
    case "range": throw new FormulaError("#錯誤!"); // 範圍只能出現在函式引數位置
    case "unary": {
      const v = toArithmeticNumber(evalNode(node.operand, cellsRef, visited));
      return node.op === T.MINUS ? -v : v;
    }
    case "binop": {
      const l = toArithmeticNumber(evalNode(node.left, cellsRef, visited));
      const r = toArithmeticNumber(evalNode(node.right, cellsRef, visited));
      switch (node.op) {
        case T.PLUS: return l + r;
        case T.MINUS: return l - r;
        case T.STAR: return l * r;
        case T.SLASH: return l / r;
        case T.PERCENT: return l % r;
        case T.CARET: return Math.pow(l, r);
        default: throw new FormulaError("#錯誤!");
      }
    }
    case "compare":
      return compareValues(node.op, evalNode(node.left, cellsRef, visited), evalNode(node.right, cellsRef, visited));
    case "call":
      return evalCall(node, cellsRef, visited);
    default:
      throw new FormulaError("#錯誤!");
  }
}

function evalCellContent(raw, cellsRef, visited) {
  if (raw === undefined || raw === null || raw === "") return "";
  const s = String(raw);
  if (!s.startsWith("=")) {
    const n = Number(s);
    return s === "" ? "" : Number.isNaN(n) ? s : n;
  }
  const tokens = tokenize(s.slice(1));
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  if (parser.peek().type !== T.EOF) throw new FormulaError("#錯誤!");
  const result = evalNode(ast, cellsRef, visited);
  if (typeof result === "number" && Number.isNaN(result)) throw new FormulaError("#錯誤!");
  return result;
}

// 對外的求值入口。visited 通常不用傳，只有內部遞迴會用到（保留參數是為了型別一致）。
export function evaluateFormula(raw, cellsRef, visited) {
  try {
    return evalCellContent(raw, cellsRef, visited instanceof Set ? visited : new Set());
  } catch (err) {
    if (err instanceof FormulaError) return err.code;
    console.error("公式求值錯誤：", err);
    return "#錯誤!";
  }
}

// ===== XLSX 往返輔助 =====

// 把一個工作表的 cells 轉成 SheetJS 可用的 AOA + 公式清單（匯出／存書庫共用）。
// raw 以 '=' 開頭的儲存格會被記錄進 formulas，供呼叫端寫入 cell.f（去掉開頭的 '='）。
export function sheetToAOA(sheetCells) {
  let maxR = 0, maxC = 0;
  Object.keys(sheetCells).forEach((id) => {
    const ref = parseCellRef(id);
    if (ref) { maxR = Math.max(maxR, ref.r); maxC = Math.max(maxC, ref.c); }
  });
  const aoa = [];
  const formulas = [];
  for (let r = 0; r <= maxR; r++) {
    const row = [];
    for (let c = 0; c <= maxC; c++) {
      const id = cellId(r, c);
      const raw = sheetCells[id];
      if (raw === undefined || raw === "") { row.push(""); continue; }
      if (typeof raw === "string" && raw.startsWith("=")) {
        formulas.push({ r, c, f: raw.slice(1) });
      }
      row.push(evaluateFormula(raw, sheetCells));
    }
    aoa.push(row);
  }
  return { aoa, formulas, maxR, maxC };
}

// 從 SheetJS 的儲存格物件還原成試算表的 raw 字串：有公式優先還原成 '=...'，
// 否則落回純值。找不到內容回傳 undefined（呼叫端據此判斷是否要寫入 cells）。
export function xlsxCellToRaw(cell) {
  if (!cell) return undefined;
  if (cell.f) return "=" + cell.f;
  if (cell.v !== undefined && cell.v !== null && cell.v !== "") return String(cell.v);
  return undefined;
}

// 欄寬（px）與 SheetJS !cols 之間的換算。SheetJS 寫入時吃 wpx 可直接用；
// 讀進來的檔案（含其他軟體存的 xlsx）多半只有 wch（字元寬），换算成 px 供 UI 使用。
const MDW = 7; // Excel 預設字型（Calibri 11）量測寬度，SheetJS 內部同樣用這個常數
export function widthsToCols(colWidths, maxC) {
  const cols = [];
  for (let c = 0; c <= maxC; c++) {
    if (colWidths[c] != null) cols[c] = { wpx: colWidths[c] };
  }
  return cols;
}

export function colsToWidths(cols) {
  const widths = {};
  if (!Array.isArray(cols)) return widths;
  cols.forEach((col, i) => {
    if (!col) return;
    if (typeof col.wpx === "number") widths[i] = Math.round(col.wpx);
    else if (typeof col.wch === "number") widths[i] = Math.round(col.wch * MDW + 5);
  });
  return widths;
}

// ===== 虛擬捲動視窗 =====
//
// 純依 scrollTop/viewportHeight 算可見列範圍，上下各留 overscan 列緩衝。
// selectionRow 不併入 min/max：選取列離目前捲動位置遠時，視窗不會被撐開成全量渲染，
// 「選取列捲入視窗」改由呼叫端在 selection 變動時主動捲動容器（見 SpreadsheetEditor.jsx），
// 那之後 scrollTop 本身就會把選取列帶進窗口，不需要這個純函式知道 selectionRow。
export function rowWindow({ scrollTop, viewportHeight, gridRows, selectionRow, rowHeight, overscan }) {
  const visibleRowCount = Math.max(1, Math.ceil((viewportHeight || rowHeight * 20) / rowHeight));
  const firstVisibleRow = Math.floor(scrollTop / rowHeight);
  const startRow = Math.max(0, firstVisibleRow - overscan);
  const endRow = Math.min(gridRows - 1, firstVisibleRow + visibleRowCount + overscan);
  const topSpacerHeight = startRow * rowHeight;
  const bottomSpacerHeight = Math.max(0, gridRows - 1 - endRow) * rowHeight;
  return { startRow, endRow, topSpacerHeight, bottomSpacerHeight };
}
