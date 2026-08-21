# Akasha Library 交接事項（2026-07-02）

> 本檔每次重大進度後更新；歷史交接與逐項細節見 `dev-log.md`。

## 目前狀態

**Branch:** `master`（最新 `2b38357` Codex S1 修復 + Editor 完整性；工作樹乾淨，遠端僅剩 `master`）
**Build / 測試:** `npm test`（= vite build ×2 → `scripts/sync-sw.js` 自動同步 sw.js → SW-INTEGRITY 缺檔檢查 → 關鍵檔存在檢查）
**本地伺服器:** `npx http-server . -p 3460 -c-1`
**測試 URL:** `http://127.0.0.1:3460/dist/script-editor/index.html`
**線上:** Cloudflare Pages 自動部署 / GitHub Pages（`_site/` via `npm run build:public`）

---

## 2026-07-02 Codex S1 修復 + Editor block 完整性（`2b38357`）

| 項目 | 內容 | 檔案 |
|------|------|------|
| S1-1 | OCR note postMessage schema 對齊 Shell receiver | `modules/pdf-reader/index.html` |
| S1-2 | crop-screenshot 圖片預覽面板（不再文字解碼） | `index.html`（Shell） |
| Editor | Command block 編輯 UI（command + value 欄位） | `modules/script-editor/src/App.jsx` |
| Editor | Block 上移/下移排序按鈕 | `modules/script-editor/src/App.jsx` |
| Editor | Choice 路徑驗證（缺跳轉 + 不存在場次） | `modules/script-editor/src/App.jsx` |

---

## 2026-06-13 解凍修復批次（Dynamic Workflow，已併入 master · PR #5）

Codex 全量健檢 → Opus 二度評估（抓到 2 處不準：SW 快取項當下其實一致、tsuki-synth「已解阻塞」無證據）→ Dynamic Workflow 逐項修復。詳見 `dev-log.md` 同日條目。

| 項目 | 內容 | 檔案 |
|------|------|------|
| 活躍 S0 | choice 選項含「/」資料遺失 → escape `\/` | `modules/script-editor/src/lib/parser.js` |
| 活躍 S2 | 刪作品殘留 `edges_${workId}` → 補清除 | `modules/script-editor/src/App.jsx` |
| 解凍 A | Reader→Table Forge 無損化 | `modules/table-forge/parsers.js` |
| 解凍 B | SW precache 自動化 + SW-INTEGRITY 進 npm test | `scripts/sync-sw.js`、`package.json`、`scripts/build.js` |
| 解凍 C | 月幣未部署提示 | `modules/ai-settings/index.html` |
| 解凍 D | Vite 5→8（audit 0） | `package.json` |

**SW 快取**：版號改為全資產內容雜湊，由 `scripts/sync-sw.js` 自動產生（不再手寫 v 號）。改任何 precache 檔後跑 `npm run build` 或 `node scripts/sync-sw.js` 即自動 bump；`npm test` 會在 precache 指向缺檔時失敗。

---

## 待處理

### 跨專案阻塞（狀態未驗證）
- **tsuki-synth v3 音訊整合**：`ZeroRhyme.generateScore` / `renderScore` 仍是空殼；文件記載的 CLI 阻塞（`ScoreRenderer.h` API mismatch）**未經本 repo 驗證**，動工前須回 tsuki-synth repo 取證。見 `docs/tsuki-synth-integration.md`。

### 部署設定（需月月提供，不進 repo）
- **月幣模式**：`core/config.js` 的 `API_BASE` 仍為 placeholder；啟用需設定 Cloudflare Worker secrets + KV + 正式 `__AKASHA_API_BASE`。未設定時 UI 已顯示「尚未部署」提示（2026-06-13 加）。
- **OAuth**：`GOOGLE_CLIENT_ID` 仍為 placeholder。

---

## 關鍵技術備忘

- **混合架構**：App Shell 與多數模組為無框架 HTML/CSS/JS；**Script Editor + Spreadsheet 為 Vite + React**（自 2026-06-13 起 Vite 8 / rolldown 引擎），經 iframe 嵌入，輸出 `dist/<module>/`。
- **per-work localStorage key（刪作品須對稱清除，共 10 個）**：`blocks_` / `notes_` / `characters_` / `sw_write_draft_v1_`(+`__novel` / `__notes`) / `sw_write_mode_v1_` / `sw_slot_locks_v1_` / `sw_history_v1_`(經 clearHistory) / `edges_`。
- **choice 純文字格式**：option label 內 `/` 以 `\/` 逃脫（`escapeChoiceOption` / `splitChoiceOptions`），避免與選項分隔符衝突丟跳轉。
