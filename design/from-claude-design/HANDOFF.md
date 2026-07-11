# Akasha Library 重設計 — 實作交接清單（HANDOFF）

> 對象：Claude Code Workflow。設計依據：`Akasha 全站設計 Mockup.dc.html`（互動雛形，含深淺模式與各模組狀態）＋`Akasha 元件規格 Style Guide.dc.html`＋`design/styles/tokens.css`（v2，權威 token）。
> 鐵則：**功能一項不減**；模組 iframe 內**刪掉所有自畫標題**；書桌列（44px）是模組唯一 chrome，**禁止出現模組名字**。

---

## 0. 全域（先做）

- [ ] 以本包 `design/styles/tokens.css` 覆蓋現有檔：新增紙頁系 `--page-*`、七廳墨色 `--ink-*`、手寫體 `--font-hand`、`--topbar-h: 52px`、`--deskbar-h: 44px`、`--sidebar-w: 240px`。
- [ ] Google Fonts 加載 `Sorts Mill Goudy`（ital）；其餘字體沿用。
- [ ] `assets/styles/shared.css`：
  - `.module-header`（56px 版）改名/重寫為 `.deskbar`（44px，btn 高 28px、gap 8、padding 0 28px、左狀態 mono 10.5px＋5px 墨點）。
  - 全域清查 `.btn-gold` → `.btn--gold`（舊拼法一律替換）。
  - 新增 `.seg`（分段切換）、`.mh-menu` 規格照 style guide 04（min-width 238、項高 28、分組 mono 標籤）。
- [ ] 殼 `index.html`：上列改 52px；新增刊頭 masthead（麵包屑 mono 9px ＋ 中文標題 23px/700 ＋ 拉丁名 italic 墨色 ＋ 2×58px 墨色底線）。廳別資料（zh/la/ink/卷號）做成一份 `HALLS` 常數，側欄、刊頭、大廳卡共用。
- [ ] 側欄：TOOLS 列表加 6px 墨色圓點；active＝navy-light 底＋inset 2px 墨色左條；底部同步狀態塊照 mockup。
- [ ] 深淺模式：`:root[data-mode="light"]` 只反轉書房家具；**紙頁 token 不反轉**。
- [ ] 新增資源記得跑 `scripts/sync-sw.js` precache；不得引入執行期 CDN 依賴（Google Fonts 除外）。

## 1. 各模組共同動作

- [ ] **刪**：模組內自畫的標題/副標題列（PDF 閱讀器、每日館報、談心專區、AI 設定、Code&Data…全部）。
- [ ] **換**：模組第一列統一為 `.deskbar`；狀態靠左、動作靠右；放不下的收 `更多▾`（不可刪功能）。
- [ ] postMessage 協定不變；vanilla 維持 vanilla，劇本工房維持 React。

## 2. Code & Data（Manuscripta · #4A80A8）

- [ ] 刪 iframe 內「READING HALL…」整條表頭。
- [ ] 書桌列常駐 4＋1：開啟檔案｜編輯（載檔後，active＝靛青框）｜複製目前視圖｜搜尋 ⌘F｜更多▾。
- [ ] 更多▾ 分組（18 項，照 mockup 選單）：編輯（復原/重做/變更標示/清除標示/下載新檔/存檔至書庫）｜複製與下載（複製原始內容/下載目前內容）｜匯出（DOCX/劇本 DOCX/劇本 PDF 預覽/AI 摘要）｜SHEETS（複製 HTML/純表格/格式化/開新 Sheet 貼上）｜跨模組（送到 Table Forge）。
- [ ] 閱讀面改紙頁 notebook（白紙＋32px 橫線＋左紅邊 @54px；正文 14.5/32）；右軌＝目次索引卡＋檔案便利貼；AI 眉批用 margin-note。
- [ ] 編輯模式：同一張紙、mono 12.5px；diff＝綠底左綠條（新增）/紅底刪除線（移除）；紙框轉靛青。

## 3. PDF 閱讀器（Lectorium · #C8962E）

- [ ] 刪雙層標題。模組殼保持深色（PDF 內容本身已是紙）。
- [ ] 書桌列：開啟｜縮放群組（−/100%/＋/適頁，合體膠囊）｜書籤｜截圖框選｜OCR 摘錄｜匯出（gold）。原「深淺切換」由殼的夜燈統一，模組內移除。
- [ ] 左欄四籤 PAGES/CUT/MARK/LIB 照 mockup（籤＝底線式 tab，蜂蜜色 active）；右欄 AI 摘錄面板（RAG 訊息卡＝左 2px 蜂蜜條）。

## 4. Table Forge ＋ 試算表（Tabularium · #5A8A4A）

- [ ] 兩者統一儀器 `.panel` 規格（style guide 06）。
- [ ] Table Forge 書桌列：匯入▾（貼上解析/開檔/從 MD 抽取）｜Meta｜HINTS｜Diff 比對｜匯出▾（MD/JSON/CSV 預覽＋複製/下載）｜清除（danger）。
- [ ] 試算表書桌列：匯入 XLSX/CSV｜匯出▾（CSV/XLSX）｜存書庫（gold）；公式列（名稱框＋fx）進內容區頂。

## 5. 劇本工房（Dramaturgica · #B84058）

- [ ] Write 區文字上方 chrome 壓到 ≤1 列：四模式 seg（速寫/搜尋/編輯/閱讀）進書桌列左側；作品切換▾/從劇本回填/範例/清空進書桌列右側。
- [ ] 刪 SCRIPTORIUM·CALAMUS 列與獨立字數列；字數/行數/閱讀時間縮成稿紙右上 mono 小字。
- [ ] 體裁三切（小說/劇本/筆記）＝稿紙上緣紙夾籤（rotate ±0.6°，active 白底＋莓紅字）。
- [ ] PERSONA SLOTS 收成稿紙下緣筆盤（ALT+1–9 chip，26px 高；鎖定＝莓紅框＋🔒；右鍵選單保留）。
- [ ] 右側五預覽籤＝索引卡（active＝左莓紅條＋左移 4px）；段落卡保留逐句 ▶。
- [ ] 底部深色狀態列 28px：Ln/Col · blocks parsed · ⇄/↻/← 同步 · auto-save · 打字機模式。

## 6. 每日館報（Gazette · #D4763A）

- [ ] 刪自畫刊頭列；內容區改真報紙：三線 double-rule 刊頭「每日館報 The Akasha Gazette」＋期號/日期/節氣行；分節＝emoji＋節名＋mono 小字眉；節間 washi。
- [ ] 書桌列：日期籤（今日/選日期）＋送達狀態｜▶ 朗讀（gold）/BGM/匯出▾/存書庫/更多▾（開啟本地 .json/.md、貼上→AI 整理摺疊保留、歷史清單）。
- [ ] 右軌：語音稿便利貼（voice_YYYYMMDD.txt ＋ ▶）、月幣便利貼、過刊索引卡。
- [ ] 404 空狀態照 mockup（虛線圓章「未付印」＋兩行文案＋查看過刊/開啟本地）。

## 7. 談心專區（Intimarium · #7A5898）

- [ ] 刪自畫標題列。對話面改紙頁：使用者訊息＝右側李紫淡框；零韻回覆＝紙上正文＋margin-note 眉批＋mono 署名「談心與手札整理員 · 月上零韻」。
- [ ] 免責聲明整條橫幅 → 紙頁頁腳一行鉛筆小字（手寫體 10.5px，opacity .75）。
- [ ] 書桌列：狀態（在館/不留痕提示）｜不留痕 toggle（李紫 active）｜手札｜清除對話（danger）。
- [ ] 手札右軌：清單＋標籤篩選＋新篇；匯出 MD/JSON 兩鍵；編輯對話框沿用全域 dialog 樣式。

## 8. AI 設定（Aetherium · 黃銅）＋公共書庫

- [ ] 刪自畫標題。BYOK / 月幣制做成兩張儀器卡（active 卡＝金框＋brass glow）；金鑰輸入/測試/清除/狀態、餘額/重置日/代理未部署說明照 mockup。
- [ ] 公共書庫：唯一允許自有標頭的頁面（不在殼內）；沿用書房深色＋brand 標頭＋分類篩選＋搜尋＋書封格線。

## 9. 驗收（貼截圖比對）

- [ ] 任兩模組並排：書桌列高度/字級/間距/按鈕完全一致。
- [ ] 全站 grep 不到第二份模組標題。
- [ ] 劇本工房 Write 文字區上方 chrome ≤ 1 列＋紙夾籤。
- [ ] §5 功能盤點逐項可指出位置（含更多▾ 內）。
- [ ] 深淺模式、1280 與 375 寬皆成立（側欄可收合、紙頁單欄）。

## 附：空狀態文案

見 Style Guide 第 07 節（大廳/九模組各一句，世界觀語氣）。
