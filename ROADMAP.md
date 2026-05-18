# 阿卡夏圖書館 — Roadmap

> 依 `akasha-enhancement-spec.md` + `akasha-feature-additions-spec.md` 展開。
> Phase 1–3 為原始規格，Phase 7+ 為追加規格。
> 每階段以相依性排序。

---

## Phase 1：App Shell 基礎重構 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 1-A | Header 雙層化 — 第一層（麵包屑 + 召喚圖書館員）提到 App Shell，模組只留第二層工具列 | ✅ |
| 1-B | 右上角按鈕修復 — 「匯入」「新建」移除，App Shell 只留圖書館員 | ✅ |
| 1-C | HINTS 聯動系統 — 上半段固定格式說明 + 下半段動態（操作紀錄 + hover 說明） | ✅ |
| 1-D | Toast 提示統一 — 操作完成 → toast + HINTS 下半段同步更新 | ✅ |
| 1-E | 手機版 popover — 長按按鈕彈出說明氣泡，取代桌面 hover | ✅ |

## Phase 2：PDF Reader 補強 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 2-A | 書籤功能 — 新增/列表/跳頁/刪除，localStorage 持久化 | ✅ |
| 2-B | 自訂選擇切割 — 頁碼網格勾選 → pdf-lib 合併 → 下載或存書庫 | ✅ |
| 2-C | 截圖框選 — Canvas 拖拉選取 → PNG 存書庫 | ✅ |
| 2-D | OCR 文字摘錄 — 單頁 OCR + 版權鎖定 + 月幣計費 | ✅ |

## Phase 3：零韻面板（跨模組 AI 圖書館員） ✅ 完成

依賴 Phase 1。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 3-A | 面板 UI 抽出 — 從 PDF Reader 抽成獨立元件，掛到 App Shell | ✅ |
| 3-B | Context 切換 — 根據當前模組自動切換角色 + 真正 LLM 呼叫 | ✅ |
| 3-C | 人設管理 — `persona.md` 外部化 + 場景動態注入（追加 spec §7.1–7.2） | ✅ |
| 3-D | 對話紀錄 — 每模組獨立對話，統一存書庫 | ✅ |
| 3-E | 預寫回應 DB — JSON 常見問答，優先匹配免打 API（追加 spec §7.3–7.4） | ✅ |
| 3-F | 計費系統 — 月幣 + BYOK + token 預估（前端骨架已有） | ✅ |

## Phase 4：Code & Data 整合 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 4-A | 零韻接入 — 手稿解讀員 context（3-B 已完成） | ✅ |
| 4-B | 自動偵測表格 — .md/.json 開啟時偵測 → 提示條 | ✅ |

## Phase 5：Table Forge 整合 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 5-A | 零韻接入 — 資料檢查員 context（3-B 已完成） | ✅ |
| 5-B | Script Editor 資料橋 — PostMessage 接收 blocks → 表格（預留接口） | ✅ |

## Phase 6：版權邊界 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 6-A | 版權邊界實作 — OCR/截圖鎖定 + 警示文案 | ✅ |

---

## Phase 7：Translation Core（追加 spec §2.1, Batch A） ✅ 完成

格式翻譯核心 — 外部輸入 → 阿卡夏中介格式。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 7-A | `core/translation-core.js` 基礎架構 + `TransformJob` 格式 | ✅ |
| 7-B | Markdown outline / table / code fence / task list 抽取 | ✅ |
| 7-C | Plain Script parser —「角色：台詞」→ dialogue blocks | ✅ |
| 7-D | JSON array → table candidate 偵測 | ✅ |
| 7-E | 轉換結果預覽 UI + 存入書庫 | ✅ |

## Phase 8：Script Editor MVP（追加 spec §3, Batch B）✅ 完成

獨立模組，依賴 Phase 7（Translation Core）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 8-A | 模組空殼 + 三欄 UI（角色卡 / 編輯器 / 預覽） | ✅ |
| 8-B | Plain Script 編輯器 + 即時 blocks 預覽 | ✅ |
| 8-C | 角色資料庫（Character Database）— alias → speakerId 比對 | ✅ |
| 8-D | blocks.jsonl → TyranoScript `.ks` 輸出 | ✅ |
| 8-E | blocks → Markdown / AVG JSON 輸出 | ✅ |
| 8-F | blocks → PDF 預覽（HTML 排版層） | ✅ |
| 8-G | 回流匯入 — `.blocks.jsonl` / AVG JSON / Markdown / `.ks` | ✅ |
| 8-H | 側欄入口 + App Shell 整合 | ✅ |

## Phase 9：Table Forge 文字抽取強化（追加 spec §4, Batch C）✅ 完成

依賴 Phase 7（共用抽取邏輯）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 9-A | Markdown 章節表抽取（sectionNo / level / title / lineStart） | ✅ |
| 9-B | Markdown table inventory（tableId / columns / rowCount） | ✅ |
| 9-C | H2/H3 大綱表 + code fence 清單 | ✅ |
| 9-D | 表格回寫 diff 預覽 | ✅ |
| 9-E | AI/人類共用欄位 metadata | ✅ |

## Phase 10：Memory System（追加 spec §6, Batch D）

依賴 Phase 3（零韻面板）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 10-A | 短期 session memory（runtime state） | ✅ |
| 10-B | 中期 room summary（每模組摘要，IndexedDB） | ✅ |
| 10-C | 長期 approved memory — 零韻手札儲存 + 使用者確認 | ✅ |
| 10-D | Memory Record viewer（查看/編輯/刪除） | ✅ |
| 10-E | Memory search — 受控搜尋，只回傳命中片段 | ✅ |

## Phase 11：Notion Connector（追加 spec §5, Batch E）

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 11-A | Notion database mapping（Library Index / Script Blocks） | ✅ |
| 11-B | 書庫 metadata 同步 | ✅ |
| 11-C | persona.md + Script blocks 同步 | ✅ |
| 11-D | Sync queue + 背景同步流程 | ✅ |
| 11-E | 衝突處理 UI（diff 顯示 + 使用者選擇） | ✅ |

## Phase 12：Security Layer（追加 spec §14, Batch F）✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 12-A | 資料分級常數（Public / Personal / Sensitive / Secret / Large Assets） | ✅ |
| 12-B | IndexedDB 敏感欄位加密（passphrase → PBKDF2 → AES-GCM） | ✅ |
| 12-C | BYOK session-only + encrypted local key 模式 | ✅ |
| 12-D | checksum / version / updatedAt 標記 | ✅ |
| 12-E | 公開版 / 私有版 build 差異化 | ✅ |

## Phase 13：Document Bridge（追加 spec §9, Batch G）

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 13-A | DOCX 匯入 → Markdown（段落 / 標題 / 表格 / 粗斜體） | ✅ |
| 13-B | Markdown → DOCX 匯出（交付文件用） | ✅ |
| 13-C | Script blocks → PDF / DOCX（劇本交付） | ✅ |
| 13-D | DOC 舊格式 — 只抽文字 | ✅ |

## Phase 14：Voice / BGM Prototype（追加 spec §10–11, Batch H）

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 14-A | Rein-Voice task format + voice preview UI | ✅ |
| 14-B | score.json 預覽 + TsukiSynth preset selector | ✅ |
| 14-C | 館報朗讀稿輸出 | ✅ |
| 14-D | 伴讀時指定背景樂 | ✅ |

## Phase 15：Private Reading Room + 每日館報（追加 spec §8, §12）✅ 完成

依賴 Phase 10（Memory System）+ Phase 14（Voice）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 15-A | 談心專區模組 — 今日談心 / 不留痕模式 / 記憶選項 | ✅ |
| 15-B | 零韻手札 UI 強化 — 編輯 modal / tag 篩選 / Notion 同步 / MD+JSON 匯出 | ✅ |
| 15-C | 每日館報 MVP — 手動文字 → LLM 整理 → §12.3 JSON → 顯示/儲存/匯出 | ✅ |
| 15-D | 館報朗讀 + BGM 搭配 — Voice bridge / 播放控制 / BGM preset 連動 | ✅ |

## Phase 16：Export Core + 部署（追加 spec §2.2, §15）✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 16-A | `core/export-core.js` — 統一匯出引擎（MD / HTML / PDF / CSV / JSON / .ks） | ✅ |
| 16-B | 公開 Demo 版 build（`scripts/build.js --mode=public`，排除私有資料 + 注入 BUILD_MODE） | ✅ |
| 16-C | 私有完整版 build（`scripts/build.js --mode=private`，完整 persona / connector） | ✅ |
| 16-D | 後端服務骨架（Worker：BYOK + Coin + sync queue + RAG stub + KV coin 系統） | ✅ |

---

## 相依關係

```
已完成（Phase 1–6 全部完成）
├─ Phase 1 (App Shell) ✅
├─ Phase 2 (PDF Reader) ✅
├─ Phase 3 (零韻面板) ✅
├─ Phase 4 (Code & Data 整合) ✅
├─ Phase 5 (Table Forge 整合) ✅
└─ Phase 6 (版權邊界) ✅

已完成
├─ Phase 7 (Translation Core) ✅ ──→ Phase 8 (Script Editor) ✅
│                                 ──→ Phase 9 (Table Forge 抽取強化) ✅
├─ Phase 10 (Memory) ✅ ──→ Phase 15 (談心 + 館報) ✅
├─ Phase 11 (Notion Connector) ✅
├─ Phase 12 (Security Layer) ✅
├─ Phase 13 (Document Bridge) ✅ — 13-A/B/C/D 全部完成
└─ Phase 16 (Export Core + 部署) ✅ — 16-A/B/C/D 全部完成

已完成
├─ Phase 14 (Voice/BGM) ✅ ──→ Phase 15-D (館報朗讀) ✅

已完成
└─ Phase 15 (談心 + 館報) ✅ — 15-A/B/C/D 全部完成
```

---

## Phase 17：Script Editor 4-TAB 整合（Archive 合併）

整合 `-Archive_Script_Editor-`（React 獨立版）與 Akasha 內嵌版，改寫為 Vanilla JS 4-TAB 模組。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 17-1 | Foundation — `data-model.js` 共享狀態 + 事件匯流排 + 解析器 + 驗證 + IndexedDB + `index.html` 4-TAB 骨架 | ⬜ |
| 17-2 | Write TAB — textarea 速寫 + Alt+N 角色快捷鍵 + undo/redo + Voice TTS + BGM 合成 + 預覽面板 | ⬜ |
| 17-3 | Editor TAB — 區塊卡片（6 種 block type）+ AVG 面板 + TAG 編輯 + 角色 CRUD + 筆記 | ⬜ |
| 17-4 | Search TAB — 6 篩選器 + 結果卡片 + MD/CSV 匯出 + 跳轉 Editor | ⬜ |
| 17-5 | Reader TAB — 連續排版 + 場景 TOC + TAG hover + choice 互動 + PDF 匯出 | ⬜ |
| 17-6 | Overlays — Table Forge / 角色關係圖 / 音效庫 / 劇本檢查 / 初稿生成 | ⬜ |
| 17-7 | 整合收尾 — 跨 TAB 同步 + 多作品支援 + 匯入統一 + README/ROADMAP 更新 | ⬜ |

---

## 相依關係（更新）

```
Phase 1–16 全部完成 ✅

進行中
└─ Phase 17 (Script Editor 4-TAB 整合) ──→ 依賴 Phase 8 ✅ + Phase 14 ✅ + Phase 16 ✅
   ├─ 17-1 Foundation
   ├─ 17-2 Write TAB（含 Voice/BGM from Phase 14）
   ├─ 17-3 Editor TAB
   ├─ 17-4 Search TAB
   ├─ 17-5 Reader TAB
   ├─ 17-6 Overlays
   └─ 17-7 整合收尾
```

---

## 已完成（不在 Roadmap 步驟內）

- ✅ Code & Data Reader MVP（9 項新功能：tooltip / HINTS / undo-redo / diff / 存書庫 / 歷程）
- ✅ code-data-reader-spec.md 47/47 項全部實作完成
- ✅ index.html 雙層腳本重構（file:// 可用）
- ✅ Table Forge MVP
- ✅ PDF Reader AI 圖書館員（RAG + LLM）
- ✅ 健檢 14 項修復
- ✅ Reader → Table Forge 匯出管線
- ✅ Phase 1 App Shell 基礎重構
- ✅ Phase 4-A 零韻接入 Code & Data（在 3-B 中完成）
- ✅ Phase 5-A 零韻接入 Table Forge（在 3-B 中完成）

---

## 規格文件索引

| 文件 | 涵蓋範圍 |
|------|---------|
| `akasha-enhancement-spec.md` | Phase 1–6 原始規格 |
| `akasha-feature-additions-spec.md` | Phase 7–16 追加規格（Translation Core / Script Editor / Memory / Notion / Security / Voice / BGM / 談心 / 館報 / 部署） |
| `code-data-reader-spec.md` | Code & Data Reader 完整功能清單（已完結） |
