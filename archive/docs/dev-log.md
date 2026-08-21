# Akasha Library — Dev Log

## 2026-07-02：Codex 回報 2 bug 修復 + Script Editor block 完整性補強

### Codex 回報 S1 修復（凍結區解凍修）

| 項目 | 問題 | 修法 | 檔案 |
|------|------|------|------|
| S1-1 | OCR 文字摘錄存書庫後，「最近開啟」點開無反應 | `postMessage` payload 從手拼 `{type, id, name, fileType}` 改為直接傳 `{type: 'akasha-file-opened', entry}`，與 Shell receiver schema 對齊 | `modules/pdf-reader/index.html` |
| S1-2 | 截圖框選 PNG 從書庫重開時顯示亂碼文字 | Shell `openRecentFile` 新增 `entry.type === 'crop-screenshot'` 分支，建 Object URL 顯示於新增的 `.crop-viewer-overlay` 圖片預覽面板，不再進 `decodeBuffer` 文字解碼 | `index.html`（Shell） |

### Script Editor block 類型完整性補強（活躍區）

| 項目 | 內容 | 檔案 |
|------|------|------|
| Command 編輯 UI | `addBlock("command")` 模板（`{command, value}`）+ BlockCard 內雙行輸入欄位（指令名 mono / 指令值 serif） | `App.jsx` |
| Block 排序 | `moveBlock(id, dir)` 上移/下移 + BlockCard 雙按鈕（title="上移"/"下移"），取代原裝飾用拖曳圖標 | `App.jsx` |
| Choice 路徑驗證 | `validateBlock` 第三參數 `blocks`：檢查選項缺 `nextBlockId`（"未指定跳轉目標"）+ 跳轉指向不存在場次（"指向不存在的場次"） | `App.jsx` |

驗證：`npm test` 通過（8 迴歸 + 2 Vite build + SW-INTEGRITY）；瀏覽器端以 JS 驗證 command 按鈕生成、上下移動 swap、command 缺值警告、choice 跳轉驗證。

Commit: `2b38357`

---

## 2026-06-13:人類實走測試計畫 + 機器軌驗證（先規劃 → Claude 實跑）

月月要求「先規劃、不執行」一份完整性的人類實走測試，再由 Claude 把「機器能查的」那一軌先跑掉。

**產出**：`docs/walkthrough-test-plan.md` — 約 70 條可勾選 UAT，每條標 🤖機器查 / 👤人走 / 🤝兩者 / ⛔受阻（雲端未部署）。核心觀念：本專案「後端」多為瀏覽器內 IndexedDB/localStorage + iframe postMessage 管線（🤖 可查）；月幣/Drive/Notion 的 Worker 未部署，無後端可對應，只驗未配置守門。

**機器軌（preview 真實瀏覽器，serverId 託管 :3460；真實 fixture + 真實 shipping 程式碼）結果，零 S0/S1**：
- B8/R1 Reader→Table Forge 無損：`contentToPayload(sample.md)`→`parseReaderPayload` 全鏈，四型內容全在 + 非表格分隔列；傳輸層確認 payload 原封進 sessionStorage（index.html:2798）→ table-ui.js:507，端到端對應。
- F2 parser：半形/全形冒號都判 dialogue、`//`→note 不被吞（區塊序 scene→narration→dialogue×3→note）。
- F9/R4 choice 含「/」：序列化 `去A\/B路口`、重解析回原樣、剛好 2 選項。
- F5 多作品隔離（runtime 端到端，驅動 UI）：建自訂作品→打標記→切 lohengrin textarea 不含標記（零污染）→切回標記還在。
- R3 刪作品對稱（runtime）：刪後該作品 per-work key leftover=0、sw_custom_works→[]、切回 fallback；程式碼確認清全 10 key 含 edges_。
- F1/D 兩 React 模組掛載零 console error；8 vanilla 模組 + App Shell 載入冒煙全過、零失敗請求。
- R7 金鑰不外洩（靜態）：全碼無 console 印金鑰；SECRET 級 session-only/AES-GCM。
- H2 不留痕（碼）：noTrace 開→maybeSuggestNote return，自動寫記憶被擋。
- J2 月幣守門（runtime）：預設 BYOK、月幣段隱藏無假餘額；切「月幣制」→警告「此部署尚未啟用…請改用 BYOK」現身。

留給月月親走：視覺/聲音/體感、需真實 PDF/xlsx/docx 的流程、真金鑰 console 抽驗、不留痕 IndexedDB 殘留負向斷言。
工程備忘：`.claude/launch.json` 的 akasha 設定加 `autoPort`、移除寫死 `-p`（讓 preview 自挑 port，不撞月月手開的 :3460）。

## 2026-06-13:Codex audit 二度評估 + 解凍修復批次（Dynamic Workflow）

月月交來 Codex「全量健檢 BLOCKED」報告，要求 Opus 二度評估 + 用 Dynamic Workflow（Opus 規劃/驗證、Sonnet 執行）逐一修復，最後重跑全面審查。

**二度評估**：複查 Codex 七項，抓到 2 處不準——SW「快取項不存在」在當下 committed 狀態其實一致（rebuild 才失準，降 S1→S2）；「tsuki-synth CLI 阻塞已過時」無證據（跨 repo），未採信、未寫入文件。另把 edges/月幣由 S1 降 S2。結論 PASS WITH ISSUES。

**活躍區修復**（先行）：
- [S0→fix-first] choice 選項含「/」資料遺失：`parser.js` 加 `escapeChoiceOption`/`splitChoiceOptions`，option label 內 `/`→`\/`，三處共用（parse / serialize / `_choiceKey`）。補 CARD-06 未蓋到的洞（選項數變動→配對失敗丟 nextBlockId）。
- [S2] 刪自訂作品殘留 `edges_${workId}`：`App.jsx deleteCurrentWork` 補 removeItem（先列舉全 10 個 per-work key 確認唯一遺漏）。
- [S3] 文件同步：README / ROADMAP / TODO 標 19-D 已實作。

**解凍修復批次**（月月解凍 Phase 1–18 後）：
- [A] Reader→Table Forge 不再靜默丟內容：`parsers.js parseReaderPayload` 改為無損——有表格時保留原生欄位、非表格內容（標題/段落/程式碼）以標記列接於同 sheet；無表格時建 [類型,內容] sheet。fixture `sample.md` 端到端驗證四型全在。
- [B] SW precache 自動化 + SW-INTEGRITY 進 npm test：新增 `scripts/sync-sw.js`（重建後自動把 dist hash 寫回 sw.js + 以全資產內容雜湊產生 CACHE_NAME，冪等）；`npm run build` 末端自動執行，`npm test` 加 `--check`（缺檔即失敗，根治「修了沒生效」）；`scripts/build.js` 不再硬編碼 v6，改沿用內容雜湊名 + 附 mode。
- [C] 月幣模式未部署提示：`ai-settings` 月幣區塊加自包含偵測，placeholder 代理時顯示「尚未部署，請改用 BYOK」。
- [D] Vite 5→8 升級（@vitejs/plugin-react 4→6）：清除 esbuild dev-server 漏洞，`npm audit` 歸 0；build（rolldown）+ npm test + 源碼測試通過。

每項經 Opus 獨立 gate（含負向測試與真實 fixture）驗證後，commit `a34315e`、經 PR #5 併入 `master`（`b07c181`），Vite 8 render 另以 Chrome MCP 實測（Script Editor + 試算表零 console error）。SW 快取版號自 v9 起改為全資產內容雜湊並自動化。

## 2026-06-10:審查修復批次(fix-cards)

依 2026-06-10 全量健檢報告執行(詳見 docs/fix-cards-2026-06-10.md):
- CARD-01 [S0] WriteTab 快速切換丟字:debounce flush + reverse sync blocks-ref gating
- CARD-02 [S0] `//` 註解行 round-trip:parsePlainScript 改產 note block
- CARD-03 [S2] dist rebuild + sw.js v7→v8 + precache hash 更新
- CARD-04/05 [S3] 文件同步 + 審查協議安裝(CLAUDE.md)+ review-fixtures 建立

六月先前 commit 補記:`0624f31` 草稿歷史+Worker RAG、`301bd5a` Codex round2、
`3dd9d9b`/`4cf6d52` typewriter scroll + H1~H4 大綱、`b0ddcd4` 章節列移除、
`dec2304`/`49f5992` shell 修正、`b4f8e2d` 上輪審查修復+匯入即建作品、`ab5960b` 場景副標題去硬編碼。

## 2026-05-23：Phase 18 Script Editor 品質修正（Round 1 + Round 2）

### 背景

PR #3（`feature/archive-host-merge`）merge 後，月月實測 + Codex audit 回饋 10 項問題。分兩輪修正。

### Round 1（`a31e242`）

四大功能修正一次到位：

#### 18-A 搜尋補強 — narration / scene filter

Search tab 的 block type filter 原本只有 dialogue，新增 narration 和 scene。Lohengrin 資料集無 narration blocks，scene 正確回傳 10 筆。

#### 18-B Persona Slots UX 重構

WriteTab slots 從「固定 1-2 + 右鍵才能管理 3-9」改為全面可操作：
- `locks` 機制擴展到 9 格
- `onSlotContext` 移除 `n <= 2` 限制
- 右鍵選單加入 lock / unlock / clear / assign

#### 18-C 多作品支援

新增自訂作品系統，脫離 Lohengrin 單一作品限制：
- `getCustomWorks()` / `saveCustomWorks()` — localStorage `sw_custom_works` JSON 陣列
- `loadWorkIndex()` 合併 server + custom works（`_custom: true` 標記）
- `loadAllData()` custom work 早期返回（CHARACTERS=[], SCRIPT=[]）
- `populateCharsFromBlocks()` — 從 dialogue blocks 自動發現角色填入 CHARACTERS + CHAR_COLORS
- `NewWorkModal` — title / titleEn / author 表單
- `WorkSwitcher` — `<select>` 切換 + 「＋」新增 + 「✕」刪除
- per-work localStorage 隔離：`blocks_${workId}` / `notes_${workId}` / `sw_write_draft_v1_${workId}` / `sw_slot_locks_v1_${workId}`
- `sw_last_work` 跨 session 記憶

WriteTab 對應：
- `draftKey(workId)` / `locksKey(workId)` 動態 key
- 所有 `loadDraft` / `saveDraft` / `loadLocks` / `saveLocks` 接受 workId 參數
- Component 簽名加入 `workId` prop

#### 18-D AI 輔助面板

`AiAssistPanel` 組件：
- 聊天 UI — 訊息清單 + textarea 輸入 + 送出按鈕
- 4 presets：潤稿建議 / 角色塑造 / 場景描寫 / 翻譯比對
- iframe 偵測 + `postMessage`（`akasha-reading-room-send` / `akasha-reading-room-response`）
- 非 iframe 環境顯示提示文字
- SwHeader 加 AI 按鈕（moon icon）

### Round 2（`fe1eb02`）

月月回饋 + Codex audit 10 項 → 一次修完：

#### 18-E-1 Persona Slots v2（全面開放）

WriteTab `SlotBadge` + slot 邏輯全面重寫：
- `slotLabels` 改為：locks 優先 → `__clear__` 清空 → 預設（1=#scene, 2=旁白, 3-9=dynamic）
- `isLocked(n)` 簡化：`!!locks[n] && locks[n] !== "__clear__"`
- 空格也可點（移除 `disabled={!filled}`），cursor 始終 `pointer`
- 左鍵 → `onSlotContext`（開選單），雙擊 → `insertSpeakerPrefix`
- 右鍵選單新增「▸ 插入」頂部動作 + #scene / 旁白 在 assign 清單
- tooltip 改為「單擊管理 · 雙擊插入 · Alt+N」

#### 18-E-2 WorkSwitcher 內嵌

從 `position: absolute; top: 10; right: 120` 改為 inline flex：
- `SwHeader` 接受 `workSwitcher` prop，渲染在 header 右側
- `App` 把 `<WorkSwitcher>` 作為 JSX prop 傳入
- 不再擋住底下的文字內容

#### 18-E-3 Editor 去耦合

- `EditorView` `activeChar` 從 `"lohengrin"` 改為 `() => CHARACTERS[0]?.id || ""`
- `addBlock` dialogue template `speakerId` 從 `"lohengrin"` 改為 `CHARACTERS[0]?.id || ""`

#### 18-E-4 Delete work 修正

`deleteCurrentWork` 清 localStorage 的 key 從錯誤的 `archive_write_draft_${id}` / `archive_write_history_${id}` 修正為 `sw_write_draft_v1_${id}` / `sw_slot_locks_v1_${id}`

#### 18-E-5 SEED 通用化

WriteTab SEED 從 Lohengrin 角色名（天鵝騎士/傳令官/艾爾莎）改為通用範例（角色A/角色B/旁白）。

#### 18-E-6 說明更新

info dialog 從 "Archive Script Editor" 改為 "劇本工房"，加入 slot 用法說明。

### 檔案變更

| 檔案 | Round 1 | Round 2 |
|------|---------|---------|
| `modules/script-editor/src/App.jsx` | 新增 custom work 系統 + AI panel + WorkSwitcher + search filter | SwHeader workSwitcher prop + Editor 去耦合 + delete key 修正 + inline switcher |
| `modules/script-editor/src/components/WriteTab.jsx` | per-work draft/locks key + workId prop | Slots v2 全面重寫 + SEED 通用化 |
| `dist/script-editor/` | 重建 | 重建 |

### 數字總覽

| 項目 | 數量 |
|------|------|
| Commit | 2（`a31e242` + `fe1eb02`） |
| 修改檔案 | 2 source + 2 dist |
| Vite build 產物 | 37 modules / 309 KB JS / gzip 91 KB |

### 已知遺留

- `SCENE_SUBTITLES`（App.jsx line 19-30）仍硬編碼 Lohengrin 場景名
- 角色管理 UI 尚未實作（新增/編輯/刪除角色）
- 草稿歷史/存檔系統尚未實作
- 關係圖為唯讀，無編輯功能
- JSONL 匯入不會自動建立 custom work

---

## 2026-05-19：Phase 17 v2 Script Editor — Archive-host merge 完成

### 背景：方向反轉

前一波 Phase 17 嘗試（branch `feature/akasha-4tab-attempt`、PR #2）把 Archive 獨立版 React 程式碼整套**改寫成 Vanilla JS** 塞進 Akasha 內嵌版，產出 5,279 行新增程式碼，merge 進 master 後又被 revert（commit `b51a0c4`）。

本次方向反過來：**讓 Archive 當主機，把 Akasha 速寫器移植進去**。技術棧改 Vite + React build（不再用 React CDN + Babel Standalone），與既有 spreadsheet 模組同一個部署模式。

### 分支 / 起點

- Branch: `feature/archive-host-merge`（從 `master@b51a0c4` 開新）
- 對應 task: v2-1 ~ v2-9

### v2-1 搬檔 + Vite 設定

新檔：
- `vite.config.script-editor.js` — root=`modules/script-editor`、outDir=`../../dist/script-editor`
- `modules/script-editor/index.html` — 改寫為 Vite entry（移除 CDN + Babel scripts）
- `modules/script-editor/tokens.css` — 從 Archive 搬入
- `modules/script-editor/src/App.jsx` — 從 Archive `uiux/app.jsx` 改造（3 處：加 `import React`、`DATA_BASE` 改為 `./data`、底部 mount 改為 `export default`）
- `modules/script-editor/src/main.jsx` — Vite 掛載入口（`loadAllData → ReactDOM.createRoot`）
- `modules/script-editor/public/data/` — 從 `-Archive_Script_Editor-/data/` 搬入 8 個 JSON/JSONL
- `modules/script-editor/legacy/index.legacy.html` — Phase 8 Vanilla 版備份（1829 行保留）

`package.json`：加 `dev:script-editor`、`build:script-editor`、`build:spreadsheet`，主 `build` 串接兩個 Vite build；`test` 多檢查 `dist/script-editor/index.html`。

Build 結果：32 modules / 261 KB JS / gzip 78 KB / 892ms。Archive 3-TAB（Search / Editor / Reader）原樣跑起，Lohengrin 47 blocks 載入正常。

### v2-2 SwHeader 加第 4 個 TAB

`SwHeader` tabs 陣列加 `{ id: "write", tc: "速寫", en: "Write", ic: "quill" }` 在最前；`App.useState("write")` 改成預設；routing 加 `{tab === "write" && <WriteTab />}`。新建 `src/components/WriteTab.jsx` 為純 placeholder（120 行）。

### v2-3 WriteTab textarea + Plain Script parser + 預覽

新檔 `src/lib/parser.js`（145 行）：
- `parsePlainScript(text)` — `#cmd：value` / `旁白：x` / `Speaker：x` / `// 註解` regex
- `blocksToPlainScript(blocks, characters?)` — round-trip 反向
- `computeStats(blocks)` — 類型計數 / 角色排名 / 字數
- `getLineCol(text, idx)` — 游標位置 → Ln/Col

WriteTab 改為 grid 三欄佈局：textarea（左 1fr）+ preview pane（右 360px）。Preview 切分 Blocks / Stats / Layout 三個子 tab。textarea 範例 seed + localStorage `sw_write_draft_v1`（500ms debounce）。底部 status bar 顯示 Ln/Col、格式、blocks 計數、Auto-save。

### v2-4 Alt+N 快捷鍵 + slot badges

WriteTab 加 `dynamicSlots` useMemo 從 parsedBlocks 抽 unique speakers（最多 7 位）填入 slot 3-9；slot 1 固定 `#scene`、slot 2 固定 `旁白`。

`insertSpeakerPrefix(slotN)` — 智能插入/取代：偵測當前行既有前綴（`#cmd：` 或 `Speaker：`）有則取代、沒則前置；游標跳到「：」之後。

`onKeyDown` 監聽 `Alt+1` ~ `Alt+9` + `preventDefault`。Grid 多加一列放 SlotBadge 9 個按鈕（可點擊插入）。

### v2-5 Voice TTS（Web Speech API）

新檔 `src/hooks/useVoiceTTS.js`（167 行）— React hook 包裝 `speechSynthesis`：
- `hasTTS` 偵測支援
- `voices` 系統語音清單（含 `voiceschanged` 事件）
- `settings` voiceId / rate / pitch / includeNarration（localStorage `sw_voice_settings_v1`）
- `state` speaking / queueActive / queueIdx / queueTotal / currentText
- `speakOne(text)` 單句
- `playQueue(blocks)` 序列 await onend
- `stop()` cancel + reset

WriteTab：
- preview tabs 加 `voice`
- BlockCard 每個 dialogue / narration 加 `▶/■` 試聽按鈕（speaking 中閃爍）
- 新組件 `VoicePanel` — 控制列 + 設定（系統語音下拉、速度滑桿、音調滑桿、包含旁白勾選）+ Queue 清單
- Status bar 顯示 `▶ Voice X/Y`（隊列）或 `▶ Speaking`（單句）

### v2-6 BGM 占位 + tsuki-synth 整合計畫（改弦更張）

讀過 sibling project `tsuki-synth/` 的 README + ROADMAP 後決定 **不在這裡寫 Web Audio 合成**，原因：
- tsuki-synth 已用 C++/JUCE 做完整物理建模（弦 / 梁 / 板 modal synthesis）
- VST3 + Standalone build 已通過（tag `playable-vst3-clean-build-v0`）
- 兩處實作會音色不一致、雙倍維護
- 瀏覽器 DSP 精度不如 C++

新檔 `src/components/BgmPanel.jsx`（218 行）— 占位面板：
- 「Soundscape · Deferred」狀態頭部
- Cues in Script：即時掃 `#bgm:` / `#sfx:` 偵測，比對 sound library，標 ✓ 或 ⚠
- Planned Library：tsuki-synth `sound_names.json` 的 8 個 sound 快照
- Integration Roadmap：Phase A → E
- Why not Web Audio here：設計決策註腳

新檔 `docs/tsuki-synth-integration.md`（165 行）— 完整整合計畫：兩專案角色分工、cue 語法約定、Phase A-E 詳細路徑、阻塞點（tsuki-synth CLI render 待修）。

WriteTab：preview tabs 加 `bgm`，import + route。

### v2-7 跨 TAB 同步（Write ↔ Editor/Reader）

單一 source of truth = App 的 `blocks` state。Write 通過雙 useEffect 做 ↔ 同步：

**Forward**：textarea → useMemo parsedBlocks → debounce 350ms → `setBlocks(parsedBlocks)`
**Reverse**：blocks 變動 → `blocksToPlainScript(blocks, characters)` → `setContent`

兩道 loop guard：
- `syncTokenRef`：自己 push 造成 blocks 變動 → reverse useEffect 偵測 token>0 → 消化跳過
- `lastReverseRef`：reverse 設進來的 content 不要再 forward echo（避免 round-trip 元數據遺失反過來覆寫 Editor）

Parser 升級：產出時補 Reader/Editor 需要的欄位（`speakerId`、`zh`、`original`、`avg`），`#scene:` 特殊處理為真 scene block。`blocksToPlainScript` 接受 optional `characters[]`，把 `speakerId='lohengrin'` 映射回中文「國王海因里希」顯示名。

Status bar 多顯示同步狀態（`↻ Sync→` / `← Pulled from Editor` / `⇄ Synced`）。

驗證：初始 mount 從 Lohengrin 47 blocks 反向產出 textarea；新增段落 → 切 Reader 立刻看見；切回 Write 內容保留無 loop。

**已知 trade-off**：
- forward push 後 Lohengrin 的 original 德文 / tags / avg 元數據遺失（未來可加 detach 模式）
- 註解行 `// xxx` 在 reverse sync 時消失

### v2-8 App Shell 整合 + build.js 修正

`scripts/build.js`：
- `ALWAYS_EXCLUDE_DIRS` 加 `modules/script-editor`（與 spreadsheet 並列為 Vite source）
- `ALWAYS_EXCLUDE_FILES` 加 `vite.config.script-editor.js`
- `critical[]` 把 `modules/script-editor/index.html` 改為 `dist/script-editor/index.html`

`sw.js`：
- `CACHE_NAME` v4 → v5
- 移除 `./modules/script-editor/index.html`
- 「Built Vite modules」區塊新增 `./dist/script-editor/index.html`

App Shell `index.html` line 1949（v2-1 已先改）：`modules/script-editor/index.html` → `dist/script-editor/index.html`

驗證：`npm test` + `npm run build:public` 全過；`_site/dist/script-editor/` 完整、`_site/modules/script-editor/` 不存在；http-server 開 App Shell 點 Script Editor → iframe 載入 dist 版 → 4-TAB + 47 blocks 正常。

### 檔案結構終態

```
akasha-library/
├── vite.config.script-editor.js              🆕
├── docs/
│   └── tsuki-synth-integration.md            🆕
├── modules/script-editor/                    ← Vite source，build.js 排除
│   ├── index.html                            ✏️ Vite entry
│   ├── tokens.css                            🆕
│   ├── legacy/index.legacy.html              🆕 Phase 8 備份
│   ├── public/data/                          🆕 8 個 JSON/JSONL
│   └── src/
│       ├── App.jsx                           ✏️ from Archive
│       ├── main.jsx                          🆕
│       ├── components/
│       │   ├── WriteTab.jsx                  🆕
│       │   └── BgmPanel.jsx                  🆕
│       ├── hooks/
│       │   └── useVoiceTTS.js                🆕
│       └── lib/
│           └── parser.js                     🆕
└── dist/script-editor/                       🆕 build 產出
    ├── index.html (3.8 KB)
    ├── assets/index-*.js (294 KB / gzip 86 KB)
    └── data/
```

### 數字總覽

| 項目 | 數量 |
|------|------|
| 新增檔案 | 11 |
| 修改檔案 | 6（App.jsx、scripts/build.js、sw.js、package.json、akasha-library/index.html、ROADMAP/TODO/README/DEVELOPMENT/dev-log）|
| Vite build 產物 | 36 modules / 294 KB JS / gzip 86 KB |
| build 時間 | ~700ms |
| 對照前次 revert 之嘗試 | 5,279 行 Vanilla 重寫 → 本次 ~1,500 行（保留 React 不重寫業務邏輯）|

### 設計決策摘要

1. **Archive React 不重寫**：保留原 3,844 行 jsx 完整邏輯（力導向關係圖、音效庫、劇本檢查、初稿生成等 overlay 全保留）
2. **Vite + React build**：與 spreadsheet 同部署模式；GitHub Pages 部署只要靜態檔案
3. **BGM/SFX 委派 tsuki-synth**：不重複合成器；等 CLI render 修好後預渲染 WAV 接入
4. **Write 為第 4 TAB 且預設**：使用者打開即進入寫作模式
5. **單 blocks state + 雙 useEffect 同步**：簡單可靠，loop guard 兩道


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
