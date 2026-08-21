/* Dashboard — module cards arranged like leather-bound spines on a brass shelf,
   with a recent-files ledger underneath. */

const dashStyles = {
  root: {
    flex: 1,
    overflow: "auto",
    padding: "32px 48px 56px",
    background: `
      linear-gradient(180deg, var(--navy) 0%, var(--navy-deep) 100%)
    `,
    position: "relative",
  },
  hero: {
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    marginBottom: 32, gap: 24,
  },
  heroL: { maxWidth: 600 },
  eyebrow: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 11, letterSpacing: "0.4em",
    color: "var(--gold)",
    textTransform: "uppercase",
    display: "flex", alignItems: "center", gap: 12,
    marginBottom: 16,
  },
  eyebrowOrn: { width: 28, height: 1, background: "var(--gold)" },
  heroTitle: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 38, lineHeight: 1.2,
    color: "var(--text-primary)",
    margin: 0,
    fontWeight: 500,
    letterSpacing: "0.02em",
  },
  heroEn: {
    fontFamily: "var(--font-serif-en)",
    fontStyle: "italic",
    fontSize: 17,
    color: "var(--text-secondary)",
    marginTop: 8,
    letterSpacing: "0.04em",
  },
  heroR: {
    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-tertiary)",
    letterSpacing: "0.08em",
  },
  heroRTime: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 22, color: "var(--gold)",
    letterSpacing: "0.18em",
  },
  shelfHeader: {
    display: "flex", alignItems: "baseline", gap: 16,
    marginTop: 16, marginBottom: 18,
  },
  shelfNum: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 34, color: "var(--gold-deep)",
    fontStyle: "italic", lineHeight: 1,
  },
  shelfLabel: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 18, color: "var(--text-primary)",
    letterSpacing: "0.18em",
  },
  shelfEn: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 11, letterSpacing: "0.3em",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
  },
  shelfRule: { flex: 1, height: 1, background: "var(--navy-line)" },

  // Module shelf
  shelf: {
    position: "relative",
    padding: "0 0 28px",
    marginBottom: 36,
  },
  shelfBoard: {
    position: "absolute",
    bottom: 8, left: -8, right: -8, height: 14,
    background: `
      linear-gradient(180deg, #5b3a2a 0%, #3a2618 70%, #1f130a 100%)
    `,
    borderRadius: 1,
    boxShadow: "0 6px 18px -4px rgba(0,0,0,0.6), inset 0 1px 0 var(--gold-line)",
  },
  cardsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    position: "relative",
    zIndex: 1,
  },
};

const MODULES = [
  {
    id: "markdown", icon: "feather", roman: "I",
    title: "Markdown", subtitle: "手稿廳", en: "Manuscripta",
    desc: "雙欄即時預覽。羽毛筆下的文字，自有重量。",
    formats: [".md", ".html"],
    spine: "#5b3a2a",
  },
  {
    id: "pdf", icon: "pdf", roman: "II",
    title: "PDF 閱讀器", subtitle: "閱讀廳", en: "Lectorium",
    desc: "翻頁、註解、頁面切割；圖書館員為您伴讀。",
    formats: [".pdf"],
    spine: "#3a2818",
    featured: true,
  },
  {
    id: "spreadsheet", icon: "spreadsheet", roman: "III",
    title: "試算表", subtitle: "帳冊房", en: "Tabularium",
    desc: "公式、儲存格、多工作表。冷靜的數字之地。",
    formats: [".xlsx", ".csv"],
    spine: "#3d3220",
  },
  {
    id: "book", icon: "book", roman: "IV",
    title: "書籍排版器", subtitle: "裝訂坊", en: "Bibliopegia",
    desc: "頁面重排、封面、匯出 PDF。為文字製作一具身體。",
    formats: [".pdf", ".html"],
    spine: "#4a2828",
  },
];

function ModuleCard({ mod, onOpen }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen?.(mod.id)}
      style={{
        position: "relative",
        background: `linear-gradient(180deg, var(--navy-light) 0%, ${mod.featured ? "#262d3c" : "var(--navy-light)"} 100%)`,
        border: `1px solid ${hover || mod.featured ? "var(--gold-line)" : "var(--navy-line)"}`,
        borderRadius: "var(--r-card)",
        padding: "22px 22px 20px",
        cursor: "pointer",
        transition: "transform 220ms cubic-bezier(.2,.8,.2,1), border-color 200ms, box-shadow 220ms",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? "var(--shadow-lift)" : "var(--shadow-card)",
        overflow: "hidden",
        minHeight: 220,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}
    >
      {/* spine — left edge looks like a leather-bound book spine */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
        background: `linear-gradient(180deg, ${mod.spine}, ${mod.spine}cc, ${mod.spine}88)`,
        boxShadow: "1px 0 0 rgba(0,0,0,0.4), inset 0 0 4px rgba(0,0,0,0.5)",
      }} />
      {/* roman numeral */}
      <div style={{
        position: "absolute", top: 14, right: 18,
        fontFamily: "var(--font-serif-en)",
        fontSize: 22, fontStyle: "italic",
        color: "var(--gold-deep)",
        letterSpacing: "0.05em",
      }}>{mod.roman}</div>

      <div>
        <div style={{
          width: 48, height: 48,
          border: "1px solid var(--gold-line)",
          borderRadius: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: hover ? "var(--gold-bright)" : "var(--gold)",
          background: "rgba(201,168,106,0.04)",
          marginBottom: 18,
          transition: "all 200ms",
        }}>
          <Icon name={mod.icon} size={24} stroke={1.5} />
        </div>

        <div style={{
          fontFamily: "var(--font-serif-tc)",
          fontSize: 19, color: "var(--text-primary)",
          letterSpacing: "0.06em",
          marginBottom: 2,
        }}>{mod.title}</div>
        <div style={{
          fontFamily: "var(--font-serif-en)",
          fontStyle: "italic",
          fontSize: 12.5, color: "var(--gold)",
          letterSpacing: "0.16em",
          marginBottom: 10,
        }}>— {mod.en}</div>
        <div style={{
          fontFamily: "var(--font-serif-tc)",
          fontSize: 12.5, color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}>{mod.desc}</div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 18, paddingTop: 12,
        borderTop: "1px dashed rgba(201,168,106,0.18)",
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {mod.formats.map(f => (
            <span key={f} style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              padding: "2px 6px",
              border: "1px solid var(--navy-hover)",
              borderRadius: 2,
              color: "var(--text-tertiary)",
              letterSpacing: "0.05em",
            }}>{f}</span>
          ))}
        </div>
        <div style={{
          fontFamily: "var(--font-serif-en)",
          fontSize: 11, letterSpacing: "0.24em",
          color: hover ? "var(--gold)" : "var(--text-tertiary)",
          textTransform: "uppercase",
          transition: "color 180ms",
        }}>Open →</div>
      </div>
    </div>
  );
}

const RECENT_FILES = [
  { id: 1, name: "蒙田隨筆 · Vol II.pdf", type: "pdf", time: "今晨 03:14", page: "第 142 頁", size: "8.4 MB" },
  { id: 2, name: "本月寫作計畫.md", type: "markdown", time: "昨夜 23:48", page: "1,204 字", size: "—" },
  { id: 3, name: "讀書會記錄 · 三月.xlsx", type: "spreadsheet", time: "三月 廿八", page: "Sheet2 · F12", size: "62 KB" },
  { id: 4, name: "Tractatus Logico — annotated.pdf", type: "pdf", time: "三月 廿四", page: "第 38 頁", size: "2.1 MB" },
  { id: 5, name: "短篇集草稿 · 春.book", type: "book", time: "三月 二十", page: "16 頁", size: "—" },
];

const TYPE_META = {
  pdf: { icon: "pdf", label: "PDF" },
  markdown: { icon: "feather", label: "MD" },
  spreadsheet: { icon: "spreadsheet", label: "XLS" },
  book: { icon: "book", label: "BOOK" },
};

function RecentFiles({ onOpen }) {
  return (
    <div style={{
      background: "var(--navy-light)",
      border: "1px solid var(--navy-line)",
      borderRadius: "var(--r-card)",
      overflow: "hidden",
    }}>
      {/* ledger header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "32px 2.5fr 1fr 1.2fr 0.6fr 60px",
        gap: 16,
        padding: "10px 22px",
        borderBottom: "1px solid var(--navy-line)",
        fontFamily: "var(--font-serif-en)",
        fontSize: 10.5, letterSpacing: "0.28em",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        background: "rgba(0,0,0,0.18)",
      }}>
        <div>№</div><div>Title</div><div>Format</div><div>Last Touched</div><div>Mark</div><div></div>
      </div>
      {RECENT_FILES.map((f, i) => (
        <RecentRow key={f.id} f={f} i={i} onOpen={onOpen} />
      ))}
    </div>
  );
}

function RecentRow({ f, i, onOpen }) {
  const [hover, setHover] = React.useState(false);
  const meta = TYPE_META[f.type];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => f.type === "pdf" && onOpen?.("pdf")}
      style={{
        display: "grid",
        gridTemplateColumns: "32px 2.5fr 1fr 1.2fr 0.6fr 60px",
        gap: 16,
        padding: "13px 22px",
        borderBottom: i === RECENT_FILES.length - 1 ? "none" : "1px solid rgba(255,255,255,0.03)",
        alignItems: "center",
        background: hover ? "rgba(201,168,106,0.04)" : "transparent",
        cursor: "pointer",
        transition: "background 140ms",
      }}
    >
      <div style={{
        fontFamily: "var(--font-serif-en)", fontStyle: "italic",
        fontSize: 14, color: "var(--gold-deep)",
      }}>{String(i + 1).padStart(2, "0")}</div>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 13.5,
        color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: "var(--gold)", opacity: 0.85 }}>
          <Icon name={meta.icon} size={15} stroke={1.5} />
        </span>
        {f.name}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-tertiary)", letterSpacing: "0.08em",
      }}>{meta.label} · {f.size}</div>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 12,
        color: "var(--text-secondary)",
      }}>{f.time}</div>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontStyle: "italic",
        fontSize: 12, color: "var(--gold)",
      }}>{f.page}</div>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontSize: 11,
        color: hover ? "var(--gold)" : "var(--text-tertiary)",
        letterSpacing: "0.2em", textAlign: "right",
        textTransform: "uppercase",
      }}>{hover ? "Open" : "—"}</div>
    </div>
  );
}

function Dashboard({ onOpen }) {
  const [time, setTime] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");

  return (
    <div style={dashStyles.root} className="tex-paper">
      <div style={dashStyles.hero}>
        <div style={dashStyles.heroL}>
          <div style={dashStyles.eyebrow}>
            <span style={dashStyles.eyebrowOrn} />
            Bibliotheca · 阿卡夏
            <span style={dashStyles.eyebrowOrn} />
          </div>
          <h1 style={dashStyles.heroTitle}>晚安，旅人。書庫今晚靜謐。</h1>
          <div style={dashStyles.heroEn}>
            "All knowledge that the world has ever received comes from the mind."
          </div>
        </div>
        <div style={dashStyles.heroR}>
          <div style={dashStyles.heroRTime}>{hh}<span style={{ color: "var(--text-tertiary)" }}>:</span>{mm}</div>
          <div>MMXXVI · MAY · V</div>
          <div style={{ color: "var(--gold-deep)" }}>·  四月廿八  ·</div>
        </div>
      </div>

      {/* Shelf I — Modules */}
      <div style={dashStyles.shelfHeader}>
        <span style={dashStyles.shelfNum}>I.</span>
        <span style={dashStyles.shelfLabel}>四廳</span>
        <span style={dashStyles.shelfEn}>Quattuor Aulae · Four Halls</span>
        <span style={dashStyles.shelfRule} />
      </div>
      <div style={dashStyles.shelf}>
        <div style={dashStyles.cardsRow}>
          {MODULES.map(m => <ModuleCard key={m.id} mod={m} onOpen={onOpen} />)}
        </div>
        <div style={dashStyles.shelfBoard} />
      </div>

      {/* Shelf II — Recent files (ledger) */}
      <div style={dashStyles.shelfHeader}>
        <span style={dashStyles.shelfNum}>II.</span>
        <span style={dashStyles.shelfLabel}>近日卷帙</span>
        <span style={dashStyles.shelfEn}>Recentes · Last Opened</span>
        <span style={dashStyles.shelfRule} />
      </div>
      <RecentFiles onOpen={onOpen} />
    </div>
  );
}

window.Dashboard = Dashboard;
