/* Topbar — brass plate header bar */
function Topbar({ title, subtitle, breadcrumb, actions, onBack }) {
  return (
    <div style={{
      height: "var(--topbar-h)",
      minHeight: "var(--topbar-h)",
      background: "linear-gradient(180deg, var(--navy-light) 0%, var(--navy) 100%)",
      borderBottom: "1px solid var(--navy-line)",
      display: "flex", alignItems: "center",
      padding: "0 28px",
      gap: 16,
      position: "relative",
    }}>
      {/* brass underline accent */}
      <div style={{
        position: "absolute", left: 28, right: 28, bottom: -1, height: 1,
        background: "linear-gradient(90deg, transparent, var(--gold-line) 25%, var(--gold-line) 75%, transparent)",
      }} />

      {onBack && (
        <button onClick={onBack} style={{
          background: "transparent",
          border: "1px solid var(--navy-line)",
          borderRadius: "var(--r-soft)",
          color: "var(--text-secondary)",
          padding: "6px 8px",
          display: "flex", alignItems: "center",
        }}><Icon name="back" size={16} /></button>
      )}

      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
        {breadcrumb && (
          <div style={{
            fontFamily: "var(--font-serif-en)",
            fontSize: 10.5, letterSpacing: "0.3em",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            marginBottom: 3,
          }}>{breadcrumb}</div>
        )}
        <div style={{
          fontFamily: "var(--font-serif-tc)",
          fontSize: 15.5, color: "var(--text-primary)",
          letterSpacing: "0.06em",
          display: "flex", alignItems: "baseline", gap: 10,
        }}>
          {title}
          {subtitle && (
            <span style={{
              fontFamily: "var(--font-serif-en)",
              fontStyle: "italic",
              fontSize: 12, color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
            }}>· {subtitle}</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>
    </div>
  );
}

/* Generic button */
function Btn({ children, onClick, variant = "ghost", size = "md", icon, disabled, title }) {
  const [hover, setHover] = React.useState(false);
  const variants = {
    gold: {
      background: hover ? "var(--gold)" : "rgba(201,168,106,0.12)",
      border: "1px solid var(--gold)",
      color: hover ? "var(--navy-deep)" : "var(--gold-bright)",
    },
    ghost: {
      background: hover ? "rgba(201,168,106,0.05)" : "transparent",
      border: "1px solid var(--navy-line)",
      color: hover ? "var(--gold-bright)" : "var(--text-secondary)",
    },
    danger: {
      background: hover ? "var(--danger)" : "rgba(196,96,79,0.1)",
      border: "1px solid var(--danger)",
      color: hover ? "var(--cream)" : "var(--danger)",
    },
  };
  const sizes = {
    sm: { padding: "5px 10px", fontSize: 11.5 },
    md: { padding: "7px 14px", fontSize: 12.5 },
    lg: { padding: "10px 20px", fontSize: 13.5 },
  };
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...variants[variant], ...sizes[size],
        fontFamily: "var(--font-serif-tc)",
        letterSpacing: "0.12em",
        borderRadius: "var(--r-soft)",
        display: "inline-flex", alignItems: "center", gap: 7,
        transition: "all 160ms",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 14} stroke={1.6} />}
      {children}
    </button>
  );
}

window.Topbar = Topbar;
window.Btn = Btn;
