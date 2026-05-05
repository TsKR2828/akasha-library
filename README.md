# 阿卡夏圖書館 Akasha Library

通用 MD / Excel / PDF 線上雲端編輯書庫。
支援文件切割、Google Drive 同步、離線使用，可匯出 PDF / Excel / Markdown。

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

## 四大模組

| 模組 | 功能 | 輸入 | 輸出 |
|------|------|------|------|
| Markdown 編輯器 | 撰寫 / 預覽 / 同步 Sheets | .md, 手打 | .md, HTML, Google Sheets |
| PDF 閱讀器 | 閱讀 / 頁面切割 / 書庫管理 | .pdf | 切割後 .pdf |
| 試算表編輯器 | 本地 Excel 編輯（免買 Office）| .xlsx | .xlsx |
| 書籍排版器 | 視覺化書頁排版 | 文字 + 圖片 | .pdf, .html, .book |

## 技術棧

- **前端**：純 HTML/CSS/JS（MD/PDF/Book）+ React（試算表）
- **打包**：Vite（僅試算表模組需要）
- **PDF**：pdf.js（閱讀）+ pdf-lib（切割/匯出）
- **Excel**：SheetJS (xlsx)
- **儲存**：IndexedDB（本地快取）+ Google Drive API（雲端同步）
- **部署**：GitHub Pages + PWA
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
# 安裝依賴（僅試算表模組需要）
npm install

# 開發伺服器
npm run dev

# 建置靜態檔案
npm run build
```

## 授權

MIT
