/* AI Librarian — AVG visual-novel inspired panel.
   Two zones:
   - PORTRAIT area (top, ~55% height): character placeholder + nameplate
   - DIALOGUE BOX (bottom, ~45%): typewriter text + choices + input
   Mode tabs along the top: 文字 / 語音 / 人設 */

const aiStyles = {
  root: {
    width: 340,
    minWidth: 340,
    background: "linear-gradient(180deg, #11151d 0%, #0a0d13 100%)",
    borderLeft: "1px solid var(--gold-line)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "var(--font-serif-tc)",
    position: "relative",
  },
  // top header — small bar with name, mode tabs, close
  header: {
    padding: "10px 14px 0",
    borderBottom: "1px solid var(--navy-line)",
  },
  headerRow: {
    display: "flex", alignItems: "center", gap: 10,
    paddingBottom: 8,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: "var(--success)",
    boxShadow: "0 0 6px var(--success)",
  },
  headerTitle: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 11, letterSpacing: "0.32em",
    color: "var(--gold)",
    textTransform: "uppercase",
    flex: 1,
  },
  closeBtn: {
    background: "transparent",
    border: "1px solid var(--navy-line)",
    color: "var(--text-secondary)",
    width: 24, height: 24, borderRadius: 2,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  },
  modeRow: {
    display: "flex",
    gap: 4,
    paddingBottom: 0,
  },
  modeTab: (active) => ({
    flex: 1,
    padding: "8px 6px",
    fontFamily: "var(--font-serif-tc)",
    fontSize: 12, letterSpacing: "0.16em",
    color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
    borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
    textAlign: "center",
    cursor: "pointer",
    background: active ? "rgba(201,168,106,0.04)" : "transparent",
    transition: "all 160ms",
  }),
  // PORTRAIT zone — like an AVG game scene
  portrait: {
    flex: "1 1 320px",
    minHeight: 280,
    position: "relative",
    overflow: "hidden",
    background: `
      radial-gradient(ellipse at 50% 90%, rgba(201,168,106,0.18) 0%, transparent 55%),
      linear-gradient(180deg, #1a2030 0%, #0d1018 100%)
    `,
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  },
  // background scene — bookshelves silhouette
  scene: {
    position: "absolute", inset: 0,
    pointerEvents: "none",
  },
  // character silhouette placeholder
  charSil: {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: 200,
    height: 250,
    pointerEvents: "none",
  },
  // Nameplate — brass plaque
  nameplate: {
    position: "absolute",
    top: 12, left: 14,
    background: "linear-gradient(180deg, #2a1f12 0%, #1a130a 100%)",
    border: "1px solid var(--gold-line)",
    padding: "6px 12px 7px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 var(--gold-line)",
    display: "flex", flexDirection: "column",
    minWidth: 110,
  },
  nameplateName: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 14, color: "var(--gold-bright)",
    letterSpacing: "0.18em",
    lineHeight: 1.1,
  },
  nameplateRole: {
    fontFamily: "var(--font-serif-en)",
    fontStyle: "italic",
    fontSize: 9.5,
    color: "var(--gold-deep)",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    marginTop: 2,
  },
  // emotion indicator
  emotion: {
    position: "absolute",
    top: 16, right: 16,
    fontFamily: "var(--font-serif-en)",
    fontStyle: "italic",
    fontSize: 11,
    color: "var(--gold-dim)",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    padding: "4px 8px",
    border: "1px solid var(--gold-line)",
    background: "rgba(0,0,0,0.4)",
  },
  // current-page badge
  pageBadge: {
    position: "absolute",
    bottom: 14, right: 14,
    fontFamily: "var(--font-mono)",
    fontSize: 10, color: "var(--text-tertiary)",
    letterSpacing: "0.08em",
    padding: "3px 8px",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid var(--navy-hover)",
    borderRadius: 2,
  },
  // DIALOGUE BOX
  dialogue: {
    position: "relative",
    margin: "8px 12px 0",
    padding: "20px 18px 16px",
    background: "rgba(15,18,25,0.92)",
    border: "1px solid var(--gold-line)",
    minHeight: 110,
  },
  dialogueOrn: {
    position: "absolute",
    top: -1, left: -1, right: -1, height: 4,
    background: "linear-gradient(90deg, var(--gold-deep), var(--gold), var(--gold-deep))",
    opacity: 0.7,
  },
  dialogueCorner: (corner) => ({
    position: "absolute",
    [corner.includes("top") ? "top" : "bottom"]: -1,
    [corner.includes("left") ? "left" : "right"]: -1,
    width: 10, height: 10,
    border: `1px solid var(--gold)`,
    borderTopColor: corner.includes("top") ? "var(--gold)" : "transparent",
    borderBottomColor: corner.includes("bottom") ? "var(--gold)" : "transparent",
    borderLeftColor: corner.includes("left") ? "var(--gold)" : "transparent",
    borderRightColor: corner.includes("right") ? "var(--gold)" : "transparent",
  }),
  dialogueName: {
    position: "absolute",
    top: -10, left: 18,
    background: "var(--navy-deep)",
    padding: "0 10px",
    fontFamily: "var(--font-serif-tc)",
    fontSize: 13, color: "var(--gold-bright)",
    letterSpacing: "0.18em",
  },
  dialogueText: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 14,
    lineHeight: 1.85,
    color: "var(--cream)",
    letterSpacing: "0.04em",
    minHeight: 60,
  },
  cursor: {
    display: "inline-block",
    width: 6, height: 14,
    background: "var(--gold)",
    marginLeft: 2,
    verticalAlign: "middle",
    animation: "blink 1s steps(2) infinite",
  },
  // choices
  choices: {
    display: "flex", flexDirection: "column", gap: 4,
    padding: "10px 12px 6px",
  },
  choice: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--navy-line)",
    color: "var(--cream)",
    padding: "8px 12px 9px",
    fontFamily: "var(--font-serif-tc)",
    fontSize: 12.5, letterSpacing: "0.06em",
    textAlign: "left",
    cursor: "pointer",
    display: "flex", alignItems: "center", gap: 10,
    transition: "all 140ms",
  },
  choiceMark: {
    fontFamily: "var(--font-serif-en)", fontStyle: "italic",
    color: "var(--gold)",
    fontSize: 13,
    minWidth: 16,
  },
  // bottom token bar + input
  tokenBar: {
    margin: "0 12px",
    padding: "8px 12px",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid var(--navy-line)",
    borderRadius: "var(--r-soft)",
    display: "flex", alignItems: "center", gap: 10,
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    color: "var(--text-tertiary)",
    letterSpacing: "0.06em",
  },
  inputRow: {
    margin: "8px 12px 14px",
    display: "flex", gap: 6,
  },
  input: {
    flex: 1,
    background: "var(--navy-light)",
    border: "1px solid var(--navy-line)",
    color: "var(--cream)",
    padding: "9px 12px",
    fontFamily: "var(--font-serif-tc)",
    fontSize: 13,
    borderRadius: "var(--r-soft)",
    outline: "none",
    letterSpacing: "0.04em",
  },
  sendBtn: {
    background: "var(--gold-glow)",
    border: "1px solid var(--gold)",
    color: "var(--gold-bright)",
    padding: "0 14px",
    borderRadius: "var(--r-soft)",
    cursor: "pointer",
    display: "flex", alignItems: "center",
  },
};

/* SVG silhouette of a librarian — robed figure with book.
   Simple, classical — designed to be replaced with Live2D later. */
function CharacterSilhouette({ emotion = "calm" }) {
  const ink = "rgba(241,234,214,0.85)";
  const robe = "rgba(58,40,24,0.55)";
  return (
    <svg viewBox="0 0 200 250" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="robeGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a2818" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1a1208" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="35%" r="50%">
          <stop offset="0%" stopColor="rgba(201,168,106,0.35)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      {/* halo */}
      <ellipse cx="100" cy="80" rx="70" ry="60" fill="url(#halo)" />
      {/* robe / shoulders */}
      <path d="M40 250 C 40 180, 60 150, 100 150 C 140 150, 160 180, 160 250 Z" fill="url(#robeGrad)" stroke="rgba(201,168,106,0.25)" strokeWidth="0.5" />
      {/* collar */}
      <path d="M75 158 L100 174 L125 158 L120 200 L100 188 L80 200 Z" fill="rgba(201,168,106,0.12)" stroke="rgba(201,168,106,0.4)" strokeWidth="0.6" />
      {/* head */}
      <ellipse cx="100" cy="100" rx="32" ry="40" fill="#2a2118" stroke="rgba(201,168,106,0.4)" strokeWidth="0.6" />
      {/* face — soft suggestion */}
      <ellipse cx="100" cy="100" rx="28" ry="36" fill="rgba(241,234,214,0.04)" />
      {/* hair drape */}
      <path d="M68 88 Q 70 60 100 56 Q 130 60 132 88 L 130 110 Q 125 95 120 92 Q 110 78 100 80 Q 90 78 80 92 Q 75 95 70 110 Z" fill="#1a1208" stroke="rgba(201,168,106,0.3)" strokeWidth="0.5" />
      {/* eyes — closed serene line */}
      {emotion === "calm" && <>
        <path d="M88 102 Q 92 100 96 102" stroke={ink} strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M104 102 Q 108 100 112 102" stroke={ink} strokeWidth="1" fill="none" strokeLinecap="round" />
      </>}
      {emotion === "thinking" && <>
        <circle cx="92" cy="102" r="1.4" fill={ink} />
        <circle cx="108" cy="102" r="1.4" fill={ink} />
      </>}
      {/* small smile */}
      <path d="M93 118 Q 100 122 107 118" stroke={ink} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      {/* glasses */}
      <circle cx="92" cy="103" r="7" fill="none" stroke="rgba(201,168,106,0.6)" strokeWidth="0.8" />
      <circle cx="108" cy="103" r="7" fill="none" stroke="rgba(201,168,106,0.6)" strokeWidth="0.8" />
      <line x1="99" y1="103" x2="101" y2="103" stroke="rgba(201,168,106,0.6)" strokeWidth="0.8" />
      {/* book in hands */}
      <rect x="78" y="200" width="44" height="32" fill="#5b3a2a" stroke="rgba(201,168,106,0.5)" strokeWidth="0.8" />
      <line x1="100" y1="200" x2="100" y2="232" stroke="rgba(201,168,106,0.4)" strokeWidth="0.5" />
      <path d="M82 206 L96 206 M82 212 L94 212 M104 206 L118 206 M104 212 L116 212" stroke="rgba(241,234,214,0.4)" strokeWidth="0.4" />
      {/* hands hint */}
      <ellipse cx="76" cy="216" rx="5" ry="4" fill="rgba(241,234,214,0.5)" />
      <ellipse cx="124" cy="216" rx="5" ry="4" fill="rgba(241,234,214,0.5)" />
      {/* candle glow at bottom right (off-screen suggestion) */}
    </svg>
  );
}

/* Bookshelf scene — dark silhouette in background */
function BookshelfScene() {
  const shelves = [60, 130, 200];
  return (
    <svg viewBox="0 0 340 320" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", opacity: 0.42 }}>
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1a2030" />
          <stop offset="100%" stopColor="#0a0d15" />
        </linearGradient>
      </defs>
      <rect width="340" height="320" fill="url(#bg)" />
      {/* shelves */}
      {shelves.map((y, i) => (
        <g key={i}>
          <rect x="0" y={y + 50} width="340" height="3" fill="#2a1f12" />
          {/* book spines */}
          {Array.from({ length: 18 }).map((_, j) => {
            const w = 8 + ((j * 7) % 10);
            const h = 38 + ((j * 11) % 14);
            const colors = ["#2a1f12", "#3a2818", "#1a2030", "#2a1418", "#3a2a1c"];
            const x = j * 19 + ((i * 7) % 9);
            return (
              <rect
                key={j}
                x={x}
                y={y + 50 - h}
                width={w}
                height={h}
                fill={colors[(i + j) % colors.length]}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="0.4"
              />
            );
          })}
        </g>
      ))}
      {/* candle glow */}
      <radialGradient id="candle" cx="80%" cy="60%" r="30%">
        <stop offset="0%" stopColor="rgba(255,200,120,0.4)" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>
      <rect width="340" height="320" fill="url(#candle)" />
    </svg>
  );
}

/* Typewriter effect */
function useTypewriter(text, speed = 28) {
  const [shown, setShown] = React.useState("");
  React.useEffect(() => {
    setShown("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  const done = shown.length >= text.length;
  return [shown, done];
}

const DIALOGUE_SCRIPT = [
  {
    speaker: "圖書館員 · 蘇菲亞",
    en: "Sophia",
    emotion: "calm",
    text: "我注意到你停在第 142 頁很久了。蒙田論及伯西亞之王的悲痛——這一段，需要我為你說明背景嗎？",
    choices: [
      { id: "a", mark: "i.", text: "是的，請告訴我這典故的出處。" },
      { id: "b", mark: "ii.", text: "我想知道為什麼他面對最深的悲痛反而沉默。" },
      { id: "c", mark: "iii.", text: "先讀完，待會再問。" },
    ],
  },
  {
    speaker: "圖書館員 · 蘇菲亞",
    en: "Sophia",
    emotion: "thinking",
    text: "這個故事原出自希羅多德《歷史》卷三第十四節。蒙田在此引用，並非為了悲痛本身，而是為了揭示一件更深的事——",
    choices: [],
  },
];

function AiLibrarian({ onClose, currentPage, chapter }) {
  const [mode, setMode] = React.useState("text"); // text | voice | persona
  const [scriptIdx, setScriptIdx] = React.useState(0);
  const current = DIALOGUE_SCRIPT[scriptIdx] || DIALOGUE_SCRIPT[0];
  const [shown, done] = useTypewriter(current.text, 22);
  const [draft, setDraft] = React.useState("");

  const handleChoice = (c) => {
    if (scriptIdx < DIALOGUE_SCRIPT.length - 1) setScriptIdx(scriptIdx + 1);
  };

  const handleAdvance = () => {
    if (!done) return; // wait for typewriter
    if (current.choices?.length === 0 && scriptIdx < DIALOGUE_SCRIPT.length - 1) {
      setScriptIdx(scriptIdx + 1);
    }
  };

  return (
    <aside style={aiStyles.root}>
      {/* HEADER */}
      <div style={aiStyles.header}>
        <div style={aiStyles.headerRow}>
          <span style={aiStyles.statusDot} />
          <span style={aiStyles.headerTitle}>Bibliothecaria · 在線</span>
          <button style={aiStyles.closeBtn} onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <div style={aiStyles.modeRow}>
          {[
            ["text", "文字", "feather"],
            ["voice", "語音", "microphone"],
            ["persona", "人設", "mask"],
          ].map(([id, tc, ic]) => (
            <div key={id} style={aiStyles.modeTab(mode === id)} onClick={() => setMode(id)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name={ic} size={12} stroke={1.5} />
                {tc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PORTRAIT — AVG visual novel scene */}
      <div style={aiStyles.portrait} onClick={handleAdvance}>
        <div style={aiStyles.scene}><BookshelfScene /></div>
        <div style={aiStyles.charSil}><CharacterSilhouette emotion={current.emotion} /></div>

        <div style={aiStyles.nameplate}>
          <div style={aiStyles.nameplateName}>蘇菲亞</div>
          <div style={aiStyles.nameplateRole}>Sophia · Librarian</div>
        </div>
        <div style={aiStyles.emotion}>{current.emotion === "calm" ? "Serena" : "Cogitans"}</div>

        <div style={aiStyles.pageBadge}>
          ※ 正在閱讀 · p. {currentPage} · {chapter}
        </div>
      </div>

      {/* DIALOGUE BOX */}
      <div style={aiStyles.dialogue}>
        <div style={aiStyles.dialogueOrn} />
        <div style={aiStyles.dialogueCorner("top-left")} />
        <div style={aiStyles.dialogueCorner("top-right")} />
        <div style={aiStyles.dialogueCorner("bottom-left")} />
        <div style={aiStyles.dialogueCorner("bottom-right")} />

        <div style={aiStyles.dialogueName}>{current.speaker}</div>
        <div style={aiStyles.dialogueText}>
          {shown}
          {!done && <span style={aiStyles.cursor} />}
          {done && current.choices?.length === 0 && (
            <span style={{ ...aiStyles.cursor, animation: "blink 1.4s steps(2) infinite" }}>▾</span>
          )}
        </div>
      </div>

      {/* CHOICES */}
      {done && current.choices?.length > 0 && (
        <div style={aiStyles.choices}>
          {current.choices.map(c => (
            <ChoiceBtn key={c.id} c={c} onClick={() => handleChoice(c)} />
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* TOKEN BAR */}
      <div style={aiStyles.tokenBar}>
        <Icon name="coin" size={13} stroke={1.4} />
        <span>預估 ~ 120 tokens</span>
        <span style={{ marginLeft: "auto", color: "var(--gold)" }}>1 月幣</span>
        <span style={{ color: "var(--text-tertiary)" }}>· 餘 99</span>
      </div>

      {/* INPUT */}
      <div style={aiStyles.inputRow}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="…向圖書館員提問"
          style={aiStyles.input}
        />
        <button style={aiStyles.sendBtn} onClick={() => setDraft("")}>
          <Icon name="send" size={14} />
        </button>
      </div>
    </aside>
  );
}

function ChoiceBtn({ c, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        ...aiStyles.choice,
        background: hover ? "var(--gold-glow)" : "rgba(255,255,255,0.02)",
        borderColor: hover ? "var(--gold)" : "var(--navy-line)",
        color: hover ? "var(--gold-bright)" : "var(--cream)",
        transform: hover ? "translateX(3px)" : "translateX(0)",
      }}
    >
      <span style={aiStyles.choiceMark}>{c.mark}</span>
      <span style={{ flex: 1 }}>{c.text}</span>
      {hover && <Icon name="chevronRight" size={13} />}
    </button>
  );
}

window.AiLibrarian = AiLibrarian;
