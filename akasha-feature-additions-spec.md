# 阿卡夏圖書館｜功能追加規格設計補強書

> 本文件為《阿卡夏圖書館｜整體補強規格書》的追加規格。  
> 本文件只處理功能、資料流、權限、安全、同步、輸出格式與使用體驗。  
> 商業模式、定價、月幣售價、訂閱方案、行銷定位另寫一份，不放入本文件。

---

## 0. 文件定位

### 0.1 本文件目的

本文件補充阿卡夏圖書館後續功能設計，重點是把「翻譯 → 編輯 → 輸出 → 再編輯」做成系統核心。

阿卡夏圖書館不是單一 PDF Reader、表格工具、劇本編輯器或 AI 聊天室，而是一個跨格式、跨模組、跨媒介的創作者工作台。

### 0.2 核心概念

```text
人類可讀格式
→ 阿卡夏翻譯成 AI / 程式可處理格式
→ 使用者在表格、卡片、書庫、劇本介面中編輯
→ 系統輸出成外部工具需要的格式
→ 使用者可再次匯入、修改、轉換
```

### 0.3 不包含內容

本文件不包含：

- 商業模式
- 定價設計
- 付款流程
- 月幣售價
- 訂閱方案
- 使用者分層
- 行銷文案
- 品牌官網銷售頁

---

## 1. 產品主軸補強：翻譯型工作台

### 1.1 阿卡夏的「翻譯」定義

阿卡夏中的翻譯不只代表語言翻譯，而是將內容轉成另一種更適合處理、編輯、輸出或保存的形狀。

| 翻譯類型 | 輸入 | 中介格式 | 輸出 |
|---|---|---|---|
| 文件翻譯 | PDF / OCR / 截圖 | 書庫筆記 / metadata | 筆記、摘要、Script Editor 素材 |
| 程式翻譯 | JS / JSON / Python / Markdown | 結構化摘要 / blocks / table | 人類可讀說明、表格、修正建議 |
| 表格翻譯 | Markdown table / JSON array | Table Forge sheet | CSV / JSON / Markdown table / blocks |
| 劇本翻譯 | Plain Script | blocks.jsonl | `.ks` / AVG JSON / Ren’Py `.rpy` / PDF / Markdown |
| 聲音翻譯 | 文字 / 台詞 / 館報 | 語音任務 JSON | 零韻朗讀 / 台詞試聽 |
| 音樂翻譯 | score.json / preset | TsukiSynth 參數 | Piano / 揚琴 / 空靈鼓 / 水鐘伴讀 |
| 記憶翻譯 | 對話紀錄 | summary / memory record | 零韻手札 / 房間摘要 / 長期偏好 |
| 雲端翻譯 | 本機書庫資料 | sync manifest | Notion / Drive / R2 索引備份 |

### 1.2 使用者價值

使用者不需要理解每一種外部格式，只需要在阿卡夏中使用自然文字、表格、卡片、書庫項目或劇本段落進行編輯。

系統負責：

- 判斷內容格式
- 轉換成中介資料
- 提供適合人類修改的介面
- 提供適合 AI 處理的資料結構
- 匯出成外部工具需要的格式
- 支援再次匯入與重新編輯

### 1.3 第一版成功標準

第一版不追求支援所有格式，而是要證明以下流程可用：

```text
Markdown / Plain Script / JSON
→ 轉成 blocks 或 table
→ 使用者在 Table Forge / Script Editor 編輯
→ 匯出 JSON / MD / PDF / .ks
→ 再次匯入後仍能編輯
```

---

## 2. 新增核心層級

### 2.1 Translation Core

Translation Core 是阿卡夏的格式轉換核心，負責將外部輸入轉成阿卡夏內部可處理格式。

#### 職責

- 偵測檔案格式
- 擷取結構
- 轉成 blocks / table / note / memory / score 等中介資料
- 驗證資料是否完整
- 交給對應模組顯示與編輯

#### 第一版支援

| 輸入 | 偵測方式 | 轉換結果 |
|---|---|---|
| `.md` | heading / table / list / code fence | outline table / markdown blocks |
| `.json` | object / array / schema-like structure | JSON tree / table candidate |
| `.jsonl` | line-based JSON | blocks list / table |
| Plain Script | `角色：內容` | dialogue blocks |
| `.score.json` | score schema | TsukiSynth score preview |

### 2.2 Export Core

Export Core 負責把阿卡夏內部資料輸出成外部工具可用格式。

#### 第一版支援

| 內部資料 | 輸出格式 |
|---|---|
| markdown blocks | `.md` / `.html` / PDF |
| table sheet | CSV / TSV / JSON / Markdown table |
| dialogue blocks | `.ks` / AVG JSON / Markdown / PDF |
| score.json | `.score.json` / preset json |
| memory record | `.md` / Notion page payload |

### 2.3 Connector Layer

Connector Layer 負責同步與外部服務連接。

第一版建議只做：

- Notion Connector：文字型索引、手札、persona、劇本卡片同步
- Google Drive Connector：大型檔案與備份
- Local Connector：本機 IndexedDB / File System Access API

### 2.4 Security Layer

Security Layer 負責使用者資料、API Key、同步權限、版本紀錄與加密。

第一版至少包含：

- 資料分級
- 本機 IndexedDB 加密策略
- BYOK 保存策略
- API key 不硬編碼於前端
- 同步版本紀錄
- checksum / updatedAt / source 標記

---

## 3. Script Editor｜Plain Script 轉換層

### 3.1 定位

Script Editor 是阿卡夏的劇本翻譯室。

它不要求使用者直接書寫 `.ks`、`.rpy`、JS 或 JSON，而是讓使用者用好讀格式撰寫，再由系統轉換成外部工具格式。

### 3.2 Plain Script 基本格式

```text
零韻：不喜歡這種複雜格式！
旁白：圖書館的燈慢慢亮起。
咲月：那就讓圖書館幫我轉！
#bg: library_night
#bgm: moon_archive_soft
#emotion: happy
```

### 3.3 Plain Script 解析規則

| 規則 | 說明 |
|---|---|
| `角色名：台詞` | 轉成 dialogue block |
| `旁白：內容` | 轉成 narration block |
| `#key: value` | 轉成 command / tag metadata |
| 空行 | 分段，不產生 block |
| `// 註解` | 編輯用註解，不輸出到遊戲格式 |
| 無冒號純文字 | 預設視為 narration，並提示使用者確認 |

### 3.4 角色資料庫比對

Script Editor 應支援角色資料卡，用於將人類輸入的角色名轉成固定 speakerId。

```json
{
  "id": "reiin",
  "displayName": "零韻",
  "aliases": ["零韻", "月上零韻", "Reiin", "Tsukigami Reiin"],
  "defaultPortrait": "reiin_normal",
  "defaultVoice": "reiin_default",
  "color": "moon_gold"
}
```

當 parser 讀到：

```text
零韻：不喜歡這種複雜格式！
```

應轉成：

```json
{
  "type": "dialogue",
  "speakerId": "reiin",
  "speaker": "零韻",
  "text": "不喜歡這種複雜格式！",
  "emotion": null,
  "portrait": "reiin_normal",
  "voice": "reiin_default"
}
```

### 3.5 blocks.jsonl 中介格式

Script Editor 的主要內部格式為 `blocks.jsonl`，每行一個 block。

#### dialogue block

```json
{"type":"dialogue","speakerId":"reiin","speaker":"零韻","text":"不喜歡這種複雜格式！","emotion":"annoyed","portrait":"reiin_annoyed","voice":"reiin_default"}
```

#### narration block

```json
{"type":"narration","text":"圖書館的燈慢慢亮起。","sceneId":"library_night"}
```

#### command block

```json
{"type":"command","command":"bgm","value":"moon_archive_soft"}
```

### 3.6 Script Editor UI

第一版 UI 建議分成三欄：

| 區域 | 功能 |
|---|---|
| 左欄 | 角色資料卡、場景資料卡、TAG 字典 |
| 中央 | Plain Script 編輯器 / 卡片式劇本編輯器 |
| 右欄 | 零韻劇本顧問、匯出預覽、錯誤提示 |

### 3.7 輸出格式

#### TyranoScript `.ks`

輸入：

```text
零韻：不喜歡這種複雜格式！
```

輸出：

```ks
#零韻
不喜歡這種複雜格式！[p]
```

#### AVG JSON

```json
{
  "blocks": [
    {
      "type": "dialogue",
      "speakerId": "reiin",
      "speaker": "零韻",
      "text": "不喜歡這種複雜格式！"
    }
  ]
}
```

#### Markdown

```markdown
**零韻**：不喜歡這種複雜格式！
```

#### 可印刷 PDF

PDF 輸出由 Markdown / HTML 排版層生成，定位為交付與列印用，不作為主編輯格式。

### 3.8 回流編輯

匯出的 blocks / JSON / Markdown 應能重新匯入 Script Editor。

第一版要求：

- `.blocks.jsonl` 可完整回流
- AVG JSON 可轉回 blocks
- Markdown 可盡量轉回 Plain Script
- `.ks` 可做低保真匯入，先保留文字與 speaker，複雜演出指令可標記為 unknown command

### 3.9 錯誤提示

| 問題 | 提示 |
|---|---|
| 找不到角色 | 「這個角色還沒有資料卡，要新增嗎？」 |
| 同一角色多個 alias 衝突 | 「這個名稱對應到多位角色，請選擇一位。」 |
| 不支援的 command | 「這個指令目前會保留，但匯出時可能被略過。」 |
| 空台詞 | 「這一列沒有台詞內容。」 |
| 缺少 speakerId | 「這句台詞還沒有綁定角色 ID。」 |

---

## 4. Table Forge｜文字轉表格補強

### 4.1 定位

Table Forge 不只處理一般表格，也負責把長篇文字中的結構翻譯成可掃描、可編輯、可交給 AI 批次處理的表格。

### 4.2 Markdown 結構抽取

開啟 Markdown 時，系統可抽取：

- 文件章節表
- H2 / H3 大綱
- 所有 Markdown table
- code fence 清單
- task list
- link list
- frontmatter

### 4.3 表格抽取結果

#### 文件章節表

| 欄位 | 說明 |
|---|---|
| sectionNo | 章節編號 |
| level | heading level |
| title | 標題 |
| parent | 上層章節 |
| lineStart | 原始行號 |
| lineEnd | 結束行號 |
| summary | AI 或程式生成摘要 |

#### Markdown tables inventory

| 欄位 | 說明 |
|---|---|
| tableId | 表格 ID |
| parentSection | 所屬章節 |
| columns | 欄位名稱 |
| rowCount | 列數 |
| lineStart | 原始行號 |
| lineEnd | 結束行號 |

### 4.4 人類與 AI 共同使用

Table Forge 的輸出應同時滿足：

- 人類一眼掃描文件骨架
- AI 可逐列檢查、補欄位、做分類
- 可回寫到原始 Markdown 或匯出成 JSON

### 4.5 回寫規則

第一版採保守策略：

- 對獨立表格可回寫原始 Markdown table
- 對章節大綱只提供匯出，不直接改原文
- 大量重排需使用者確認
- 回寫前產生 diff 預覽

---

## 5. Notion Connector｜雲端索引與可讀備份

### 5.1 定位

Notion 不取代阿卡夏書庫，也不作為即時主資料庫。

Notion Connector 的定位是：

```text
雲端索引
＋可讀備份
＋跨裝置恢復入口
＋使用者能直接查看與手動編輯的後台資料頁
```

### 5.2 建議同步內容

| 資料 | 是否同步到 Notion | 說明 |
|---|---:|---|
| 書庫 metadata | ✅ | 標題、類型、建立時間、標籤、來源 |
| persona.md | ✅ | 可讀、可回溯、可手動改 |
| Script blocks | ✅ | 適合 database / page 管理 |
| RSS 館報 | ✅ | 適合日期、來源、主題分類 |
| 零韻手札摘要 | ✅ | 經使用者確認後同步 |
| TsukiSynth score.json | ✅ | 小型文字資料，可同步 |
| PDF 原檔 | ⚠️ | Notion 只存索引與連結，大檔放 Drive / R2 |
| 聲音庫 WAV | ❌ | 不進 Notion，只存索引 |
| Live2D 素材 | ❌ | 不進 Notion，只存索引 |
| OCR 全文 | ❌ | 受版權邊界限制，不同步出書庫 |
| API key | ❌ | 禁止同步 |

### 5.3 同步流程

```text
使用者操作
→ IndexedDB 立即存檔
→ sync queue 建立任務
→ 背景同步到 Notion
→ 成功後寫入 lastSyncedAt
→ 失敗則保留 pending 狀態
```

### 5.4 衝突處理

| 情境 | 處理 |
|---|---|
| 本機較新 | 提示覆蓋雲端 |
| Notion 較新 | 提示拉回本機 |
| 兩邊都改過 | 顯示 diff，讓使用者選擇 |
| 同步失敗 | 保留 pending，顯示 toast + sync log |

### 5.5 Notion database 建議

#### Library Index

| 欄位 | 型別 | 說明 |
|---|---|---|
| title | title | 書庫項目名稱 |
| itemType | select | pdf / script / table / note / score / voice |
| tags | multi-select | 標籤 |
| localId | text | IndexedDB ID |
| sourceUrl | url | 外部來源 |
| storageRef | text | Drive / R2 / local ref |
| updatedAt | date | 更新時間 |
| checksum | text | 內容校驗 |

#### Script Blocks

| 欄位 | 型別 | 說明 |
|---|---|---|
| scriptId | text | 劇本 ID |
| blockNo | number | 順序 |
| type | select | dialogue / narration / command |
| speaker | text | 顯示角色名 |
| speakerId | text | 角色 ID |
| text | rich text | 內容 |
| emotion | select | 情緒 TAG |
| portrait | text | 立繪 ID |
| scene | text | 場景 ID |

---

## 6. Memory System｜零韻記憶與手札

### 6.1 定位

Memory System 是零韻陪伴感、跨模組連續性與使用者偏好保存的基礎。

它不是黑盒自動記憶，而是可見、可編輯、可刪除、可同步的「零韻手札」。

### 6.2 三層記憶

| 層級 | 名稱 | 保存位置 | 用途 |
|---|---|---|---|
| 短期 | session memory | runtime state / sessionStorage | 當前對話上下文 |
| 中期 | room summary | IndexedDB | 每個模組 / 房間的摘要 |
| 長期 | approved memory | IndexedDB + 可選 Notion | 使用者允許保存的偏好、persona、重要事件 |

### 6.3 寫入規則

| 記憶類型 | 是否可自動寫入 | 使用者確認 |
|---|---:|---:|
| 短期 session | ✅ | 不需要 |
| 中期 room summary | ✅ | 可在設定關閉 |
| 長期偏好 | ❌ | 必須確認 |
| 談心內容 | ❌ | 必須確認 |
| persona 變更 | ❌ | 必須確認 |
| 重要事件 | ❌ | 必須確認 |

### 6.4 零韻手札 UI

談心或創作陪跑時，零韻可以提出：

```text
是否將這段整理成零韻手札？
```

選項：

- 只留在今天
- 存到本機書庫
- 同步到 Notion
- 不保存

### 6.5 Memory Record 格式

```json
{
  "id": "mem_20260508_001",
  "scope": "approved_memory",
  "module": "Script Editor",
  "title": "Plain Script 編輯偏好",
  "content": "使用者希望用「角色：台詞」格式編輯劇本，再輸出 .ks / AVG JSON / PDF。",
  "tags": ["script-editor", "plain-script", "export"],
  "source": "chat",
  "userApproved": true,
  "syncTarget": "notion",
  "createdAt": "2026-05-08T14:00:00+08:00",
  "updatedAt": "2026-05-08T14:00:00+08:00"
}
```

### 6.6 搜尋流程

零韻需要記憶時，不直接讀整個資料庫，而是呼叫受控搜尋：

```text
使用者輸入
→ 判斷是否需要 memory.search
→ App 端搜尋相關記憶
→ 只把命中的摘要片段交給零韻
→ 零韻根據片段回答
```

### 6.7 權限原則

- AI 不直接持有 Notion / Drive / IndexedDB token
- AI 只能透過 App 提供的受控工具讀寫
- 每次長期寫入都要能回溯來源
- 使用者能查看、修改、刪除每一筆長期記憶

---

## 7. Persona / Context / 預寫回應 DB

### 7.1 persona.md 結構

```markdown
# persona.md

## Core Identity
月上零韻，阿卡夏圖書館的 AI 圖書館員。

## Tone
清楚、帶圖書館員式儀式感，協助使用者整理、翻譯、檢查與保存內容。

## Global Rules
- 不擅自改寫使用者原文
- 不把草稿當最終稿
- 需要外部 API 時先提示成本與用途
- 版權受限內容不可帶出書庫

## Module Contexts
### PDF Reader
身份：文獻伴讀員

### Code & Data
身份：手稿解讀員

### Table Forge
身份：資料檢查員

### Script Editor
身份：劇本顧問

### Private Reading Room
身份：談心與手札整理員
```

### 7.2 Context 注入

每次呼叫 AI 時，系統組合：

```text
核心 persona
＋目前模組 context
＋目前檔案 / 表格 / 劇本摘要
＋必要的 memory snippets
＋使用者當前訊息
```

### 7.3 預寫回應 DB

常見問候、功能說明、操作提示應優先走本地 JSON，不必每次打 API。

```json
{
  "script_editor.explain_plain_script": {
    "intent": "explain_plain_script",
    "response": "Plain Script 是給人類看的劇本格式，阿卡夏會幫你轉成 blocks、.ks 或 PDF。"
  }
}
```

### 7.4 預寫回應優先順序

```text
使用者訊息
→ intent match
→ 命中預寫回應：直接回覆
→ 未命中：組 prompt 打 API
```

---

## 8. Private Reading Room｜談心專區

### 8.1 定位

談心專區是阿卡夏的私人閱覽室，用於陪伴、文字整理、日記、手札、創作陪跑。

它不是醫療諮商，也不提供醫療、法律、金融等專業判斷。

### 8.2 核心功能

| 功能 | 說明 |
|---|---|
| 今日談心 | 當日對話與整理 |
| 零韻手札 | 使用者確認後保存的片段 |
| 不留痕模式 | 關閉後清除 session |
| 本機保存 | 存 IndexedDB |
| Notion 同步 | 經使用者確認後同步 |
| 語音朗讀 | 零韻朗讀手札或館報 |

### 8.3 記憶選項

每次談心後可選：

- 不保存
- 只保留今日
- 存成本機手札
- 同步到 Notion
- 轉成創作素材

### 8.4 安全提示

談心專區需明確提示：

- 使用者可刪除紀錄
- 使用者可關閉長期記憶
- 使用者可選擇不同步雲端
- 私密內容預設不進 Notion

---

## 9. Document Bridge｜DOCX / DOC 匯入匯出

### 9.1 定位

Document Bridge 是外部文件格式交換層，不改變阿卡夏內部主格式。

阿卡夏內部仍以：

- Markdown
- JSON
- JSONL
- blocks.jsonl
- Table Forge sheet

作為主要編輯與交換格式。

### 9.2 支援優先序

| 格式 | 優先度 | 說明 |
|---|---:|---|
| DOCX 匯入 | 高 | 轉 Markdown / blocks |
| Markdown → DOCX | 中 | 交付文件用 |
| Script blocks → DOCX | 中 | 劇本交付用 |
| DOC 匯入 | 低 | 舊格式，必要時只抽文字 |
| DOC 編輯 | 暫不支援 | 避免處理舊格式複雜樣式 |

### 9.3 匯入流程

```text
DOCX
→ 抽取段落 / 標題 / 表格
→ 轉 Markdown
→ 偵測是否可轉 blocks 或 table
→ 存入書庫
```

### 9.4 匯出流程

```text
Markdown / Script blocks
→ HTML template
→ DOCX 或 PDF
→ 使用者下載
```

### 9.5 設計限制

- 不承諾保留所有 Word 樣式
- 第一版保留文字、標題、表格、基本粗斜體
- 複雜頁首頁尾、註腳、浮動圖片先不支援
- 可印刷輸出優先走 PDF

---

## 10. Rein-Voice / 聲音庫接入

### 10.1 定位

Rein-Voice 是零韻的人聲系統，與 TsukiSynth 樂器系統分離。

| 系統 | 處理對象 | 用途 |
|---|---|---|
| Rein-Voice | 人聲 | 零韻朗讀、台詞試聽、館報播報 |
| TsukiSynth | 樂器 | 伴讀 BGM、指定樂器演奏 |

### 10.2 聲音庫素材規格

建議素材：

| 項目 | 建議 |
|---|---|
| 格式 | WAV |
| 聲道 | Mono |
| 音色 | Dry 乾聲 |
| 取樣率 | 44.1kHz 或 48kHz，整套一致 |
| 位元深度 | 16-bit 或 24-bit PCM |
| 處理 | 不加混響、壓縮、EQ、空間效果 |

### 10.3 使用場景

| 場景 | 說明 |
|---|---|
| PDF 伴讀 | 朗讀摘要或段落 |
| 館報播報 | 將 RSS 館報轉語音 |
| Script Editor | 台詞試聽 |
| Private Reading Room | 手札朗讀 |

### 10.4 任務資料格式

```json
{
  "type": "voice_task",
  "voiceId": "reiin_default",
  "text": "今日館報已整理完成。",
  "emotion": "calm",
  "speed": 1.0,
  "output": "preview_audio"
}
```

---

## 11. TsukiSynth BGM / 指定樂器伴讀

### 11.1 定位

TsukiSynth 是阿卡夏的樂器伴讀系統，用 score.json 或 preset 控制樂曲、材質與演奏方式。

### 11.2 支援樂器方向

第一批建議：

- Piano
- 揚琴
- 空靈鼓
- 水鐘

### 11.3 score.json 範例

```json
{
  "scoreId": "moon_archive_soft_001",
  "instrument": "yangqin",
  "tempo": 72,
  "scale": "minor_pentatonic",
  "mood": "quiet_archive",
  "notes": [
    {"time": 0, "pitch": "D4", "duration": 1.0, "velocity": 0.45},
    {"time": 1, "pitch": "A4", "duration": 1.5, "velocity": 0.38}
  ],
  "effects": {
    "reverb": 0.35,
    "delay": 0.15
  }
}
```

### 11.4 零韻建議模式

零韻可依照閱讀內容建議：

```text
這段適合使用空靈鼓，速度放慢，混響稍高，音量保持背景層級。
```

第一版不需要自動生成完整樂曲，可先做到：

- preset 選擇
- score.json 預覽
- 手動播放
- 伴讀時指定背景樂

---

## 12. Daily Archive Report｜每日館報

### 12.1 定位

每日館報是阿卡夏的新聞 / RSS / 資訊整理輸出功能。

### 12.2 流程

```text
RSS / 手動來源
→ 擷取標題與摘要
→ Charta 文風器整理
→ 輸出館報 MD / JSON
→ 存入書庫
→ 零韻朗讀
→ 可搭配 TsukiSynth BGM
```

### 12.3 館報資料格式

```json
{
  "reportId": "daily_20260508",
  "date": "2026-05-08",
  "sections": [
    {
      "title": "AI 工具更新",
      "items": [
        {
          "source": "example",
          "title": "某工具推出新功能",
          "summary": "摘要內容",
          "url": "https://example.com"
        }
      ]
    }
  ],
  "voiceTaskId": null,
  "bgmScoreId": null
}
```

### 12.4 輸出

- Markdown
- JSON
- 零韻朗讀稿
- 歷史館報書庫頁

---

## 13. Web App / PWA / 桌面版邊界

### 13.1 Web App

Web App 是第一優先形式。

特徵：

- 用網址開啟
- 桌機與手機瀏覽器可用
- 易部署
- 適合快速更新

### 13.2 PWA

PWA 是 Web App 的進階形式。

第一版可支援：

- 加到桌面
- 離線開啟外殼
- 快取靜態資源
- IndexedDB 本機書庫

### 13.3 桌面版

桌面版適合後續處理：

- 大型 PDF
- 聲音庫
- 本地資料夾
- 批次轉檔
- Script Editor 重度使用

建議技術方向：

- Tauri
- Electron

### 13.4 手機 App

手機 App 不列為第一階段。

手機版 Web / PWA 先支援：

- 閱讀
- 談心
- 館報
- 手札
- 輕量劇本查看

重度編輯仍以桌機為主。

---

## 14. Security & Data Protection

### 14.1 基本原則

```text
公開前端可以被看見
核心資料不進公開 repo
敏感資料加密保存
API key 不硬編碼
同步要有版本紀錄
使用者能刪除自己的資料
```

### 14.2 資料分級

| 等級 | 內容 | 保存方式 |
|---|---|---|
| Public | UI、Demo、空模板、說明文件 | 公開 repo / GitHub Pages |
| Personal | 書庫 metadata、劇本草稿、手札 | IndexedDB + 可選 Notion 同步 |
| Sensitive | 談心紀錄、persona、OCR 筆記 | IndexedDB 加密 + 使用者確認同步 |
| Secret | API key、OAuth token | session only / encrypted local / backend proxy |
| Large Assets | PDF、聲音庫、Live2D、音源 | Google Drive / R2 / 本機資料夾，只存索引 |

### 14.3 API key 規則

- 不在前端硬編碼任何 API key
- BYOK 預設只保存在 session
- 若使用者選擇保存，必須以 passphrase 加密
- 正式多人使用時，建議改走 backend proxy

### 14.4 IndexedDB 加密

敏感資料進 IndexedDB 前應加密。

```text
使用者 passphrase
→ 派生 key
→ 加密資料
→ 存 IndexedDB
```

注意：忘記 passphrase 可能無法復原，需提供復原碼或匯出備份。

### 14.5 版本與防竄改

每份重要資料應有：

```json
{
  "id": "script_001",
  "version": 12,
  "updatedAt": "2026-05-08T15:10:00+08:00",
  "checksum": "sha256...",
  "source": "local",
  "lastSyncedTo": ["notion", "drive"]
}
```

### 14.6 Copy / 山寨風險處理

公開前端無法完全防止被 copy。

防護策略是：

| 層級 | 做法 |
|---|---|
| 公開版 | 只放 Demo、基礎功能、空模板 |
| 私有版 | 放完整零韻、聲音庫、connector、exporter |
| 後端 | RAG、預寫回應 DB、API proxy、同步服務 |
| 素材 | 聲音庫、Live2D、角色素材不進公開 repo |
| 授權 | repo 加 LICENSE，品牌素材另行保護 |

---

## 15. Deployment｜公開 Demo 與私有完整版

### 15.1 建議切法

```text
公開 Demo：GitHub Pages
私有完整版：Private repo + Web App / PWA / 桌面版
後端服務：API proxy + sync + RAG
大型資產：Drive / R2 / 本機資料夾
```

### 15.2 公開 Demo 可包含

- App Shell
- 基礎 Reader
- 基礎 Table Forge
- 基礎 Script Editor parser
- Demo 資料
- 空白 persona 模板

### 15.3 私有完整版包含

- 零韻完整 persona
- 聲音庫
- 預寫回應 DB
- RAG 資料庫
- Notion / Drive connector
- 記憶系統
- 完整 exporter
- 高品質 Script Editor 模板

### 15.4 後端服務包含

- API key 管理
- Claude / OpenAI / 其他模型 proxy
- Notion OAuth / Drive OAuth callback
- RAG 檢索
- 同步任務 queue
- 月幣 / token 記錄接口

月幣與商業邏輯另行撰寫，本文件只預留接口。

---

## 16. Permission Matrix｜權限矩陣

| 功能 | 讀本機 | 寫本機 | 讀雲端 | 寫雲端 | 需要使用者確認 |
|---|---:|---:|---:|---:|---:|
| 開啟檔案 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 存入書庫 | ✅ | ✅ | ❌ | ❌ | 視設定 |
| Notion 同步 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Drive 備份 | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI 問答 | ✅ | ❌ | ❌ | ❌ | 視成本提示 |
| 長期記憶寫入 | ✅ | ✅ | 視設定 | 視設定 | ✅ |
| OCR 筆記 | ✅ | ✅ | ❌ | ❌ | ✅ |
| OCR 文字外部匯出 | ❌ | ❌ | ❌ | ❌ | 禁止 |
| Script 匯出 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 聲音庫讀取 | ✅ | ❌ | ❌ | ❌ | ✅ |
| API key 保存 | ❌ | ✅ | ❌ | ❌ | ✅ |

---

## 17. 新增名詞對照

| 術語 | 白話解釋 |
|---|---|
| Translation Core | 阿卡夏的格式翻譯核心，把外部內容轉成內部格式 |
| Export Core | 把阿卡夏內部資料輸出成外部格式的模組 |
| Plain Script | 給人寫的劇本格式，例如 `角色：台詞` |
| Character Database | 角色資料庫，用來把角色名對應到 speakerId |
| Memory Record | 零韻記憶資料，每筆可查看、修改、刪除 |
| Room Summary | 某個模組 / 房間的中期對話摘要 |
| 零韻手札 | 使用者確認保存的長期記憶或談心摘要 |
| Connector Layer | 連接 Notion、Drive、R2、本機資料夾的同步層 |
| Sync Queue | 背景同步任務佇列 |
| Checksum | 用來確認資料是否被改動的校驗值 |
| Private Reading Room | 談心專區 / 私人閱覽室 |
| Document Bridge | DOCX / DOC / Markdown / PDF 的文件交換層 |
| Rein-Voice | 零韻人聲系統 |
| TsukiSynth | 樂器與 BGM 系統 |
| Daily Archive Report | 每日館報 |

---

## 18. 建議開發批次

### Batch A：Translation Core MVP

目標：先建立「翻譯 → 編輯 → 輸出 → 再編輯」主幹。

任務：

1. 建立 `core/translation-core.js`
2. 支援 Markdown outline / table 抽取
3. 支援 Plain Script parser
4. 支援 JSON array → table candidate
5. 建立共用 `TransformJob` 格式
6. 建立轉換結果預覽 UI

完成標準：

- Markdown 可抽章節表
- Plain Script 可轉 blocks
- JSON array 可送 Table Forge
- 轉換結果可存入書庫

### Batch B：Script Editor MVP

任務：

1. 建立 Script Editor 專案空殼
2. 加入 Plain Script 編輯器
3. 加入 character database
4. Plain Script → blocks.jsonl
5. blocks → `.ks`
6. blocks → Markdown
7. blocks → PDF 預覽

完成標準：

- 使用者可不寫 JS / JSON / `.ks`，只用 Plain Script 完成基本劇本輸出

### Batch C：Table Forge 文字抽取強化

任務：

1. Markdown 章節表抽取
2. Markdown table inventory
3. H2 / H3 大綱表
4. 表格回寫 diff 預覽
5. AI / 人類都能使用的欄位 metadata

完成標準：

- 長篇規格書可瞬間轉成可掃描表格

### Batch D：Memory System MVP

任務：

1. session memory
2. room summary
3. 零韻手札儲存按鈕
4. memory record viewer
5. memory delete / edit
6. memory search 基礎版

完成標準：

- 零韻能記住單一房間摘要
- 長期記憶需使用者確認後才保存

### Batch E：Notion Connector MVP

任務：

1. Notion database mapping
2. Library Index 同步
3. persona.md 同步
4. Script blocks 同步
5. sync queue
6. sync conflict UI

完成標準：

- 換裝置可從 Notion 拉回 metadata 與小型文字資料

### Batch F：Security Layer

任務：

1. 資料分級常數
2. IndexedDB sensitive fields 加密
3. BYOK session-only 模式
4. encrypted local key 模式
5. checksum / version / updatedAt
6. private/public build 差異化

完成標準：

- 公開前端不包含核心私有資料
- 敏感資料可加密保存

### Batch G：Document Bridge

任務：

1. DOCX → Markdown
2. Markdown → DOCX
3. Script blocks → PDF
4. Script blocks → DOCX
5. DOC 舊格式只抽文字

完成標準：

- 外部文件可進入阿卡夏
- 阿卡夏內容可輸出成可交付文件

### Batch H：Voice / BGM Prototype

任務：

1. Rein-Voice task format
2. voice preview UI
3. score.json preview
4. TsukiSynth preset selector
5. 館報朗讀稿輸出

完成標準：

- 文字可變成零韻朗讀任務
- 伴讀時可指定樂曲或樂器 preset

---

## 19. Claude Code 實作提示

### 19.1 不要一次做完

請依 Batch A → B → C → D 的順序拆 PR。

每次 PR 只處理一個主題，避免同時動 App Shell、Script Editor、Table Forge、Memory、Notion Connector。

### 19.2 每批都要有 DEV-LOG

每次完成需更新：

- `DEV-LOG.md`
- `ROADMAP.md`
- 對應 spec 檔案

### 19.3 禁止事項

- 不要把 API key 寫進前端
- 不要把完整 persona.md 放進 public demo
- 不要把聲音庫放 public repo
- 不要自動同步談心內容到雲端
- 不要讓 AI 直接持有 Notion / Drive token
- 不要讓 OCR 文字被下載或複製出書庫
- 不要讓 `.ks` 成為主要編輯格式

### 19.4 第一優先驗收場景

```text
使用者貼上 Plain Script
→ 系統辨識角色與台詞
→ 生成 blocks.jsonl
→ Table Forge 可攤平成表格
→ 使用者修改欄位
→ 回寫 blocks
→ 匯出 .ks / Markdown / PDF
```

這個場景跑通，就代表阿卡夏的「翻譯型工作台」主軸成立。

---

## 20. 結語

本追加規格的目標，是讓阿卡夏圖書館從「多模組工具集合」升級為「翻譯型創作者工作台」。

阿卡夏的核心不是單一功能，而是把內容在不同形狀之間轉換：

```text
文字 ↔ 表格 ↔ blocks ↔ JSON ↔ PDF ↔ 聲音 ↔ 音樂 ↔ 記憶
```

使用者面對的是圖書館、劇本室、表格室、私人閱覽室與零韻；系統背後處理的是格式、權限、同步、輸出、記憶與安全。

商業模式另行撰寫，不放入本文件。
