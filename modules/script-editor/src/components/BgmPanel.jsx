import React from "react";
import CATALOG from "../lib/soundCatalog.json";

/* ============================================================
   BgmPanel — v3（tsuki-synth 整合）
   ────────────────────────────────────────────────────────────
   聲音一律由姊妹專案 tsuki-synth（C++ / JUCE 物理建模）預渲染，
   劇本工房只負責「播放」，不自己合成。

   資料來源：
     • soundCatalog.json — 音色庫的公開 metadata（id / 名稱 / 類型），
       由 scripts/sync-audio.js 從 tsuki-synth/sound_library/sound_names.json 產生，
       公開版也有，用來檢查劇本裡的 cue 是否存在。
     • private-assets/audio/ — 實際音檔＋manifest.json，只在私有版。
       tsuki-synth 為專有授權，音檔不進 git、不進公開 build。

   Cue 語法：
     #bgm：<sound_id>   循環背景音（換曲 1 秒交叉淡化；#bgm：stop 停止）
     #sfx：<sound_id>   單次音效
   ============================================================ */

const BY_ID = new Map(CATALOG.map(s => [s.id, s]));
const isLoop = (s) => s?.sound_type === "loop";

const MOOD_COLORS = {
  sacred: "rgb(227,196,134)", mystical: "rgb(168,156,216)", tense: "rgb(196,96,79)",
  ominous: "rgb(123,142,201)", calm: "rgb(106,174,127)", playful: "rgb(201,168,106)",
  epic: "var(--gold)",
};

export default function BgmPanel({ blocks, audio }) {
  const ready = audio?.status === "ready";

  const cues = React.useMemo(() => {
    const out = [];
    for (const b of (blocks || [])) {
      if (b.type !== "command") continue;
      if (b.command === "bgm" || b.command === "sfx") {
        out.push({ kind: b.command, value: String(b.value || "").trim(), _line: b._line });
      }
    }
    return out;
  }, [blocks]);

  const loops = CATALOG.filter(isLoop);
  const oneshots = CATALOG.filter(s => !isLoop(s));

  return (
    <div className="se-panel">
      <StatusCallout audio={audio} />

      {ready && <Controls audio={audio} />}

      {/* 目前文稿中的 cue */}
      <section>
        <SectionHead latin="Cues in Script" zh={`本稿中的音訊指令 · ${cues.length}`} />
        {cues.length === 0 ? (
          <div className="se-panel-hint">
            尚無 <code className="se-code">#bgm：</code> 或 <code className="se-code">#sfx：</code> 指令。<br />
            範例：<code className="se-code">#bgm：{loops[0]?.id || "akashic_loop_001"}</code>
          </div>
        ) : (
          <div className="se-panel-list">
            {cues.map((c, i) => <CueRow key={i} cue={c} audio={audio} ready={ready} />)}
          </div>
        )}
      </section>

      <LibrarySection title="BGM · 循環" latin="Loops" sounds={loops} kind="bgm" audio={audio} ready={ready} />
      <LibrarySection title="SFX · 單次" latin="One-shots" sounds={oneshots} kind="sfx" audio={audio} ready={ready} />
    </div>
  );
}

function StatusCallout({ audio }) {
  const status = audio?.status || "unavailable";
  const m = audio?.manifest;
  const tone = status === "ready"
    ? { bg: "rgba(106,174,127,0.08)", bd: "rgba(106,174,127,0.28)", fg: "var(--success)", label: "Soundscape · Ready" }
    : { bg: "rgba(168,156,216,0.08)", bd: "rgba(168,156,216,0.25)", fg: "rgb(168,156,216)", label: status === "checking" ? "Soundscape · Checking" : "Soundscape · Catalog only" };
  return (
    <div className="se-panel-callout" style={{ background: tone.bg, borderColor: tone.bd }}>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontSize: 10.5, letterSpacing: "0.22em",
        color: tone.fg, fontVariant: "small-caps", textTransform: "uppercase", marginBottom: 4,
      }}>{tone.label}</div>
      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 13, lineHeight: 1.6 }}>
        聲音由姊妹專案 <code className="se-code">tsuki-synth</code> 物理建模預渲染，共 {CATALOG.length} 個。
      </div>
      <div style={{ marginTop: 4, color: "var(--text-tertiary)", fontSize: 11, lineHeight: 1.6 }}>
        {status === "ready" && <>音檔已載入，可試聽、也會在「語音」朗讀時同步播放。{m?.source?.commit && <> 來源 tsuki-synth <code className="se-code">{m.source.commit}</code>{m.generated_at ? ` · ${String(m.generated_at).slice(0, 10)}` : ""}</>}</>}
        {status === "checking" && "正在確認這個版本是否附帶音檔…"}
        {status === "unavailable" && <>此版本不含音檔（tsuki-synth 為專有授權，音檔只收在私有版）。仍可用下方清單檢查 cue 名稱是否正確。</>}
      </div>
    </div>
  );
}

function Controls({ audio }) {
  const { settings, setSettings, nowBgm } = audio;
  const nowName = nowBgm ? (BY_ID.get(nowBgm)?.name_zh || nowBgm) : null;
  return (
    <section>
      <SectionHead latin="Mixer" zh="音量" />
      <div className="se-panel-list" style={{ gap: 6 }}>
        <label style={rowStyle}>
          <span>啟用</span>
          <input type="checkbox" checked={settings.enabled}
            onChange={e => { setSettings({ enabled: e.target.checked }); if (!e.target.checked) audio.stopBgm(300); }} />
          <span style={{ flex: 1 }} />
        </label>
        <VolumeRow label="BGM" value={settings.bgm} onChange={v => setSettings({ bgm: v })} />
        <VolumeRow label="SFX" value={settings.sfx} onChange={v => setSettings({ sfx: v })} />
        <div style={{ ...rowStyle, gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
            {nowName ? <>播放中：<strong style={{ color: "var(--gold)" }}>{nowName}</strong></> : "BGM 未播放"}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={!nowBgm} onClick={() => audio.stopBgm(800)}>■ 停止 BGM</button>
        </div>
      </div>
    </section>
  );
}

function VolumeRow({ label, value, onChange }) {
  return (
    <label style={rowStyle}>
      <span style={{ minWidth: 34 }}>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={value}
        onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", minWidth: 30, textAlign: "right" }}>
        {Math.round(value * 100)}
      </span>
    </label>
  );
}

function CueRow({ cue, audio, ready }) {
  const isStop = cue.kind === "bgm" && ["stop", "off", "none"].includes(cue.value);
  const s = BY_ID.get(cue.value);
  let note, ok = true;
  if (isStop) note = <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>停止 BGM</span>;
  else if (!s) { ok = false; note = <span style={{ fontSize: 10.5, color: "var(--danger)" }}>⚠ 音色庫沒有這個聲音</span>; }
  else if (cue.kind === "bgm" && !isLoop(s)) note = <span style={{ fontSize: 10.5, color: "var(--gold-dim)" }}>△ {s.name_zh}（單次音效，建議用 #sfx）</span>;
  else if (cue.kind === "sfx" && isLoop(s)) note = <span style={{ fontSize: 10.5, color: "var(--gold-dim)" }}>△ {s.name_zh}（循環音，建議用 #bgm）</span>;
  else note = <span style={{ fontSize: 10.5, color: "var(--success)" }}>✓ {s.name_zh}</span>;

  return (
    <div className="se-panel-row" style={{
      background: ok ? "rgba(106,174,127,0.06)" : "rgba(196,96,79,0.06)",
      borderColor: ok ? "rgba(106,174,127,0.25)" : "rgba(196,96,79,0.25)",
      alignItems: "center", gap: 8,
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: cue.kind === "bgm" ? "var(--gold)" : "rgb(168,156,216)", minWidth: 34 }}>#{cue.kind}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cue.value}</span>
      {note}
      {!isStop && <PlayBtn disabled={!ready || !s} onClick={() => audio.playCue(cue.kind, cue.value)} />}
    </div>
  );
}

function LibrarySection({ title, latin, sounds, kind, audio, ready }) {
  const [open, setOpen] = React.useState(kind === "bgm");
  return (
    <section>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <SectionHead latin={latin} zh={`${title} · ${sounds.length} ${open ? "▾" : "▸"}`} />
      </button>
      {open && (
        <div className="se-panel-list">
          {sounds.map(s => (
            <div key={s.id} className="se-panel-row" style={{ alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: MOOD_COLORS[s.mood] || "var(--text-tertiary)" }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: "var(--font-serif-tc)", fontSize: 12, color: "var(--text-primary)" }}>
                  {s.name_zh || s.name}
                  <span style={{ marginLeft: 6, fontFamily: "var(--font-serif-en)", fontSize: 10, color: "var(--text-tertiary)" }}>
                    {s.duration_sec != null ? `${s.duration_sec}s` : ""}
                  </span>
                </span>
                <code className="se-code" style={{ fontSize: 10, userSelect: "all" }}>#{kind}：{s.id}</code>
              </span>
              <PlayBtn disabled={!ready} onClick={() => (kind === "bgm" ? audio.playBgm(s.id) : audio.playSfx(s.id))} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlayBtn({ disabled, onClick }) {
  return (
    <button type="button" className="btn" disabled={disabled} onClick={onClick}
      title={disabled ? "此版本不含音檔" : "試聽"}
      style={{ height: 24, minHeight: 24, padding: "0 8px", flexShrink: 0 }}>▶</button>
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

const rowStyle = {
  display: "flex", alignItems: "center", gap: 10,
  fontFamily: "var(--font-serif-tc)", fontSize: 12, color: "var(--text-secondary)",
};
