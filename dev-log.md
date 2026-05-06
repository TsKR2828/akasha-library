# Akasha Library — Dev Log

## 2026-05-06：健檢修復 + Reader→Spreadsheet 匯出管線

### Reader → Spreadsheet 匯出架構（`6dc1a0d`）
- 新增 `core/export/` 模組群（bridge, toPayload, fromPayload, clipboard）
- 管線流程：Reader → postMessage → 主殼層 → sessionStorage → Spreadsheet useEffect
- `toPayload` 支援 md/json/py/txt 四種格式，產出 heading/paragraph/table/code 四種 block
- `fromPayload` 將 block 轉為試算表 cells + styles
- Reader 新增「送到內建試算表」按鈕，使用 dynamic `import()` 載入 core/export
- iframe sandbox 補上 `allow-clipboard-write`

### 圖書館員調整（`de9efcb`）
- 縮放 3x → 2.76x（92%）
- 下移至 bottom: -80px（腰部裁切）
- 名牌 z-index 提升避免壓到兔耳
- 情緒標籤 Serena → Jabberwocky
- 新增立繪顯示/隱藏 toggle（眼睛 icon）

### 健檢 Bug 修復 #1–5（`b4e3925`）
| # | 問題 | 修法 |
|---|------|------|
| 1 | `importFile()` 不讀檔案內容 | 讀取後 postMessage 傳入 iframe（text/PDF/spreadsheet 三條路徑） |
| 2 | 公共書庫開不了 PDF | 主殼層接 `akasha-open-public-pdf`；PDF reader 新增 `loadFromUrl()` |
| 3 | `saveFileEntry()` 同步時間戳被覆寫 | 保留傳入 `lastOpened`、新增 `updatedAt`、衝突判斷改用 `updatedAt` |
| 4 | insertRow/Col 溢出可視範圍 | 檢查末列/欄、clamp 邊界、溢出提示 |
| 5 | `renderBooks()` XSS 注入 | 加 `escapeHtml()` 套用到所有 catalog 資料 |

### 健檢回歸/風險修復 #6–10（`82da20c`）
| # | 問題 | 修法 |
|---|------|------|
| 6 | deploy.yml 沒有 build 步驟 | 加 Node.js setup + `npm ci` + `npm run build` |
| 7 | 公式參照不隨列欄移動更新 | `shiftRefs()` helper，四個操作都重寫公式 |
| 8 | PDF reader PWA 路徑斷裂 | manifest/icons 改 `../../` 前綴 |
| 9 | 沒有 test script | `npm test` = build + 關鍵檔案存在檢查 |
| 10 | postMessage 沒驗證 origin | 四個檔案加 `event.origin` 守衛 |

### 風險/路徑修復 #11–14（`bd6b26e`）
| # | 問題 | 修法 |
|---|------|------|
| 11 | Drive API 沒檢查 `res.ok` | `driveJson()`/`driveBlob()` helper，非 2xx 拋出含 Google error message 的錯誤 |
| 12 | BYOK 明文存 localStorage | API key 改存 sessionStorage（關分頁即清除），非敏感設定留 localStorage |
| 13 | 最近檔案點擊不還原內容 | `openRecentFile()` 讀 IndexedDB blob → postMessage 傳入對應模組 |
| 14 | offlineQueue 純記憶體 | 佇列存入 IndexedDB settings store，`initOfflineSync()` 啟動時還原 |

**健檢報告 14/14 項全部修復完畢。**
