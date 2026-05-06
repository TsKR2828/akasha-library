/* Sidebar — dark wood-panelled rail with brass accents, hinted with vertical wood grain. */

const sidebarStyles = {
  root: {
    width: "var(--sidebar-w)",
    minWidth: "var(--sidebar-w)",
    height: "100vh",
    background: "linear-gradient(180deg, #1c2230 0%, #161b25 70%, #11151d 100%)",
    borderRight: "1px solid var(--navy-line)",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    fontFamily: "var(--font-body)",
  },
  brassEdge: {
    position: "absolute",
    right: 0, top: 0, bottom: 0, width: 1,
    background: "linear-gradient(180deg, transparent 0%, var(--gold-line) 8%, var(--gold-line) 92%, transparent 100%)",
    pointerEvents: "none",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "22px 22px 18px",
  },
  brandText: {
    display: "flex", flexDirection: "column", lineHeight: 1.05,
  },
  brandEn: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 18,
    letterSpacing: "0.18em",
    color: "var(--gold)",
    fontWeight: 500,
    textTransform: "uppercase",
  },
  brandTc: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 13,
    color: "var(--text-secondary)",
    letterSpacing: "0.32em",
    marginTop: 4,
  },
  authBlock: {
    margin: "8px 18px 14px",
    padding: "14px 14px",
    border: "1px solid var(--navy-line)",
    borderRadius: "var(--r-soft)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.18))",
    position: "relative",
  },
  authRow: {
    display: "flex", alignItems: "center", gap: 10,
  },
  avatar: {
    width: 34, height: 34, borderRadius: "50%",
    background: "radial-gradient(circle at 30% 30%, #4a3a26, #2a1f12)",
    border: "1px solid var(--gold-line)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--gold)",
    fontFamily: "var(--font-serif-en)",
    fontSize: 16, fontWeight: 500,
    boxShadow: "inset 0 0 6px rgba(0,0,0,0.5)",
  },
  authText: { flex: 1, minWidth: 0 },
  authName: {
    fontFamily: "var(--font-serif-tc)",
    fontSize: 13.5, color: "var(--text-primary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  authMeta: {
    fontSize: 11, color: "var(--text-tertiary)",
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.05em",
    marginTop: 2,
    display: "flex", alignItems: "center", gap: 6,
  },
  syncDot: (kind) => ({
    width: 6, height: 6, borderRadius: "50%",
    background: kind === "synced" ? "var(--success)" :
               kind === "syncing" ? "var(--gold)" :
               kind === "offline" ? "var(--text-tertiary)" : "var(--danger)",
    boxShadow: kind === "syncing" ? "0 0 8px var(--gold)" : "none",
    animation: kind === "syncing" ? "pulse 1.4s ease-in-out infinite" : "none",
  }),
  navWrap: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 12px 16px",
  },
  navSection: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 10.5,
    letterSpacing: "0.32em",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    padding: "16px 10px 8px",
    display: "flex", alignItems: "center", gap: 10,
  },
  sectionRule: {
    flex: 1, height: 1,
    background: "linear-gradient(90deg, var(--navy-line), transparent)",
  },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 12,
    padding: "9px 12px",
    color: active ? "var(--gold-bright)" : "var(--text-secondary)",
    background: active ? "var(--gold-glow)" : "transparent",
    borderLeft: `2px solid ${active ? "var(--gold)" : "transparent"}`,
    borderRadius: "0 var(--r-soft) var(--r-soft) 0",
    cursor: "pointer",
    transition: "all 160ms ease",
    position: "relative",
    fontFamily: "var(--font-serif-tc)",
  }),
  navIcon: { opacity: 0.85 },
  navText: { display: "flex", flexDirection: "column", lineHeight: 1.15, flex: 1 },
  navTitle: { fontSize: 13.5, letterSpacing: "0.08em" },
  navSub: {
    fontFamily: "var(--font-serif-en)",
    fontSize: 10, letterSpacing: "0.18em",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    marginTop: 2,
  },
  footer: {
    padding: "14px 22px 18px",
    borderTop: "1px solid var(--navy-line)",
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    color: "var(--text-tertiary)",
    letterSpacing: "0.06em",
    display: "flex", justifyContent: "space-between",
  },
  footerLink: {
    color: "var(--text-tertiary)",
    cursor: "pointer",
  },
};

const NAV_ITEMS = [
  { id: "dashboard", icon: "dashboard", title: "總覽", sub: "Overview", section: "navigate" },
  { id: "personal", icon: "bookshelf", title: "個人書庫", sub: "My Library", section: "navigate" },
  { id: "public", icon: "globe", title: "公共書庫", sub: "Public Stacks", section: "navigate" },
  { id: "markdown", icon: "markdown", title: "Markdown", sub: "Manuscripts", section: "tools" },
  { id: "pdf", icon: "pdf", title: "PDF 閱讀器", sub: "Reading Hall", section: "tools" },
  { id: "spreadsheet", icon: "spreadsheet", title: "試算表", sub: "Ledgers", section: "tools" },
  { id: "book", icon: "book", title: "書籍排版器", sub: "Bindery", section: "tools" },
  { id: "settings", icon: "settings", title: "AI 設定", sub: "Aetherium", section: "tools" },
];

function Sidebar({ active = "pdf", onNavigate, syncState = "synced", user }) {
  const navigate = NAV_ITEMS.filter(n => n.section === "navigate");
  const tools = NAV_ITEMS.filter(n => n.section === "tools");

  const syncLabel = {
    synced: "已同步",
    syncing: "同步中…",
    offline: "離線模式",
    error: "同步失敗",
  }[syncState];

  return (
    <aside style={sidebarStyles.root} className="tex-paper">
      <div style={sidebarStyles.brassEdge} />

      {/* BRAND */}
      <div style={sidebarStyles.brand}>
        <AkashaMark size={42} />
        <div style={sidebarStyles.brandText}>
          <div style={sidebarStyles.brandEn}>Akasha</div>
          <div style={sidebarStyles.brandTc}>阿卡夏圖書館</div>
        </div>
      </div>

      <div className="brass-rule brass-rule--thin" style={{ margin: "0 22px" }} />

      {/* AUTH */}
      <div style={sidebarStyles.authBlock}>
        <div style={sidebarStyles.authRow}>
          <div style={sidebarStyles.avatar}>{user ? user.initial : "客"}</div>
          <div style={sidebarStyles.authText}>
            <div style={sidebarStyles.authName}>{user ? user.name : "訪客 — 未登入"}</div>
            <div style={sidebarStyles.authMeta}>
              <span style={sidebarStyles.syncDot(syncState)} />
              {syncLabel}
              {user && <span style={{ opacity: 0.5 }}>· {user.email}</span>}
            </div>
          </div>
        </div>
        {!user && (
          <button
            onClick={() => onNavigate?.({ type: "login" })}
            style={{
              marginTop: 10, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "8px 10px",
              border: "1px solid var(--gold-line)",
              background: "transparent",
              color: "var(--gold)",
              fontFamily: "var(--font-serif-tc)",
              fontSize: 12.5, letterSpacing: "0.1em",
              borderRadius: "var(--r-soft)",
            }}
          >
            <Icon name="google" size={14} stroke={1.6} />
            以 Google 簽到入館
          </button>
        )}
      </div>

      {/* NAV */}
      <nav style={sidebarStyles.navWrap}>
        <div style={sidebarStyles.navSection}>
          <span>I · Navigate</span>
          <span style={sidebarStyles.sectionRule} />
        </div>
        {navigate.map(item => (
          <NavRow key={item.id} item={item} active={active === item.id}
            onClick={() => onNavigate?.({ type: "page", id: item.id })} />
        ))}

        <div style={sidebarStyles.navSection}>
          <span>II · Tools</span>
          <span style={sidebarStyles.sectionRule} />
        </div>
        {tools.map(item => (
          <NavRow key={item.id} item={item} active={active === item.id}
            onClick={() => onNavigate?.({ type: "page", id: item.id })} />
        ))}
      </nav>

      {/* FOOTER */}
      <div style={sidebarStyles.footer}>
        <span>v0.1 · MMXXVI</span>
        <span style={sidebarStyles.footerLink}>Privacy</span>
      </div>
    </aside>
  );
}

function NavRow({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const style = {
    ...sidebarStyles.navItem(active),
    background: active ? "var(--gold-glow)" : (hover ? "rgba(255,255,255,0.025)" : "transparent"),
    color: active ? "var(--gold-bright)" : (hover ? "var(--text-primary)" : "var(--text-secondary)"),
  };
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      <div style={sidebarStyles.navIcon}><Icon name={item.icon} size={18} /></div>
      <div style={sidebarStyles.navText}>
        <div style={sidebarStyles.navTitle}>{item.title}</div>
        <div style={sidebarStyles.navSub}>{item.sub}</div>
      </div>
      {active && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--gold)",
          boxShadow: "0 0 6px var(--gold)",
        }} />
      )}
    </div>
  );
}

window.Sidebar = Sidebar;
window.NAV_ITEMS = NAV_ITEMS;
