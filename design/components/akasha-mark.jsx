/* AKASHA mark — letter "A" with a flame above, framed by classical rule.
   Used in sidebar brand and as 404/splash mark. */
function AkashaMark({ size = 36, accent = "var(--gold)", ink = "var(--cream)" }) {
  const w = size;
  const h = size;
  return (
    <svg width={w} height={h} viewBox="0 0 60 60" fill="none" style={{ flexShrink: 0 }}>
      {/* outer brass frame — octagonal hint */}
      <path d="M30 4 L52 16 L52 44 L30 56 L8 44 L8 16 Z"
        stroke={accent} strokeWidth="1" opacity="0.55" fill="none" />
      {/* inner hairline */}
      <path d="M30 8 L48 18 L48 42 L30 52 L12 42 L12 18 Z"
        stroke={accent} strokeWidth="0.5" opacity="0.35" fill="none" />
      {/* flame above the A */}
      <path d="M30 14 c1.5 2 3 3 3 5.5 a3 3 0 11-6 0 c0-1.2 .6-1.8 1.2-2.4 0 1.2 1.2 1.8 1.8 .6 0-1.8-.6-2.4 0-3.7z"
        fill={accent} opacity="0.9" />
      {/* letter A — classical wide */}
      <path d="M19 42 L30 22 L41 42 M23.5 35 H36.5"
        stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* base rule */}
      <path d="M16 46 L44 46" stroke={accent} strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

window.AkashaMark = AkashaMark;
