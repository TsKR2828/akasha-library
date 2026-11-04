# tsuki-synth × 阿卡夏圖書館：使用說明

> 2026-11-03 接入完成。舊版規劃文件見 `archive/docs/tsuki-synth-integration.md`。

圖書館裡有兩種方式使用 tsuki-synth：

| | 零韻即興演奏 | 劇本 BGM / SFX |
|---|---|---|
| 誰決定彈什麼 | 零韻依你的要求**當場寫 score.json** | 你在劇本寫 `#bgm：` / `#sfx：` |
| 聲音怎麼來 | tsuki-synth 引擎編成 **WebAssembly**，在瀏覽器裡即時渲染 | 45 個預先渲染好的音色庫 |
| 準備步驟 | `node scripts/build-tsuki-wasm.js` | `node scripts/sync-audio.js` |

兩者都只在**私有版**（tsuki-synth 為專有授權）。

## 零、零韻即興演奏

在零韻面板說「彈一首小曲」、「來段下雨天的音樂」、「幫這一幕作曲」之類的話：

1. 零韻會讀 tsuki-synth 的 `SCORE_GUIDE.md`，寫一份 `score.json`。
2. 圖書館用 WebAssembly 版引擎渲染，通常 1 秒內完成，並自動播放。
3. 演奏卡片可以：▶ 播放／■ 停止、⬇ 下載 WAV、存書庫（`.score.json`，可在 Code & Data 開啟）、查看樂譜。
4. 樂譜若被引擎退回（例如用了不存在的樂器），零韻會自動修正一次。

限制：90 秒以內、不支援 layers。
每次演奏請求會多帶約 6 千 token 的樂譜指南。

### 準備 WebAssembly 引擎

需要：tsuki-synth checkout（含 `libs/JUCE` submodule）、Emscripten（`em++`）。不需要先用 CMake 編 tsuki-synth。

```bash
node scripts/build-tsuki-wasm.js --tsuki ../tsuki-synth
```

產出在 `private-assets/tsuki/`：`tsukisynth.mjs` / `tsukisynth.wasm`（約 1.2 MB）、`SCORE_GUIDE.md`、`score.schema.json`、`manifest.json`（tsuki-synth commit、編譯器版本、雜湊）。

**引擎程式碼一行不改**。只在暫存資料夾裡替 JUCE 8 的 `juce_core` 補 WebAssembly 缺的幾個實作，加上 `JUCE_LITTLE_ENDIAN=1`。

**和原生 CLI 的一致性**（2026-11-03，tsuki-synth `3f9b90a`，Emscripten 3.1.6）：用 tsuki-synth 的 `tools/crossplatform_verify.py` 比對 5 個 probe，**全部在登記容差內**。

| probe | 最大差 | 頻譜偏差 | 音高偏差 |
|---|---|---|---|
| water_gong_clamped | −124.5 dBFS（5 LSB） | 0.0005 dB | 0.0000 c |
| water_gong_free | −138.5 dBFS（1 LSB） | 0.0003 dB | 0.0000 c |
| physical_piano | −132.5 dBFS（2 LSB） | 0.0005 dB | 0.0000 c |
| akashic_bell | −132.5 dBFS（2 LSB） | 0.0010 dB | 0.0000 c |
| fur_elise_opening | −132.5 dBFS（2 LSB） | 0.0006 dB | 0.0000 c |
| 容差上限 | −120 dBFS | 0.01 dB | 0.01 c |

## 劇本 BGM / SFX

### 一、劇本裡怎麼寫

```
#scene：第一幕
#bgm：akashic_loop_001      ← 循環背景音（換曲時 1 秒交叉淡化）
旁白：天色將明。
傳令官：聽令！
#sfx：akashic_bell_001      ← 單次音效
#bgm：stop                  ← 停止背景音
```

- 聲音名稱可以在劇本工房右側「配樂」分頁查，每個聲音底下都有可直接複製的 cue 文字。
- 名稱打錯時，「配樂」分頁會標 ⚠「音色庫沒有這個聲音」。
- 在「語音」分頁按「全部試聽」，朗讀到 cue 的位置就會播放對應聲音。語音出現時 BGM 會自動壓低 30%。

### 二、為什麼公開版沒有聲音

tsuki-synth 是**專有授權（保留所有權利）**，所以：

| 位置 | 有沒有音檔 |
|---|---|
| GitHub 上的 akasha-library repo | ✗（`private-assets/` 已列入 `.gitignore`） |
| GitHub Pages 公開 demo（`build:public`） | ✗（build 時排除 `private-assets/`） |
| 私有版（`build:private`）／本機開發 | ✓ |

公開版的「配樂」分頁仍會顯示音色庫清單，也能檢查 cue 名稱，只是播放鍵停用。
`npm test` 有一項檢查會在音檔可能外流時直接失敗。

### 三、更新音檔（tsuki-synth 改版後）

需要：tsuki-synth 的 CLI 執行檔、ffmpeg。

```bash
node scripts/sync-audio.js --tsuki ../tsuki-synth --cli ../tsuki-synth/build/TsukiSynthCLI_artefacts/Release/TsukiSynthCLI.exe
```

這一步會：

1. 依 `tsuki-synth/sound_library/sound_names.json` 逐一用 CLI 渲染全部聲音。
2. 循環音：把殘響尾巴疊回開頭，截成剛好一個循環長度，接縫才不會斷。
3. 轉成 MP3，放進 `private-assets/audio/{bgm,sfx}/`，並寫 `manifest.json`（tsuki-synth commit、渲染器版本、雜湊）。
4. 更新公開的音色庫清單 `modules/script-editor/src/lib/soundCatalog.json`（只有名稱和類型，沒有音訊）。

只想更新清單、不渲染：加 `--catalog-only`。

### 四、目前收錄（tsuki-synth `3f9b90a`）

- 45 個聲音：6 個循環 BGM、30 個單次 SFX、9 個變體 SFX，MP3 合計約 3.4 MB。
- 6 個世界觀：akashic、rabbit、restraint、forest、ocean、clockwork。
- 2026-11-03 這一批在 Linux（GCC 13.3）渲染。之後在 Windows 重跑上面的指令，就會換成 Windows 的渲染結果。
