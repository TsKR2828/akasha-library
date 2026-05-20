# Script Editor — HANDOFF（給下個窗口）

> 建立時間：2026-05-19（session end）
> 上一次工作分支：`feature/archive-host-merge`
> 起點：`master@b51a0c4`（前次 Phase 17 嘗試 PR #2 已被 revert）

---

## 1. 整體狀態（30 秒摘要）

Phase 17 v2「Script Editor Archive-host merge」**主體開發已完成並提交**（v2-1 ~ v2-9）。

```
本地 commit:
  1555910 docs(phase-17-v2): update README/ROADMAP/TODO/dev-log + tsuki-synth plan
  75f5800 feat(phase-17-v2): Script Editor Archive-host merge
  b51a0c4 Revert "Merge pull request #2 ..." (起點，origin/master 同位)
```

**做法是**：把 Archive 的 3,844 行 React jsx 整套搬進 akasha-library，改用 Vite + React build pipeline（與 spreadsheet 模組同模式），dist 出到 `dist/script-editor/`。Akasha 速寫器（textarea + Voice TTS + Alt+N 快捷鍵）改寫成新的 React 元件 `WriteTab.jsx` 當第 4 個 TAB（預設停在這）。BGM/SFX 委派給 sibling project `tsuki-synth`（VST3 物理建模合成器），本模組只解析 cue + 占位顯示，等 CLI render 修好接 WAV。

**接著進入修 bug 階段，但未完成**（見第 4 節）。後續 Fix-2 / Fix-3 / Fix-4 的程式碼變更已寫進檔案但**尚未 commit**——工作樹有改動。

---

## 2. 立刻檢查的指令

```bash
cd C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\akasha-library

git status                                      # 看未提交的 Fix 變更
git log --oneline master..HEAD                  # 看本分支已 commit 的內容
git log --oneline feature/archive-host-merge..origin/feature/archive-host-merge  # 是否落後雲端

npm run dev:script-editor                       # Vite dev server → http://localhost:5173/
npm test                                        # build + critical file check
```

dev server 在 session 結束時還跑著（port 5173）。下個窗口若 list preview 應該還能看見 `script-editor` server。

---

## 3. 已完成的修正（在工作樹，未 commit）

### Fix-2 ✅ 原文為空時不顯示「」（自適應間距）
- **改動位置**：`modules/script-editor/src/App.jsx`
  - line ~798-810（SearchView ResultCard）：`r.original` / `r.zh` 改成條件渲染
  - line ~3725-3741（ReaderView dialogue）：`block.original` / `block.zh` 改成條件渲染
- 不再顯示空的 `「」`，自然省下間距。

### Fix-3 ✅ Write textarea「寫作視線範圍」
- **改動位置**：`modules/script-editor/src/components/WriteTab.jsx`
  - textarea style：`padding: "20px 28px 40vh"`（底部 40vh 留白）+ `scrollPaddingBottom: "40vh"`
  - 新增 `anchorCaretView()` callback：當游標超過 viewport 2/3 時自動 scrollTop，把當前行帶到「下 2/3」位置
  - 接到 `onKeyUp` / `onClick` / `onInput` 觸發

### Fix-4 ✅ 未知 speaker 不假裝是已知角色
- **改動位置**：
  - `modules/script-editor/src/lib/parser.js`：`parsePlainScript(content, characters=[])` 新增第二參數；建 `idByName` 反查表把「羅恩格林」→「lohengrin」等映射；找不到時 `speakerId: ""` 且加 `isUnknown: true` 旗標
  - `App.jsx` validateBlock（~line 226）：`if (!block.isUnknown)` 才跑 speakerId 不存在 errors
  - `App.jsx` checkScript（~line 1716）：isUnknown 時改 push `severity: "info"` 的「新角色尚未綁定」note，不再 error
  - `WriteTab.jsx`：`parsePlainScript(content, characters)` 傳入 characters

⚠️ **重要**：`VALID_BLOCK_TYPES` 仍未包含 `"command"`（檔案 line 213）。當 user 輸入 `#bgm: xxx`、`#cue: xxx` 等指令，parser 產出 `type: "command"` 的 block，但 validateBlock / checkScript 會說「未知 type『command』」。**這要修**——把 `command` 加進 VALID_BLOCK_TYPES。

---

## 4. 還沒處理的問題（user 報的 6 個）

### Fix-1 ⏸ 換劇本後 Editor 死掉
- **觀察**：實測發現「死掉」不是真的 crash，而是 Editor 顯示一堆 validation 警告（「未知 type 『command』」「speakerId 不在角色表」等），加上 forward sync 把 Lohengrin 47 blocks 替換成只有 5 個 block 的 SEED，看起來像空白。
- **症狀**：點 範例 按鈕後 SEED 推進 blocks，切到 Editor 看到的不是 Lohengrin 而是 SEED 的 5 個 block + 警告。
- **應做**：
  1. 把 `command` 加進 VALID_BLOCK_TYPES（最簡單一步）
  2. WriteTab 加「↺ 從劇本載入」按鈕，把 main blocks via `blocksToPlainScript()` 拉回 textarea（不寫進 localStorage）
  3. 或更激進：在 App.jsx 加「reset to original SCRIPT」action（重跑 loadAllData）

### Fix-5 ⏸ Persona Slots 缺少編輯/刪除/手動指派
- **觀察**：目前 SlotBadge 純 auto-bind 唯讀，使用者無法 (1) 清除某 slot、(2) 手動指派、(3) 處理超過 7 個角色（Lohengrin 有 8 個 unique speakers，所以 傳令官 永遠沒位置）。
- **應做**：
  - SlotBadge 右鍵 menu：「清除 / 指派至…/ 鎖定（不被 auto-bind 蓋掉）」
  - localStorage 持久化 `sw_slot_locks_v1` = `{3: 'lohengrin', 4: 'elsa', ...}`
  - dynamicSlots 計算要先看 locks，再用 auto-bind 補空位
  - 顯示 overflow 指示器：「⋯ 還有 N 個角色未綁定」

### Fix-6 ⏸ 減字後 Characters 反增 + Write/Search 角色清單不同步
- **觀察 1**（減字反增）：user 截圖一張 49 blocks parsed，另一張 48 blocks parsed，但 Characters 字數似乎相反方向變動。**未確認是 stats bug 還是 UI 顯示問題**。可能是：
  - useMemo 沒清乾淨上次的 stats
  - 或 user 看到的是「字數」而不是「block 數」，字數計算有 bug（重複加總？）
  - 需要實測：在 textarea 連續刪字，觀察 stats panel 的 Total Characters 變化
- **觀察 2**（Write vs Search 角色不同）：Write TAB 認到的是「parsedBlocks 抽出的 unique speakers」（slot 3-9）、Search TAB 認到的是 CHARACTERS 表（Lohengrin 預載的角色）。兩者來源不同，理應一致。
- **應做**：
  - 建統一的 `useCharactersOfWork(blocks, characters)` hook：把 CHARACTERS + parsedBlocks 的 unique speakers 合併去重
  - Write 的 slots、Search 的「角色」filter 都吃這個 hook
  - 字數 bug 要 reproduce 再修

---

## 5. 重要狀態小心地雷

### 5-A. `index.html` 的 tokens.css 連結被砍了
本 session 結尾，user 或 linter 動過 [`modules/script-editor/index.html`](modules/script-editor/index.html)，**移除了** `<link rel="stylesheet" href="tokens.css" />` 那一行。tokens.css 還在資料夾裡但沒被載入。

**檢查**：tokens 變數（`--gold`、`--navy` 等）現在從哪來？可能：
- 從 App Shell（akasha-library/index.html）的全域 CSS 透過 iframe 繼承——不會繼承
- 從 main.jsx 或 App.jsx import——應該沒有
- 從 shared.css（akasha-library/assets/styles/shared.css）——只在被 link 時生效

**很可能 dev server 跑出來樣式正常但 build 後 tokens 失效**，或反之。要先實測 dev 模式 vs production build 樣式是否一致。如果壞了，補回：
```html
<link rel="stylesheet" href="tokens.css" />
```
或在 main.jsx 加 `import './tokens.css';`。

### 5-B. WriteTab forward sync 會把 Lohengrin 元數據蓋掉
v2-7 sync 設計：Write 打字 → 350ms debounce → setBlocks(parsedBlocks)。但 parsedBlocks 缺 `original` 德文、`tags`、`avg` 等 Lohengrin 既有元數據。一旦 forward push 完，Lohengrin 的 original/tags 就沒了。

**規避方法**：
1. 加「detach 模式」開關：Write 不 forward push
2. 或 forward push 做「merge」而非「overwrite」——保留 blocks 的非衝突欄位
3. 或加「↺ 從劇本載入」（見 Fix-1 應做事項）

### 5-C. dev server preview 還在跑
session 結束時 `script-editor` server 在 port 5173 dev 模式跑著。下個窗口若 `preview_list` 應該還在。若不在，重新 `preview_start name=script-editor` 即可。.claude/launch.json 在家目錄 `C:\Users\User.DESKTOP-HA8VHD7\.claude\launch.json`（不是 project 的 .claude）。

### 5-D. Fast Refresh 警告（無害）
HMR 偶爾跳 `Could not Fast Refresh ("loadAllData" export is incompatible)`，因為 App.jsx 同時 export default 與 named function loadAllData。React Fast Refresh 規範要 module 只 export components。這只是 HMR 退化成 full reload，不影響 production build。修法是把 loadAllData 搬到另一個檔案，但低優先。

---

## 6. 關鍵檔案地圖

```
akasha-library/
├─ modules/script-editor/                    ← Vite source（build 排除）
│  ├─ index.html                ✏️ Vite entry（注意 5-A 提到的 tokens.css 連結被砍）
│  ├─ tokens.css                ← 設計 tokens（--gold, --navy 等）
│  ├─ legacy/index.legacy.html  ← Phase 8 Vanilla 版備份，不部署
│  ├─ public/data/              ← Lohengrin 8 個 JSON/JSONL
│  ├─ HANDOFF.md                ← 本文件
│  └─ src/
│     ├─ App.jsx                ← 從 Archive 3844 行 jsx 改造（重點 line 213 VALID_BLOCK_TYPES）
│     ├─ main.jsx               ← Vite mount
│     ├─ components/
│     │  ├─ WriteTab.jsx        ← 速寫 TAB（含 textarea + slot + voice + sync）
│     │  └─ BgmPanel.jsx        ← BGM/SFX 占位（委派 tsuki-synth）
│     ├─ hooks/
│     │  └─ useVoiceTTS.js      ← Web Speech API hook
│     └─ lib/
│        └─ parser.js           ← Plain Script ↔ blocks（含 v2-fix4 characters 反查）
├─ dist/script-editor/                       ← Vite build output（commit 過）
├─ docs/tsuki-synth-integration.md           ← BGM/SFX 接入計畫
├─ vite.config.script-editor.js
├─ scripts/build.js                          ← v2-8 改：modules/script-editor 加入 exclude
├─ sw.js                                     ← v2-8 改：CACHE_NAME=v5、cache list 換 dist/
├─ index.html                                ← App Shell：line 1949 已指 dist/script-editor/
└─ package.json                              ← 新增 dev:script-editor / build:script-editor
```

---

## 7. 開工建議順序

1. **先 commit 現有未提交 Fix（10 分鐘）**
   ```bash
   git status                                 # 確認改的是這些檔案
   git add modules/script-editor/src/App.jsx \
           modules/script-editor/src/components/WriteTab.jsx \
           modules/script-editor/src/lib/parser.js \
           modules/script-editor/index.html \
           modules/script-editor/HANDOFF.md
   git commit -m "fix(phase-17): empty quotes / writing room / unknown speaker"
   ```

2. **補完最容易的 Fix-1 殘餘**（10 分鐘）
   - 把 `command` 加進 `VALID_BLOCK_TYPES`（App.jsx line 213）
   - 在 WriteTab 工具列加「↺ 從劇本」按鈕：`onClick={() => setContent(blocksToPlainScript(blocks, characters))}`

3. **5-A 檢查 tokens.css**（5 分鐘）
   - 開 dev server，看樣式有沒有壞
   - 若壞，把 `<link rel="stylesheet" href="tokens.css" />` 補回 index.html 或 main.jsx 加 import

4. **Fix-6 重現字數 bug**（15 分鐘）
   - 在 textarea 連續刪字、加字，觀察 stats panel 的「Total Characters」
   - 看是否 stale closure / useMemo 沒重新計算
   - 修 parser.js 的 `computeStats` 或 WriteTab 的 useMemo 依賴陣列

5. **Fix-5 Persona Slots 編輯 UI**（1 小時）
   - 設計：右鍵 → menu（清除 / 指派 / 鎖定）
   - localStorage `sw_slot_locks_v1` 持久化
   - dynamicSlots 計算改為 lock + auto-fill 混合

6. **Fix-6 Part 2 統一角色清單**（30 分鐘）
   - 寫 `useCharactersOfWork(blocks, characters)` 抽出單一 source of truth
   - SearchView 的角色 filter、WriteTab slots 都吃這個

7. **全部完成後**
   - `npm test`（build + critical file check）
   - `git push -u origin feature/archive-host-merge`
   - 視狀況開 PR 或直接合 master

---

## 8. 與 sibling 專案 tsuki-synth 的對接

詳見 [`docs/tsuki-synth-integration.md`](../../docs/tsuki-synth-integration.md)。摘要：

- tsuki-synth 在 `C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth`
- VST3 + Standalone build OK，CLI render 待修
- 一旦 CLI 修好 → 批次預渲染 sound library → WAV 搬進 akasha → Script Editor 接 cue
- 詳細路徑：Phase A → E

---

## 9. 規格出處 / 上下文連結

- 前次失敗嘗試的 commit 鏈：`git log --oneline origin/feature/akasha-4tab-attempt`（看當初 Vanilla 重寫的東西，有些純邏輯可參考）
- Archive 原始位置：`C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\-Archive_Script_Editor-\`（保留當原始備份）
- 規格主文件：`akasha-feature-additions-spec.md`（Phase 17 在這）
- 本次 dev log：`dev-log.md`「2026-05-19：Phase 17 v2 Script Editor — Archive-host merge 完成」

---

**接班人開工前先**：
1. 讀本文件
2. `git status`
3. `npm run dev:script-editor` 開預覽
4. 在 textarea 連續刪字實測 Fix-6 字數 bug
5. 切到 Editor 看「未知 type 『command』」警告（佐證 Fix-1 殘餘）
