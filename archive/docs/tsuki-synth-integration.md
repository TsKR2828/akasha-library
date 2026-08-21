# tsuki-synth ↔ akasha-library Integration Plan

> 文件建立：2026-05-19（Phase 17 v2-6 期間）
> 範圍：Script Editor 的 `#bgm:` / `#sfx:` 指令如何接到外部聲音庫
> 對應 task：v2-6（BGM/SFX 占位）、未來 v3 系列（實際接入）

---

## TL;DR

**Script Editor 不自行合成 BGM/SFX。** 所有聲音由獨立子專案 [`tsuki-synth`](C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth) 預渲染成 WAV 後，由 akasha-library 收編為靜態 asset 播放。

---

## 為什麼這樣設計

| 選項 | 優點 | 缺點 | 採用？ |
|------|------|------|:------:|
| Script Editor 自寫 Web Audio 合成（原 v2-6 規格） | 零依賴、即時可用 | 與 tsuki-synth 音色不一致、兩處維護、瀏覽器 DSP 精度差 | ❌ |
| 直接掛 tsuki-synth VST3 | 音色 100% 一致 | 瀏覽器不能跑 VST3、要 native bridge | ❌ |
| **tsuki-synth CLI 批次渲染 → WAV → 收編** | 音色一致、瀏覽器原生 `<audio>` 即可、可離線 | 要等 tsuki-synth CLI 修好、增加 repo 體積 | ✅ |

---

## 兩個專案的角色

### tsuki-synth — 聲音的「生產者」

- **位置**：`C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth`
- **本體**：C++17 / JUCE 8.0.12 / CMake 的 VST3/AU 插件
- **三引擎**：Cimbalom（modal/string）、Chromatic（beam+plate）、FM Piano（2-op FM）
- **DSP**：物理建模 — 從材料密度、Young's modulus、弦張力、板 Bessel zeros 算出 vibration modes
- **產出**：
  - VST3 / Standalone（給 DAW 直接用）
  - **CLI render**：`tsukisynth-cli render score.json → foo.wav`（目前壞掉，待修）
  - JSON Score 格式：`scores/schema/score.schema.json`
  - Sound library 索引：`sound_library/sound_names.json`、`sound_library/tags.json`

### akasha-library / Script Editor — 聲音的「使用者」

- 解析劇本中的 `#bgm:` 和 `#sfx:` 指令
- 顯示 cue 預覽（哪些音訊會在哪一行觸發）
- 播放：HTML5 `<audio>` element，loop / fade / cross-fade
- **不負責**：合成、效果處理、preset 設計

---

## Cue 語法

Script Editor 的 Plain Script parser 已能識別 `#xxx：value` 為 command block。約定兩個 command 名稱：

```
#bgm: <sound_id>     # Background music — long, looping
#sfx: <sound_id>     # Sound effect — short, oneshot
```

範例：
```
#scene：第一幕 · 第一場
#bgm: akashic_library_drone_001
旁白：天色將明……
傳令官：聽令！
#sfx: akashic_bell_001
艾爾莎：（顫抖地）我並非弒弟之兇手。
```

`<sound_id>` 對應 `tsuki-synth/sound_library/sound_names.json` 的 `id` 欄位。

---

## 整合路徑（Phase A → E）

### Phase A — tsuki-synth 完工 ✋ 等待中

| 子任務 | 狀態 |
|--------|:----:|
| VST3 build | ✅ done (6.7 MB) |
| Standalone build | ✅ done (6.5 MB) |
| Cimbalom playability pass | ✅ done (2026-05-08) |
| **CLI render target** | ❌ broken — `ScoreRenderer.h` API mismatch with JUCE `SynthesiserVoice` |
| Factory presets v1 | ⏳ 待 audition tune |
| Sound library 完整化 | ⏳ 目前 8 個 oneshot，缺 BGM-type loops |
| DAW host validation | ⏳ 等找到 DAW |

**阻塞點**：CLI render 修好之前，沒有自動化的 WAV 出口。

### Phase B — 批次預渲染（tsuki-synth 端）

```bash
cd tsuki-synth
tsukisynth-cli --batch scores/examples/*.score.json --output exports/wav/
```

每個 `<sound_id>` 對應一個 `exports/wav/<sound_id>.wav`。

**BGM-type 規劃**：tsuki-synth 目前產出多為 oneshot SFX；要加 BGM 需先：
1. 撰寫 long-form score（30~120 秒，可 loop）
2. 在 sound_names.json 新增 `sound_type: "loop"` 的條目
3. CLI 渲染時注意 loop point 平滑

### Phase C — 收編到 akasha-library

```
akasha-library/modules/script-editor/public/audio/
├── bgm/                            # loop 類
│   ├── akashic_library_drone_001.wav
│   └── ...
└── sfx/                            # oneshot 類
    ├── akashic_bell_001.wav
    └── ...
```

可選同步機制：
- Git submodule（tsuki-synth 為 submodule，build 時 copy 過來）
- 手動同步（每次 tsuki-synth release 後人工 sync WAV）
- npm script: `npm run sync:audio` 從 tsuki-synth 的 build artifact 抓 WAV

### Phase D — Script Editor 接 cue（v3 工作）

新建 hook `src/hooks/useAudioCues.js`：

```js
// 大致 API
const audio = useAudioCues();
audio.play("#bgm", "akashic_library_drone_001");  // 載入 + 播放 + loop
audio.play("#sfx", "akashic_bell_001");           // 一次性
audio.fadeOut(2000);                              // 2 秒淡出
audio.stop();
```

UI：BgmPanel 的「Cues in Script」每個 cue 加 ▶ 按鈕；Status bar 顯示目前播放的 BGM。

### Phase E — 三軌混音

Voice TTS（v2-5）+ BGM + SFX 同時播放：
- 三者各有獨立音量（在 BgmPanel / VoicePanel 設定）
- BGM 自動 ducking（語音播放時 BGM 音量降 30%）
- 場景切換時 BGM cross-fade（舊 fadeout 1s + 新 fadein 1s）

---

## 為什麼 Web Audio 合成不是 stopgap

考慮過：在 tsuki-synth 完工前先用 Web Audio API 寫 4 樂器 × 4 preset 的合成（原 v2-6 規格）。決定不做，因為：

1. **音色不一致** — 物理建模（C++）和簡單振盪器疊加（JS）出來的聲音差別很大，使用者寫的時候習慣某種音色，正式接入後又會變樣
2. **重複維護** — 同一個 preset 名稱（如 `quiet_archive_piano`）在兩處都要實作和調參
3. **誤導使用者** — 看起來「能用」實際上是占位品，反而拖延 tsuki-synth 的正式整合
4. **瀏覽器 DSP 限制** — Web Audio 的 ConvolverNode、即時 LPF 精度比 C++ DSP 差；物理建模需要的 N-mode 疊加在瀏覽器吃 CPU

**結論**：v2-6 改為純面板 + 整合計畫文件，等 tsuki-synth CLI 修好就直接接 WAV。

---

## 何時可以推進

下列任一發生時，重啟 v3 接入工作：

- [ ] tsuki-synth CLI target 編譯通過（`TsukiSynthCLI` 修好 `ScoreRenderer.h`）
- [ ] tsuki-synth `--batch render` 成功產出 WAV
- [ ] tsuki-synth sound_library 新增 BGM-type loop 條目（至少 3 個）

聯絡 tsuki-synth 維護者（自己）確認 release tag 與 WAV asset 位置。

---

## 相關檔案

- 本檔：`akasha-library/docs/tsuki-synth-integration.md`
- 占位面板：`akasha-library/modules/script-editor/src/components/BgmPanel.jsx`
- Plain Script parser（識別 `#bgm:` / `#sfx:`）：`akasha-library/modules/script-editor/src/lib/parser.js`
- tsuki-synth README：`C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth\README.md`
- tsuki-synth ROADMAP：`C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth\ROADMAP.md`
- tsuki-synth sound library：`C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth\sound_library\sound_names.json`
