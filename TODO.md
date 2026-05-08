# 阿卡夏圖書館 — TODO

> Enhancement Phase 1–6 已全部完成，下一步：Phase 7+
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
- [ ] Table Forge 實作（無側欄，待新增 HINTS 面板）

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

---

## 待做（追加規格 · Phase 8–16）

- Phase 8：Script Editor MVP（Plain Script → blocks → .ks / AVG JSON / PDF）— 依賴 Phase 7 ✅
- Phase 9：Table Forge 文字抽取強化（Markdown 章節表 / 大綱 / 回寫 diff）— 依賴 Phase 7
- Phase 10：Memory System（session / room summary / 零韻手札）
- Phase 11：Notion Connector（雲端索引 + 可讀備份）
- Phase 12：Security Layer（資料分級 / IndexedDB 加密 / 版本標記）
- Phase 13：Document Bridge（DOCX 匯入匯出）
- Phase 14：Voice / BGM Prototype（Rein-Voice + TsukiSynth）
- Phase 15：Private Reading Room + 每日館報 — 依賴 Phase 10 + 14
- Phase 16：Export Core + 部署切分
