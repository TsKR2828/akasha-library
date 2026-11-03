# tsuki-synth × 劇本工房：BGM / SFX 使用說明

> 2026-11-03 v3 接入完成。舊版規劃文件見 `archive/docs/tsuki-synth-integration.md`。

## 一、劇本裡怎麼寫

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

## 二、為什麼公開版沒有聲音

tsuki-synth 是**專有授權（保留所有權利）**，所以：

| 位置 | 有沒有音檔 |
|---|---|
| GitHub 上的 akasha-library repo | ✗（`private-assets/` 已列入 `.gitignore`） |
| GitHub Pages 公開 demo（`build:public`） | ✗（build 時排除 `private-assets/`） |
| 私有版（`build:private`）／本機開發 | ✓ |

公開版的「配樂」分頁仍會顯示音色庫清單，也能檢查 cue 名稱，只是播放鍵停用。
`npm test` 有一項檢查會在音檔可能外流時直接失敗。

## 三、更新音檔（tsuki-synth 改版後）

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

## 四、目前收錄（tsuki-synth `3f9b90a`）

- 45 個聲音：6 個循環 BGM、30 個單次 SFX、9 個變體 SFX，MP3 合計約 3.4 MB。
- 6 個世界觀：akashic、rabbit、restraint、forest、ocean、clockwork。
- 2026-11-03 這一批在 Linux（GCC 13.3）渲染。之後在 Windows 重跑上面的指令，就會換成 Windows 的渲染結果。
