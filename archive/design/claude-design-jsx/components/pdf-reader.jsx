/* PDF Reader — three-pane: thumbnails left, canvas center, AI panel right.
   The AI panel has an AVG-novel mode (bottom dialogue + portrait area). */

const pdfStyles = {
  root: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--navy-deep)",
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  /* Left thumbnails */
  left: {
    width: 200,
    background: "linear-gradient(180deg, var(--navy-light) 0%, var(--navy) 100%)",
    borderRight: "1px solid var(--navy-line)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  leftTabs: {
    display: "flex",
    borderBottom: "1px solid var(--navy-line)",
  },
  leftTab: (active) => ({
    flex: 1,
    padding: "9px 6px",
    fontFamily: "var(--font-serif-en)",
    fontSize: 10.5, letterSpacing: "0.22em",
    textTransform: "uppercase",
    textAlign: "center",
    color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
    borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
    background: active ? "rgba(201,168,106,0.04)" : "transparent",
    cursor: "pointer",
  }),
  thumbList: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 14px 18px",
  },
  thumb: (active) => ({
    position: "relative",
    background: active ? "rgba(201,168,106,0.06)" : "transparent",
    padding: "8px 8px 8px 12px",
    marginBottom: 8,
    borderLeft: `2px solid ${active ? "var(--gold)" : "transparent"}`,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    transition: "background 140ms",
  }),
  thumbCard: (active) => ({
    width: "100%",
    aspectRatio: "0.71",
    background: "var(--paper)",
    border: `1px solid ${active ? "var(--gold)" : "rgba(0,0,0,0.5)"}`,
    boxShadow: active
      ? "0 0 0 2px var(--gold-glow), 0 4px 10px rgba(0,0,0,0.4)"
      : "0 2px 4px rgba(0,0,0,0.4)",
    position: "relative",
    overflow: "hidden",
  }),
  thumbLines: {
    position: "absolute", inset: "10% 8% auto 8%",
    display: "flex", flexDirection: "column", gap: 2,
  },
  thumbLine: (w, c = "#9c8d75") => ({
    height: 1.5, width: w, background: c, opacity: 0.55,
  }),
  thumbNum: {
    fontFamily: "var(--font-serif-en)",
    fontStyle: "italic",
    fontSize: 11.5,
    color: "var(--text-tertiary)",
    letterSpacing: "0.14em",
  },

  /* Center canvas */
  canvasWrap: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 32px 56px",
    background: `
      radial-gradient(ellipse at center top, rgba(201,168,106,0.05) 0%, transparent 60%),
      var(--navy-deep)
    `,
    position: "relative",
  },
  page: {
    width: 620,
    minHeight: 870,
    background: "var(--paper)",
    color: "#2a2118",
    boxShadow: "0 30px 60px -20px rgba(0,0,0,0.7), 0 8px 18px rgba(0,0,0,0.4)",
    padding: "76px 86px",
    fontFamily: "'Cormorant Garamond', 'Noto Serif TC', serif",
    fontSize: 14.5,
    lineHeight: 1.85,
    position: "relative",
  },
  pageRunHead: {
    position: "absolute",
    top: 28, left: 86, right: 86,
    display: "flex", justifyContent: "space-between",
    fontFamily: "var(--font-serif-en)",
    fontSize: 9.5, letterSpacing: "0.32em",
    textTransform: "uppercase",
    color: "#7a6638",
    paddingBottom: 8,
    borderBottom: "0.5px solid #c9a86a55",
  },
  pageNum: {
    position: "absolute",
    bottom: 32, left: 0, right: 0,
    textAlign: "center",
    fontFamily: "var(--font-serif-en)",
    fontStyle: "italic",
    fontSize: 12,
    color: "#7a6638",
    letterSpacing: "0.1em",
  },
};

const READING = {
  title: "蒙田隨筆 · 卷 II",
  en: "Essais de Montaigne — Tome II",
  totalPages: 386,
  currentChapter: "論憂愁",
  chapterEn: "De la Tristesse",
};

const PAGE_THUMBS = [
  { num: 138, label: "I. 引言", lines: ["56%","82%","70%","45%","78%","68%","52%"] },
  { num: 139, label: "I. 引言", lines: ["68%","75%","82%","56%","72%","48%","80%","60%"] },
  { num: 140, label: "II. 論憂", lines: ["80%","45%","68%","78%","85%","52%","70%","62%","48%"] },
  { num: 141, label: "II. 論憂", lines: ["60%","78%","68%","80%","52%","75%","58%","82%"] },
  { num: 142, label: "II. 論憂", lines: ["75%","68%","80%","56%","82%","68%","48%","78%","62%"] },
  { num: 143, label: "II. 論憂", lines: ["68%","82%","56%","78%","72%","60%","85%","50%"] },
  { num: 144, label: "III. 信仰", lines: ["52%","78%","68%","82%","56%","72%","60%"] },
  { num: 145, label: "III. 信仰", lines: ["80%","56%","72%","68%","85%","52%","78%","60%"] },
];

function PdfPage({ pageNum, currentChapter }) {
  return (
    <div style={pdfStyles.page} className="tex-paper">
      <div style={pdfStyles.pageRunHead}>
        <span>Montaigne — Essais</span>
        <span>Liber II · Cap. {pageNum < 140 ? "I" : pageNum < 144 ? "II" : "III"}</span>
      </div>

      <div style={{
        fontFamily: "var(--font-serif-en)",
        fontStyle: "italic",
        fontSize: 13, letterSpacing: "0.34em",
        color: "#7a6638",
        textTransform: "uppercase",
        textAlign: "center",
        marginBottom: 6,
      }}>Caput Secundum</div>

      <h2 style={{
        fontFamily: "var(--font-serif-tc)",
        fontSize: 26, fontWeight: 500,
        textAlign: "center",
        margin: "0 0 6px",
        letterSpacing: "0.16em",
      }}>論憂愁</h2>
      <div style={{
        fontFamily: "var(--font-serif-en)",
        fontStyle: "italic",
        textAlign: "center",
        fontSize: 14,
        color: "#7a6638",
        marginBottom: 28,
        letterSpacing: "0.04em",
      }}>De la Tristesse</div>

      {/* drop cap */}
      <p style={{ margin: "0 0 14px", textIndent: 0 }}>
        <span style={{
          float: "left",
          fontFamily: "var(--font-serif-en)",
          fontSize: 64,
          lineHeight: 0.85,
          marginRight: 8,
          marginTop: 4,
          color: "#5a4a26",
        }}>我</span>
        是世上最不愛這種情緒的人，既不喜歡也不看重它，
        雖然全世界都已約定俗成，特別偏愛將之打扮得鄭重而莊嚴。
        他們以這個名義裝飾智慧、美德、良知——這是何等愚蠢而醜怪的比附。
      </p>
      <p style={{ margin: "0 0 14px", textIndent: "2em" }}>
        意大利人更恰當地以憂愁的名義稱呼狡黠。因為它總是一種有害的、
        瘋狂的、卑賤而怯懦的特質；斯多噶派禁止其哲人沾染這種感情。
      </p>
      <p style={{ margin: "0 0 14px", textIndent: "2em" }}>
        但有則故事說，當伯西亞之王犯人在凱旋的勝利者埃及王面前列隊走過時，
        看見其女被擄為奴僕站在僕婢中遞水給士兵，他默不作聲，目不轉睛
        地凝視著土地——而當他見到他的兒子被押解走向死刑時，他仍然
        保持著同樣的姿態。
      </p>
      <p style={{ margin: "0 0 14px", textIndent: "2em" }}>
        但當他認出他的一位故友身陷囚徒之列時，他卻開始捶打自己的頭，
        並表現出極度的悲痛。
      </p>
      {/* annotation in margin */}
      <div style={{
        position: "absolute",
        top: 360, right: 16, width: 56,
        fontFamily: "var(--font-serif-en)",
        fontStyle: "italic",
        fontSize: 9.5,
        color: "#a08550",
        lineHeight: 1.4,
        borderLeft: "1px solid #c9a86a44",
        paddingLeft: 6,
      }}>
        cf. Hérodote III, 14 — sur Psammétique
      </div>
      <p style={{ margin: "0 0 14px", textIndent: "2em" }}>
        這件事最近也發生在我們的一位王公身上。在特倫特，他得知自己長兄
        在死訊時，那是支撐其家族榮耀的長兄，後來又得知次兄的死亡——
      </p>

      <div style={pdfStyles.pageNum}>— {pageNum} —</div>
    </div>
  );
}

function PdfReader({ onBack, onAiToggle, aiOpen }) {
  const [currentPage, setCurrentPage] = React.useState(142);
  const [zoom, setZoom] = React.useState(100);
  const [leftTab, setLeftTab] = React.useState("pages"); // pages | tools

  const total = READING.totalPages;

  const actions = (
    <>
      <Btn icon="zoomOut" size="sm" onClick={() => setZoom(z => Math.max(50, z - 10))} title="縮小" />
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)",
        padding: "0 8px", letterSpacing: "0.06em", minWidth: 48, textAlign: "center",
      }}>{zoom}%</div>
      <Btn icon="zoomIn" size="sm" onClick={() => setZoom(z => Math.min(200, z + 10))} title="放大" />
      <Btn icon="fitScreen" size="sm" onClick={() => setZoom(100)} title="符合畫面" />
      <div style={{ width: 1, height: 20, background: "var(--navy-line)", margin: "0 6px" }} />
      <Btn icon="download" size="sm">匯出</Btn>
      <Btn variant="gold" icon="mask" size="sm" onClick={onAiToggle}>
        {aiOpen ? "圖書館員 ●" : "召喚圖書館員"}
      </Btn>
    </>
  );

  return (
    <div style={pdfStyles.root}>
      <Topbar
        breadcrumb="Reading Hall · 閱讀廳"
        title={READING.title}
        subtitle={READING.en}
        onBack={onBack}
        actions={actions}
      />

      <div style={pdfStyles.body}>
        {/* LEFT */}
        <aside style={pdfStyles.left}>
          <div style={pdfStyles.leftTabs}>
            <div style={pdfStyles.leftTab(leftTab === "pages")} onClick={() => setLeftTab("pages")}>Pages · 頁</div>
            <div style={pdfStyles.leftTab(leftTab === "tools")} onClick={() => setLeftTab("tools")}>Cut · 切割</div>
          </div>

          {leftTab === "pages" ? (
            <div style={pdfStyles.thumbList}>
              {PAGE_THUMBS.map(t => (
                <div
                  key={t.num}
                  onClick={() => setCurrentPage(t.num)}
                  style={pdfStyles.thumb(t.num === currentPage)}
                >
                  <div style={pdfStyles.thumbCard(t.num === currentPage)}>
                    <div style={pdfStyles.thumbLines}>
                      {t.lines.map((w, i) => (
                        <div key={i} style={pdfStyles.thumbLine(w)} />
                      ))}
                    </div>
                  </div>
                  <div style={pdfStyles.thumbNum}>p. {t.num} · {t.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <CutTools />
          )}
        </aside>

        {/* CENTER */}
        <div style={pdfStyles.canvasWrap} className="tex-paper">
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", transition: "transform 200ms" }}>
            <PdfPage pageNum={currentPage} />
          </div>
          {/* page nav floater */}
          <div style={{
            position: "sticky", bottom: 12, marginTop: 24,
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--navy-light)",
            border: "1px solid var(--gold-line)",
            borderRadius: 24,
            padding: "6px 14px",
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6)",
          }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} style={{
              background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer",
              display: "flex", alignItems: "center", padding: 4,
            }}><Icon name="chevronLeft" size={18} /></button>
            <div style={{
              fontFamily: "var(--font-serif-en)",
              fontStyle: "italic",
              fontSize: 14, color: "var(--cream-dim)",
              letterSpacing: "0.1em",
              minWidth: 80, textAlign: "center",
            }}>p. {currentPage} <span style={{ color: "var(--text-tertiary)" }}>/ {total}</span></div>
            <button onClick={() => setCurrentPage(p => Math.min(total, p + 1))} style={{
              background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer",
              display: "flex", alignItems: "center", padding: 4,
            }}><Icon name="chevronRight" size={18} /></button>
          </div>
        </div>

        {/* RIGHT — AI panel */}
        {aiOpen && <AiLibrarian onClose={onAiToggle} currentPage={currentPage} chapter={READING.currentChapter} />}
      </div>
    </div>
  );
}

function CutTools() {
  const [mode, setMode] = React.useState("range");
  return (
    <div style={{ padding: 14, fontFamily: "var(--font-serif-tc)" }}>
      <div style={{
        fontFamily: "var(--font-serif-en)",
        fontSize: 10.5, letterSpacing: "0.28em",
        color: "var(--gold)", textTransform: "uppercase",
        marginBottom: 12,
      }}>Sectio · 頁面切割</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        {[
          ["range", "指定範圍", "Range"],
          ["every", "每 N 頁", "Stride"],
          ["custom", "自訂選擇", "Custom"],
        ].map(([id, tc, en]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              background: mode === id ? "var(--gold-glow)" : "transparent",
              border: `1px solid ${mode === id ? "var(--gold-line)" : "var(--navy-line)"}`,
              color: mode === id ? "var(--gold-bright)" : "var(--text-secondary)",
              padding: "8px 10px",
              borderRadius: "var(--r-soft)",
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: "0.08em",
              textAlign: "left",
              cursor: "pointer",
              display: "flex", justifyContent: "space-between",
            }}
          >
            <span>{tc}</span>
            <span style={{ fontFamily: "var(--font-serif-en)", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: 11 }}>{en}</span>
          </button>
        ))}
      </div>

      <div style={{
        fontSize: 11, color: "var(--text-tertiary)",
        fontFamily: "var(--font-serif-en)", letterSpacing: "0.18em",
        textTransform: "uppercase", marginBottom: 8,
      }}>From · To</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input defaultValue="138" style={cutInputStyle} />
        <span style={{ alignSelf: "center", color: "var(--text-tertiary)" }}>—</span>
        <input defaultValue="148" style={cutInputStyle} />
      </div>

      <div style={{
        padding: "10px 12px",
        background: "rgba(0,0,0,0.25)",
        border: "1px dashed var(--navy-hover)",
        borderRadius: "var(--r-soft)",
        fontSize: 11.5, color: "var(--text-secondary)",
        lineHeight: 1.6,
        marginBottom: 14,
      }}>
        將切割 <span style={{ color: "var(--gold)" }}>11 頁</span>，
        輸出為一份新文件，置於書庫「片段」夾。
      </div>

      <Btn variant="gold" icon="scissors" size="sm">執行切割</Btn>
    </div>
  );
}

const cutInputStyle = {
  flex: 1,
  background: "var(--navy-deep)",
  border: "1px solid var(--navy-line)",
  color: "var(--cream)",
  padding: "6px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  borderRadius: "var(--r-soft)",
  textAlign: "center",
};

window.PdfReader = PdfReader;
