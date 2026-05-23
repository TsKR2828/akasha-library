# Script Editor 交接事項（2026-05-23）

## 目前狀態

**Branch:** `master`  
**最新 commit:** `fe1eb02` — 已 push，Cloudflare Pages 自動部署中  
**本地伺服器:** `npx http-server . -p 3462 -c-1`（若需測試）  
**Build 指令:** `npx vite build --config vite.config.script-editor.js`  
**測試 URL:** `http://127.0.0.1:3462/dist/script-editor/index.html`  
**線上 URL:** Cloudflare Pages（月月正在 io 上審核 Round 2）

---

## 已完成（Phase 18，本次 session）

| 項目 | commit | 狀態 |
|------|--------|------|
| 搜尋 narration/scene filter | `a31e242` | ✅ |
| Persona Slots v2（全 9 格可指派） | `fe1eb02` | ✅ |
| 多作品支援（custom work CRUD） | `a31e242` | ✅ |
| AI 輔助面板（postMessage bridge） | `a31e242` | ✅ |
| WorkSwitcher inline（不再擋內容） | `fe1eb02` | ✅ |
| Editor/addBlock 去耦合 "lohengrin" | `fe1eb02` | ✅ |
| Delete work 正確 localStorage key | `fe1eb02` | ✅ |
| SEED 通用化 | `fe1eb02` | ✅ |

---

## 待處理（Phase 19，月月審後決定優先順序）

### 高優先

1. **SCENE_SUBTITLES 硬編碼**  
   `App.jsx` line 19-30，Lohengrin 場景名寫死在全域常數。  
   修法：改為 per-work 或從 data JSON 讀取，custom work 不顯示。

2. **角色管理 UI**  
   月月回饋「我也不能新增或刪除修改角色」。  
   目前角色只能從 server data 載入或 `populateCharsFromBlocks()` 自動抽取。  
   需要：角色 CRUD modal（name / nameEn / voice / role / tags）+ 存入 localStorage。

3. **草稿歷史/存檔系統**  
   月月回饋「沒有存檔草稿跟歷史紀錄」。  
   目前 WriteTab 只有 auto-save 到 `sw_write_draft_v1_${workId}`，無版本回溯。  
   建議：localStorage 存最近 N 筆 snapshot（timestamp + content 前 50 字預覽）。

### 中優先

4. **關係圖編輯**  
   `RelationshipGraph` 目前只讀顯示。需加 add/edit/save relations 功能。

5. **JSONL 匯入即建作品**  
   現在匯入 JSONL 不會自動建立 custom work metadata，blocks 掛在當前作品下。

6. **`getWorkId()` 一致性**  
   仍用 `WORKS[0]?.id`，與 App 的 `currentWork` state 可能 desync。  
   長期應改為 React context 或統一從 `sw_last_work` 讀。

### 低優先

7. **SW cache 版號** — `akasha-library-v4-public` 固定，應隨 build 自動 bump
8. **GERMAN_ACT_NUMS** — 硬編碼歌劇幕號格式，非通用

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
