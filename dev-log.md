# Akasha Library — Dev Log

## 2026-05-08 (c)：Phase 1 — App Shell 基礎重構完成

### 1-A Header 雙層化

`index.html` topbar 重構：

| 項目 | 說明 |
|------|------|
| 麵包屑更新 | `AKASHA LIBRARY » TOOLS » 模組名`，隨模組切換動態更新 |
| 召喚圖書館員按鈕 | 金色星形圖標 + 文字，所有模組中始終顯示（Phase 3 接入） |
| 移除匯入/新建 | 從 App Shell topbar 移除，各模組已有自己的匯入功能 |
| 移除 MODULES_WITH_OWN_ACTIONS | 不再隱藏/顯示 topbar-actions，召喚按鈕永遠可見 |
| 手機 RWD | `.btn-summon span` 隱藏文字只留圖標 |

新增 CSS：`.btn-summon` + `.btn-summon:hover`

### 1-C HINTS 聯動系統（Code & Data Reader）

`modules/markdown/index.html` 新增 HINTS 分區：

| 區塊 | 說明 |
|------|------|
| 上半段 | 固定格式說明（`.fileHint`），不受操作影響 |
| 分隔線 | `<hr class="hints-divider">`，有操作紀錄時顯示 |
| 下半段第一層 | 操作紀錄：✓ 標記 + 相對時間戳（每 10 秒更新） |
| 下半段第二層 | hover 按鈕說明：滑鼠移到按鈕時即時顯示，移開消失 |

所有 14 個按鈕 click handler 加入 `recordOperation()` 呼叫。

新增函式：`relativeTime()` / `recordOperation()` / `updateOpRecord()` / `showHoverHint()` / `hideHoverHint()` / `initHoverHints()`

新增 CSS：`.hints-divider` / `.hints-lower` / `.hints-op-record` / `.hints-hover-desc`

### 1-D Toast 提示統一

跨模組統一 toast 系統：

| 模組 | 說明 |
|------|------|
| Code & Data | `showToast()` — 右上角浮出，300ms 淡入 + 2.5s 顯示 + 淡出移除 |
| Table Forge | 同一套 `showToast()` 函式，統一樣式 |

新增 CSS（兩模組同步）：`.toast-container` / `.toast` / `.toast.show` / `.toast-check`

### 1-E 手機版 popover

兩模組新增 long press popover：

| 項目 | 說明 |
|------|------|
| 觸發 | `touchstart` 500ms 長按 → 顯示 popover 氣泡 |
| 消失 | `touchend` / `touchcancel` / `touchmove` → 隱藏 |
| 內容 | 按鈕名稱（金色）+ title 說明文字 |
| 定位 | 按鈕下方 6px，寬度上限 220px，左右不超出螢幕 |

Table Forge 按鈕新增 `title` 屬性：匯入 / 匯出 / 清除。

新增 CSS（兩模組同步）：`.mobile-popover` / `.mobile-popover.show` / `.pop-label`

---

## 2026-05-08 (b)：Code & Data MVP + index.html 重構 + Enhancement Roadmap

### Code & Data Reader MVP 更新（`0cb742c`）

`modules/markdown/index.html`（+334 行）新增 9 項功能：

| 功能 | 說明 |
|------|------|
| 全按鈕 tooltip | 所有 18 個按鈕加上中文 `title`，hover 可看白話說明 |
| HINTS 文字更新 | .py / .score.json / .json / .md / .txt 五種格式用「說人話」描述 |
| .txt 停用摘要 | `updateSummaryButton()` 在 `.txt` 模式 disable 匯出摘要 + 隱藏摘要存檔鈕 |
| 存檔至書庫 | `saveEditedToLibrary()` — 編輯模式下存 blob + entry 到 IndexedDB |
| 摘要存入書庫 | `saveSummaryToLibrary()` — 產生 `_summary.md` 存入 |
| Undo / Redo | `editorUndo()` / `editorRedo()` — `document.execCommand` |
| 變更標示 (Diff) | `showDiff()` — 逐行比對原始 vs 編輯，綠底新增 / 紅底刪除 |
| 清除標示 | `hideDiff()` — 回到原始碼視圖 |
| 編輯歷程 | `getHistory()` / `pushHistory()` / `renderHistory()` — localStorage，最多 10 筆 |

新增 CSS：`.btn[disabled]` / `.edit-group` / `.diff-bar` / `.diff-line-added` / `.diff-line-removed` / `.history-panel` / `.history-item`

新增 HTML：`btnSaveToLibrary` / `btnSaveSummaryToLibrary` / `editGroup`（含 btnUndo / btnRedo / btnShowDiff / btnClearDiff）/ `historyPanel`

### index.html 雙層腳本重構（`0cb742c`）

**問題：** `<script type="module">` 在 `file:///` 協議被 CORS 攔截 → 整個 JS 死掉 → 按鈕全部沒反應。

**修法：** 拆成兩層：
- Layer 1 `<script>`：導航 / 開模組 / 匯入 / 明暗切換（file:// 可用）
- Layer 2 `<script type="module">`：Auth / Sync / 近日卷帙 / 跨模組訊息（需 HTTP）
- Auth 在 file:// 下點會提示「需要 HTTP 伺服器」，不會死掉

### README 更新（`0cb742c`）

反映當前五大模組功能，新增 Code & Data Reader 詳細功能清單、Table Forge 架構、PDF AI 圖書館員說明。

### Enhancement Roadmap

讀取 `akasha-enhancement-spec.md`，展開為 6 Phase 執行計畫：
- Phase 1：App Shell 基礎重構（Header 雙層化 / HINTS 聯動 / Toast / 手機 popover）
- Phase 2：PDF Reader 補強（書籤 / 切割 / 截圖框選 / OCR）
- Phase 3：零韻面板（跨模組 AI 圖書館員）
- Phase 4：Code & Data 整合
- Phase 5：Table Forge 整合
- Phase 6：Script Editor 接口 + 版權邊界

建立 `ROADMAP.md` / `TODO.md`，開始 Phase 1 on `feature/cool-stuff` branch。

---

## 2026-05-08：Table Forge MVP + Edit Mode + 舊試算表移除

### Table Forge MVP（`767fb3c`, `c0f4884`）

**資料層** `modules/table-forge/`：
- `model.js` — 80×50 grid，公式引擎（SUM / AVG / COUNT / MIN / MAX / IF），A1 ↔ RC 轉換
- `parsers.js` — CSV / TSV 解析，含引號 / 逗號 / 換行 edge case；自動偵測分隔符
- `exporters.js` — 匯出 CSV（RFC 4180 compliant）

**UI 層** `modules/table-forge/index.html`：
- Canvas 畫布渲染（column / row header + frozen），滑鼠選取 / 拖曳 / 雙擊編輯
- 公式列 + 工具列（對齊 / 粗體 / 刪除列欄 / 新增列欄）
- 主殼層整合：nav 新增 Table Forge 入口，`.csv` / `.tsv` 匯入導向 Table Forge

### Bug 修復 A / B / C（`305c17d`）

| Bug | 問題 | 修法 |
|-----|------|------|
| A | 模組 topbar 覆蓋主殼層 actions | `MODULES_WITH_OWN_ACTIONS` set，`openModule()` 隱藏 `.topbar-actions`，`switchView()` 恢復 |
| B | Table Forge CSV 解析器引號 edge case | 重寫 `parseCSV()` 為逐字元 FSM，正確處理 `""` 轉義和引號內換行 |
| C | PDF AI 面板疊在內容上方（overlay） | 改為 flex docked，`width: 0` + `min-width: 0` 折疊；mobile 改 bottom sheet `transform: translateY(100%)` |

### Code & Data Edit Mode（`d4c9957`）

`modules/markdown/index.html`：
- 可編輯格式：`.md` / `.txt` / `.json`（其餘唯讀）
- 編輯模式 toggle → 強制切到 raw tab → textarea 直接編輯
- 「下載新檔」按鈕：JSON 下載前執行 `JSON.parse()` 驗證
- 不覆寫原檔、不寫回 Drive、不自動儲存

### 舊試算表 Ledger 移除（`63c165d`）

- `index.html`：移除 nav 入口、modules 物件、import route、newFile 選項、TYPE_MODULES 映射
- `modules/markdown/index.html`：「送到內建試算表」→「送到 Table Forge」
- `privacy.html`：「試算表」→「資料表」
- 模組檔案保留不刪（legacy reference）

### README 更新

- 模組表：移除「試算表編輯器」，新增 Table Forge + Code & Data 檢視器
- 技術棧：移除 React / Vite / SheetJS，新增 AI RAG 描述
- 開發指令：更新為 http-server 靜態伺服器

---

## 2026-05-07：AI 圖書館員上線 — 文字擷取 + RAG + LLM 整合

### PDF 切割 / 書庫 Bug 修復（`a351e5b`, `c5aa98b`）

| 問題 | 根因 | 修法 |
|------|------|------|
| 切割後 PDF 不下載 | iframe sandbox 缺 `allow-downloads`；`downloadBlob()` 的 `<a>` 未加入 DOM、`revokeObjectURL` 即刻呼叫造成 race | sandbox 加 `allow-downloads`；`<a>` 加入 body 並延遲 revoke；新增 fallback 下載列 |
| 書庫只存標題沒存檔案 | `saveToLibrary()` 只寫 `{name, pages}` 到 localStorage | 改寫為 async，接收 bytes，存入 IndexedDB（`saveFileEntry` + `saveFileBlob`） |
| 書庫 PDF 無法開啟 | library item 無 click handler、無 blob | 新增 `openFromLibrary(id, name)`，從 IndexedDB 取 blob 重新 `loadFile()` |
| 刪除不清理 blob | `removeFromLibrary` 只刪 localStorage | 同步呼叫 `deleteFileEntry(id)` 清 IndexedDB |

### Phase 4.1：文字擷取層（`3258f6d`）

新增 `core/ai.js`：
- `extractPageText(pdfDoc, pageNum)` — pdf.js `getTextContent()` + y/x 座標排序重建閱讀順序
- `extractContextPages(pdfDoc, currentPage, range=2)` — 目前頁 ±2 頁，帶頁碼標記，12K 字安全上限
- `buildSystemPrompt()` — 圖書館員「月上零韻」人設 + 頁面內容注入

### Phase 4.4：LLM 對話整合（`3258f6d`）

`core/ai.js` 新增 LLM 路由：
- `callLLM(settings, systemPrompt, userMessage)` — 依 provider 分流
- OpenAI：`/v1/chat/completions`，Authorization header
- Anthropic：`/v1/messages`，`anthropic-dangerous-direct-browser-access` header
- Google：`/v1beta/models/.../generateContent`，API key in URL
- Custom：OpenAI-compatible 格式（支援 Ollama / LM Studio）
- 月幣系統：`estimateTokens()` → `coinCost()` → `deductCoins()`

`modules/pdf-reader/index.html` 改寫 `sendAIMessage()`：
- 讀取 `akasha-ai-settings`（localStorage）+ `akasha-ai-apikey`（sessionStorage）
- 無 Key → 提示設定；無 PDF → 提示開啟；掃描頁 → 提示無文字
- loading 鎖 + 送出鈕 disabled 防重複
- try/catch 完整錯誤訊息

Cloudflare Worker proxy（`workers/`）：
- `POST /v1/chat` — BYOK 透傳 / 月幣用 server secret
- per-IP rate limit 12 req/min
- 待部署，BYOK 模式無需 proxy 即可使用

### Phase 4.2 + 4.3：Embedding 索引 + RAG 檢索（`261d08f`）

新增 `core/embedding.js` — 雙層檢索：

**Tier 1 · BM25（免 API，離線可用）：**
- CJK 感知分詞器（正則拆中日韓字元 + 拉丁詞組）
- BM25 排名（k1=1.5, b=0.75）
- 零依賴，純 JS

**Tier 2 · Dense Embedding（有 API Key 時自動啟用）：**
- OpenAI `text-embedding-3-small` / Google `text-embedding-004`
- 批次呼叫（100 chunks/batch）
- cosine similarity 向量搜尋
- 向量存入 IndexedDB `embeddings` store，跨 session 複用

索引流程：
- PDF 開啟後背景執行 `indexPDF()` — 全書分頁擷取 → 300 字分塊（60 字重疊）→ BM25 索引 + API 向量化
- 使用者提問時 `queryRelevant()` 取 top 3 → `formatRetrievalContext()` 合併目前頁 + 全書相關段落
- 已索引的檔案下次開啟跳過重建

`core/storage.js` 升級：
- `DB_VERSION` 1 → 2
- 新增 `embeddings` object store（keyPath: `id`，index: `fileId`）
- `saveEmbeddings()` / `getEmbeddings()` / `deleteEmbeddings()`

### 目前 Phase 4 進度

```
4.1 文字擷取  ✅  core/ai.js
4.2 Embedding ✅  core/embedding.js（BM25 + API 雙層）
4.3 RAG 檢索  ✅  queryRelevant() → formatRetrievalContext()
4.4 LLM proxy ✅  workers/src/index.js（待部署）
4.5 聊天 UI   ✅  sendAIMessage() 已接入真實 LLM
4.6 月幣系統  ✅  前端完成（proxy 啟用後生效）
4.7 BYOK      ✅  直接可用
4.8 人設載入  ⬜  待做
4.9 TTS 語音  ⬜  待做
4.10 AI 立繪  ⬜  待做
```

---

## 2026-05-06：健檢修復 + Reader→Spreadsheet 匯出管線

### Reader → Spreadsheet 匯出架構（`6dc1a0d`）
- 新增 `core/export/` 模組群（bridge, toPayload, fromPayload, clipboard）
- 管線流程：Reader → postMessage → 主殼層 → sessionStorage → Spreadsheet useEffect
- `toPayload` 支援 md/json/py/txt 四種格式，產出 heading/paragraph/table/code 四種 block
- `fromPayload` 將 block 轉為試算表 cells + styles
- Reader 新增「送到內建試算表」按鈕，使用 dynamic `import()` 載入 core/export
- iframe sandbox 補上 `allow-clipboard-write`

### 圖書館員調整（`de9efcb`）
- 縮放 3x → 2.76x（92%）
- 下移至 bottom: -80px（腰部裁切）
- 名牌 z-index 提升避免壓到兔耳
- 情緒標籤 Serena → Jabberwocky
- 新增立繪顯示/隱藏 toggle（眼睛 icon）

### 健檢 Bug 修復 #1–5（`b4e3925`）
| # | 問題 | 修法 |
|---|------|------|
| 1 | `importFile()` 不讀檔案內容 | 讀取後 postMessage 傳入 iframe（text/PDF/spreadsheet 三條路徑） |
| 2 | 公共書庫開不了 PDF | 主殼層接 `akasha-open-public-pdf`；PDF reader 新增 `loadFromUrl()` |
| 3 | `saveFileEntry()` 同步時間戳被覆寫 | 保留傳入 `lastOpened`、新增 `updatedAt`、衝突判斷改用 `updatedAt` |
| 4 | insertRow/Col 溢出可視範圍 | 檢查末列/欄、clamp 邊界、溢出提示 |
| 5 | `renderBooks()` XSS 注入 | 加 `escapeHtml()` 套用到所有 catalog 資料 |

### 健檢回歸/風險修復 #6–10（`82da20c`）
| # | 問題 | 修法 |
|---|------|------|
| 6 | deploy.yml 沒有 build 步驟 | 加 Node.js setup + `npm ci` + `npm run build` |
| 7 | 公式參照不隨列欄移動更新 | `shiftRefs()` helper，四個操作都重寫公式 |
| 8 | PDF reader PWA 路徑斷裂 | manifest/icons 改 `../../` 前綴 |
| 9 | 沒有 test script | `npm test` = build + 關鍵檔案存在檢查 |
| 10 | postMessage 沒驗證 origin | 四個檔案加 `event.origin` 守衛 |

### 風險/路徑修復 #11–14（`bd6b26e`）
| # | 問題 | 修法 |
|---|------|------|
| 11 | Drive API 沒檢查 `res.ok` | `driveJson()`/`driveBlob()` helper，非 2xx 拋出含 Google error message 的錯誤 |
| 12 | BYOK 明文存 localStorage | API key 改存 sessionStorage（關分頁即清除），非敏感設定留 localStorage |
| 13 | 最近檔案點擊不還原內容 | `openRecentFile()` 讀 IndexedDB blob → postMessage 傳入對應模組 |
| 14 | offlineQueue 純記憶體 | 佇列存入 IndexedDB settings store，`initOfflineSync()` 啟動時還原 |

**健檢報告 14/14 項全部修復完畢。**
