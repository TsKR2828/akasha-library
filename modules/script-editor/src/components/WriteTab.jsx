import React from "react";
import { parsePlainScript, blocksToPlainScript, computeStats, getLineCol } from "../lib/parser.js";
import { useVoiceTTS } from "../hooks/useVoiceTTS.js";
import BgmPanel from "./BgmPanel.jsx";

/* ===========================================================
   WriteTab — Phase 17 (v2-3 ~ v2-6 cumulative)
   ─────────────────────────────────────────────────────────
   Layout:    [ textarea (1fr) | preview pane (360px) ]
   Parser:    Plain Script regex → blocks[] (local, not committed to main state)
   Stores:    localStorage "sw_write_draft" (debounced 500ms)
   Roadmap:   v2-4 Alt+N shortcuts ✓
              v2-5 Voice TTS (Web Speech API) ✓
              v2-6 BGM/SFX panel — placeholder; audio synth handled by
                   sister project tsuki-synth (C++/JUCE VST3, see BgmPanel.jsx)
              v2-7 cross-TAB sync (Write ↔ Editor/Reader) — pending
   =========================================================== */

const DRAFT_KEY = "sw_write_draft_v1";
const SEED = `#scene：第一幕 · 第一場
旁白：天色將明，舍爾德河畔聚集著布拉班特諸侯。
傳令官：聽令！國王海因里希駕臨此地。
艾爾莎：（顫抖地）我……我並非弒弟之兇手。
// 此處插入天鵝騎士登場
#bgm：piano_morning`;

const TYPE_COLORS = {
  dialogue:  { fg: "var(--gold)",          bg: "rgba(201,168,106,0.10)", bd: "var(--gold-line)" },
  narration: { fg: "rgb(154,161,173)",     bg: "rgba(154,161,173,0.08)", bd: "rgba(154,161,173,0.20)" },
  scene:     { fg: "var(--gold-bright)",   bg: "rgba(227,196,134,0.10)", bd: "rgba(227,196,134,0.25)" },
  command:   { fg: "rgb(123,142,201)",     bg: "rgba(123,142,201,0.10)", bd: "rgba(123,142,201,0.25)" },
  choice:    { fg: "rgb(168,156,216)",     bg: "rgba(168,156,216,0.10)", bd: "rgba(168,156,216,0.25)" },
  note:      { fg: "rgb(100,107,120)",     bg: "rgba(100,107,120,0.08)", bd: "rgba(100,107,120,0.20)" },
};

function loadDraft() {
  try { return localStorage.getItem(DRAFT_KEY) ?? SEED; }
  catch { return SEED; }
}
function saveDraft(text) {
  try { localStorage.setItem(DRAFT_KEY, text); } catch {}
}

export default function WriteTab({ blocks, setBlocks, characters }) {
  /* ---------- initial textarea content ----------
     1) localStorage draft 優先（user-authored 不該被 Lohengrin 覆寫）
     2) 否則用 blocks 反向產生（讓 Reader/Editor 載入的劇本能在 Write 看見）
     3) 都沒有 → SEED 範例 */
  const initialContent = React.useMemo(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved != null && saved !== "") return saved;
    } catch {}
    if (Array.isArray(blocks) && blocks.length > 0) {
      return blocksToPlainScript(blocks, characters);
    }
    return SEED;
    // 只在 mount 時計算一次（後續同步交給 effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [content, setContent] = React.useState(initialContent);
  const [previewTab, setPreviewTab] = React.useState("blocks"); // blocks | stats | voice | bgm | layout
  const [caret, setCaret] = React.useState(0);
  const taRef = React.useRef(null);

  /* parse + stats */
  const parsedBlocks = React.useMemo(() => parsePlainScript(content), [content]);
  const stats = React.useMemo(() => computeStats(parsedBlocks), [parsedBlocks]);
  const { line, col } = React.useMemo(() => getLineCol(content, caret), [content, caret]);

  /* Voice TTS (v2-5) */
  const voice = useVoiceTTS();

  /* ---------- v2-7 BI-DIRECTIONAL SYNC ----------
     Forward:  textarea → parsedBlocks → setBlocks   (debounced 350ms)
     Reverse:  blocks → blocksToPlainScript → textarea (when external)
     Loop guards:
       - syncTokenRef: 自己 push 造成 blocks 變動 → reverse useEffect 消化跳過
       - lastReverseRef: reverse 設進來的 content 不要再回 forward push
                         （否則 round-trip 的元數據遺失會回頭覆寫 Editor） */
  const syncTokenRef = React.useRef(0);
  const lastReverseRef = React.useRef(null);
  const initializedRef = React.useRef(false);
  const forwardTimer = React.useRef(null);
  const [syncStatus, setSyncStatus] = React.useState("idle"); // idle | pushing | external

  // Forward sync — push parsedBlocks 到 parent blocks
  React.useEffect(() => {
    if (!setBlocks) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return; // 首次 mount 跳過：避免 SEED/draft 立刻吞掉 Lohengrin
    }
    if (content === lastReverseRef.current) {
      // 這次 content 是 reverse 推進來的，不要 echo 回去
      lastReverseRef.current = null;
      setSyncStatus("idle");
      return;
    }
    clearTimeout(forwardTimer.current);
    setSyncStatus("pushing");
    forwardTimer.current = setTimeout(() => {
      syncTokenRef.current++;
      setBlocks(parsedBlocks);
      setSyncStatus("idle");
    }, 350);
    return () => clearTimeout(forwardTimer.current);
  }, [parsedBlocks, setBlocks, content]);

  // Reverse sync — blocks 從外部變動時，重產 textarea
  React.useEffect(() => {
    if (syncTokenRef.current > 0) {
      syncTokenRef.current--;
      return; // 自己 push 造成的 echo，跳過
    }
    if (!Array.isArray(blocks)) return;
    const regenerated = blocksToPlainScript(blocks, characters);
    if (regenerated && regenerated !== content) {
      lastReverseRef.current = regenerated;
      setContent(regenerated);
      saveDraft(regenerated);
      setSyncStatus("external");
      setTimeout(() => setSyncStatus("idle"), 600);
    }
    // 不把 content 加進依賴（避免 setContent → 再觸發）；blocks 變了才同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, characters]);

  /* ─── v2-4: Alt+N slots ────────────────────────────────
     1, 2 固定（場景 / 旁白）；3-9 動態 auto-bind 對白角色 */
  const dynamicSlots = React.useMemo(() => {
    const seen = [];
    for (const b of parsedBlocks) {
      if (b.type === "dialogue" && b.speaker && !seen.includes(b.speaker)) {
        seen.push(b.speaker);
        if (seen.length >= 7) break;
      }
    }
    return seen;
  }, [parsedBlocks]);

  const slotLabels = React.useMemo(() => ({
    1: "#scene",
    2: "旁白",
    3: dynamicSlots[0] || null,
    4: dynamicSlots[1] || null,
    5: dynamicSlots[2] || null,
    6: dynamicSlots[3] || null,
    7: dynamicSlots[4] || null,
    8: dynamicSlots[5] || null,
    9: dynamicSlots[6] || null,
  }), [dynamicSlots]);

  /* insertSpeakerPrefix — Alt+N or click slot:
     於目前游標所在行的開頭塞入 prefix；若該行已有 speaker：前綴就替換之，
     不論前綴是命令（#xxx：）或對白（X：）。游標跳到「：」之後。 */
  const insertSpeakerPrefix = React.useCallback((slotN) => {
    const ta = taRef.current;
    if (!ta) return;
    const label = slotLabels[slotN];
    if (!label) return;
    const prefix = `${label}：`;

    const value = ta.value;
    const start = ta.selectionStart ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNl   = value.indexOf("\n", start);
    const lineEnd  = nextNl === -1 ? value.length : nextNl;
    const currentLine = value.slice(lineStart, lineEnd);

    // 偵測既有前綴：#cmd：  或  Speaker：
    const m = currentLine.match(/^(#[\w.\-]+|[^#\n][^：:]{0,20})[：:]/);
    const newLine = m
      ? prefix + currentLine.slice(m[0].length).replace(/^\s+/, "")
      : prefix + currentLine;

    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    setContent(newValue);

    const caretPos = lineStart + prefix.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretPos, caretPos);
      setCaret(caretPos);
    });
  }, [slotLabels]);

  const onKeyDown = React.useCallback((e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      insertSpeakerPrefix(Number(e.key));
    }
  }, [insertSpeakerPrefix]);

  /* debounced auto-save */
  const saveTimer = React.useRef(null);
  React.useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(content), 500);
    return () => clearTimeout(saveTimer.current);
  }, [content]);

  const onTextChange = e => setContent(e.target.value);
  const onCaretMove  = e => setCaret(e.target.selectionStart || 0);

  const onClearDraft = () => {
    if (!confirm("清除草稿？此動作會清除本地儲存的速寫內容。")) return;
    setContent("");
    saveDraft("");
  };
  const onResetSeed = () => {
    if (content && !confirm("以範例覆蓋目前草稿？")) return;
    setContent(SEED);
  };

  return (
    <div style={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: "1fr 360px",
      gridTemplateRows: "auto auto 1fr auto",
      overflow: "hidden",
      animation: "swFade 200ms ease",
      background: "var(--navy-deep)",
    }}>
      {/* ───── top toolbar (left, row 1) ───── */}
      <div style={{
        gridColumn: "1 / 2",
        gridRow: "1 / 2",
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 16px",
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-en)",
          fontSize: 10.5, letterSpacing: "0.28em",
          color: "var(--gold)",
          fontVariant: "small-caps", textTransform: "uppercase",
        }}>Scriptorium · Calamus</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
          {stats.total} blocks · {stats.speakers.length} speakers · {stats.totalChars} chars
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onResetSeed}
          style={tbBtnStyle}
          title="以範例覆蓋"
        >範例</button>
        <button
          onClick={onClearDraft}
          style={{ ...tbBtnStyle, color: "var(--danger)", borderColor: "rgba(196,96,79,0.3)" }}
          title="清除草稿"
        >清空</button>
      </div>

      {/* ───── preview tabs (right, row 1) ───── */}
      <div style={{
        gridColumn: "2 / 3",
        gridRow: "1 / 2",
        display: "flex",
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
        borderLeft: "1px solid var(--navy-line)",
      }}>
        {["blocks", "stats", "voice", "bgm", "layout"].map(id => {
          const active = previewTab === id;
          return (
            <button
              key={id}
              onClick={() => setPreviewTab(id)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: active ? "var(--gold-glow)" : "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
                color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
                fontFamily: "var(--font-serif-en)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 160ms",
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* ───── slot badges row (left, row 2) — v2-4 ───── */}
      <div style={{
        gridColumn: "1 / 2",
        gridRow: "2 / 3",
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
        padding: "8px 16px",
        background: "var(--navy-deep)",
        borderBottom: "1px solid var(--navy-line)",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10,
          letterSpacing: "0.22em", color: "var(--gold-dim)",
          fontVariant: "small-caps", textTransform: "uppercase",
          marginRight: 4,
        }}>Persona Slots ·</span>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <SlotBadge
            key={n}
            n={n}
            label={slotLabels[n]}
            fixed={n <= 2}
            onClick={() => slotLabels[n] && insertSpeakerPrefix(n)}
          />
        ))}
      </div>

      {/* ───── textarea (left, row 3) ───── */}
      <textarea
        ref={taRef}
        value={content}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onKeyUp={onCaretMove}
        onClick={onCaretMove}
        onSelect={onCaretMove}
        spellCheck={false}
        placeholder={`輸入 Plain Script — 例：\n#scene：第一幕\n旁白：天色將明……\n角色名：「對白」\n#bgm：piano_morning\n\n快捷鍵：Alt+1 場景 / Alt+2 旁白 / Alt+3~9 角色`}
        style={{
          gridColumn: "1 / 2",
          gridRow: "3 / 4",
          width: "100%",
          height: "100%",
          padding: "20px 28px",
          background: "var(--navy-deep)",
          color: "var(--text-primary)",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: "var(--font-serif-tc)",
          fontSize: 14.5,
          lineHeight: 1.85,
          letterSpacing: "0.02em",
          tabSize: 4,
          whiteSpace: "pre-wrap",
        }}
      />

      {/* ───── preview body (right, rows 2-3 — spans the slot-badges row on left) ───── */}
      <div style={{
        gridColumn: "2 / 3",
        gridRow: "2 / 4",
        overflowY: "auto",
        background: "var(--navy)",
        borderLeft: "1px solid var(--navy-line)",
        padding: "12px 14px",
      }}>
        {previewTab === "blocks" && <BlocksPreview blocks={parsedBlocks} voice={voice} />}
        {previewTab === "stats"  && <StatsPreview stats={stats} />}
        {previewTab === "voice"  && <VoicePanel blocks={parsedBlocks} voice={voice} />}
        {previewTab === "bgm"    && <BgmPanel blocks={parsedBlocks} />}
        {previewTab === "layout" && <LayoutPlaceholder />}
      </div>

      {/* ───── status bar (row 4, spans both cols) ───── */}
      <div style={{
        gridColumn: "1 / 3",
        gridRow: "4 / 5",
        display: "flex", alignItems: "center", gap: 14,
        padding: "5px 16px",
        background: "var(--navy)",
        borderTop: "1px solid var(--navy-line)",
        fontSize: 11, color: "var(--text-tertiary)",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-serif-en)",
      }}>
        <span>Ln {line} · Col {col}</span>
        <span style={badgeStyle}>Plain Script</span>
        <span>{parsedBlocks.length} blocks parsed</span>
        {syncStatus === "pushing" && (
          <span style={{ color: "var(--gold-dim)" }}>↻ Sync→</span>
        )}
        {syncStatus === "external" && (
          <span style={{ color: "rgb(168,156,216)" }}>← Pulled from Editor</span>
        )}
        {syncStatus === "idle" && setBlocks && (
          <span style={{ color: "var(--success)" }} title="Forward & reverse sync 已連通">⇄ Synced</span>
        )}
        {voice.state.queueActive && (
          <span style={{ color: "var(--gold)", animation: "blink 1.2s infinite" }}>
            ▶ Voice {voice.state.queueIdx + 1}/{voice.state.queueTotal}
          </span>
        )}
        {!voice.state.queueActive && voice.state.speaking && (
          <span style={{ color: "var(--gold)", animation: "blink 1.2s infinite" }}>▶ Speaking</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--success)" }}>● Auto-save</span>
      </div>
    </div>
  );
}

const tbBtnStyle = {
  padding: "3px 10px",
  background: "transparent",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  color: "var(--text-secondary)",
  fontSize: 11,
  letterSpacing: "0.06em",
  cursor: "pointer",
  fontFamily: "var(--font-serif-tc)",
};
const badgeStyle = {
  padding: "1px 8px",
  background: "var(--navy-light)",
  borderRadius: 2,
  color: "var(--gold-dim)",
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/* ============= Slot Badge (v2-4) ============= */
function SlotBadge({ n, label, fixed, onClick }) {
  const filled = !!label;
  // colour scheme: 1/2 = gold-bright (fixed scene/narrator), 3-9 = gold (filled) / muted (empty)
  const color = filled
    ? (fixed ? "var(--gold-bright)" : "var(--gold)")
    : "var(--text-tertiary)";
  const border = filled
    ? (fixed ? "var(--gold-line)" : "var(--gold-line)")
    : "var(--navy-line)";
  const bg = filled
    ? (fixed ? "rgba(227,196,134,0.08)" : "rgba(201,168,106,0.06)")
    : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!filled}
      title={filled ? `Alt+${n} 插入「${label}：」` : `空位 — 輸入對白後自動綁定`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px 3px 6px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 2,
        color,
        cursor: filled ? "pointer" : "default",
        fontSize: 11.5,
        fontFamily: "var(--font-serif-tc)",
        letterSpacing: "0.04em",
        transition: "background 150ms, border-color 150ms",
        opacity: filled ? 1 : 0.6,
      }}
    >
      <span style={{
        fontFamily: "var(--font-serif-en)",
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: filled ? "var(--gold-dim)" : "var(--text-tertiary)",
        fontVariant: "small-caps",
        textTransform: "uppercase",
      }}>⌥{n}</span>
      <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label || "—"}
      </span>
    </button>
  );
}

/* ============= Blocks Preview ============= */
function BlocksPreview({ blocks, voice }) {
  if (!blocks.length) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
        尚未解析出 block。<br />
        試試在左側輸入「<code style={inlineCode}>角色：對白</code>」或「<code style={inlineCode}>#scene：第一幕</code>」。
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {blocks.map((b, i) => <BlockCard key={b.id} block={b} index={i + 1} voice={voice} />)}
    </div>
  );
}

function BlockCard({ block, index, voice }) {
  const color = TYPE_COLORS[block.type] || TYPE_COLORS.note;
  const speakable = (block.type === "dialogue" || block.type === "narration") && (block.text || "").trim();
  const speaking = voice?.state.speaking && voice?.state.currentText === (block.text || "");

  const onPlay = (e) => {
    e.stopPropagation();
    if (!voice?.hasTTS) return;
    if (speaking) voice.stop();
    else voice.speakOne(block.text || "");
  };

  return (
    <div style={{
      padding: "8px 10px",
      background: color.bg,
      border: `1px solid ${color.bd}`,
      borderLeft: `3px solid ${color.fg}`,
      borderRadius: 4,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontSize: 9.5,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: color.fg, fontVariant: "small-caps",
        }}>{block.type}</span>
        {block.speaker && (
          <span style={{
            fontFamily: "var(--font-serif-tc)", fontSize: 12,
            color: "var(--text-primary)", fontWeight: 600,
          }}>{block.speaker}</span>
        )}
        {block.command && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--gold-dim)",
          }}>#{block.command}</span>
        )}
        <span style={{ flex: 1 }} />
        {speakable && voice?.hasTTS && (
          <button
            onClick={onPlay}
            title={speaking ? "停止" : "試聽"}
            style={{
              padding: "1px 6px",
              fontSize: 10,
              background: speaking ? "var(--gold)" : "transparent",
              color: speaking ? "var(--navy-deep)" : "var(--gold-dim)",
              border: `1px solid ${speaking ? "var(--gold)" : "var(--gold-line)"}`,
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-serif-en)",
              letterSpacing: "0.08em",
              animation: speaking ? "blink 1.2s infinite" : "none",
            }}
          >{speaking ? "■" : "▶"}</button>
        )}
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          #{index}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
        color: "var(--text-secondary)", lineHeight: 1.5,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {block.text || block.value || ""}
      </div>
    </div>
  );
}

/* ============= Voice Panel (v2-5) ============= */
function VoicePanel({ blocks, voice }) {
  if (!voice.hasTTS) {
    return (
      <div style={{ padding: "30px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
        此瀏覽器不支援 <code style={inlineCode}>speechSynthesis</code>。<br />
        請使用 Chrome / Edge / Safari。
      </div>
    );
  }

  const queue = React.useMemo(() => (blocks || []).filter(b =>
    b.type === "dialogue" || (b.type === "narration" && voice.settings.includeNarration)
  ), [blocks, voice.settings.includeNarration]);

  if (!blocks.length) {
    return (
      <div style={{ padding: "30px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
        尚無對白可試聽。<br />在左側輸入劇本即可。
      </div>
    );
  }

  const onPlayAll = () => voice.playQueue(blocks);
  const onStop    = () => voice.stop();

  // group voices by lang for cleaner picker
  const sortedVoices = React.useMemo(() => {
    return [...voice.voices].sort((a, b) => {
      // prefer zh-* on top
      const aZh = /^zh/i.test(a.lang) ? -1 : 0;
      const bZh = /^zh/i.test(b.lang) ? -1 : 0;
      return aZh - bZh || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
    });
  }, [voice.voices]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* controls */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center",
        padding: "8px 10px",
        background: "rgba(201,168,106,0.06)",
        border: "1px solid var(--gold-line)",
        borderRadius: 4,
      }}>
        <button
          onClick={onPlayAll}
          disabled={voice.state.queueActive || queue.length === 0}
          style={btnPrimaryStyle(voice.state.queueActive)}
        >▶ 全部試聽</button>
        <button
          onClick={onStop}
          disabled={!voice.state.queueActive && !voice.state.speaking}
          style={btnGhostStyle}
        >■ 停止</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 10.5, color: "var(--text-tertiary)", letterSpacing: "0.12em" }}>
          {voice.state.queueActive
            ? `${voice.state.queueIdx + 1}/${voice.state.queueTotal}`
            : voice.state.speaking ? "speaking" : `${queue.length} ready`}
        </span>
      </div>

      {/* settings */}
      <section>
        <SectionHead latin="Voice Settings" zh="語音設定" />
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={voiceLabelStyle}>
            <span>語音</span>
            <select
              value={voice.settings.voiceId}
              onChange={e => voice.setSettings({ voiceId: e.target.value })}
              style={selectStyle}
            >
              <option value="">系統預設</option>
              {sortedVoices.map(v => (
                <option key={v.name} value={v.name}>{v.name} · {v.lang}</option>
              ))}
            </select>
          </label>

          <label style={voiceLabelStyle}>
            <span>速度</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min="0.5" max="2" step="0.1"
                value={voice.settings.rate}
                onChange={e => voice.setSettings({ rate: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={voiceValStyle}>{voice.settings.rate.toFixed(1)}</span>
            </div>
          </label>

          <label style={voiceLabelStyle}>
            <span>音調</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min="0" max="2" step="0.1"
                value={voice.settings.pitch}
                onChange={e => voice.setSettings({ pitch: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={voiceValStyle}>{voice.settings.pitch.toFixed(1)}</span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            <input
              type="checkbox"
              checked={voice.settings.includeNarration}
              onChange={e => voice.setSettings({ includeNarration: e.target.checked })}
            />
            包含旁白
          </label>
        </div>
      </section>

      {/* queue list */}
      <section>
        <SectionHead latin="Queue" zh={`待播 · ${queue.length}`} />
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {queue.map((item, qi) => {
            const active = voice.state.queueActive && qi === voice.state.queueIdx;
            return (
              <button
                key={item.id || qi}
                onClick={() => voice.playQueue(blocks, blocks.indexOf(item) >= 0
                  ? queue.indexOf(item) : qi)}
                style={{
                  display: "flex", alignItems: "baseline", gap: 6,
                  padding: "4px 8px",
                  background: active ? "var(--gold-glow)" : "var(--navy-deep)",
                  border: `1px solid ${active ? "var(--gold-dim)" : "var(--navy-line)"}`,
                  borderRadius: 2,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-serif-tc)",
                  fontSize: 12,
                  transition: "background 150ms, border-color 150ms",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", minWidth: 16 }}>
                  {qi + 1}
                </span>
                <span style={{
                  color: active ? "var(--gold-bright)" : "var(--gold-dim)",
                  fontWeight: 600,
                  minWidth: 56,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{item.speaker || "（旁白）"}</span>
                <span style={{
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}>{item.text}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const btnPrimaryStyle = (active) => ({
  padding: "5px 12px",
  background: active ? "var(--gold-deep)" : "var(--gold-dim)",
  color: active ? "var(--gold-bright)" : "var(--cream)",
  border: "1px solid var(--gold)",
  borderRadius: 2,
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
  cursor: active ? "default" : "pointer",
  letterSpacing: "0.06em",
});
const btnGhostStyle = {
  padding: "5px 12px",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
  cursor: "pointer",
  letterSpacing: "0.06em",
};
const voiceLabelStyle = {
  display: "flex", flexDirection: "column", gap: 3,
  fontFamily: "var(--font-serif-en)",
  fontSize: 10.5, letterSpacing: "0.14em",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
};
const selectStyle = {
  padding: "4px 8px",
  background: "var(--navy-deep)",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
};
const voiceValStyle = {
  fontFamily: "var(--font-serif-en)",
  fontSize: 11,
  color: "var(--gold-dim)",
  minWidth: 28, textAlign: "right",
};

/* ============= Stats Preview ============= */
function StatsPreview({ stats }) {
  const ROWS = [
    ["Dialogue",  stats.counts.dialogue,  TYPE_COLORS.dialogue.fg],
    ["Narration", stats.counts.narration, TYPE_COLORS.narration.fg],
    ["Scene",     stats.counts.scene,     TYPE_COLORS.scene.fg],
    ["Choice",    stats.counts.choice,    TYPE_COLORS.choice.fg],
    ["Note",      stats.counts.note,      TYPE_COLORS.note.fg],
    ["Command",   stats.counts.command,   TYPE_COLORS.command.fg],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* type counts */}
      <section>
        <SectionHead latin="Block Types" zh="區塊類型" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          {ROWS.map(([label, count, color]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "5px 10px",
              background: "var(--navy-light)",
              border: "1px solid var(--navy-line)",
              borderRadius: 3,
            }}>
              <span style={{
                fontFamily: "var(--font-serif-en)", fontSize: 10.5,
                letterSpacing: "0.14em", color: color, fontVariant: "small-caps",
              }}>{label}</span>
              <span style={{
                fontFamily: "var(--font-serif-en)", fontSize: 14, fontWeight: 600,
                color: count > 0 ? "var(--text-primary)" : "var(--text-tertiary)",
              }}>{count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* totals */}
      <section style={{
        padding: "10px 12px",
        background: "rgba(201,168,106,0.06)",
        border: "1px solid var(--gold-line)",
        borderRadius: 3,
      }}>
        <SectionHead latin="Totals" zh="總計" />
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Blocks</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.total}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Characters</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.totalChars.toLocaleString()}</span>
        </div>
      </section>

      {/* speakers */}
      <section>
        <SectionHead latin="Speakers" zh={`角色 · ${stats.speakers.length}`} />
        {stats.speakers.length === 0 ? (
          <div style={{ padding: "12px 4px", fontSize: 11.5, color: "var(--text-tertiary)" }}>尚無對白</div>
        ) : (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            {stats.speakers.slice(0, 12).map(([name, n]) => (
              <div key={name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 8px", borderRadius: 2,
                background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
              }}>
                <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--text-primary)" }}>{name}</span>
                <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 11, color: "var(--text-tertiary)" }}>{n} lines</span>
              </div>
            ))}
            {stats.speakers.length > 12 && (
              <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                … 還有 {stats.speakers.length - 12} 位
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHead({ latin, zh }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      paddingBottom: 4, borderBottom: "1px solid var(--navy-line)",
    }}>
      <span style={{
        fontFamily: "var(--font-serif-en)", fontSize: 10,
        letterSpacing: "0.22em", color: "var(--gold)",
        fontVariant: "small-caps", textTransform: "uppercase",
      }}>{latin}</span>
      <span style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 11,
        color: "var(--text-tertiary)", letterSpacing: "0.1em",
      }}>{zh}</span>
    </div>
  );
}

/* ============= Layout Placeholder ============= */
function LayoutPlaceholder() {
  return (
    <div style={{
      padding: "40px 14px", textAlign: "center",
      color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7,
    }}>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontSize: 10,
        letterSpacing: "0.22em", color: "var(--gold-dim)",
        textTransform: "uppercase", marginBottom: 6,
      }}>Layout Preview</div>
      <div>v2-5 起逐步上線</div>
      <div style={{ marginTop: 12, fontSize: 11 }}>
        排版預覽（A4 預印 + Voice/BGM 註記）<br />
        將從 Reader TAB 邏輯沿用 + 加上 Voice/BGM badge。
      </div>
    </div>
  );
}

const inlineCode = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  background: "var(--navy-deep)",
  padding: "1px 5px",
  borderRadius: 2,
  border: "1px solid var(--navy-line)",
  color: "var(--gold-dim)",
};
