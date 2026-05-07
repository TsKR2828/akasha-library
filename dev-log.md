# Akasha Library — Dev Log

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
