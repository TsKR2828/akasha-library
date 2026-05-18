# 阿卡夏圖書館 Akasha Library

通用文件雲端閱讀書庫。
支援 Markdown / PDF / 程式碼 / 資料表閱讀編輯，Google Drive 同步、離線使用、AI 閱讀助手。

## 概念

```
┌─────────────────────────────────────────┐
│           阿卡夏圖書館 (APP Shell)        │
├───────────────┬─────────────────────────┤
│  個人書庫      │  公共書庫（同樂會）       │
│  OAuth 登入   │  無需登入               │
│  存自己 Drive  │  讀公開連結              │
│  可編輯/切割   │  唯讀閱讀               │
└───────────────┴─────────────────────────┘
```

## 主要模組

| 模組 | 別名 | 功能 | 支援格式 |
|------|------|------|----------|
| Code & Data Reader | Manuscripta | 多格式閱讀 / 編輯 / 搜尋 / 匯出摘要 / Sheets 匯出 / DOCX 匯入匯出 / 劇本偵測匯出 / Python 風險掃描 / TsukiSynth Score 儀表板 | .md .txt .py .json .score.json .docx .doc .blocks.jsonl |
| PDF 閱讀器 | Lectorium | 翻頁閱讀 / 書籤 / 自訂切割 / 截圖框選 / AI 圖書館員（RAG 伴讀） | .pdf |
| Table Forge | Tabularium | Canvas 表格編輯 / 公式引擎 / 多格式互通匯入匯出 | .csv .tsv（可從 Code & Data 接收 MD / JSON） |
| **Script Editor** | **Scriptorium** | **4-TAB：速寫 / 編輯 / 搜尋 / 閱讀 · Voice TTS · BGM 4 preset · TAG 5 類 · AVG 立繪面板 · 角色關係圖 · 格式檢查 · 初稿生成** | **.txt .md .blocks.jsonl .ks .json** |
| 書籍排版器 | Bibliopegia | 視覺化書頁排版 / 封面設計 / 匯出 | .pdf .html |
| 談心專區 | Reading Room | 聊天式 AI 對話 / 零韻手札（記憶 CRUD）/ Notion 同步 | — |
| 每日館報 | Daily Report | 文字輸入 → AI 整理結構化日報 / 朗讀 + BGM | — |
| AI 設定 | Aetherium | API Key 管理（BYOK）/ 模型選擇 / 月幣系統 | — |

### Code & Data Reader 詳細功能

- **多格式閱讀**：Markdown 預覽、Pretty JSON + 樹狀 JSON、Python 語法高亮 + 結構摘要、TsukiSynth Score 專用儀表板、純文字閱讀
- **編輯模式**：md / txt / json 可直接編輯，JSON 下載前自動驗證格式
- **搜尋**：全文關鍵字搜尋，高亮標示於所有視圖
- **複製匯出**：複製原始內容 / 複製目前視圖 / 下載檔案 / 匯出結構化摘要 .md
- **Sheets 匯出**：複製 HTML (WordPress) / 純表格 TSV / 格式化貼上 / 開新 Google Sheet
- **跨模組**：一鍵送到 Table Forge、自動偵測表格結構（MD table / JSON array）
- **安全檢查**：Python 風險掃描（刪檔 / 連網 / 系統指令 / 金鑰讀取）、JSON 格式驗證（錯誤定位到行列）

### Table Forge 架構

```
modules/table-forge/
  index.html        # 頁面骨架 + Canvas 渲染
  table-model.js    # 80x50 grid + 公式引擎 (SUM/AVG/COUNT/MIN/MAX/IF)
  parsers.js        # CSV / TSV 解析（逐字元 FSM，處理引號 / 換行 edge case）
  table-ui.js       # DOM 渲染 + 滑鼠選取 / 拖曳 / 雙擊編輯
  exporters.js      # CSV 匯出（RFC 4180 compliant）
```

### Script Editor 架構（Phase 17 4-TAB 整合）

```
modules/script-editor/
  index.html         # 4-TAB shell + CSS + tab 切換 + PostMessage
  data-model.js      # AppState + Bus + 5 解析器 + validate + IndexedDB 角色 CRUD + ShortcutManager
  write-tab.js       # 速寫 TAB（Voice TTS / BGM preset / 角色 slot badge + 右鍵指派）
  editor-tab.js      # 編輯 TAB（6 種 BlockCard / TAG inline adder / AVG 面板 / JSON preview）
  search-tab.js      # 搜尋 TAB（6 篩選器 / 結果卡片 / MD/CSV 匯出 / 跳轉 Editor）
  reader-tab.js      # 閱讀 TAB（連續排版 / 場景 TOC / IntersectionObserver / Print PDF）
  overlays.js        # 5 overlay：Table Forge / 角色關係圖 / 音效庫 / 格式檢查 / 初稿生成
```

**4-TAB**：
- **速寫 Write**：textarea 即時解析 → blocks · Alt+1~9 快捷鍵插入（場景 / 旁白 / 角色）· Voice TTS 5 個 sub-panel
- **編輯 Editor**：區塊卡片 CRUD · 6 種 type · TAG 連續新增 · AVG sprite/position/BGM/SFX · JSON 預覽
- **搜尋 Search**：6 篩選器（關鍵字 / 角色 / 劇情 TAG / 情緒 TAG / 類型 / 排序）· 點結果跳 Editor + 金色光圈
- **閱讀 Reader**：場景分組 · TOC IntersectionObserver · choice 互動跳轉 · `window.print` PDF

**5 Overlay**（header 工具 dropdown）：Table Forge / 角色關係圖 / 音效庫 / 格式檢查（15+ 規則）/ 初稿生成（5 模板）

**支援 import 格式**：Plain Script / blocks.jsonl / AVG JSON / TyranoScript .ks / Markdown

### PDF 閱讀器功能

- **書籤**：新增 / 列表 / 跳頁 / 刪除，IndexedDB 持久化
- **自訂切割**：頁碼網格勾選 → pdf-lib 合併 → 下載或存書庫
- **截圖框選**：Canvas 拖拉選取 → PNG 存書庫
- **OCR 文字摘錄**：單頁 OCR + 版權鎖定面板 + 月幣計費

### AI 圖書館員 — 月上零韻

- **App Shell 面板**：「召喚圖書館員」按鈕開啟右側面板，角色立繪 + 對話框 + 打字機效果
- **PDF RAG 問答**：BM25 + Dense Embedding 雙層檢索，支援 OpenAI / Anthropic / Google / Custom API
- **跨模組 Context**：切換模組時自動切換角色（圖書館員 / 手稿解讀員 / 資料檢查員），LLM 對話已接入
- **人設管理**：`persona.md` 外部化 + 場景動態注入
- **對話紀錄**：每模組獨立對話，統一存書庫（IndexedDB）
- **預寫回應**：常見問答 JSON 優先匹配，免打 API
- **計費系統**：月幣統一計費 + BYOK + token 預估 + App Shell token bar 同步
- **版權邊界**：copyrightProtected 欄位 + 鎖定圖示 + 開啟攔截

## 技術棧

- **前端**：純 HTML / CSS / JS（全模組，無框架）
- **PDF**：pdf.js（閱讀）+ pdf-lib（切割 / 匯出）
- **AI**：BM25 + Dense Embedding 雙層 RAG，支援多家 LLM API
- **儲存**：IndexedDB（本地快取）+ Google Drive API（雲端同步）
- **部署**：GitHub Pages + PWA（Service Worker 離線）
- **OAuth**：Google `drive.file` scope（僅存取 APP 建立的檔案）

## Google Drive 設計

- 每個使用者登入自己的 Google 帳號 → 書存在自己的 Drive
- APP 使用 `drive.file` scope → 看不到使用者的其他檔案
- 公共書庫使用管理員公開分享連結 → 讀者不需登入
- 索引：本地 IndexedDB 快取 + Drive 上備份 JSON

## UI / 設計師協作

本專案的 UI 設計為「可替換」架構，開發階段使用佔位樣式，之後可由設計師整體替換而不動邏輯。

**前端分層原則：**

```
結構層 (HTML)  — 語意化標籤 + BEM-like class 命名，描述功能不描述外觀
樣式層 (CSS)   — 所有視覺設定集中在 CSS 變數，可整份抽換
圖示層 (Icons) — 開發階段用 emoji/Unicode 佔位，之後換 SVG 或 icon font
動效層 (Anim)  — 預留 class hook，開發階段不做動畫，設計師自行加入
```

**設計師接手時只需要：**

1. 修改 `assets/styles/shared.css` 的 CSS 變數（色票、字型、圓角、間距）
2. 替換 `icons/` 資料夾的圖示檔案
3. 各模組的 `<style>` 區塊可覆蓋或抽出為獨立 CSS 檔
4. 不需要動任何 JS 邏輯或 HTML 結構

**CSS 變數集中管理：**

```css
:root {
  --navy: #1E2430;       /* 主背景 */
  --gold: #C9A86A;       /* 強調色 */
  --cream: #F4F0E6;      /* 文字/亮面 */
  --text-primary: ...;
  --text-secondary: ...;
  --radius: 6px;         /* 全域圓角 */
  --font-body: 'Noto Serif TC', serif;
  --font-brand: 'Cormorant Garamond', serif;
}
```

## 部署方式

1. **GitHub Pages**：推上 repo 即自動部署
2. **PWA 安裝**：瀏覽器「加到主畫面」→ 像 APP 一樣使用
3. **未來 APP**：可用 Capacitor / PWABuilder 包成 .apk / .ipa

## 開發 / 建置

```bash
# 安裝依賴
npm install

# 開發伺服器（靜態檔案，無需建置）
npx http-server . -p 3460 -c-1

# 測試（建置 + 關鍵檔案檢查）
npm test
```

## 開發進度

| 階段 | 狀態 |
|------|:----:|
| 基礎書庫 + Drive 同步 + 公共書庫 | ✅ |
| AI 圖書館員（RAG / BYOK / 人設 / 計費） | ✅ 90% |
| Enhancement Phase 1–6（App Shell / PDF / 零韻 / 版權） | ✅ |
| Enhancement Phase 7–13（Translation / Script Editor / Memory / Notion / Security / Document Bridge） | ✅ |
| Enhancement Phase 16（Export Core + 部署：build script / deploy / Worker 後端） | ✅ |
| Enhancement Phase 14（Voice / BGM Prototype — Rein-Voice + TsukiSynth + 館報朗讀 + 伴讀 BGM） | ✅ |
| Enhancement Phase 15（Private Reading Room + 每日館報） | ✅ |
| Phase 17：Script Editor 4-TAB 整合（Archive 合併 → Vanilla JS 4-TAB） | ✅ |

詳見 [ROADMAP.md](ROADMAP.md) 和 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 授權

MIT
