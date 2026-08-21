# Akasha Library 全站 UI 重設計 — 設計簡報（Design Brief）

> 這份文件是給 **Claude Design** 的完整設計委託書。
> 它自足：不需要讀任何過去的對話，讀完本檔＋參考資產即可開工。
> 委託人：月月（SEO 內容工作者，不讀程式碼，用視覺溝通）。
> 日期：2026-07-07。

---

## 0. 一句話任務

把一座「功能都對、但長得像組合肉」的 PWA 個人知識圖書館，重新設計成**一套有系統的視覺語言**——根據下方的後端功能盤點做前端設計，功能一項不准減。

---

## 1. 專案是什麼

**Akasha Library（阿卡夏圖書館）**：本機優先的 PWA 個人知識平台。
世界觀：深夜的大學圖書館。使用者是館主「月月」，AI 助手是「圖書館員」。

- Repo：`C:\Users\admin\Desktop\Claude\akasha-library`（GitHub public：TsKR2828/akasha-library）
- 架構：**App Shell（index.html）＋ iframe 載入各模組**。多數模組是 vanilla HTML/CSS/JS；劇本工房是 Vite + React。
- 現有設計 token：`design/styles/tokens.css`（navy #181d28 / 黃銅金 #c9a86a / 米白 cream / 襯線字 Cormorant Garamond + Noto Serif TC / mono JetBrains Mono）。
- 支援深色（預設）與淺色模式（`:root[data-mode="light"]`）。
- 本機預覽：`npx http-server . -p 3105`（launch.json 已設定，名稱 `akasha`）。

---

## 2. 現況病灶（為什麼要重設計）

月月的原話：「像霍爾的移動城堡一樣亂七八糟」「組合肉」。具體病灶：

1. **標題重複、每模組長相不同**：殼畫了一次「麵包屑＋模組標題」，PDF 閱讀器、每日館報、談心專區、AI 設定又在 iframe 內**自己再畫一次標題**（例：殼寫「PDF 閱讀器 · Lectorium」，模組內又寫「READING HALL · 閱讀廳／PDF 閱讀器 · Akasha Library Reader」）。每個模組的第二列高度、字級、排版都不一樣。
2. **劇本工房 Write 區控制列堆疊**：文字區上方疊了 3～4 層（標題列、SCRIPTORIUM·CALAMUS 列、體裁切換＋字數＋按鈕列、PERSONA SLOTS 角色格一整列），視覺極碎。
3. **上列全域按鈕感覺偏向 Code&Data**：全域功能與模組功能界線不清。
4. **各模組按鈕樣式漂移**：曾有 `.btn-gold` vs `.btn--gold` 混用、間距字級不一（2026-07-06 已做過一輪表面統一，但月月看截圖仍不滿意——問題是**沒有一份權威設計**，每次都在補丁）。

**教訓：不要再「修」，要先有設計、再照設計重建。**

---

## 3. 硬性約束（不可違反）

1. **功能一項不減**。§5 的功能盤點是合約：每顆按鈕、每個流程都要在新設計中有位置（可收進「更多▾」溢出選單，不可消失）。
2. **標題契約**（本次重設計的核心規則，已定案）：
   - 全站固定三層：**上列**（52px，殼；品牌＋全域搜尋＋匯入/新增/夜燈＋召喚圖書館員）→ **刊頭 masthead**（殼；麵包屑＋中文標題＋拉丁名，全站唯一的標題）→ **書桌列 deskbar**（44px，模組唯一的 chrome；只放狀態與動作，**禁止出現模組名字**）。
   - 模組 iframe 內不得再畫任何標題／副標題列。
3. **架構不動**：仍是 App Shell + iframe + postMessage；vanilla 模組維持 vanilla，劇本工房維持 React。設計交付的是版面與樣式規格，不是改架構。
4. **深淺雙模式**都要成立（深色為主場景）。
5. **Repo 是 public**：設計稿與程式內不得出現任何金鑰、私人資料。
6. **PWA / Service Worker**：新增靜態資源要能被 precache（`scripts/sync-sw.js` 會處理，設計端只需知道資源要是本機檔案，**不可依賴外部 CDN 執行期載入**；Google Fonts 目前已在用、可沿用）。
7. **中文為主、英文/拉丁文為裝飾層**：mono 小字眉、拉丁廳名是世界觀的一部分，保留。
8. **響應式**：桌機為主（1280–1600），但手機要能用（側欄可收合，紙頁單欄）。

---

## 4. 已定案的設計方向（前一輪提案，月月已看過雛形）

概念名：**「深夜書房，攤開的紙頁」（The Midnight Study & The Open Page）**。
以下方向視為基調，Claude Design 可以在其上深化、細部可挑戰（挑戰時說明理由）：

### 4.1 兩種材質
- **書房（深）**：殼（上列/側欄/刊頭/書桌列）與「儀器類」模組（Table Forge、試算表、AI 設定、公共書庫）。navy＋黃銅，深色是家具。
- **紙頁（亮）**：一切閱讀與書寫的內容面（Code&Data 文章、館報、劇本稿紙、談心對話）。亮色手帳紙，像在檯燈下攤開一頁紙。

### 4.2 紙頁語言（源自 Charta Lab，月月指定的參考）
白色筆記紙＋橫線（repeating-linear-gradient）＋左紅邊線；內文 Noto Serif TC；
**旁註 margin-note**（手寫體斜體，給 AI 眉批）、**tangent 離題筆記**、**washi 紙膠帶分隔**、**便利貼 postit**（檔案資訊/月幣/語音稿）、**ex libris 藏書章**（頁尾）、程式碼＝「舊紙標本」（#F3EDE0 底＋左側墨色條）。

### 4.3 分區墨色 Zone Inks（讓差異變成系統）
每廳一色，用在側欄圓點、麵包屑尾字、刊頭底線、模組內強調色：

| 廳 | 拉丁名 | 墨色 | hex |
|---|---|---|---|
| 大廳 | Atrium | 黃銅 | #C9A86A |
| Code & Data | Manuscripta | 靛青 | #4A80A8 |
| PDF 閱讀器 | Lectorium | 蜂蜜 | #C8962E |
| Table Forge／試算表 | Tabularium | 葉綠 | #5A8A4A |
| 劇本工房 | Dramaturgica | 莓紅 | #B84058 |
| 每日館報 | Gazette | 胡蘿蔔 | #D4763A |
| 談心專區 | Intimarium | 李紫 | #7A5898 |

紙頁側 token（新增）：`--page-bg #FAF8F3`、`--page-card #FFFFFF`、`--page-old #F3EDE0`、`--page-ink #1C1610`、`--page-pencil #8A7A66`。
手寫體：Sorts Mill Goudy（italic）。

### 4.4 各場景已出過的雛形（可沿用可精修）
- 大廳＝卡片目錄（五廳卡＋墨色頂線＋羅馬數字）＋最近經手帳簿表。
- Code&Data＝筆記紙閱讀面＋右軌目次卡＋檔案便利貼；工具列常駐 4 顆＋更多▾（18 項分組收納）。
- 劇本工房 Write＝體裁切換（小說/劇本/筆記）做成**長在稿紙上緣的紙夾籤**；角色 ALT 快捷格收成**稿紙下緣筆盤**；右側五個預覽分頁統一成**桌上索引卡**；底部一條深色狀態列。
- 每日館報＝真的報紙：雙線刊頭「每日館報 The Akasha Gazette」＋日期行＋分節（washi 分隔）＋右軌語音稿/月幣便利貼＋過刊卡。

---

## 5. 功能盤點（合約：每一項都要有位置）

### 5.1 殼 Shell（index.html）
- 上列：召喚圖書館員（AI 面板）、匯入檔案、新增檔案（開新檔對話框：md/pdf/表格/劇本/館報…）、深淺模式切換。
- 側欄：TOOLS 八模組導航＋VIEWS（個人館/公共書庫切換)＋登入/同步狀態塊（Google Drive）。
- 大廳：問候 hero、模組卡片群、最近檔案清單（IndexedDB，點開直達模組）。
- 全域對話框：記憶檢視器（Memory Viewer，含 Session/Approved/Notion 分頁）、設定、AI 面板（文字/語音/人格模式，內含「手札」入口鈕）。
- 檔案路由：副檔名 → 模組（TYPE_MODULES）；`.book` 舊檔顯示「書籍排版器已下架」提示。

### 5.2 Code & Data（modules/markdown）— 靛青
- 常駐：開啟檔案、編輯模式（載檔後）、複製目前視圖、搜尋（Ctrl+F）、更多▾。
- 更多▾內（分組）：復原/重做、變更標示/清除標示、下載新檔、存檔至書庫｜複製原始內容、下載目前內容｜匯出 DOCX、劇本 DOCX、劇本 PDF 預覽、AI 摘要（匯出＋存書庫）｜複製 HTML、純表格→Sheets、格式化→Sheets、開新 Sheet 貼上｜送到 Table Forge。
- 狀態：空、已載檔（檢視）、編輯模式（textarea＋diff 高亮）、搜尋中。

### 5.3 PDF 閱讀器（modules/pdf-reader）— 蜂蜜
- 工具：開啟、縮放（縮小/100%/放大/適頁）、匯出、書籤、截圖框選、OCR 摘錄、深淺切換。
- 側欄四籤：PAGES 頁縮圖｜CUT 切割（範圍/每N頁/自訂）｜MARK 書籤（命名/刪除）｜LIB 本檔筆記。
- 右側 AI 摘錄面板（文字/語音/人格）。
- 注意：**PDF 內容本身已是紙**，此模組殼保持深色即可；刪除模組自畫的雙層標題。

### 5.4 Table Forge（modules/table-forge）— 葉綠
- 匯入（貼上解析/開檔/從 Markdown 抽取結構）、匯出（MD/JSON/CSV 預覽＋複製/下載）、清除、Meta 欄位、HINTS 提示面板、Diff 比對。
- 儀器類：深色面板，統一 `.panel` 規格。

### 5.5 試算表（modules/spreadsheet，React）— 葉綠
- 匯入 XLSX/CSV、公式（SUM/AVERAGE/IF…）、欄寬/排序/增刪列、匯出 CSV/XLSX、存書庫。

### 5.6 劇本工房（modules/script-editor，React）— 莓紅
- 四模式：速寫 Write／搜尋 Search／編輯 Editor（結構化區塊＋角色管理）／閱讀 Reader。
- Write：體裁三切（小說/劇本/筆記，各自草稿 localStorage）、字數/行數/閱讀時間、從劇本回填、範例、清空；ALT+1–9 角色快捷（含鎖定/右鍵選單）；打字機模式捲動。
- 右側預覽五籤：段落 Blocks（可逐句播語音）／統計 Stats／大綱 Outline（點擊跳轉）／語音 Voice（TTS 佇列/發音）／配樂 BGM（#bgm 標記）。
- 底部狀態：Ln/Col、blocks parsed、同步狀態（⇄/↻/←）、auto-save。
- 作品切換下拉（多作品，localStorage per workId）。

### 5.7 每日館報（modules/daily-report）— 胡蘿蔔
- 主流程：日期選擇 → 載入館報（fetch `https://raw.githubusercontent.com/TsKR2828/akasha-rss-news/main/output/daily_YYYYMMDD.json`，base URL 可設定）→ 渲染分節報導（emoji＋節名＋條目＋來源連結）。
- 次流程：開啟本地 .json/.md；「貼上→AI 整理」舊路（摺疊保留）。
- 朗讀/暫停/停止（TTS）、BGM、匯出 MD/JSON、存書庫、歷史清單。
- 404（當日未發佈）要有友善空狀態。
- 相關檔案：`voice_YYYYMMDD.txt` 語音稿（設計上可呈現為便利貼）。

### 5.8 談心專區（modules/reading-room）— 李紫
- 對話（AI 署名「談心與手札整理員 · 月上零韻」）、不留痕模式、清除對話。
- 手札面板：清單＋標籤篩選＋編輯對話框（標題/內容/標籤）＋匯出 MD/JSON。
- 免責聲明（不提供醫療法律金融判斷…）：目前是一整條橫幅，**設計上請降噪**（如紙頁頁腳一行鉛筆小字）。

### 5.9 AI 設定（modules/ai-settings）＋公共書庫（public-library）
- AI 設定：BYOK（金鑰輸入/測試/清除/狀態）vs 月幣制（餘額/重置，代理未部署的說明）。儀器類深色表單。
- 公共書庫：獨立頁（brand 標頭＋分類篩選＋搜尋＋書封格線，點開 PDF 進閱讀器）。可沿用「書房深色」語言，唯一允許保有自己標頭的頁面（它不在殼內）。

---

## 6. 參考資產（路徑）

| 資產 | 路徑 | 用途 |
|---|---|---|
| 前輪 mockup ×5 | `design/mockups/00-design-spec.html` ～ `04-daily-report.html` ＋ `mock-shared.css` | 已定案基調的雛形，可直接沿用元件 CSS |
| 現有 token | `design/styles/tokens.css` | 深色殼的權威色票 |
| 現行共用樣式 | `assets/styles/shared.css` | 現有 `.module-header`/`.btn` 體系（將被新規格取代/擴充） |
| Charta 筆記本 CSS（月月指定參考） | `C:\Users\admin\Desktop\Claude\SEO\Charta-creating2\site-1\project\charta-lab.css` | 紙頁語言原典：notebook/margin-note/tangent/washi/postit/ex-libris |
| Charta 元件結構 | 同上目錄 `charta-lab.jsx` | 元件組合方式、兔子 ASCII、flask shelf |
| 世界觀文件 | repo 內 `README.md`、`DEVELOPMENT.md` | 命名與敘事語氣 |

---

## 7. 交付物（Claude Design 要產出什麼）

1. **設計 token 檔**：`design/styles/tokens.css` 的擴充版（新增紙頁系＋七廳墨色＋手寫體），深淺雙模式。
2. **元件規格**（一份 HTML style guide 或 MD＋截圖）：上列、側欄、刊頭、書桌列、按鈕（.btn/.btn--gold/.btn--ghost）、分段切換 seg、更多▾選單、紙頁 notebook、旁註、便利貼、washi、索引卡、儀器 panel、狀態列、空狀態、toast。每個元件標注尺寸/字級/間距/色票。
3. **九個畫面的版面規格**：大廳、Code&Data（檢視＋編輯兩態）、PDF、Table Forge、試算表、劇本工房（Write＋Editor 兩態）、館報（已送達＋未發佈兩態）、談心、AI 設定。可以是高保真 HTML mockup（放 `design/mockups/`，沿用現有命名續編 05、06…）或標注圖。
4. **狀態與空狀態文案**：每模組的空狀態一句話（世界觀語氣，例：「書桌還空著。開啟一份手稿，或從大廳的帳簿挑一本。」）。
5. **實作交接清單**：給工程（Claude Code Workflow）的逐模組 checklist——哪些元素刪（模組內自畫標題）、哪些搬（按鈕進更多▾）、哪些換class。

**驗收標準**：
- 任何兩個模組並排截圖，第二列（書桌列）高度、字級、間距、按鈕樣式完全一致；
- 全站找不到第二份模組標題；
- 劇本工房 Write 文字區上方 chrome ≤ 1 列（書桌列）＋稿紙上的紙夾籤；
- 功能盤點 §5 逐項可在新設計中指出位置；
- 深淺模式、1280 與 375 寬皆成立。

---

## 8. 語氣與品味備忘

- 月月吃「世界觀一致」勝過「現代感」：黃銅、襯線、拉丁文、藏書章、亥時報時——這些是資產不是裝飾病，保留並用得更準。
- 亮色紙頁是本次的靈魂：**在深色書房裡打開一頁亮的紙**，光落在桌上。紙要有橫線、有紅邊線、有鉛筆味；不要做成又一個純白 SaaS 後台。
- 手寫體只給「人味註記」（AI 眉批、便利貼、藏書章日期），正文永遠襯線，功能字永遠 mono 小字眉。
- 動畫極簡：呼吸、淡入、EQ 跳動即可，不要彈跳。
- 如果某個決定與本檔衝突，回來問月月，不要自行擴權。
