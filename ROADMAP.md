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

已完成
├─ Phase 17 v2 (Script Editor Archive-host merge) ✅ — v2-1 ~ v2-9 全部完成
│  依賴 Phase 8 ✅ + Phase 14 ✅
└─ Phase 18 (Script Editor 品質修正) ✅ — 18-A ~ 18-E 全部完成
   依賴 Phase 17 v2 ✅

已完成
└─ Phase 19 (Script Editor 深度強化) ✅ — 19-A~E 完成
   依賴 Phase 18 ✅
```

---

## Phase 17 v2：Script Editor 4-TAB 整合 — Archive 為主機 ✅ 完成

> 前次嘗試（`feature/akasha-4tab-attempt`、PR #2）方向相反——
> 把 Archive React 改寫成 Vanilla 塞進 Akasha 內嵌版，5279 行新增後被 revert。
> 本次方向反過來：**Archive 當主機（保留 React + Vite build），把 Akasha 速寫器移植進來**。
>
> Branch: `feature/archive-host-merge`（從 `master@b51a0c4` 起）

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| v2-1 | 搬檔 + Vite 設定 + Archive 原樣跑（從 CDN+Babel 改 Vite+React） | ✅ |
| v2-2 | SwHeader 4-TAB（Write 放第一位、預設）+ WriteTab placeholder | ✅ |
| v2-3 | WriteTab textarea + Plain Script parser + Blocks/Stats 預覽 | ✅ |
| v2-4 | Alt+1~9 角色快捷鍵 + slot badges auto-bind | ✅ |
| v2-5 | Voice TTS（useVoiceTTS hook，Web Speech API） | ✅ |
| v2-6 | BGM/SFX 占位面板 + tsuki-synth 整合計畫文件 | ✅ |
| v2-7 | 跨 TAB 雙向同步（loop guard：syncToken + lastReverse）| ✅ |
| v2-8 | App Shell 整合 + scripts/build.js / sw.js 修正 | ✅ |
| v2-9 | 文件更新 + commit | ✅ |

關鍵設計：
- **Vite + React build**（與 spreadsheet 同部署模式，dist/script-editor/）
- **不重寫業務邏輯**：保留 Archive 的 3844 行 jsx（力導向關係圖 / 音效庫 / 劇本檢查 / 初稿生成等 overlay 完整保留）
- **BGM/SFX 委派外部專案**：`tsuki-synth`（C++/JUCE VST3 物理建模合成器）負責，本模組只解析 cue + 顯示 placeholder，等 CLI render 修好後預渲染 WAV 接入。詳見 [`docs/tsuki-synth-integration.md`](docs/tsuki-synth-integration.md)

## Phase 18：Script Editor 品質修正（PR #3 post-merge）✅ 完成

> PR #3（`feature/archive-host-merge`）merge 後的功能補強 + Codex audit 修正。
> Commits: `a31e242`（Round 1）+ `fe1eb02`（Round 2）

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 18-A | 搜尋補強 — narration / scene block type 篩選加入 Search tab | ✅ |
| 18-B | Persona Slots v2 — 全 9 格可指派（含 #scene/旁白）、空格可點、單擊選單/雙擊插入 | ✅ |
| 18-C | 多作品支援 — 自訂作品 CRUD、WorkSwitcher、per-work localStorage 隔離 | ✅ |
| 18-D | AI 輔助面板 — 聊天 UI + 4 preset + postMessage 橋接 parent iframe | ✅ |
| 18-E | Codex audit 修正 — SEED 通用化、Editor 預設角色去耦合、delete 鍵修正、WorkSwitcher inline | ✅ |

---

## Phase 19：Script Editor 深度強化 ✅ 完成

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 19-A | SCENE_SUBTITLES per-work 化 — 移除硬編碼 Lohengrin 場景名（`ab5960b`） | ✅ |
| 19-B | 角色管理 UI — 新增 / 編輯 / 刪除角色（含 voice / role / tags）（`e78e7c8`） | ✅ |
| 19-C | 草稿歷史 — 存檔點 + 回溯（`0624f31`，sw_history_v1 per-work，15 筆 FIFO） | ✅ |
| 19-D | 關係圖編輯 — 新增 / 編輯 / 儲存角色關係（RelationshipGraph editMode + per-work saveCustomEdges 持久化） | ✅ |
| 19-E | JSONL 匯入即建作品 — 匯入時自動建立 custom work metadata（`b4f8e2d`） | ✅ |

---

## 2026-06-13：解凍修復批次 + 工程強化 ✅ 完成

> Codex 全量健檢 → Opus 二度評估 → Dynamic Workflow（Opus 規劃/驗證、Sonnet 執行）。
> 月月解凍 Phase 1–18 後逐項修復；已 commit `a34315e`、經 PR #5 併入 `master`。

| 項目 | 內容 | 狀態 |
|------|------|:----:|
| 活躍-S0 | choice 選項含「/」round-trip 資料遺失 → escape `\/`（parser.js） | ✅ |
| 活躍-S2 | 刪作品殘留 `edges_${workId}` → 補清除（App.jsx） | ✅ |
| 解凍-A | Reader→Table Forge 無損化（不再丟標題/段落/程式碼） | ✅ |
| 解凍-B | SW precache 自動化（scripts/sync-sw.js）+ SW-INTEGRITY 進 npm test | ✅ |
| 解凍-C | 月幣模式未部署提示（ai-settings） | ✅ |
| 解凍-D | Vite 5→8 升級，清 esbuild dev-server 漏洞（npm audit 0） | ✅ |

---

## 2026-07-02：Codex S1 修復 + Editor block 完整性 ✅ 完成

> Codex 回報 2 筆 S1 bug（凍結區解凍修復）+ Script Editor block type system 3 項完整性缺口。
> Commit: `2b38357`

| 項目 | 內容 | 狀態 |
|------|------|:----:|
| S1-1 | OCR note postMessage schema 對齊（pdf-reader → Shell receiver） | ✅ |
| S1-2 | crop-screenshot 圖片預覽（新增 overlay，不再進文字解碼） | ✅ |
| Editor | Command block 編輯 UI（command + value 雙欄位） | ✅ |
| Editor | Block 上移/下移排序按鈕 | ✅ |
| Editor | Choice 路徑驗證（缺跳轉 + 不存在場次） | ✅ |

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
