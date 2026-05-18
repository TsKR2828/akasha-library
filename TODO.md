# 阿卡夏圖書館 — TODO

> Enhancement Phase 1–16 全部完成（含 15 談心+館報 / 8 Script Editor / 12 Security / 16 部署）
> Branch: `feature/cool-stuff`

---

## 已完成

### 1-A Header 雙層化 ✅
- [x] 設計 App Shell 第一層 header HTML 結構（麵包屑 + 召喚圖書館員按鈕）
- [x] 把第一層從 iframe 內模組提到 `index.html` App Shell
- [x] 各模組保留第二層工具列，移除重複的 header 邏輯
- [x] 麵包屑顯示 `AKASHA LIBRARY » TOOLS » 模組名`，隨模組切換更新
- [x] 「召喚圖書館員」按鈕（金色），點擊預留（Phase 3 接入）

### 1-B 右上角按鈕修復 ✅
- [x] 「匯入」「新建」按鈕從 App Shell topbar 移除（各模組已有自己的匯入）
- [x] App Shell 右上角只保留「召喚圖書館員」
- [x] 移除 `MODULES_WITH_OWN_ACTIONS` 隱藏邏輯，召喚按鈕在所有模組中始終顯示

### 1-C HINTS 聯動系統 ✅
- [x] HINTS 區塊拆成上下兩段（細分隔線區隔）
- [x] 上半段：固定格式說明（不受操作影響）
- [x] 下半段第一層：操作紀錄（✓ 標記 + 相對時間戳，持久直到下次操作）
- [x] 下半段第二層：hover 按鈕說明（即時顯示/消失）
- [x] Code & Data Reader 實作
- [x] Table Forge 實作（可收合 HINTS bar + 操作紀錄 + hover 說明 + 18 個按鈕 title）

### 1-D Toast 提示統一 ✅
- [x] 操作完成 → toast 提示 2~3 秒淡出
- [x] 同步更新 HINTS 下半段操作紀錄（Code & Data）
- [x] 各模組統一 toast 樣式（Code & Data + Table Forge）

### 1-E 手機版 popover ✅
- [x] 長按（long press）按鈕 → popover 氣泡顯示說明（Code & Data + Table Forge）
- [x] 放開後消失
- [x] 側欄預設收合時以 popover 取代 HINTS hover

---

## 已完成（Phase 2）

### 2-A 書籤功能 ✅
### 2-B 自訂選擇切割 ✅
### 2-C 截圖框選 ✅

## 已完成（Phase 3-A）

### 3-A 零韻面板 UI 抽出 ✅
- [x] AI 面板 CSS / HTML 從 PDF Reader 抽到 App Shell index.html
- [x] 召喚圖書館員按鈕改為實際開關面板
- [x] 立繪 / 對話框 / 打字機 / Token 計 / 輸入列
- [x] 模組切換時 context badge 自動更新
- [x] 手機版底部上拉面板
- [x] 暫用 placeholder 回應（Phase 3-B 接 LLM）

## 已完成（Phase 3-B）

### 3-B Context 切換 ✅
- [x] MODULE_CONTEXTS 配置表（角色名 / 英文名 / badge / engine / 招呼語 / placeholder / emotion）
- [x] updateAIContextBadge() 升級 — 切換模組時同步更新 badge / nameplate / speaker / placeholder / emotion
- [x] 切換模組時顯示角色招呼語
- [x] core/ai.js 新增 buildCodeSystemPrompt / buildTableSystemPrompt / buildGeneralSystemPrompt
- [x] PostMessage 協議：App Shell 向 iframe 請求 akasha-ai-get-context → 模組回應 akasha-ai-context-response
- [x] Code & Data / Table Forge / PDF Reader 三模組加入 context response handler
- [x] App Shell Layer 2 實作 _aiSendReal()：模組偵測 → 請求內容 → 建構 system prompt → callLLM → 打字機回應
- [x] file:// fallback 提示需要 HTTP server

---

## 已完成（Phase 3-C~F + 2-D + 4-B + 5-B + 6-A）

### 3-C 人設管理 ✅
- [x] `persona.md` 外部化 + `core/persona.js` 解析器
- [x] 場景動態注入（模組切換時載入對應人設段落）

### 3-D 對話紀錄 ✅
- [x] `core/chat-history.js` — 每模組獨立對話，統一存書庫（IndexedDB）

### 3-E 預寫回應 DB ✅
- [x] `core/prewritten.js` — JSON 常見問答，優先匹配免打 API

### 3-F 計費系統 ✅
- [x] `core/billing.js` — 月幣統一計費 + App Shell token bar 同步

### 2-D OCR 文字摘錄 ✅
- [x] 單頁 OCR + 版權鎖定面板 + 月幣計費

### 4-B 自動偵測表格 ✅
- [x] .md / .json 開啟時偵測表格結構 → 提示條（4-A 已在 3-B 完成）

### 5-B Script Editor 資料橋 ✅
- [x] PostMessage 接收 blocks → 表格（預留接口）（5-A 已在 3-B 完成）

### 6-A 版權邊界 ✅
- [x] copyrightProtected 欄位 + 鎖定圖示 + 開啟攔截

---

### Phase 7 Translation Core ✅
- [x] 7-A: `core/translation-core.js` 基礎架構 + TransformJob 格式
- [x] 7-B: Markdown outline / table / code fence / task list 抽取
- [x] 7-C: Plain Script parser —「角色：台詞」→ dialogue blocks
- [x] 7-D: JSON array → table candidate 偵測
- [x] 7-E: 轉換結果預覽 UI + 存入書庫（App Shell modal）

### Phase 9 Table Forge 文字抽取強化 ✅
- [x] 9-A: `md-extract.js` — extractChapterTable（sectionNo / level / title / parent / lineStart / lineEnd / summary）
- [x] 9-B: extractTableInventory（tableId / parentSection / columns / rowCount / lineStart / lineEnd）
- [x] 9-C: extractOutline / extractCodeFences / extractTasks
- [x] 9-D: generateWritebackDiff — 回寫 diff 預覽（原始 MD vs 當前表格）
- [x] 9-E: addMetadataColumns — source / editedBy 欄位
- [x] Table Forge UI — 抽取按鈕、extract panel、Meta 按鈕、Diff 格式選項

---

## 已完成（Phase 10 Memory System）

### 10-A 短期 session memory ✅
- [x] runtime state — 當前對話 context 暫存

### 10-B 中期 room summary ✅
- [x] `core/room-summary.js` — 每模組摘要，IndexedDB `roomSummaries` store

### 10-C 長期 approved memory ✅
- [x] `core/approved-memory.js` — 零韻手札儲存 + 使用者確認流程

### 10-D Memory Record viewer ✅
- [x] 查看 / 編輯 / 刪除 memory records UI

### 10-E Memory search ✅
- [x] 受控搜尋，只回傳命中片段

---

## 已完成（Phase 11 Notion Connector）

### 11-A Notion database mapping ✅
- [x] Library Index / Script Blocks 資料庫對應

### 11-B 書庫 metadata 同步 ✅
- [x] IndexedDB ↔ Notion 書庫索引同步

### 11-C persona.md + Script blocks 同步 ✅
- [x] 人設檔與劇本區塊 Notion 同步

### 11-D Sync queue + 背景同步流程 ✅
- [x] `core/sync-queue.js` — 背景排隊同步機制

### 11-E 衝突處理 UI ✅
- [x] diff 顯示 + 使用者選擇

---

## 已完成（Phase 13 Document Bridge）

### 13-A DOCX 匯入 → Markdown ✅
- [x] `core/document-bridge.js` — mammoth.js CDN 載入，段落/標題/表格/粗斜體轉換

### 13-B Markdown → DOCX 匯出 ✅
- [x] docx library CDN 載入，交付文件用 DOCX 匯出

### 13-C Script blocks → PDF / DOCX ✅
- [x] `exportScriptDocx()` — speaker bold / dialogue indented / narration italic / command right-aligned
- [x] `exportScriptHtml()` — 可列印 HTML 排版 + @media print CSS
- [x] Code & Data Reader 整合 — Plain Script 偵測 + .blocks.jsonl 支援 + 劇本匯出按鈕

### 13-D DOC 舊格式文字抽取 ✅
- [x] 純文字抽取（DOC 二進位格式）

---

## 已完成（Phase 16-A Export Core）

### 16-A 統一匯出引擎 ✅
- [x] `core/export-core.js` — 17 converter 登錄式架構
- [x] 5 種 dataType：markdown / table / dialogue / score / memory
- [x] 格式矩陣：markdown(md,html,pdf,docx) / table(csv,tsv,json,md) / dialogue(ks,avg-json,md,jsonl,docx,pdf) / score(json) / memory(md)
- [x] 公開 API：`exportAs()` / `listFormats()` / `listAllFormats()` / `exportAndDownload()`

---

## 已完成（§4.4 PDF 書籤 IndexedDB 遷移）

- [x] `core/storage.js` — 新增 `bookmarks` object store + 4 CRUD exports
- [x] DB_VERSION = 6 四檔同步（storage / approved-memory / room-summary / sync-queue）
- [x] `modules/pdf-reader/index.html` — 書籤操作改寫為 async IndexedDB
- [x] `migrateBookmarks()` 一次性遷移（localStorage → IndexedDB）

---

## 已完成（Phase 8 Script Editor MVP）

### 8-A 模組空殼 + 三欄 UI ✅
- [x] 角色卡 / Plain Script 編輯器 / 預覽面板 三欄佈局
- [x] App Shell 側欄 + 儀表板卡片

### 8-B Plain Script 編輯器 ✅
- [x] `parseBlocks()` — 角色：台詞 / 旁白 / #key:value / // 註解
- [x] 即時 blocks 預覽（dialogue / narration / command 分色標籤）

### 8-C 角色資料庫 ✅
- [x] 獨立 IndexedDB `script-editor-characters`（不衝 main DB）
- [x] alias → speakerId 比對 + CRUD modal + 自動偵測

### 8-D blocks.jsonl → TyranoScript .ks 輸出 ✅
- [x] 委託 `core/export-core.js` dialogue:ks converter

### 8-E blocks → Markdown / AVG JSON 輸出 ✅
- [x] 委託 export-core dialogue:md / dialogue:avg-json converter

### 8-F 版面預覽 ✅
- [x] Layout tab — 場景分割線 / speaker 色標 / 列印 / DOCX 快捷

### 8-G 回流匯入 ✅
- [x] `parseTyranoScript()` / `parseAvgJson()` / `parseMarkdownScript()` / `parseBlocksJsonl()`
- [x] `blocksToPlainScript()` round-trip + `importAsPlainScript()` format router
- [x] PostMessage `akasha-open-file` handler 整合

### 8-H 側欄入口 + App Shell 整合 ✅
- [x] sidebar nav 按鈕（pen SVG icon）
- [x] 儀表板卡片（Roman IV, .txt/.jsonl/.ks tags）
- [x] MODULE_CONTEXTS['script-editor'] 零韻接入

---

## 已完成（Phase 12 Security Layer）

### 12-A 資料分級常數 ✅
- [x] `DATA_LEVEL`（Public/Personal/Sensitive/Secret/Large Asset 五級）
- [x] `CLASSIFICATION` map + `classify()` + `requiresEncryption()`

### 12-B IndexedDB 敏感欄位加密 ✅
- [x] `deriveKey(passphrase, salt)` → PBKDF2 310K iterations → AES-256-GCM
- [x] `encrypt()` / `decrypt()` — base64(iv‖ct) 格式
- [x] `encryptFields()` / `decryptFields()` — 欄位級加解密

### 12-C BYOK 加密本地金鑰 ✅
- [x] `persistApiKey()` / `retrieveApiKey()` — 密碼保護本地金鑰
- [x] `getByokMode()` — none / session / encrypted-local

### 12-D Record Stamping ✅
- [x] `sha256()` + `stampRecord()` — _version / _updatedAt / _checksum / _source
- [x] `verifyChecksum()` + `markSynced()`

### 12-E Build Mode ✅
- [x] `BUILD_MODE` + `FEATURE_GATES`（public: 5 on / 8 off, private: all 13 on）
- [x] `isFeatureEnabled()` / `getFeatureGates()`

---

## 已完成（Phase 16-B/C/D 部署）

### 16-B 公開 Demo 版 build ✅
- [x] `scripts/build.js --mode=public` — 過濾私有檔案 + 注入 `BUILD_MODE='public'`
- [x] persona.md → 公開空白模板
- [x] 排除 spec / dev docs / workers / admin
- [x] GitHub Actions deploy.yml 改用 `_site/` 輸出

### 16-C 私有完整版 build ✅
- [x] `scripts/build.js --mode=private` — 完整檔案複製
- [x] `npm run build:public` / `npm run build:private` scripts

### 16-D 後端服務骨架 ✅
- [x] Worker BYOK + Coin 雙模式（coin balance check → deduct → refund on error）
- [x] Coin KV 系統（balance / history / estimateCoinCost per model）
- [x] Sync queue API（push / pull / ack + KV 持久化）
- [x] RAG stub endpoint（接口預留，回傳空結果）
- [x] wrangler.toml KV bindings 範本

---

## 其他更新

### SW 快取 v4 ✅
- [x] 完整列舉所有 core/*.js + modules + dist + public-library
- [x] 個別 cache.add 容錯（缺檔不影響安裝）
- [x] Stale-while-revalidate 策略（本地 JS/CSS/HTML）
- [x] CDN 域名擴充（cdn.jsdelivr.net）

---

## Phase 14：Voice / BGM Prototype ✅

### 14-A：Rein-Voice task format + voice preview UI ✅
- [x] `core/voice.js` — VoiceTask 格式、Web Speech TTS、speak/stop/pause/resume、task queue
- [x] `blocksToVoiceTasks()` — Script blocks → voice task 序列
- [x] Script Editor「試聽」tab — 語音設定（voice/speed/pitch）、全部播放、per-block play、queue list

### 14-B：score.json + TsukiSynth preset selector ✅
- [x] `core/bgm.js` — Score 格式、4 樂器（Piano/揚琴/空靈鼓/水鐘）、ADSR + reverb/delay
- [x] 4 presets（靜謐書庫/柔風揚琴/冥想空靈鼓/流水水鐘）
- [x] `playScore()` / `playPreset()` / `stopScore()` / `setVolume()` API

### 14-C：館報朗讀稿輸出 ✅
- [x] `core/report-voice.js` — `reportToVoiceTasks()`（report JSON → voice task 序列）
- [x] `reportToReadingScript()`（→ Markdown 朗讀稿）+ `estimateReadTime()`
- [x] `core/export-core.js` 新增 `report:voice-tasks` + `report:reading-script` converter

### 14-D：伴讀時指定背景樂 ✅
- [x] App Shell BGM Companion Bar — preset select / play / stop / volume / close
- [x] Loop playback（score 播完自動重播）
- [x] `window.akashaBgm` 全域 API（show/hide/play/stop/toggle）
- [x] PostMessage 協議（akasha-bgm-play / akasha-bgm-stop / akasha-bgm-toggle）

---

## 已完成（Phase 15 Private Reading Room + 每日館報）

### 15-A 談心專區模組 ✅
- [x] `modules/reading-room/index.html` — 談心專區 MVP（今日談心 / 不留痕模式）
- [x] 三種記憶保存選項（今日限定 / 本機手札 / 不保存）
- [x] PostMessage Memory Bridge（getAll / save / saveSession / delete / deleteAll / enqueueSync）
- [x] App Shell 整合（sidebar + dashboard + MODULE_CONTEXTS + AI bridge）
- [x] `core/security.js` 新增 `reading_room` feature gate

### 15-B 零韻手札 UI 強化 ✅
- [x] 編輯 modal — 標題 / 內容 / 標籤可編輯，save 用 `put()` 更新既有記錄
- [x] Tag 篩選列 — 收集所有標籤生成 pill buttons，篩選手札清單
- [x] Notion 同步選項 — 第 5 種保存選項，save 後 `enqueueSync` 排入佇列
- [x] MD / JSON 匯出 — Blob download，含所有手札（`零韻手札_YYYY-MM-DD.md/.json`）

### 15-C 每日館報 MVP ✅
- [x] `modules/daily-report/index.html` — 新模組，兩欄式 UI（輸入 / 報告顯示）
- [x] AI Bridge — `akasha-report-generate` + system prompt 輸出 §12.3 JSON
- [x] 報告渲染 — sections / items / source / url 結構化顯示
- [x] 儲存 / 載入歷史 — 複用 Memory Bridge（`module:'daily-report'`, `scope:'report'`）
- [x] MD / JSON 匯出 — `館報_YYYY-MM-DD.md/.json`
- [x] App Shell 整合（sidebar + dashboard card VII + MODULE_CONTEXTS + AI bridge）

### 15-D 館報朗讀 + BGM 搭配 ✅
- [x] App Shell Voice Bridge — 動態 import voice.js + report-voice.js，PostMessage 協議
- [x] 訊息處理：`akasha-voice-play-report` / `pause` / `resume` / `stop` / `state`
- [x] 狀態廣播：`akasha-voice-state-update` 回傳 speaking / paused / index / total / text
- [x] Daily-Report 播放 UI — 朗讀 / 暫停 / 停止按鈕 + BGM preset 下拉
- [x] 語音進度條 — 顯示「第 N/M 段」+ 當前朗讀文字（60 字截取）
- [x] BGM 連動 — 開始朗讀同時 `akasha-bgm-play`，停止時 `akasha-bgm-stop`

---

## 進行中：Phase 17 Script Editor 4-TAB 整合

> Branch: `feature/script-editor-merge`
> 整合 Archive 獨立版（React 3TAB）+ Akasha 內嵌版（Vanilla JS）→ 4-TAB Vanilla JS 模組

### 17-1 Foundation（data-model.js + index.html 骨架）✅
- [x] AppState 單例 + Bus 事件匯流排
- [x] Block 類型定義（dialogue / narration / scene / choice / note / command）
- [x] Plain Script 解析器（regex parser 移植）
- [x] Blocks JSONL / AVG JSON / TyranoScript / Markdown 回流匯入解析器
- [x] blocksToPlainScript() 反向轉換
- [x] validateBlock() / validateBlocks()（從 Archive 移植）
- [x] IndexedDB 角色 CRUD（從 Akasha 移植）
- [x] 角色 alias 解析 + 自動偵測新角色
- [x] localStorage 工具（blocks draft / notes / shortcuts config）
- [x] 快捷鍵管理器（load / save / autoBind）
- [x] index.html 骨架（HTML + CSS + 4-TAB 切換）
- [x] PostMessage 協議（open-file / ai-context / mode-change / file-opened / export-to-table）

### 17-2 Write TAB（write-tab.js）✅
- [x] textarea 編輯區 + 即時解析 → blocks[]
- [x] Undo/redo 棧（100 快照、Ctrl+Z/Y）
- [x] 狀態列（Ln/Col、格式徽章、block 計數）
- [x] Auto-save draft（debounce 400ms → localStorage）
- [x] Alt+1 場景 / Alt+2 旁白 / Alt+3~9 角色快捷鍵
- [x] 角色卡 slot badge + 右鍵指派
- [x] 右側預覽面板（Blocks / Stats / Layout / Voice / BGM）
- [x] Voice TTS 預覽（Web Speech API）
- [x] BGM 合成預覽（Web Audio API 4 樂器 4 preset）

### 17-3 Editor TAB（editor-tab.js）✅
- [x] 三欄佈局：角色面板 | 區塊編輯 | AVG 面板（簡化為兩欄：blocks + side panel；角色 CRUD 走 Write TAB 共用 modal）
- [x] 角色清單 + 詳情卡 — 走 Write TAB Characters 面板
- [x] 角色 CRUD modal + 筆記 CRUD — modal 共用，筆記 17-7 補
- [x] BlockCard 6 種類型（dialogue / narration / scene / choice / note / command）
- [x] TAG 管理（TagAdder：kind 選擇 + 連續新增）
- [x] AVG 面板（sprite 匯入 / 16:9 預覽 / JSON 預覽 / position / BG / BGM / SFX）
- [x] 匯出列（JSONL / AVG JSON / 筆記 / 回寫 Write TAB）— 匯出走 header dropdown；新增「⇆ 寫回 Write」按鈕

### 17-4 Search TAB（search-tab.js）
- [ ] Filter Bar：關鍵字 / 作品 / 角色 / 劇情 TAG / 情緒 TAG / 版權
- [ ] ResultCard：作品名、角色、原文、中譯、TAG 膠囊
- [ ] Export Bar：Markdown / CSV 匯出
- [ ] 點擊結果 → 跳轉 Editor TAB 定位

### 17-5 Reader TAB（reader-tab.js）
- [ ] 連續排版（Scene 分組）
- [ ] 場景 TOC + IntersectionObserver 捲動追蹤
- [ ] TAG hover 顯示 + choice 互動跳轉
- [ ] 角色筆記顯示（首次出場處）
- [ ] PDF 匯出（window.print + 版權控管）

### 17-6 Overlays（overlays.js）
- [ ] Table Forge（全畫面表格 + 行內編輯 + 寫回 blocks）
- [ ] 角色關係圖（力導向 SVG + 拖曳 + 聚焦）
- [ ] 音效庫面板（library.json + mood/world/type 篩選 + ZeroRhyme NL 搜尋）
- [ ] 劇本格式檢查（ZeroRhyme.checkScript 15+ 規則 + 點擊導航）
- [ ] 初稿生成（8 模板 + 角色/情緒設定 + 預覽/插入）

### 17-7 整合收尾
- [ ] 跨 TAB 同步驗證（Write ↔ Editor ↔ Search ↔ Reader）
- [ ] Editor → Write 反向同步（blocks → Plain Script）
- [ ] 多作品支援（WorkSwitcher + loadAllData）
- [ ] 匯入統一（PostMessage open-file → 格式偵測）
- [ ] README / ROADMAP / dev-log 更新

---

## 已完成（Enhancement Phase 1–16 全部完成）
