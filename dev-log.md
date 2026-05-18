# Akasha Library — Dev Log

## 2026-05-18：Phase 17-3 Editor TAB 完成

### 產出

**`modules/script-editor/editor-tab.js`**（580 行）

- `initEditorTab(panelEl, sideEl)` — 雙欄結構：左 block 卡片列、右側 AVG/JSON 面板
- 訂閱 `state:blocks` / `state:characters` / `tab:switched`，可見時自動 re-render
- **編輯工具列**：6 種 block 類型新增按鈕（場次 / 旁白 / 對白 / 選項 / 編註 / 指令）+ 「⇆ 寫回 Write」+ block 計數
- **BlockCard 6 種類型**：
  - dialogue — speakerId select + 原文/中譯 textarea + TAG row
  - narration / note — text textarea
  - scene — act + subtitle 兩欄
  - choice — options 陣列（text + target + 刪除）+ 「+ 新增選項」
  - command — command + value 兩欄
- 即時驗證 — 紅色邊框 + 錯誤橫幅（從 `validateBlock` 取錯誤）
- 區塊操作：上移 / 下移 / 刪除（confirm）/ focus（dialogue click）
- **TAG 管理**：5 categories（plot/emotion/theme/form/role）+ 內聯 TagAdder（連續新增、Enter 提交、Esc 關閉）
- **AVG 側面板**（dialogue focus 時）：
  - 16:9 立繪預覽（背景 label + sprite 位置 + BGM/SFX 角標）
  - Sprite 匯入（image/* + 512KB 上限）+ id 輸入
  - Position 三按鈕（左 / 中 / 右）
  - Background / BGM / SFX 三欄輸入
- **JSON Preview** — focused block JSON 即時更新
- 「⇆ 寫回 Write」— `blocksToPlainScript()` → 灌回 textarea + 同步 localStorage

### 整合改動

- `index.html`
  - import `initEditorTab`
  - 替換 Editor TAB placeholder 為 `<div class="editor-layout">` + 兩個容器
  - 新增 100+ 行 CSS（編輯工具列、BlockCard、TagAdder、AVG 面板、Sprite preview、JSON preview）
  - 初始化呼叫：`initEditorTab(blockListEl, sidePanelEl)`
  - 新增 `Bus.on('toast', ...)` 讓 sub-modules 觸發 toast

- `sw.js` v5→v6；快取加 `editor-tab.js`
- `scripts/build.js`：critical path += `editor-tab.js`

### 體驗

切到 Editor TAB → 看到 block list（已從 Write TAB 解析的 blocks）→ 點 dialogue 開啟右側 AVG 面板 → 編輯 sprite/position/BGM/SFX → 即時看 16:9 預覽 + JSON 更新。新增/刪除/重排 block，TAG 連續新增。最後按「⇆ 寫回 Write」把 blocks 反向轉回 Plain Script。

---

## 2026-05-18：Phase 17-2 Write TAB 完成

### 產出

**`modules/script-editor/write-tab.js`**（470 行，全新 ES module）

- `renderVoicePreview(container)` — Voice TTS 預覽面板
  - 動態 import `core/voice.js`，feature gate 未啟用時顯示提示
  - 過濾語音引擎（zh / ja / en 優先）+ 系統預設選項
  - 語速 (0.5~2.0) / 音高 (0~2) / 朗讀旁白 checkbox
  - 全部播放 / 暫停 / 停止 + 從特定 block 開始播放
  - 即時隊列清單（speaker 色 + 文字截取 30 字）+ current highlight

- `renderBgmPreview(container)` — BGM Preset 預覽面板
  - 動態 import `core/bgm.js`，4 個 preset card（靜謐書庫 / 柔風揚琴 / 冥想空靈鼓 / 流水水鐘）
  - 音量滑桿 + 停止按鈕
  - Score timeline 預覽（pitch 對應垂直位置、duration 對應寬度）
  - 即時狀態（playing / idle）

- `renderCharListWithSlots(container)` — 角色卡增強
  - **Slot Badge** — 顯示 `⌥3 / ⌥4 / ⌥5…` 角色綁定的 Alt 快捷鍵
  - **右鍵 Context Menu** — 「指派 {角色} 至 Alt+3~9」+ 「清除快捷鍵綁定」
  - 已佔用 slot 顯示原使用者（半透明）
  - 透過 Bus emit 觸發 `char:edit-requested` / `shortcuts:user-updated`

### 整合改動

- `modules/script-editor/index.html`
  - import write-tab.js 三個函數
  - 替換 `renderVoicePreview` / `renderBgmPreview` placeholder 為 delegate 呼叫
  - 替換 `renderCharList` 內聯實作為 `renderCharListWithSlots`
  - Bus listener：`char:edit-requested` → openCharModal；`shortcuts:user-updated` → 重 render
  - 新增 CSS：Voice/BGM 面板、Voice queue 列表、Preset card、Score timeline、Slot badge

- `sw.js`：CACHE_NAME → v5；快取清單加 `data-model.js` + `write-tab.js`
- `scripts/build.js`：critical path 加 `data-model.js` + `write-tab.js`

### 體驗

打開 Script Editor → Write TAB → 右側預覽切到「試聽」可選 voice / 調整 speed/pitch / 播放全部對白。切到「BGM」可選 4 個 preset 試聽配樂 + 看 score timeline。角色卡上現在顯示 ⌥3~⌥9 badge，右鍵可重新指派。

---

## 2026-05-18：Phase 17-1 Foundation 完成

### 產出

**`modules/script-editor/data-model.js`**（596 行，全新 ES module）
- `EventBus` class + `Bus` 全域單例（on / off / emit / once）
- `AppState` 單例（get / set / merge / getAll）— blocks / characters / undoStack / activeTab / voice / shortcuts
- `BLOCK_TYPES`（6 種：dialogue / narration / scene / choice / note / command）
- `TAG_PALETTE` 5 色系（plot / emotion / theme / form / role）
- 5 個解析器：
  - `parsePlainScript()` —「角色：台詞 / #cmd：value / // 註解」regex parser
  - `parseJsonl()` — blocks.jsonl 逐行 JSON
  - `parseAvgJson()` — `{blocks: [...]}` 或 bare array
  - `parseTyranoScript()` — `.ks` 標籤解析（`[scene]/[playbgm]/[playse]/#speaker`）
  - `parseMarkdownScript()` — 自家匯出 Markdown 回流
- `blocksToPlainScript()` — 6 種 block type 反向轉換
- `importBlocks()` — 副檔名自動偵測 + fallback
- `validateBlock()` / `validateBlocks()` — 15+ 規則（從 Archive 移植）
- IndexedDB（`script-editor-characters`）：`loadCharacters()` / `saveCharacter()` / `deleteCharacter()`
- 角色工具：`resolveCharacterId()` / `getCharColor()` / `detectNewSpeakers()` / `autoRegisterSpeakers()`
- `Storage` 物件 — localStorage 封裝（draft / notes / plainText / shortcuts / focusBlock）
- `ShortcutManager` — Alt+1=場景 / Alt+2=旁白 / Alt+3~9=角色（autoBind / set / remove / getSlotLabels）
- `ICONS` + `icon(name, size, stroke)` — 25 個 SVG path 字典

**`modules/script-editor/index.html`**（1270 行，完整改寫）
- Header：title + filename + 開啟 / 新建 / 儲存 / 匯出 dropdown（7 格式）
- Tab Bar：Write / Editor / Search / Reader（圖標 + 中英雙語標題）
- **Write TAB**（完整接線）：
  - 3-column：CHARACTERS 面板 + textarea 編輯 + 預覽面板（5 sub-tab）
  - 即時解析 + 自動偵測新角色 + auto-save draft
  - Undo/Redo 棧（100 快照、Ctrl+Z/Y）
  - Alt+1~9 快捷鍵插入
  - Blocks / Stats / Layout / Voice / BGM 預覽（前 3 個完整實作）
- **Editor / Search / Reader TAB**：placeholder（待 17-3 / 17-4 / 17-5）
- 角色 Modal：新增 / 編輯 / 刪除 + IndexedDB 持久化 + 色彩選擇器
- 狀態列：format badge + 驗證狀態 + Alt+N 快捷鍵提示 + Ln/Col 游標
- PostMessage Bridge 5 協議：
  - `akasha-open-file` — 接收 App Shell 開檔
  - `akasha-ai-get-context` ↔ `akasha-ai-context-response` — AI 上下文
  - `akasha-mode-change` — dark/light
  - `akasha-file-opened` — 通知 App Shell 開檔
  - `akasha-export-to-table`（via core/export/bridge.js）
- 鍵盤導航：Ctrl+1~4 切 TAB

### 設計決策

- **Vanilla JS ES module** — 不引入 React/Vue，與 Akasha 其他模組一致
- **多檔分離** — `data-model.js` 共享 + 後續各 TAB 拆獨立 JS（write-tab.js / editor-tab.js / search-tab.js / reader-tab.js / overlays.js）
- **State + Bus 模式** — AppState 為單例物件，Bus emit 跨 TAB 事件
- **保留向後相容** — 既有 PostMessage 協議、`script-editor-characters` IndexedDB 庫名不變
- **TAB 切換用 CSS class** — 不真正卸載 DOM，保留各 TAB 狀態

---

## 2026-05-18：Phase 17 Script Editor 4-TAB 整合 開始

### 背景

Akasha Library 有兩版 Script Editor：
1. **Akasha 內嵌版**（`modules/script-editor/index.html`, 1661 行, Vanilla JS）— Phase 8 產出，textarea 速寫 + Voice TTS + BGM 合成 + export-core 整合
2. **Archive 獨立版**（`-Archive_Script_Editor-/uiux/app.jsx`, 3618 行, React 18 CDN）— 獨立專案，Search/Editor/Reader 三 TAB + 角色關係圖 + 音效庫 + 劇本檢查 + 初稿生成

兩版定位互補：Akasha 版適合快速寫作（鍵盤流），Archive 版適合瀏覽監修（結構化視圖）。

### 決策

- 合併為 **4-TAB**（速寫 Write / 編輯 Editor / 搜尋 Search / 閱讀 Reader）
- 技術棧：改寫為 **Vanilla JS**（與 Akasha 其他模組一致，去除 React 依賴）
- 入口：取代現有 `script-editor` 側欄入口
- 新功能：**Alt+N 快捷鍵**（Alt+1=場景 / Alt+2=旁白 / Alt+3~9=角色，混合模式：自動綁定+可手動調整）
- Branch: `feature/script-editor-merge`

### 檔案結構

```
modules/script-editor/
  index.html         # HTML 骨架 + CSS + 4-TAB 切換 + PostMessage
  data-model.js      # 共享狀態 + 事件匯流排 + 解析器 + 驗證 + IndexedDB
  write-tab.js       # 速寫 TAB
  editor-tab.js      # 編輯 TAB
  search-tab.js      # 搜尋 TAB
  reader-tab.js      # 閱讀 TAB
  overlays.js        # Table Forge / 關係圖 / 音效庫 / 劇本檢查 / 初稿生成
```

### 7 Phase 實作計畫

| Phase | 內容 | 預估行數 |
|-------|------|---------|
| 17-1 | Foundation（data-model.js + index.html 骨架） | ~1300 |
| 17-2 | Write TAB（textarea + Alt+N 快捷鍵 + Voice/BGM） | ~650 |
| 17-3 | Editor TAB（區塊卡片 + AVG 面板 + TAG） | ~900 |
| 17-4 | Search TAB（6 篩選器 + 結果卡片） | ~450 |
| 17-5 | Reader TAB（連續排版 + TOC + choice） | ~500 |
| 17-6 | Overlays（5 個全屏 overlay） | ~1200 |
| 17-7 | 整合收尾（跨 TAB 同步 + 多作品 + 匯入統一） | — |

---

## 2026-05-16：Phase 15 Private Reading Room + 每日館報 完成（15-A/B/C/D）

### 15-A：談心專區模組（Reading Room）

新增 `modules/reading-room/index.html`：
- 聊天式 UI — 使用者輸入 → PostMessage `akasha-reading-room-send` → App Shell 呼叫 LLM → 打字機回應
- 三種記憶模式：今日限定（session memory）、保存至手札（approved memory）、不保存（no-trace）
- 零韻手札清單 — 顯示所有已保存記憶，可查看 / 刪除
- PostMessage Memory Bridge — getAll / save / saveSession / delete / deleteAll / enqueueSync
- 手機版 RWD 適配

修改 `index.html`（App Shell）：
- modules 登錄 `reading-room` + sidebar 入口（heart SVG icon）
- 儀表板卡片（Roman VI，藍色書脊）
- `MODULE_CONTEXTS['reading-room']` — 角色：心靈夥伴 Soul Companion
- AI Bridge：`akasha-reading-room-send` handler + 記憶系統整合
- Memory Bridge：8 個 action 的完整 PostMessage 處理（含 `enqueueSync`）

修改 `core/security.js`：新增 `reading_room` feature gate

### 15-B：零韻手札 UI 強化

修改 `modules/reading-room/index.html`：
- 編輯 modal（`#editOverlay`）— 標題 / 內容 / 標籤三欄可編輯，save 用 `put()` 更新既有記錄
- Tag 篩選列 — 收集所有 notes 的 tags，生成 pill buttons，點擊篩選手札清單
- Notion 同步選項 — 第 5 種保存選項（`value="notion"`），save 後 enqueueSync 排入 Notion 同步佇列
- MD / JSON 匯出 — export dropdown，生成 `零韻手札_YYYY-MM-DD.md/.json`，Blob download

修改 `index.html`（App Shell）：
- Memory Bridge 新增 `enqueueSync` case，呼叫 `core/notion-connector.js` 的 `enqueue()`

### 15-C：每日館報 MVP

新增 `modules/daily-report/index.html`：
- 兩欄式 UI — 左：文字輸入區（textarea + date picker）、右：報告顯示區
- AI Bridge — `akasha-report-generate { text, date }` → LLM 結構化輸出 §12.3 JSON
- 報告渲染 — `renderReport(report)` 遍歷 sections / items，顯示標題 / 摘要 / 來源 / URL
- 儲存 — 複用 Memory Bridge（`module:'daily-report'`, `scope:'report'`）
- 歷史 — `loadHistory()` 從 approved-memory 取回，顯示可點擊列表 + 刪除按鈕
- MD / JSON 匯出 — `exportReport('md'|'json')`，`館報_YYYY-MM-DD.md/.json`

修改 `index.html`（App Shell）：
- modules 登錄 `daily-report` + sidebar 入口（newspaper SVG icon）
- 儀表板卡片（Roman VII，暖橙色書脊 `#3a2a1a`）
- `MODULE_CONTEXTS['daily-report']` — 角色：館報整理員 Archive Reporter
- AI Bridge：`akasha-report-generate` handler + system prompt（指定 §12.3 JSON 格式）

### 15-D：館報朗讀 + BGM 搭配

修改 `index.html`（App Shell）：
- `initVoiceBridge()` IIFE — 動態 import `core/voice.js` + `core/report-voice.js`
- `broadcastState()` — 將語音狀態（speaking / paused / index / total / text）廣播到 iframe
- 訊息處理：`akasha-voice-play-report`（clearQueue → reportToVoiceTasks → enqueue → playQueue）
- 訊息處理：`akasha-voice-pause` / `akasha-voice-resume` / `akasha-voice-stop`
- State listener：監聽 speaking / idle / paused / queue-progress / queue-done 事件

修改 `modules/daily-report/index.html`：
- Voice bar CSS — `.voice-bar` / `.voice-bar-progress` / `.voice-bar-text`
- 朗讀 / 暫停 / 停止按鈕 + BGM preset 下拉（4 presets + 無BGM）
- `setVoiceUI(playing, paused)` — 根據播放狀態切換按鈕顯示
- 監聽 `akasha-voice-state-update` — 更新進度條（「第 N/M 段」+ 當前文字 60 字截取）
- BGM 連動 — 開始朗讀時 `akasha-bgm-play`，停止時 `akasha-bgm-stop`

### 共通

- `sw.js`：v4 快取清單新增 `./modules/reading-room/index.html`、`./modules/daily-report/index.html`
- `scripts/build.js`：critical path 新增 `modules/reading-room/index.html`、`modules/daily-report/index.html`

---

## 2026-05-16：Phase 14 Voice / BGM Prototype 完成（14-A/B/C/D）

### 14-A：Rein-Voice task format + voice preview UI

新增 `core/voice.js`：
- `VoiceTask` JSON 格式（voiceId / text / emotion / speed / pitch / output）
- Web Speech API TTS 引擎：`speak()` / `stop()` / `pause()` / `resume()`
- Task queue：`enqueue()` / `playQueue()` / `stopQueue()` / `clearQueue()`
- `blocksToVoiceTasks()` — Script blocks → voice task 序列
- `setStateListener()` — 狀態監聽（speaking / idle / error / queue-progress）

修改 `modules/script-editor/index.html`：
- 新增「試聽」preview tab
- Voice settings panel：語音選擇（系統 TTS voices）、速度 slider、音調 slider、包含旁白 checkbox
- 全部播放 / 停止按鈕 + queue 進度顯示
- Per-block play buttons（每個 dialogue card 右上角 ▶ 按鈕）
- Queue list：顯示 speaker + text，點擊可從該處開始播放

### 14-B：score.json + TsukiSynth preset selector

新增 `core/bgm.js`：
- Score JSON 格式（scoreId / instrument / tempo / scale / mood / notes / effects）
- 4 樂器定義：Piano、揚琴（Yangqin）、空靈鼓（Tongue Drum）、水鐘（Water Chime）
- Web Audio API 合成引擎：多諧波 oscillator + ADSR envelope + reverb（convolver）+ delay
- 4 presets：靜謐書庫（piano）、柔風揚琴、冥想空靈鼓、流水水鐘
- API：`playScore()` / `playPreset()` / `stopScore()` / `setVolume()` / `getPresets()`

### 14-C：館報朗讀稿輸出

新增 `core/report-voice.js`：
- `reportToVoiceTasks(report, opts)` — Daily Archive Report JSON → voice task 序列
  - 結構：開場問候 → 主題數 → 逐 section（標題 + items + summaries）→ 結語
  - 可配置：voiceId / speed / greeting / closing / readSummary / readSource
- `reportToReadingScript(report, opts)` — → Markdown 朗讀稿
- `estimateReadTime(tasks)` — 預估朗讀秒數（CJK ~4 chars/sec）

修改 `core/export-core.js`：
- 新增 `report:voice-tasks` converter → `.voice-tasks.json`
- 新增 `report:reading-script` converter → `_reading.md`

### 14-D：伴讀時指定背景樂

修改 `index.html`（App Shell）：
- BGM Companion Bar：固定底部橫條（CSS `.bgm-bar`）
- UI：preset 下拉（4 presets）、播放/停止鈕、preset 名稱顯示、音量 slider、關閉鈕
- Loop playback：score 播完自動重播（setTimeout chain）
- `window.akashaBgm` 全域 API：`show()` / `hide()` / `play(presetId)` / `stop()` / `toggle()`
- PostMessage 協議：`akasha-bgm-play` / `akasha-bgm-stop` / `akasha-bgm-toggle`
- Feature gate：`isFeatureEnabled('voice')` 檢查，public build 不顯示

### 共通

修改 `sw.js`：v4 快取清單新增 `core/voice.js`、`core/bgm.js`、`core/report-voice.js`

---

## 2026-05-15：Phase 8 + 12 + 16-B/C/D 完成

三大 Phase 一次到位：Script Editor MVP、Security Layer、部署系統。

### Phase 8 Script Editor MVP（8-A~H 全部完成）

新增 `modules/script-editor/index.html`：

| 步驟 | 內容 |
|------|------|
| 8-A | 三欄 UI（角色卡 / Plain Script 編輯器 / 預覽面板） |
| 8-B | `parseBlocks()` Plain Script 解析 + 即時 blocks 預覽 |
| 8-C | 角色 DB（獨立 IndexedDB `script-editor-characters`，alias 比對 + CRUD modal） |
| 8-D | blocks → TyranoScript `.ks`（委託 export-core） |
| 8-E | blocks → Markdown / AVG JSON（委託 export-core） |
| 8-F | Layout tab 版面預覽（場景分割線 / speaker 色標 / 列印 / DOCX） |
| 8-G | 回流匯入（parseTyranoScript / parseAvgJson / parseMarkdownScript / blocksToPlainScript） |
| 8-H | App Shell 整合（sidebar 按鈕 + 儀表板卡片 + MODULE_CONTEXTS） |

`index.html` App Shell 變更：
- modules 登錄 `script-editor` + sidebar pen icon + 儀表板 Roman IV 卡片
- `MODULE_CONTEXTS['script-editor']` — 零韻角色：劇本顧問 Script Consultant
- `TYPE_MODULES` 新增 jsonl / ks 自動路由

### Phase 12 Security Layer（12-A~E 全部完成）

新增 `core/security.js`：

| 步驟 | 內容 |
|------|------|
| 12-A | `DATA_LEVEL` 五級分類 + `CLASSIFICATION` map + `classify()` |
| 12-B | PBKDF2 310K → AES-256-GCM：`encrypt()`/`decrypt()`/`encryptFields()`/`decryptFields()` |
| 12-C | BYOK 加密本地金鑰：`persistApiKey()`/`retrieveApiKey()`/`getByokMode()` |
| 12-D | Record Stamping：`sha256()`/`stampRecord()`/`verifyChecksum()`/`markSynced()` |
| 12-E | `BUILD_MODE` + `FEATURE_GATES`（public 5 on / private all 13 on）+ `isFeatureEnabled()` |

### Phase 16-B 公開 Demo 版 build

新增 `scripts/build.js`：
- `--mode=public`：排除 spec / dev docs / workers / admin，注入 `BUILD_MODE='public'`
- persona.md → 公開空白模板（13 行）
- SW cache name → `akasha-library-v4-public`
- 關鍵檔案驗證（12 個 critical path 檢查）

### Phase 16-C 私有完整版 build

- `--mode=private`：完整複製，不注入 BUILD_MODE（default='private'）
- `npm run build:public` / `npm run build:private` package.json scripts

### Phase 16-D 後端服務骨架

更新 `workers/src/index.js`：

| 端點 | 功能 |
|------|------|
| POST /v1/chat | LLM proxy — BYOK + Coin 雙模式 |
| POST /v1/sync | Sync queue — push / pull / ack（KV 持久化） |
| POST /v1/rag | RAG 檢索（stub，回傳空結果） |
| POST /v1/coin/balance | 月幣餘額查詢 |
| POST /v1/coin/deduct | 月幣扣款 |
| GET /health | 健康檢查（含 feature 狀態） |

Coin 系統：per-model 成本估算 + deduct/refund + KV history
wrangler.toml 新增 COIN_KV / SYNC_KV binding 範本

### 其他更新

- `sw.js` v3→v4：完整快取列表（57 assets）+ stale-while-revalidate + 個別 add 容錯
- `.github/workflows/deploy.yml`：改用 `_site/` 輸出（不再上傳整個 repo）
- `core/config.js`：新增 API_BASE + BUILD_MODE 欄位
- `.gitignore`：新增 `_site/`

---

## 2026-05-14：§4.4 + Phase 13 完成 + Phase 16-A Export Core

跨三個階段的實作，一次 commit 推送。

### §4.4 PDF 書籤 IndexedDB 遷移

| 項目 | 說明 |
|------|------|
| `core/storage.js` | DB_VERSION 5→6，新增 `bookmarks` object store + 4 個 CRUD export |
| 四檔同步 | `approved-memory.js` / `room-summary.js` / `sync-queue.js` 同步升至 v6 |
| `modules/pdf-reader/index.html` | 書籤全面改寫為 async IndexedDB 操作，含 `migrateBookmarks()` 一次性遷移 |

### Phase 13 Document Bridge（全部完成 ✅）

| 步驟 | 內容 |
|------|------|
| 13-A | DOCX 匯入 → Markdown（mammoth.js CDN，段落/標題/表格/粗斜體） |
| 13-B | Markdown → DOCX 匯出（docx CDN，buildDocxDoc + mdInlineRuns） |
| 13-C | Script blocks → DOCX/PDF（劇本交付）— 解除 Phase 8 依賴 |
| 13-D | DOC 舊格式純文字抽取 |

新增 `core/document-bridge.js`：
- `importDocx(arrayBuffer, filename)` — mammoth.js → HTML → Markdown
- `exportDocx(mdText, title)` — Markdown → docx Blob
- `exportScriptDocx(blocks, title)` — Script blocks → 劇本版面 DOCX
- `exportScriptHtml(blocks, title)` — Script blocks → 可列印 HTML
- `extractDocText(buffer)` — 舊 .doc 二進位文字抽取

`modules/markdown/index.html` 整合：
- file input accept 加 `.docx/.doc/.jsonl`
- 工具列加「匯出 DOCX」「劇本 DOCX」「劇本 PDF 預覽」
- `isPlainScriptContent()` 偵測 Plain Script 格式
- `parseBlocksJsonl()` 解析 `.blocks.jsonl`
- 三個進入點（file input / drag-drop / PostMessage）全部支援 DOCX

### Phase 16-A Export Core

新增 `core/export-core.js` — 統一匯出引擎：

| 資料類型 | 可匯出格式 |
|---------|-----------|
| markdown | md, html, pdf, docx |
| table | csv, tsv, json, md |
| dialogue | ks, avg-json, md, jsonl, docx, pdf |
| score | json |
| memory | md |

API：`exportAs(dataType, format, data, opts)` → `{ blob, filename, mimeType }`

新增格式轉換器：
- `blocksToTyranoScript()` — dialogue blocks → `.ks`
- `blocksToMarkdown()` — dialogue blocks → Markdown（**角色**：台詞 格式）
- `tableToDelimited()` — table → CSV/TSV（含引號逃脫）
- `tableToMarkdown()` — table → Markdown table
- `memoryToMarkdown()` — memory record → `.md`
- `markdownToHtml()` — Markdown → 完整 HTML（含 inline 格式化）

### Commit

```
72a3555 feat(§4.4/13/16-A): IDB v6 書籤遷移 + Document Bridge 完成 + Export Core
9 files changed, +1253 / -58
```

---

## 2026-05-10：Phase 10 + 11 — Memory System + Notion Connector

### Phase 10 Memory System

| 步驟 | 內容 |
|------|------|
| 10-A | `core/session-memory.js` — 短期 session memory（runtime state） |
| 10-B | `core/room-summary.js` — 中期 room summary（每模組摘要，IndexedDB） |
| 10-C | `core/approved-memory.js` — 長期 approved memory + 使用者確認 |
| 10-D | Memory Record viewer（查看/編輯/刪除） |
| 10-E | Memory search — 受控搜尋，只回傳命中片段 |

### Phase 11 Notion Connector

| 步驟 | 內容 |
|------|------|
| 11-A | `core/notion-mapping.js` — Notion database mapping |
| 11-B | `core/notion-connector.js` — 書庫 metadata 同步 |
| 11-C | persona.md + Script blocks 同步 |
| 11-D | `core/sync-queue.js` — 背景同步流程 |
| 11-E | 衝突處理 UI（diff 顯示 + 使用者選擇） |

---

## 2026-05-09：Phase 7 + 9 — Translation Core + Table Forge 抽取強化

### Phase 7 Translation Core

新增 `core/translation-core.js`：
- 7-A: TransformJob 工廠 + detectFormat（副檔名 + 內容推測）
- 7-B: Markdown 抽取（heading / table / code / list / task）
- 7-C: Plain Script parser（角色：台詞 → dialogue blocks）
- 7-D: JSON array → table candidate
- 7-E: App Shell 轉換結果預覽 modal

### Phase 9 Table Forge 抽取強化

- 9-A: extractChapterTable
- 9-B: extractTableInventory
- 9-C: extractOutline / extractCodeFences
- 9-D: generateWritebackDiff
- 9-E: addMetadataColumns

---

## 2026-05-08 (g)：ROADMAP 整合 — 追加規格書併入

將 `akasha-feature-additions-spec.md`（20 章 / 8 Batch）整合進 `ROADMAP.md`。

### 變更摘要

| 項目 | 說明 |
|------|------|
| ROADMAP.md | 從 6 Phase 擴充為 16 Phase，保留已完成項目，合併重疊項 |
| Phase 4-A / 5-A | 標為已完成（在 3-B 中實作） |
| Phase 7–16 | 新增：Translation Core / Script Editor / Table Forge 抽取 / Memory / Notion / Security / Doc Bridge / Voice-BGM / 談心+館報 / Export+部署 |
| 相依關係圖 | 重新繪製，標示「目前可做」與「追加功能鏈」 |
| 規格文件索引 | 新增三份 spec 對照表 |
| TODO.md | 更新待做清單，反映新 Phase 編號 |

### 追加 spec 對應表

| 追加 spec 章節 | 對應 Phase |
|------|------|
| §2.1 Translation Core | Phase 7 |
| §3 Script Editor | Phase 8 |
| §4 Table Forge 抽取 | Phase 9 |
| §6 Memory System | Phase 10 |
| §5 Notion Connector | Phase 11 |
| §14 Security Layer | Phase 12 |
| §9 Document Bridge | Phase 13 |
| §10–11 Voice / BGM | Phase 14 |
| §8 談心 + §12 館報 | Phase 15 |
| §2.2 Export Core + §15 部署 | Phase 16 |

---

## 2026-05-08 (f)：Phase 3-B — 零韻 Context 切換

零韻面板根據當前模組自動切換角色、system prompt、與 UI 元素，並接入真正的 LLM 呼叫。

### 變更摘要

| 項目 | 說明 |
|------|------|
| MODULE_CONTEXTS | 每模組定義 role / roleEn / badge / engine / greeting / placeholder / emotion |
| UI 切換 | `updateAIContextBadge()` 升級：badge + nameplate + speaker + placeholder + emotion 一同更新 |
| 招呼語 | 切換模組時面板內自動播放該角色的招呼語（打字機效果） |
| System Prompts | `core/ai.js` 新增 `buildCodeSystemPrompt()` / `buildTableSystemPrompt()` / `buildGeneralSystemPrompt()`，共用 `PERSONA_CORE` |
| PostMessage 協議 | `akasha-ai-get-context` → 模組回應 `akasha-ai-context-response`（含 content / fileName / fileType） |
| 模組 handler | Code & Data：回傳 `state.content`（截斷 12K）+ filename + extension |
| | Table Forge：回傳 `exportMarkdown(currentDoc)`（截斷 12K）+ title |
| | PDF Reader：回傳 `extractContextPages()` + RAG `queryRelevant()`（若 index 就緒） |
| App Shell Layer 2 | `_aiSendReal()`：偵測模組 → 請求內容 → 建構 prompt → `callLLM()` → 打字機回應 |
| Token 計 | 呼叫前更新 token 預估；coin 模式自動扣款 |
| Fallback | file:// 下顯示「需要 HTTP 伺服器」提示 |

### 功能驗證

- [x] 總覽頁 badge「※ 總覽」、role Librarian
- [x] Code & Data badge「※ Code & Data」、role Manuscript Interpreter、placeholder「…向手稿解讀員提問」
- [x] Table Forge badge「※ Table Forge」、role Data Inspector、placeholder「…向資料檢查員提問」
- [x] PDF 閱讀器 badge「※ PDF 閱讀器」、role Librarian
- [x] 切換回總覽時 reset 為預設 context
- [x] `_aiSendReal` 函式已掛載
- [x] 零 console error

---

## 2026-05-08 (e)：Phase 3-A — 零韻面板 UI 抽出

將 AI 圖書館員面板從 `modules/pdf-reader/index.html` 抽出，掛到 App Shell `index.html` 作為獨立元件。

### 變更摘要

| 項目 | 說明 |
|------|------|
| CSS | ~150 行 AI 面板樣式（`.ai-panel` 全家族）加入 App Shell `<style>` |
| HTML | `<aside class="ai-panel">` 整組（立繪 / 對話框 / Token 計 / 輸入列）加到 `</main>` 之後 |
| JS | `toggleAIPanel()` / `togglePortrait()` / `setAIMode()` / `aiAdvance()` / `sendAIMessage()` / `startTypewriter()` / `updateAIContextBadge()` |
| 按鈕 | 「召喚圖書館員」從 `alert()` placeholder 改為實際開關面板 |
| Context | 切換模組時 `aiPageBadge` 自動更新（`※ PDF 閱讀器` / `※ 總覽` 等） |
| 回應 | 暫以隨機提示回應（Phase 3-B 接入 LLM） |
| 手機 | `@media ≤768px` 底部上拉面板（`position: fixed; height: 60vh`） |
| SVG ID | 避免與 PDF Reader 衝突，gradient ID 改為 `aiBg` / `aiCandle` |
| 圖片 | `assets/images/librian.png`（根目錄相對路徑） |

### 功能驗證

- [x] 面板開關動畫（340px 滑入/滑出）
- [x] 按鈕文字同步（「召喚圖書館員」↔「圖書館員 ●」）
- [x] 立繪收合/展開
- [x] 模式 tab 切換（文字/語音/人設）
- [x] 對話打字機效果 + 點擊跳過
- [x] 送訊息 → 隨機 placeholder 回應
- [x] 模組切換 badge 更新
- [x] 零 console error

---

## 2026-05-08 (d)：Phase 2 — PDF Reader 補強（書籤 / 切割 / 截圖）

### 2-A 書籤功能

`modules/pdf-reader/index.html` 新增書籤系統：

| 項目 | 說明 |
|------|------|
| 側欄 Tab | 新增「Mark · 書籤」為第 4 個 tab |
| Topbar 按鈕 | 書籤旗幟圖標，PDF 載入後顯示，已標記時金色填充 |
| 新增書籤 | 點按鈕 → 切換到書籤 tab → 備註輸入框 → 加入 |
| 書籤列表 | 按頁碼排序，顯示頁碼 + 備註，點擊跳頁 |
| 刪除 | 每筆書籤右側 × 按鈕，hover 顯示 |
| 持久化 | localStorage `akasha-bookmarks-{fileId}` |

新增函式：`loadBookmarks()` / `saveBookmarks()` / `addBookmark()` / `removeBookmark()` / `renderBookmarks()` / `updateBookmarkButton()` / `toggleBookmark()` / `confirmAddBookmark()`

### 2-B 自訂選擇切割

補完 Custom 模式 placeholder：

| 項目 | 說明 |
|------|------|
| 頁碼網格 | `custom-page-grid`，`auto-fill` 排列，每頁一個 chip |
| 選取 | 點擊 chip 切換選取狀態，金色高亮 |
| 預覽 | 動態顯示已選頁數 |
| 執行 | pdf-lib 合併選取頁面，下載並可選同步書庫 |

新增函式：`renderCustomPageGrid()` / `updateCustomPreview()` / `splitCustom()`

新增 CSS：`.custom-page-grid` / `.custom-page-chip` / `.custom-page-chip.selected`

### 2-C 截圖框選

| 項目 | 說明 |
|------|------|
| Topbar 按鈕 | 框選圖標，PDF 載入後顯示 |
| 操作流程 | 點按鈕 → crosshair 游標 → 拖拉選區 → 確認/取消 toolbar |
| 截圖 | Canvas `drawImage` 裁切 → `toBlob('image/png')` |
| 存入書庫 | `saveFileEntry` + `saveFileBlob`，檔名含頁碼和時間戳 |
| 座標映射 | overlay → canvas 座標轉換（考慮縮放比例） |

新增函式：`startCrop()` / `confirmCrop()` / `cancelCrop()`

新增 CSS：`.crop-overlay` / `.crop-rect` / `.crop-toolbar`

---

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
