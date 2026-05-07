# Table Forge MVP Roadmap

## 目標

把 Spreadsheet 收斂成 Table Forge（資料表整理器）。
不做 Excel，只做資料格式轉換 + 表格編輯。
全格式互通：MD / JSON / CSV 任意進出。

## 技術決策

- Vanilla JS（不用 React）
- 純 session（不存 IndexedDB，未來格式 `.akasha-table.json`）
- React / Vite 先不動，MVP 確認沒問題後再清
- PapaParse 用 CDN ESM import
- 檔案放 `modules/table-forge/`

## 檔案結構

```
modules/table-forge/
  index.html        # 頁面骨架 + 樣式
  table-model.js    # TableDocument 資料模型 + 操作
  parsers.js        # MD / JSON / CSV 解析
  exporters.js      # MD / JSON / CSV 匯出
  table-ui.js       # DOM 渲染 + 編輯互動
```

## 執行步驟

### Step 1：資料模型 `table-model.js`

- [ ] 定義 TableDocument / TableSheet / TableColumn / TableRow 結構
- [ ] createDocument(title, sourceType) 建構函式
- [ ] addColumn(sheet, name) — 自動產生 id（slug 化 + 重複加序號）
- [ ] removeColumn(sheet, columnId)
- [ ] renameColumn(sheet, columnId, newName)
- [ ] addRow(sheet) — 空列
- [ ] removeRow(sheet, rowId)
- [ ] setCellValue(sheet, rowId, columnId, value)
- [ ] getColumnValues(sheet, columnId) — 取整欄資料

### Step 2：Parsers `parsers.js`

- [ ] parseMarkdownTable(text) → TableDocument
  - 偵測 header / separator / data rows
  - slug 化欄位 id，重複加序號
  - 去前後空白，空值用空字串
  - 解析失敗回傳 { error: string }
- [ ] parseJSON(text) → TableDocument
  - JSON.parse + 驗證 root 是 array
  - Array of Objects：掃描所有 keys 合併成 columns
  - Array of Arrays：第一列當 header，其餘當 data
  - object/array value 做 JSON.stringify
  - 自動偵測 AoO / AoA
- [ ] parseCSV(text) → TableDocument
  - PapaParse 解析
  - 第一列當 header
  - 欄位名稱重複自動加序號

### Step 3：Exporters `exporters.js`

- [ ] exportMarkdown(doc) → string
  - 欄位順序依 columns
  - pipe `|` escape 成 `\|`
  - null / undefined 輸出空字串
  - 換行替換成空格
- [ ] exportJSON(doc) → string
  - Array of Objects，key = column.name
  - MVP 全輸出 string
  - JSON.stringify(result, null, 2)
- [ ] exportCSV(doc) → string
  - PapaParse unparse
  - UTF-8，第一列 header

### Step 4：頁面骨架 `index.html`

- [ ] HTML 結構：import 區 + 表格區 + export 區
- [ ] 載入 shared.css + 模組自己的樣式
- [ ] 載入 PapaParse CDN
- [ ] 載入 table-model / parsers / exporters / table-ui

### Step 5：Table UI `table-ui.js`

- [ ] renderTable(doc) — 從 TableDocument 產生 `<table>` DOM
  - thead：欄位名稱可編輯（雙擊改名）
  - tbody：cell 點擊進入編輯模式
  - 每列尾端刪除列按鈕
  - 每欄 header 有刪除欄按鈕
- [ ] 新增列按鈕（表格底部）
- [ ] 新增欄按鈕（表格右側）
- [ ] Import 面板
  - textarea 貼上文字
  - 檔案上傳（.md / .json / .csv）
  - 自動偵測格式（MD table / JSON / CSV）
- [ ] Export 面板
  - 格式選擇：Markdown / JSON / CSV
  - 預覽 + 複製到剪貼簿
  - 下載檔案

### Step 6：Reader → Table Forge 橋接

- [ ] 接收主殼層 postMessage（沿用現有 `akasha-export-to-spreadsheet` 事件）
- [ ] 將 Reader payload 轉成 TableDocument
- [ ] 自動切換到 Table Forge 並顯示資料

### Step 7：主殼層整合

- [ ] index.html 把「試算表」入口改為「Table Forge｜資料表整理器」
- [ ] 更新描述文字
- [ ] iframe src 指向 `modules/table-forge/index.html`
- [ ] 確認 Reader「送到內建試算表」按鈕能正確觸發 Table Forge

### Step 8：驗證 + 收尾

- [ ] 端對端測試：MD → 編輯 → MD 匯出
- [ ] 端對端測試：JSON AoO → 編輯 → JSON 匯出
- [ ] 端對端測試：JSON AoA → 編輯 → JSON 匯出
- [ ] 端對端測試：CSV → 編輯 → CSV 匯出
- [ ] 端對端測試：Reader → Table Forge
- [ ] 格式互通：MD 匯入 → CSV 匯出（跨格式）
- [ ] 邊界情況：空表格、單欄、單列、中日文內容、pipe 字元
- [ ] 確認舊 Spreadsheet 模組未被破壞（先留著）

## MVP 完成定義

全部打勾 = MVP 完成：

- [ ] Reader 可以把資料送進 Table Forge
- [ ] Markdown table ↔ 可編輯表格
- [ ] JSON Array of Objects → 可編輯表格
- [ ] JSON Array of Arrays → 可編輯表格
- [ ] 表格 → JSON 匯出
- [ ] CSV ↔ 可編輯表格
- [ ] 全格式互通（任意格式進，任意格式出）
