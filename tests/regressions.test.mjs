import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  blocksToPlainScript,
  diffMergeBlocks,
  parsePlainScript,
} from '../modules/script-editor/src/lib/parser.js';
import {
  findLibraryItem,
  hashFileBytes,
  removeLibraryItem,
  upsertLibraryItem,
} from '../modules/pdf-reader/library-store.js';
import {
  parseDelimitedText,
  toNumericValue,
  evaluateFormula,
  colsToWidths,
  widthsToCols,
  xlsxCellToRaw,
  rowWindow,
} from '../modules/spreadsheet/src/lib/spreadsheet-utils.js';
import { parseMarkdownTable } from '../modules/table-forge/parsers.js';
import * as XLSX from 'xlsx';
import {
  normalizeText,
  rankMemoriesByQuery,
  tokenizeText,
} from '../core/approved-memory.js';

test('script rewrite preserves dialogue metadata', () => {
  const old = [{
    id: 'dialogue-1',
    lineId: 'line-1',
    type: 'dialogue',
    speaker: 'Hero',
    text: 'Old opening sentence',
    zh: 'Old opening sentence',
    original: 'Original source',
    tags: ['important'],
    avg: { sprite: 'hero', position: 'left', bg: 'hall', bgm: '', sfx: '' },
  }];
  const parsed = parsePlainScript('Hero: Entirely new sentence');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'dialogue-1');
  assert.equal(merged.lineId, 'line-1');
  assert.equal(merged.zh, 'Entirely new sentence');
  assert.equal(merged.original, 'Original source');
  assert.deepEqual(merged.tags, ['important']);
  assert.equal(merged.avg.sprite, 'hero');
});

test('script rewrite preserves choice routes when labels change', () => {
  const old = [{
    id: 'choice-1',
    type: 'choice',
    prompt: 'Pick a route',
    options: [
      { text: 'Left', nextBlockId: 'left-scene' },
      { text: 'Right', nextBlockId: 'right-scene' },
    ],
  }];
  const parsed = parsePlainScript('#choice: Forward / Back');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'choice-1');
  assert.equal(merged.prompt, 'Pick a route');
  assert.deepEqual(
    merged.options.map(option => [option.text, option.nextBlockId]),
    [['Forward', 'left-scene'], ['Back', 'right-scene']]
  );
});

test('unchanged scene round-trip preserves subtitle and extra metadata', () => {
  const old = [{
    id: 'scene-1',
    type: 'scene',
    act: 'Act 1',
    subtitle: 'The Trial',
    stage: 'dark',
  }];
  const parsed = parsePlainScript(blocksToPlainScript(old));
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'scene-1');
  assert.equal(merged.act, 'Act 1');
  assert.equal(merged.subtitle, 'The Trial');
  assert.equal(merged.stage, 'dark');
});

test('scene subtitle edits keep act and subtitle fields separate', () => {
  const old = [{
    id: 'scene-1',
    type: 'scene',
    act: 'Act 1',
    subtitle: 'The Trial',
  }];
  const parsed = parsePlainScript('#scene: Act 1 The Verdict');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.act, 'Act 1');
  assert.equal(merged.subtitle, 'The Verdict');
});

test('PDF library identity is content-based, not filename-based', async () => {
  const firstHash = await hashFileBytes(new Uint8Array([1, 2, 3]));
  const secondHash = await hashFileBytes(new Uint8Array([4, 5, 6]));
  let library = upsertLibraryItem([], {
    id: 'pdf-1',
    name: 'report.pdf',
    contentHash: firstHash,
  });

  assert.equal(findLibraryItem(library, null, secondHash), null);
  library = upsertLibraryItem(library, {
    id: 'pdf-2',
    name: 'report.pdf',
    contentHash: secondHash,
  });
  assert.equal(library.length, 2);
  assert.deepEqual(removeLibraryItem(library, 'pdf-1').map(item => item.id), ['pdf-2']);
});

test('numeric conversion preserves zero and rejects blanks', () => {
  assert.equal(toNumericValue(0), 0);
  assert.equal(toNumericValue('0'), 0);
  assert.equal(toNumericValue('-5'), -5);
  assert.equal(toNumericValue(''), null);
  assert.equal(toNumericValue('not-a-number'), null);
});

test('CSV parser supports quoted newlines and escaped quotes', () => {
  assert.deepEqual(
    parseDelimitedText('name,note\nAlice,"line 1\nline 2"\nBob,"say ""hi"""'),
    [
      ['name', 'note'],
      ['Alice', 'line 1\nline 2'],
      ['Bob', 'say "hi"'],
    ]
  );
});

test('Markdown table parser preserves escaped pipes', () => {
  const doc = parseMarkdownTable('| A | B |\n|---|---|\n| x\\|y | z |');
  assert.equal(doc.error, undefined);
  const sheet = doc.sheets[0];
  assert.equal(sheet.rows[0].cells[sheet.columns[0].id], 'x|y');
  assert.equal(sheet.rows[0].cells[sheet.columns[1].id], 'z');
});

test('spreadsheet formula engine supports nested function calls', () => {
  const cells = { A1: '1', A2: '2', A3: '3' };
  assert.equal(evaluateFormula('=SUM(AVERAGE(A1:A3),10)', cells), 12);
});

test('spreadsheet formula engine mixes range function with arithmetic', () => {
  const cells = { A1: '1', A2: '2', A3: '3' };
  // SUM(A1:A3)=6，加上 1*2（乘法優先於加法）＝ 8
  assert.equal(evaluateFormula('=SUM(A1:A3)+1*2', cells), 8);
});

test('spreadsheet formula engine respects parenthesis precedence over default operator order', () => {
  const cells = { A1: '2', A2: '3' };
  assert.equal(evaluateFormula('=(A1+A2)*3', cells), 15);
  assert.equal(evaluateFormula('=A1+A2*3', cells), 11);
});

test('spreadsheet formula engine evaluates IF with comparison operators', () => {
  const cells = { A1: '10' };
  assert.equal(evaluateFormula('=IF(A1>5,"big","small")', cells), 'big');
  assert.equal(evaluateFormula('=IF(A1<=5,"big","small")', cells), 'small');
});

test('spreadsheet formula engine concatenates cell references and string literals', () => {
  const cells = { A1: 'Hi', A2: 'there' };
  assert.equal(evaluateFormula('=CONCAT(A1," ",A2,"!")', cells), 'Hi there!');
});

test('spreadsheet formula engine still detects circular references as #循環!', () => {
  const cells = { A1: '=A2', A2: '=A1' };
  assert.equal(evaluateFormula(cells.A1, cells), '#循環!');
  // 透過 SUM 範圍間接循環也要抓到
  const viaRange = { B1: '=SUM(B2:B3)', B2: '=B1', B3: '1' };
  assert.equal(evaluateFormula(viaRange.B1, viaRange), '#循環!');
});

test('spreadsheet formula engine supports ROUND / ABS / LEN', () => {
  assert.equal(evaluateFormula('=ROUND(3.14159,2)', {}), 3.14);
  assert.equal(evaluateFormula('=ABS(-7)', {}), 7);
  assert.equal(evaluateFormula('=LEN("hello")', {}), 5);
});

test('spreadsheet formula engine no longer needs new Function/eval for unsafe input', () => {
  // 舊版靠字元白名單擋危險字串；新版是遞迴下降 parser，未知識別字直接解析失敗回 #錯誤!
  assert.equal(evaluateFormula('=alert(1)', {}), '#錯誤!');
});

test('spreadsheet XLSX column width round-trips through !cols (wpx/wch)', () => {
  const cols = widthsToCols({ 0: 120, 2: 80 }, 2);
  assert.deepEqual(colsToWidths(cols), { 0: 120, 2: 80 });
  // 外部軟體存的檔案通常只有 wch（字元寬），也要能換算回 px
  assert.equal(colsToWidths([{ wch: 10 }])[0], 75);
});

test('spreadsheet XLSX formula cells round-trip via cell.f', () => {
  assert.equal(xlsxCellToRaw({ f: 'SUM(A1:A2)' }), '=SUM(A1:A2)');
  assert.equal(xlsxCellToRaw({ v: 42 }), '42');
  assert.equal(xlsxCellToRaw({ v: '' }), undefined);
  assert.equal(xlsxCellToRaw(undefined), undefined);
});

test('spreadsheet XLSX import actually restores column widths from a real workbook (requires cellStyles: true on read)', () => {
  // 退件重現：走真實 workbook write→read，而非只測 widthsToCols/colsToWidths 兩顆純函式互接
  const ws = XLSX.utils.aoa_to_sheet([['a', 'b', 'c']]);
  ws['!cols'] = widthsToCols({ 0: 120, 2: 80 }, 2);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  // 沒帶 cellStyles: true 時（SpreadsheetEditor.jsx 修復前的呼叫方式），SheetJS 0.20.3 不會 parse 出 !cols
  const wbNoCellStyles = XLSX.read(buf, { type: 'array' });
  assert.equal(wbNoCellStyles.Sheets.Sheet1['!cols'], undefined);
  assert.deepEqual(colsToWidths(wbNoCellStyles.Sheets.Sheet1['!cols']), {});

  // 帶 cellStyles: true（修復後）才能正確還原欄寬
  const wbFixed = XLSX.read(buf, { type: 'array', cellStyles: true });
  assert.notEqual(wbFixed.Sheets.Sheet1['!cols'], undefined);
  const restored = colsToWidths(wbFixed.Sheets.Sheet1['!cols']);
  assert.equal(restored[0], 120);
  assert.equal(restored[2], 80);
});

test('spreadsheet virtual scroll row window stays bounded regardless of how far selection is from scrollTop', () => {
  // 退件重現：舊窗口算式把 selection.r 併進 min/max，sel=0 捲到 9000 列時整段全量渲染，
  // 等於沒做虛擬捲動。rowWindow 純依 scrollTop 決定窗口，selectionRow 不得影響 startRow/endRow。
  const gridRows = 10000;
  const rowHeight = 28;
  const overscan = 15;
  const viewportHeight = 600;
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const maxWindowSize = visibleRowCount + 2 * overscan + 2;

  for (const scrollTop of [0, 5000, 140000, 279000]) {
    for (const selectionRow of [0, 500, 9999]) {
      const { startRow, endRow, topSpacerHeight, bottomSpacerHeight } = rowWindow({
        scrollTop,
        viewportHeight,
        gridRows,
        selectionRow,
        rowHeight,
        overscan,
      });

      const renderedRowCount = endRow - startRow + 1;
      assert.ok(
        renderedRowCount <= maxWindowSize,
        `scrollTop=${scrollTop} selectionRow=${selectionRow}: rendered ${renderedRowCount} rows, expected <= ${maxWindowSize}`
      );

      // 捲軸長度守恆：上緩衝 + 實際渲染列高 + 下緩衝 必須等於整表高度，
      // 否則捲軸長度會跳動或內容會位移。
      const total = topSpacerHeight + renderedRowCount * rowHeight + bottomSpacerHeight;
      assert.equal(total, gridRows * rowHeight);
    }
  }
});

test('spreadsheet selection-scroll-into-view effect re-fires on startEdit and column moves, not just row changes', () => {
  // 退件重現：rowWindow 移除 selection.r 聯集後，唯一能把選取/編輯列拉回視窗內的機制
  // 是這個 useLayoutEffect。若它的 deps 只有 [selection.r, viewportHeight]，
  // 使用者滾輪捲遠（selection.r 不變）後按字元鍵觸發 startEdit（只變 editing），
  // 或按 ArrowLeft/ArrowRight（只變 selection.c），effect 都不會重跑，
  // 選取/編輯列留在視窗外，autoFocus 落空。
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    join(__dirname, '../modules/spreadsheet/src/SpreadsheetEditor.jsx'),
    'utf8'
  );

  const effectMatch = source.match(
    /useLayoutEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[([^\]]*)\]\);/
  );
  assert.ok(effectMatch, 'expected to find the selection-scroll-into-view useLayoutEffect block');

  const deps = effectMatch[1].split(',').map((d) => d.trim()).filter(Boolean);
  assert.ok(deps.includes('selection.r'), 'deps must still include selection.r (row changes must still scroll)');
  assert.ok(deps.includes('editing'), 'deps must include editing so startEdit() (which only changes `editing`, not selection) re-triggers scroll-into-view');
  assert.ok(deps.includes('selection.c'), 'deps must include selection.c so column-only navigation re-triggers scroll-into-view');
  assert.ok(deps.includes('viewportHeight'), 'deps must still include viewportHeight');
});

test('approved-memory search matches CJK query against reordered substring in memory content', () => {
  // 退件重現：查詢「圖書館 藍色」須命中內文含「藍色圖書館」(字序顛倒)的記憶，
  // 靠 bigram token 重疊而非子字串 includes。
  const memories = [
    { id: 'hit', title: '筆記', content: '含藍色圖書館的描述', tags: [] },
    { id: 'miss', title: '筆記2', content: '完全不相關的內容', tags: [] },
  ];
  const results = rankMemoriesByQuery('圖書館 藍色', memories);
  assert.deepEqual(results.map(r => r.id), ['hit']);
});

test('approved-memory search token "hi" does not match memory containing only "this"', () => {
  // 退件重現：tokenizeText 對拉丁字母整段當一個 token，'hi' 不得因為是 'this' 的子字串而誤命中。
  const memories = [
    { id: 'this-only', title: 'note', content: 'this is unrelated', tags: [] },
  ];
  assert.deepEqual(rankMemoriesByQuery('hi', memories), []);
});

test('approved-memory search matches Japanese katakana query against memory containing the same word', () => {
  // 退件重現：舊版正則只涵蓋漢字+ASCII，日文假名切不出 token，'ノート' 完全搜不到任何東西。
  const memories = [
    { id: 'hit', title: 'メモ', content: 'これは私のノートです', tags: [] },
    { id: 'miss', title: 'メモ2', content: '関係ない内容', tags: [] },
  ];
  const results = rankMemoriesByQuery('ノート', memories);
  assert.deepEqual(results.map(r => r.id), ['hit']);
});

test('approved-memory search ranks tag hits above body-only hits', () => {
  // tag 命中權重 x2、本文命中權重 x1，tag 命中的記憶必須排在本文命中的記憶之前。
  // 查詢用兩字詞（'貓咪'）以確保雙方都能切出同一個 bigram token 供比對。
  const memories = [
    { id: 'body-only', title: '雜記', content: '今天看到一隻貓咪跑過去', tags: [] },
    { id: 'tag-hit', title: '分類', content: '今天天氣不錯', tags: ['貓咪'] },
  ];
  const results = rankMemoriesByQuery('貓咪', memories);
  assert.deepEqual(results.map(r => r.id), ['tag-hit', 'body-only']);
});

test('approved-memory tokenizeText splits katakana long-vowel-mark runs via Script_Extensions, not bare Script', () => {
  // 退件重現：長音記號「ー」的 Unicode Script 是 Common 不是 Katakana，
  // 若用 \\p{Script=Katakana} 會把「ノート」切斷成 ['ノ','ート'] 而非 ['ノー','ート']。
  assert.deepEqual(tokenizeText('ノート'), ['ノー', 'ート']);
  assert.deepEqual(tokenizeText(normalizeText('Привет')), ['привет']);
});
