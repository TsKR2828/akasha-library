# Akasha Library 交接事項（2026-06-02）

## 目前狀態

**Branch:** `master`  
**本地伺服器:** `npx http-server . -p 3460 -c-1`（若需測試）  
**Build 指令:** `npm test`（= vite build + file checks）  
**測試 URL:** `http://127.0.0.1:3460/dist/script-editor/index.html`  
**線上 URL:** Cloudflare Pages 自動部署

---

## 已完成（本次 session，2026-06-02）

| 項目 | 狀態 |
|------|------|
| Codex 審查 P2: export-core `b.text` → `blockText(b)` 支援 zh/original | ✅ |
| Codex 審查 P2: App.jsx 8 處 replacement character 亂碼修復 | ✅ |
| Codex 審查 P2: translation-core 全形冒號 `：` regex 支援 | ✅ |
| Codex 審查 P3: iframe sandbox `allow-clipboard-write` → permission policy | ✅ |
| 草稿歷史 / 回溯（`sw_history_v1_${workId}`，15 筆 FIFO） | ✅ |
| Worker RAG 實作：embed proxy（BYOK+Coin）+ BM25 query | ✅ |
| 前端 embedding coin-mode fallback（`embedViaProxy()`） | ✅ |

## 先前完成（Phase 18）

| 項目 | commit |
|------|--------|
| 搜尋 narration/scene filter | `a31e242` |
| Persona Slots v2（全 9 格可指派） | `fe1eb02` |
| 多作品支援（custom work CRUD） | `a31e242` |
| AI 輔助面板（postMessage bridge） | `a31e242` |
| WorkSwitcher inline（不再擋內容） | `fe1eb02` |
| Editor/addBlock 去耦合 "lohengrin" | `fe1eb02` |
| Delete work 正確 localStorage key | `fe1eb02` |
| SEED 通用化 | `fe1eb02` |

---

## 待處理

### 高優先

1. **SCENE_SUBTITLES 硬編碼**  
   `App.jsx` line 19-30，Lohengrin 場景名寫死在全域常數。  
   修法：改為 per-work 或從 data JSON 讀取，custom work 不顯示。

2. **JSONL 匯入即建作品**  
   現在匯入 JSONL 不會自動建立 custom work metadata，blocks 掛在當前作品下。

3. **Write 多模式（小說/劇本/筆記）+ H1~H4 大綱面板**  
   Phase A 規劃已完成（見先前 session），尚未開工。

### 中優先

4. **TsukiSynth WAV pipeline**  
   `ZeroRhyme.generateScore` / `renderScore` 仍是空殼。  
   需等 tsuki-synth CLI render 修好。

5. **`getWorkId()` 一致性**  
   仍用 `WORKS[0]?.id`，與 App 的 `currentWork` state 可能 desync。  
   長期應改為 React context 或統一從 `sw_last_work` 讀。

### 低優先

6. **SW cache 版號** — `akasha-library-v4-public` 固定，應隨 build 自動 bump
7. **GERMAN_ACT_NUMS** — 硬編碼歌劇幕號格式，非通用

---

## 關鍵技術備忘

### 全域可變狀態（陷阱）

```javascript
// App.jsx 頂層，非 React state，多處直接讀取
let WORKS = [];        // loadWorkIndex() 填入
let CHARACTERS = [];   // loadAllData() 填入，或 populateCharsFromBlocks() 補
let SCRIPT = [];       // 原始 server script blocks
let CHAR_COLORS = {};  // speakerId → HSL color
let WORK_INDEX = [];   // WORKS alias
```

改這些變數時要注意：很多 component 直接讀全域而非 props。`RelationshipGraph` 已改為接受 `characters` prop，其他尚未。

### Custom Work 流程

```
新增 → NewWorkModal → saveCustomWorks() → switchWork(newId)
      → loadAllData(newId) 早期返回 → CHARACTERS=[] SCRIPT=[]
      → 使用者在 WriteTab 打字 → parsePlainScript → setBlocks
      → populateCharsFromBlocks(blocks) → 填 CHARACTERS + CHAR_COLORS
```

### Persona Slots 機制

```
slotLabels 優先順序：
1. locks[n] 有值且非 "__clear__" → 使用者指派（最高）
2. locks[n] === "__clear__" → 明確清空（顯示 null）
3. n===1 → "#scene"（預設）
4. n===2 → "旁白"（預設）
5. n>=3 → dynamicSlots[n-3]（從 blocks 抽取的角色）
```

### AI 面板通訊

```
iframe 內 → postMessage({ type: "akasha-reading-room-send", payload: { message, context } })
parent    → 呼叫 LLM → postMessage({ type: "akasha-reading-room-response", payload: { text } })
```

非 iframe 環境（直接開 dist/script-editor/）顯示「請從阿卡夏圖書館主頁面開啟」。

### Chrome 測試注意

Script Editor 頁面會讓 Chrome extension `document_idle` timeout。  
驗證時用 `javascript_tool` 而非 screenshot/find。

---

## 檔案位置速查

| 用途 | 路徑 |
|------|------|
| 主邏輯（~4200 行） | `modules/script-editor/src/App.jsx` |
| 速寫 Tab | `modules/script-editor/src/components/WriteTab.jsx` |
| Vite 入口 | `modules/script-editor/src/main.jsx` |
| Parser | `modules/script-editor/src/lib/parser.js` |
| Voice hook | `modules/script-editor/src/hooks/useVoiceTTS.js` |
| Characters hook | `modules/script-editor/src/hooks/useCharactersOfWork.js` |
| BGM 占位 | `modules/script-editor/src/components/BgmPanel.jsx` |
| Vite config | `vite.config.script-editor.js` |
| Build 產出 | `dist/script-editor/` |
| Lohengrin data | `modules/script-editor/public/data/` |
