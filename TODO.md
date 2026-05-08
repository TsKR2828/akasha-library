# 阿卡夏圖書館 — TODO

> Phase 1：App Shell 基礎重構
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

## 待做

- Phase 2：PDF Reader 補強（書籤 / 切割 / 截圖框選 / OCR）
- Phase 3：零韻面板（UI 抽出 / Context 切換 / 人設 / 對話 / 計費）
- Phase 4：Code & Data 整合（零韻接入 / 自動偵測表格）
- Phase 5：Table Forge 整合（零韻接入 / Script Editor 橋）
- Phase 6：Script Editor 接口 + 版權邊界
