# 阿卡夏圖書館 — Roadmap

> 依 `akasha-enhancement-spec.md` 展開的六階段執行路線。
> 每階段以相依性排序，Phase 1 為所有後續功能的地基。

---

## Phase 1：App Shell 基礎重構 ✅ 完成

所有後續功能（零韻面板、跨模組整合）的地基。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 1-A | Header 雙層化 — 第一層（麵包屑 + 召喚圖書館員）提到 App Shell，模組只留第二層工具列 | ✅ |
| 1-B | 右上角按鈕修復 — 「匯入」「新建」移除，App Shell 只留圖書館員 | ✅ |
| 1-C | HINTS 聯動系統 — 上半段固定格式說明 + 下半段動態（操作紀錄 + hover 說明） | ✅ |
| 1-D | Toast 提示統一 — 操作完成 → toast + HINTS 下半段同步更新 | ✅ |
| 1-E | 手機版 popover — 長按按鈕彈出說明氣泡，取代桌面 hover | ✅ |

## Phase 2：PDF Reader 補強

獨立性高，可與 Phase 1 平行推進。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 2-A | 書籤功能 — 新增/列表/跳頁/刪除，IndexedDB 持久化 | ⬜ |
| 2-B | 自訂選擇切割 — 補完現有 placeholder，勾選頁面 → 下載或存書庫 | ⬜ |
| 2-C | 截圖框選 — Canvas 拖拉 → 便條紙樣式 → 存書庫 | ⬜ |
| 2-D | OCR 文字摘錄 — 單頁 OCR + 版權鎖定 + 月幣計費 | ⬜ |

## Phase 3：零韻面板（跨模組 AI 圖書館員）

依賴 Phase 1 的 App Shell header。核心工程量最大。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 3-A | 面板 UI 抽出 — 從 PDF Reader 抽成獨立元件，掛到 App Shell | ⬜ |
| 3-B | Context 切換 — 根據當前模組自動切換角色 | ⬜ |
| 3-C | 人設管理 — `persona.md` + 場景動態注入 | ⬜ |
| 3-D | 對話紀錄 — 每模組獨立對話，統一存書庫 | ⬜ |
| 3-E | 預寫回應 DB — JSON 常見問答，優先匹配免打 API | ⬜ |
| 3-F | 計費系統 — 月幣 + BYOK + token 預估 | ⬜ |

## Phase 4：Code & Data 整合

依賴 Phase 1（HINTS）+ Phase 3（零韻）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 4-A | 零韻接入 — 手稿解讀員 context | ⬜ |
| 4-B | 自動偵測表格 — .md/.json 開啟時偵測 → 提示條 | ⬜ |

## Phase 5：Table Forge 整合

依賴 Phase 3（零韻）。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 5-A | 零韻接入 — 資料檢查員 context | ⬜ |
| 5-B | Script Editor 資料橋 — PostMessage 接收 blocks → 表格（預留接口） | ⬜ |

## Phase 6：Script Editor 接口 + 版權邊界

Script Editor 為獨立專案，這裡只做接口骨架。

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 6-A | 接口定義 — `core/script-editor-bridge.js`，PostMessage 協議 | ⬜ |
| 6-B | 側欄預留 — sidebar 加 Script Editor 入口（disabled） | ⬜ |
| 6-C | 版權邊界實作 — OCR/截圖鎖定 + 警示文案 | ⬜ |

---

## 相依關係

```
Phase 1 (App Shell) ──→ Phase 3 (零韻面板) ──→ Phase 4 + 5 (模組整合)
      ↘                                            ↗
       Phase 2 (PDF Reader) ──────────────────────
                                    Phase 6 (接口 + 版權) 隨時可做
```

## 已完成（不在 Roadmap 內）

- ✅ Code & Data Reader MVP（9 項新功能：tooltip / HINTS / undo-redo / diff / 存書庫 / 歷程）
- ✅ index.html 雙層腳本重構（file:// 可用）
- ✅ Table Forge MVP
- ✅ PDF Reader AI 圖書館員（RAG + LLM）
- ✅ 健檢 14 項修復
- ✅ Reader → Table Forge 匯出管線
- ✅ Phase 1 App Shell 基礎重構（Header 雙層化 / HINTS 聯動 / Toast / popover）
