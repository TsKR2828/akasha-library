/* SVG icon registry — all line icons, 24×24 viewBox, currentColor stroke
   Usage: <Icon name="markdown" size={20} /> */
const ICONS = {
  // Brand & shell
  dashboard: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  bookshelf: <><path d="M4 4v16M20 4v16M4 12h16M4 4h16M4 20h16"/><path d="M8 8v0M12 8v0M16 8v0M8 16v0M12 16v0M16 16v0"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>,
  markdown: <><path d="M5 4l-2 5v11h2M19 4l2 5v11h-2"/><path d="M9 8l3 4 3-4M12 12v6"/></>,
  pdf: <><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/></>,
  spreadsheet: <><rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M3 16h18M9 4v16M15 4v16"/></>,
  book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/><path d="M19 19v2H6a2 2 0 010-4"/><path d="M9 7h7"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,

  // Actions
  search: <><circle cx="11" cy="11" r="7"/><path d="M16 16l4 4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  upload: <><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></>,
  download: <><path d="M12 4v12M6 12l6 6 6-6"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  edit: <><path d="M16 4l4 4-12 12H4v-4z"/></>,
  close: <><path d="M6 6l12 12M18 6L6 18"/></>,
  check: <><path d="M5 12l5 5 9-12"/></>,
  chevronLeft: <><path d="M14 6l-6 6 6 6"/></>,
  chevronRight: <><path d="M10 6l6 6-6 6"/></>,
  chevronDown: <><path d="M6 10l6 6 6-6"/></>,
  chevronUp: <><path d="M6 14l6-6 6 6"/></>,
  back: <><path d="M19 12H5M11 6l-6 6 6 6"/></>,
  send: <><path d="M3 12L21 4l-7 17-3-7-8-2z"/></>,

  // Sync / status
  cloudCheck: <><path d="M7 18a5 5 0 110-10 6 6 0 0111 0 4 4 0 010 8H7z"/><path d="M9 14l2 2 4-4"/></>,
  cloudSync: <><path d="M7 18a5 5 0 110-10 6 6 0 0111 0 4 4 0 010 8"/><path d="M14 14h4v4M18 14a4 4 0 01-7 1"/></>,
  cloudOff: <><path d="M3 3l18 18"/><path d="M9 6a6 6 0 0110 4 4 4 0 014 4M16 18H7a5 5 0 01-2-9.5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>,
  userKey: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0"/><circle cx="18" cy="14" r="2"/><path d="M20 14h2v2M19 16v2"/></>,
  google: <><path d="M21 12a9 9 0 11-3-6.7l-2.4 2.4A5.5 5.5 0 1017.5 14H12v-3h9z"/></>,

  // Library reader
  thumbnail: <><rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M8 13h8M8 17h5"/></>,
  scissors: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M9 8l11 11M9 16l11-11"/></>,
  zoomIn: <><circle cx="11" cy="11" r="7"/><path d="M16 16l4 4M11 8v6M8 11h6"/></>,
  zoomOut: <><circle cx="11" cy="11" r="7"/><path d="M16 16l4 4M8 11h6"/></>,
  fitScreen: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></>,
  pin: <><path d="M12 2v6l3 3v3H9v-3l3-3V2zM12 14v8"/></>,

  // AI panel
  feather: <><path d="M20 4c-8 0-13 5-13 13v3h3c8 0 13-5 13-13V4z"/><path d="M20 4L4 20M14 10l-7 7"/></>,
  message: <><path d="M21 12a8 8 0 01-12 7l-5 1 1-5a8 8 0 1116-3z"/></>,
  microphone: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></>,
  mask: <><path d="M3 8c0-2 2-4 5-4h8c3 0 5 2 5 4v3a9 9 0 01-18 0z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></>,
  coin: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 7v10M9 9l6 6M9 15l6-6"/></>,

  // Decorative
  starSmall: <><path d="M12 4l2 6 6 1-4.5 4 1.5 6-5-3-5 3 1.5-6L4 11l6-1z"/></>,
  diamond: <><path d="M12 3l9 9-9 9-9-9z"/></>,
  flame: <><path d="M12 3c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4 0 2 2 3 3 1 0-3-1-5 0-7z"/></>,
};

function Icon({ name, size = 20, stroke = 1.6, className = "", style = {} }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {path}
    </svg>
  );
}

window.Icon = Icon;
window.ICONS = ICONS;
