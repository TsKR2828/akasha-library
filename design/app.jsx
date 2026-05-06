/* App — wires sidebar + topbar + dashboard + pdf reader,
   exposes Tweaks for density, mode, gold hue, sidebar variant. */

const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "mode": "dark",
  "goldHue": 86,
  "density": "comfortable",
  "showOrnaments": true,
  "fontScale": 100,
  "aiVisible": true
}/*EDITMODE-END*/;

function applyTokens(t) {
  const root = document.documentElement;
  root.dataset.mode = t.mode;
  // gold hue rotation around base 86
  const baseHue = 86;
  const delta = t.goldHue - baseHue;
  if (delta !== 0) {
    root.style.setProperty("--gold", `hsl(${36 + delta * 0.6}, 44%, 60%)`);
    root.style.setProperty("--gold-bright", `hsl(${36 + delta * 0.6}, 50%, 70%)`);
    root.style.setProperty("--gold-dim", `hsl(${36 + delta * 0.6}, 38%, 47%)`);
    root.style.setProperty("--gold-deep", `hsl(${36 + delta * 0.6}, 32%, 35%)`);
    root.style.setProperty("--gold-glow", `hsla(${36 + delta * 0.6}, 44%, 60%, 0.14)`);
    root.style.setProperty("--gold-line", `hsla(${36 + delta * 0.6}, 44%, 60%, 0.22)`);
  } else {
    root.style.removeProperty("--gold");
    root.style.removeProperty("--gold-bright");
    root.style.removeProperty("--gold-dim");
    root.style.removeProperty("--gold-deep");
    root.style.removeProperty("--gold-glow");
    root.style.removeProperty("--gold-line");
  }
  document.body.style.fontSize = `${(t.fontScale / 100) * 14}px`;
  root.style.setProperty("--density", t.density === "compact" ? "0.85" : "1");
}

function App() {
  const [tweaks, setTweak] = useTweaks(DEFAULT_TWEAKS);
  const [page, setPage] = React.useState("dashboard"); // dashboard | pdf | (others stubbed)
  const [aiOpen, setAiOpen] = React.useState(true);

  React.useEffect(() => { applyTokens(tweaks); }, [tweaks]);
  React.useEffect(() => { setAiOpen(tweaks.aiVisible); }, [tweaks.aiVisible]);

  const handleNav = ({ type, id }) => {
    if (type === "page") {
      // only dashboard + pdf are fully built; others show coming-soon
      if (id === "dashboard" || id === "pdf") {
        setPage(id);
      } else {
        setPage(id);
      }
    }
  };

  const handleOpen = (id) => {
    if (id === "pdf") setPage("pdf");
    else setPage(id);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--navy-deep)" }}>
      <Sidebar
        active={page}
        onNavigate={handleNav}
        syncState="synced"
        user={{ name: "張慕白", email: "mubai@akasha", initial: "慕" }}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}
        data-screen-label={page === "pdf" ? "02 PDF Reader" : page === "dashboard" ? "01 Dashboard" : `99 ${page}`}>
        {page === "dashboard" && (
          <>
            <Topbar
              breadcrumb="Bibliotheca · 總覽"
              title="總覽"
              subtitle="Overview"
              actions={
                <>
                  <Btn icon="upload" size="sm">匯入</Btn>
                  <Btn variant="gold" icon="plus" size="sm">新建</Btn>
                </>
              }
            />
            <Dashboard onOpen={handleOpen} />
          </>
        )}
        {page === "pdf" && (
          <PdfReader
            onBack={() => setPage("dashboard")}
            aiOpen={aiOpen}
            onAiToggle={() => setAiOpen(v => !v)}
          />
        )}
        {page !== "dashboard" && page !== "pdf" && (
          <ComingSoon name={page} onBack={() => setPage("dashboard")} />
        )}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="主題模式">
          <TweakRadio label="模式" value={tweaks.mode}
            options={[["dark", "深色"], ["light", "淺色"]]}
            onChange={(v) => setTweak("mode", v)} />
        </TweakSection>
        <TweakSection title="氛圍">
          <TweakSlider label="金色色相" min={60} max={120} step={2}
            value={tweaks.goldHue} onChange={(v) => setTweak("goldHue", v)} />
          <TweakSlider label="字體大小 %" min={88} max={114} step={2}
            value={tweaks.fontScale} onChange={(v) => setTweak("fontScale", v)} />
          <TweakRadio label="密度" value={tweaks.density}
            options={[["comfortable", "舒適"], ["compact", "緊湊"]]}
            onChange={(v) => setTweak("density", v)} />
          <TweakToggle label="裝飾紋飾"
            value={tweaks.showOrnaments}
            onChange={(v) => setTweak("showOrnaments", v)} />
        </TweakSection>
        <TweakSection title="圖書館員">
          <TweakToggle label="預設展開 AI 面板"
            value={tweaks.aiVisible}
            onChange={(v) => setTweak("aiVisible", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function ComingSoon({ name, onBack }) {
  const titles = {
    personal: ["個人書庫", "My Library"],
    public: ["公共書庫", "Public Stacks"],
    markdown: ["Markdown 編輯器", "Manuscripta"],
    spreadsheet: ["試算表", "Tabularium"],
    book: ["書籍排版器", "Bibliopegia"],
    settings: ["AI 設定", "Aetherium"],
  };
  const [tc, en] = titles[name] || ["未命名", "—"];
  return (
    <>
      <Topbar breadcrumb="Akasha" title={tc} subtitle={en} onBack={onBack} />
      <div style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 18,
        background: "var(--navy-deep)",
        color: "var(--text-secondary)",
        textAlign: "center", padding: 40,
      }}>
        <div style={{ opacity: 0.4 }}><AkashaMark size={64} /></div>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 14, color: "var(--gold-deep)", letterSpacing: "0.3em",
          textTransform: "uppercase",
        }}>In Construction</div>
        <div style={{
          fontFamily: "var(--font-serif-tc)", fontSize: 16,
          color: "var(--text-secondary)", letterSpacing: "0.1em",
          maxWidth: 360, lineHeight: 1.7,
        }}>此廳尚在裝修中。本次設計交付聚焦於儀表板與閱讀廳；其餘場域將於下一輪交付。</div>
        <Btn variant="gold" size="md" onClick={onBack}>返回總覽</Btn>
      </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
