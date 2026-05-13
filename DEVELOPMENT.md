# 阿卡夏圖書館 — 開發進度說明書

## 開發策略

- 能直接跑的先跑完
- 複雜功能（AI 圖書館員）獨立專案開發，最後整合
- 私人測試通過後才 Push 公開
- 架構從一開始就支援私人/公開切換（不需重改）

---

## Phase 1：基礎書庫（純靜態，可離線）

目標：四個模組能用、本地書庫能存、PWA 能裝

| Step | 功能 | 狀態 |
|------|------|------|
| 1.1 | 資料夾結構 + README | ✅ 完成 |
| 1.2 | 統一入口頁（APP Shell + 側欄導覽） | ✅ 完成 |
| 1.3 | Markdown 編輯器模組整合 | ✅ 完成 |
| 1.4 | PDF 閱讀器模組整合 | ✅ 完成 |
| 1.5 | 試算表模組整合（Vite 打包 React） | ✅ 完成 |
| 1.6 | 書籍排版器模組整合 | ✅ 完成 |
| 1.7 | IndexedDB 本地書庫（存檔/索引/最近開啟） | ✅ 完成 |
| 1.8 | PWA 完善（manifest 更新、SW 快取策略） | ✅ 完成 |
| 1.9 | 格式互轉匯出（MD→PDF、Book→PDF、MD→XLSX） | ✅ 完成 |

交付物：本地打開 index.html 就能用的完整書庫 APP

---

## Phase 2：Google Drive 同步

目標：個人檔案存雲端、跨裝置同步

| Step | 功能 | 狀態 |
|------|------|------|
| 2.1 | core/auth.js — OAuth 登入/登出（drive.file scope） | ✅ 完成 |
| 2.2 | core/drive.js — 檔案 CRUD（上傳/下載/列表/刪除） | ✅ 完成 |
| 2.3 | core/sync.js — 本地 ↔ Drive 雙向同步 | ✅ 完成 |
| 2.4 | 書庫索引同步（IndexedDB JSON ↔ Drive JSON） | ✅ 完成 |
| 2.5 | 同��狀態 UI（上傳中/已同步/衝突提示） | ✅ 基礎完成 |
| 2.6 | 離線模式（斷網���用本地，��復後自動同步） | ✅ 完成 |

交付物：登入 Google 後檔案自動備份到 Drive

---

## Phase 3：公共書庫（同樂會）

目標：管理員放公版書，任何人可免登入閱讀

| Step | 功能 | 狀態 |
|------|------|------|
| 3.1 | public-library/catalog.json 書目格式設計 | ✅ 完成 |
| 3.2 | 公共書庫瀏覽 UI（書封、分類、搜尋） | ✅ 完成 |
| 3.3 | 從 Drive 公開連結直接載入 PDF 閱讀 | ✅ 完成 |
| 3.4 | 閱讀進度本地記錄（不需登入） | ✅ 完成 |
| 3.5 | 管理員工具（新增/編輯書目） | ✅ 完成 |

交付物：朋友開網址就能看書，不需登入不需安裝

---

## Phase 4：AI 圖書館員（獨立專案，最後整合）

目標：PDF 閱讀時可叫出 AI 側欄問問題

| Step | 功能 | 狀態 |
|------|------|------|
| 4.1 | 文字擷取層（pdf.js 抽文字 / Tesseract.js OCR） | ✅ 完成 |
| 4.2 | Embedding 索引（本地 transformers.js 或 API） | ✅ BM25 + API 雙層 |
| 4.3 | RAG 檢索（cosine similarity 找相關頁） | ✅ 完成（自動啟用） |
| 4.4 | LLM 對話 proxy（Cloudflare Workers） | ✅ Worker 完成（待部署） |
| 4.5 | 聊天 UI（側邊面板、對話紀錄） | ✅ 完成（含每模組獨立對話紀錄） |
| 4.6 | 月幣系統（餘額、扣款、報價預估） | ✅ 完成（billing.js 統一計費 + token bar） |
| 4.7 | BYOK 模式（使用者自帶 API Key） | ✅ 完成（可直接使用） |
| 4.8 | Persona.md 人設載入 | ✅ 完成（persona.md 外部化 + 動態注入） |
| 4.9 | TTS 語音回覆（接語音資料庫） | ⬜ 待做 |
| 4.10 | AI 形象顯示（立繪/動態） | ✅ 立繪完成（動態待做） |

交付物：讀書時可問 AI、AI 用設定好的人設和聲音回答

---

## Phase 5：上線公開

目標：推 GitHub Pages，開放使用

| Step | 功能 | 狀態 |
|------|------|------|
| 5.1 | OAuth 測試模式加入朋友 email（≤100 人） | ⬜ 待做 |
| 5.2 | 隱私權政策頁 + 應用首頁 | ✅ 完成 |
| 5.3 | GitHub Pages 部署 + 自訂網域（選配） | ✅ 完成 |
| 5.4 | OAuth 正式驗證提交（公開推廣時） | ⬜ 待做 |
| 5.5 | PWABuilder 包 APK（選配） | ⬜ 待做 |

---

## 架構注意事項：私人 → 公開不需重改

以下設計從一開始就避免之後要改架構：

| 問題 | 設計決策 |
|------|----------|
| OAuth Client ID 切換 | 用環境變數 / config.js，部署時換掉就好 |
| 公共書庫開關 | catalog.json 空的 = 不顯示公共書庫，有內容才顯示 |
| AI 功能開關 | 偵測 AI 模組是否存在，不存在就不顯示按鈕 |
| 月幣 vs BYOK | 兩者共存，config 決定預設顯示哪個 |
| 書庫資料隔離 | 個人書庫 = 使用者 Drive，公共 = 管理員公開連結，完全分開 |
| 敏感資訊 | API Key / OAuth secret 永遠不進 repo，走 .env 或 Workers secret |

結論：**從 Phase 1 到 Phase 5 都不需要改架構**，只是逐步加功能。
私人階段跟公開階段的差別只是：
- OAuth 從 Testing → Production
- catalog.json 從空的 → 填入書目
- AI 模組從不存在 → 整合進來

---

## 獨立專案對照

| 獨立專案 | 對應 Phase | 整合點 | 狀態 |
|----------|-----------|--------|:----:|
| `akasha-library`（本專案） | Phase 1-3, 5 + Enhancement 1-6 | — | 進行中 |
| AI 圖書館員 | Phase 4 | 已整合到 App Shell + core/ | ✅ 已整合 |
| 語音資料庫 | Phase 4.9 / Enhancement 14 | 完成後 AI 模組引用音檔 | ⬜ |
| Persona.md | Phase 4.8 | `persona.md` 已在專案根目錄 | ✅ 已整合 |

---

## Enhancement ROADMAP（Phase 1–16）

原始開發 Phase 1–5 之外，另有 Enhancement 規格書展開的 16 Phase 計畫。
詳見 `ROADMAP.md`。

| 階段 | 內容 | 狀態 |
|------|------|:----:|
| Phase 1–6 | App Shell 重構 / PDF 補強 / 零韻面板 / Code&Data / Table Forge / 版權邊界 | ✅ 全部完成 |
| Phase 7 | Translation Core（格式翻譯核心） | ✅ 完成 |
| Phase 8 | Script Editor MVP | ⬜ 待做 |
| Phase 9 | Table Forge 文字抽取強化 | ✅ 完成 |
| Phase 10 | Memory System（零韻記憶） | ✅ 完成 |
| Phase 11 | Notion Connector | ✅ 完成 |
| Phase 12 | Security Layer | ⬜ 待做 |
| Phase 13 | Document Bridge（DOCX 匯入匯出 + 劇本匯出） | ✅ 全部完成 |
| Phase 14 | Voice / BGM Prototype | ⬜ 待做 |
| Phase 15 | Private Reading Room + 每日館報 | ⬜ 待做 |
| Phase 16 | Export Core + 部署 | 🔶 16-A 完成 |

Enhancement Phase 新增的核心模組：

| 檔案 | Phase | 功能 |
|------|:-----:|------|
| `core/persona.js` | 3-C | 人設解析器 + 載入器 |
| `core/chat-history.js` | 3-D | 每模組獨立對話紀錄 |
| `core/prewritten.js` | 3-E | 預寫回應 DB（免 API 匹配） |
| `core/billing.js` | 3-F | 月幣統一計費系統 |
| `persona.md` | 3-C | 外部化人設檔 |
| `core/translation-core.js` | 7 | 格式翻譯核心（Plain Script / MD 抽取 / JSON 偵測） |
| `core/md-extract.js` | 9 | Markdown 章節表 / table inventory / outline / code fences |
| `core/approved-memory.js` | 10-C | 長期記憶（零韻手札）+ IndexedDB |
| `core/room-summary.js` | 10-B | 中期記憶（每模組摘要）+ IndexedDB |
| `core/sync-queue.js` | 11-D | Notion 同步佇列 + 背景同步 |
| `core/document-bridge.js` | 13 | DOCX/DOC 雙向轉換 + 劇本 DOCX/HTML 匯出 |
| `core/export-core.js` | 16-A | 統一匯出引擎（17 converter + exportAs API） |
| `core/export/bridge.js` | 5-B | 跨模組匯出橋接（blocks → table payload） |

---

## UI 替換策略（設計師協作）

本專案開發階段使用佔位 UI（emoji icon、現有色票），完成功能後可整體替換視覺設計。

**分層原則：**

| 層 | 開發階段 | 設計師替換 | 動到 JS？ |
|----|----------|-----------|----------|
| HTML 結構 | 語意標籤 + 功能性 class | 不改 | 否 |
| CSS 變數 | `shared.css` 集中管理色票/字型 | 整份換 | 否 |
| 元件樣式 | 各模組內嵌 `<style>` | 抽出或覆蓋 | 否 |
| 圖示 | emoji / Unicode 佔位 | 換 SVG / icon font | 否 |
| 動畫 | 不做，預留 class hook | 設計師加 CSS transition/animation | 否 |
| 排版 | CSS Grid/Flex，結構不綁死寬度 | 調參數即可 | 否 |

**Class 命名規則：**

```
.ai-panel          — 功能區塊
.ai-panel__header  — 區塊內元素
.ai-panel--hidden  — 狀態修飾
```

描述「這是什麼」而非「這長什麼樣」。避免 `.blue-box`、`.big-text` 等外觀命名。

**設計師交付檢查清單：**

- [ ] `assets/styles/shared.css` — 全域 CSS 變數
- [ ] `icons/` — 全套 SVG 圖示（命名對應現有 emoji 用途）
- [ ] 各模組配色是否與全域變數一致
- [ ] 深色/淺色模式（選配，CSS 變數切換即可）
- [ ] 響應式斷點確認（目前 768px）

---

## 目前進度

```
Phase 1 ████████████████ 100%
Phase 2 ████████████████ 100%
Phase 3 ████████████████ 100%
Phase 4 █████████████░░░  90% (4.1-4.8 完成，剩 TTS + 動態立繪)
Phase 5 █████████░░░░░░░  40% (5.2-5.3 完成)

Enhancement ROADMAP
Phase 1–6  ████████████████ 100% (App Shell / PDF / 零韻 / Code&Data / Table Forge / 版權)
Phase 7    ████████████████ 100% (Translation Core)
Phase 8    ░░░░░░░░░░░░░░░░   0% (Script Editor MVP)
Phase 9    ████████████████ 100% (Table Forge 抽取強化)
Phase 10   ████████████████ 100% (Memory System)
Phase 11   ████████████████ 100% (Notion Connector)
Phase 12   ░░░░░░░░░░░░░░░░   0% (Security Layer)
Phase 13   ████████████████ 100% (Document Bridge — 13-A/B/C/D 全部完成)
Phase 14   ░░░░░░░░░░░░░░░░   0% (Voice / BGM)
Phase 15   ░░░░░░░░░░░░░░░░   0% (談心 + 館報)
Phase 16   ████░░░░░░░░░░░░  25% (16-A Export Core ✅ / 16-B~D 待做)
```
