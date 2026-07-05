import React from "react";

/* ============================================================
   BgmPanel — Phase 17 v2-6
   ────────────────────────────────────────────────────────────
   ⚠ 重要設計決策：本面板不實作 Web Audio 合成。

   BGM / SFX 由獨立子專案 tsuki-synth 負責：
     C:\Users\User.DESKTOP-HA8VHD7\Documents\Claude\tsuki-synth
       └─ TsukiSynth — Multi-Engine VST3/AU Plugin
          • C++ / JUCE 8.0.12
          • 3 個引擎：Cimbalom (modal/string) / Chromatic (beam+plate) / FM Piano
          • Effect Chain: Distortion → Compressor → Delay → Reverb
          • 40 個 APVTS 參數、12 個 factory preset
          • Tag: playable-vst3-clean-build-v0（VST3 + Standalone clean build OK）

   整合 pipeline（規劃，待 tsuki-synth 完工）：
     1. AI 或人工撰寫 JSON score（scores/examples/*.score.json）
     2. tsukisynth-cli render score.json → exports/wav/foo.wav
     3. akasha-library 收編 WAV 進 modules/script-editor/public/audio/
     4. Script 內 #bgm:foo / #sfx:foo 觸發 <audio> playback

   為什麼不在這裡做 Web Audio 合成：
     • tsuki-synth 已有完整的物理建模（材質、弦/梁/板 eigenmode）
     • 合成兩套會導致音色不一致
     • Script Editor 應該是「使用者」而不是「再實作一次」
     • Web Audio 浮點即時運算與 C++ DSP 精度差異也會讓 demo 失真

   tsuki-synth 當前狀態（2026-05-08）：
     ✅ VST3 build passed (6.7 MB)
     ✅ Standalone build passed (6.5 MB)
     ✅ Cimbalom playability pass complete
     ❌ CLI target (TsukiSynthCLI) — ScoreRenderer API mismatch
     ⏳ DAW host validation pending (no DAW on dev machine)

   解鎖路徑：tsuki-synth 修好 CLI render → 批次產出 sound_library WAV →
            akasha 引用 → Script Editor #bgm 真正能播。
   ============================================================ */

/* tsuki-synth sound_library snapshot（2026-05-19 取自 sound_names.json）
   實際 library 在 tsuki-synth/sound_library/sound_names.json，
   接入時應改為動態載入或同步檢入。 */
const PLANNED_SOUNDS = [
  { id: "akashic_bell_001",         zh: "阿卡西之鐘",   en: "Akashic Bell",          mood: "sacred",   engine: "plate",        type: "oneshot", world: "akashic" },
  { id: "akashic_gate_open_001",    zh: "阿卡西開門",   en: "Akashic Gate Open",     mood: "sacred",   engine: "plate",        type: "oneshot", world: "akashic" },
  { id: "akashic_record_chime_001", zh: "紀錄提示",     en: "Akashic Record Chime",  mood: "sacred",   engine: "beam",         type: "oneshot", world: "akashic" },
  { id: "akashic_page_turn_001",    zh: "翻頁",         en: "Akashic Page Turn",     mood: "calm",     engine: "string+plate", type: "oneshot", world: "akashic" },
  { id: "akashic_library_drone_001",zh: "圖書館低鳴",   en: "Akashic Library Drone", mood: "mystical", engine: "plate",        type: "oneshot", world: "akashic" },
  { id: "akashic_light_tap_001",    zh: "確認光點",     en: "Akashic Light Tap",     mood: "calm",     engine: "beam",         type: "oneshot", world: "akashic" },
  { id: "rabbit_warning_001",       zh: "兔兔警告",     en: "Rabbit Warning",        mood: "tense",    engine: "beam",         type: "oneshot", world: "creature" },
  { id: "restraint_metal_click_001",zh: "拘束扣合",     en: "Restraint Metal Click", mood: "ominous",  engine: "string+plate", type: "oneshot", world: "mechanical" },
];

const MOOD_COLORS = {
  sacred:    "rgb(227,196,134)",  // gold-bright
  mystical:  "rgb(168,156,216)",
  tense:     "rgb(196,96,79)",
  ominous:   "rgb(123,142,201)",
  calm:      "rgb(106,174,127)",  // success
  playful:   "rgb(201,168,106)",
  epic:      "var(--gold)",
};

export default function BgmPanel({ blocks }) {
  // 從目前 blocks 撈出 #bgm / #sfx command — 即時顯示「會觸發什麼聲音」
  const cues = React.useMemo(() => {
    const out = [];
    for (const b of (blocks || [])) {
      if (b.type !== "command") continue;
      if (b.command === "bgm" || b.command === "sfx") {
        out.push({ kind: b.command, value: b.value, _line: b._line });
      }
    }
    return out;
  }, [blocks]);

  return (
    <div className="se-panel">

      {/* 狀態指示 */}
      <div className="se-panel-callout" style={{ background: "rgba(168,156,216,0.08)", borderColor: "rgba(168,156,216,0.25)" }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10.5,
          letterSpacing: "0.22em", color: "rgb(168,156,216)",
          fontVariant: "small-caps", textTransform: "uppercase",
          marginBottom: 4,
        }}>Soundscape · Deferred</div>
        <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 13, lineHeight: 1.6 }}>
          BGM / SFX 由獨立子專案 <code className="se-code">tsuki-synth</code> 負責。
        </div>
        <div style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: 11, lineHeight: 1.6 }}>
          目前狀態：VST3 / Standalone build 完成；CLI render 待修；WAV 預渲染 pipeline 尚未啟動。
          Script Editor 端只負責解析 <code className="se-code">#bgm:</code> / <code className="se-code">#sfx:</code> 指令並顯示 cue，
          實際音訊接入需等 tsuki-synth 出 sound library WAV。
        </div>
      </div>

      {/* 目前文稿中的 cue */}
      <section>
        <SectionHead latin="Cues in Script" zh={`本稿中的音訊指令 · ${cues.length}`} />
        {cues.length === 0 ? (
          <div className="se-panel-hint">
            尚無 <code className="se-code">#bgm:</code> 或 <code className="se-code">#sfx:</code> 指令。<br />
            範例：<code className="se-code">#bgm: akashic_library_drone_001</code>
          </div>
        ) : (
          <div className="se-panel-list">
            {cues.map((c, i) => {
              const planned = PLANNED_SOUNDS.find(s => s.id === c.value);
              return (
                <div key={i} className="se-panel-row" style={{
                  background: planned ? "rgba(106,174,127,0.06)" : "rgba(196,96,79,0.06)",
                  borderColor: planned ? "rgba(106,174,127,0.25)" : "rgba(196,96,79,0.25)",
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10.5,
                    color: c.kind === "bgm" ? "var(--gold)" : "rgb(168,156,216)",
                    minWidth: 38,
                  }}>#{c.kind}</span>
                  <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-primary)" }}>
                    {c.value}
                  </span>
                  {planned ? (
                    <span style={{ fontSize: 10.5, color: "var(--success)", fontFamily: "var(--font-serif-tc)" }}>
                      ✓ {planned.zh}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: "var(--danger)", fontFamily: "var(--font-serif-tc)" }}>
                      ⚠ 未列於 sound library
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* tsuki-synth 規劃中的聲音庫 */}
      <section>
        <SectionHead latin="Planned Library" zh={`tsuki-synth 聲音庫 · 預覽 ${PLANNED_SOUNDS.length}`} />
        <div className="se-panel-list">
          {PLANNED_SOUNDS.map(s => (
            <div key={s.id} className="se-panel-row">
              <span style={{
                width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                background: MOOD_COLORS[s.mood] || "var(--text-tertiary)",
              }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5,
                color: "var(--text-tertiary)", minWidth: 200, maxWidth: 200,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{s.id}</span>
              <span style={{ flex: 1, fontFamily: "var(--font-serif-tc)", fontSize: 11.5, color: "var(--text-primary)" }}>
                {s.zh}
              </span>
              <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 10, color: MOOD_COLORS[s.mood] || "var(--text-tertiary)", letterSpacing: "0.1em" }}>
                {s.mood}
              </span>
              <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 9.5, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                {s.engine}
              </span>
            </div>
          ))}
          <div className="se-panel-hint" style={{ textAlign: "center", fontFamily: "var(--font-serif-en)", letterSpacing: "0.1em", fontSize: 10.5 }}>
            ↑ snapshot from <code className="se-code">tsuki-synth/sound_library/sound_names.json</code> · 2026-05-19
          </div>
        </div>
      </section>

      {/* 整合 roadmap */}
      <section>
        <SectionHead latin="Integration Roadmap" zh="接入流程" />
        <ol style={{
          marginTop: 6, paddingLeft: 18,
          fontFamily: "var(--font-serif-tc)", fontSize: 12, lineHeight: 1.85,
          color: "var(--text-secondary)",
        }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Phase A</strong> · tsuki-synth 完工：CLI render 修好、12 factory preset 確認、sound library 鎖版</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Phase B</strong> · 批次預渲染：<code className="se-code">tsukisynth-cli --batch scores/examples/*.json → exports/wav/</code></li>
          <li><strong style={{ color: "var(--text-primary)" }}>Phase C</strong> · 收編到 akasha：把 WAV 放到 <code className="se-code">modules/script-editor/public/audio/</code></li>
          <li><strong style={{ color: "var(--text-primary)" }}>Phase D</strong> · Script Editor 接 cue：<code className="se-code">#bgm:</code>/<code className="se-code">#sfx:</code> 觸發 HTML5 <code className="se-code">&lt;audio&gt;</code> playback（loop / fade-in / cross-fade）</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Phase E</strong> · 同步 Voice TTS：旁白 + BGM + SFX 三軌混音播放</li>
        </ol>
      </section>

      <div style={{
        marginTop: 4, padding: "8px 10px",
        background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
        borderRadius: "var(--r-sharp)", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6,
      }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10,
          letterSpacing: "0.18em", color: "var(--gold-dim)",
          textTransform: "uppercase", marginBottom: 4,
        }}>Why not Web Audio here</div>
        tsuki-synth 已用 C++ / JUCE 實作完整物理建模（材質密度 / 弦張力 / 梁特徵值 / 板 Bessel zeros）。
        若在此另寫一套 Web Audio 合成，會造成 (1) 音色不一致、(2) 兩處需同步維護、(3) 瀏覽器即時 DSP 精度比 C++ 差。
        Script Editor 設計上應當是 sound 的「使用者」而非「實作者」。
      </div>
    </div>
  );
}

function SectionHead({ latin, zh }) {
  return (
    <div className="se-panel-title">
      <span className="latin">{latin}</span>
      <span className="zh">{zh}</span>
    </div>
  );
}
