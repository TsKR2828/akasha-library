/* Script Workshop · v2 — three-tab edition.
   Search | Editor | Reader (new).
   Reader view = black-box theater script reading.

   Phase 17 v2 (Archive-host merge): migrated from React CDN + Babel Standalone
   to Vite + ES modules. Data folder served from public/data/ → ./data/. */

import React from "react";
import WriteTab from "./components/WriteTab.jsx";
import { useCharactersOfWork } from "./hooks/useCharactersOfWork.js";

// ============= DATA (loaded from ./data/ JSONL via Vite public folder) =============
const DATA_BASE = "./data";
let WORKS = [];
let CHAR_COLORS = {};
let CHARACTERS = [];
let SCRIPT = [];

const SCENE_SUBTITLES = {
  "1_1": "安特衛普，舍爾德河畔——國王的審判",
  "1_2": "艾爾莎的夢境敘述",
  "1_3": "天鵝騎士降臨——神判與禁問之誓",
  "2_1": "城堡階梯前——泰拉蒙德夫婦的密謀",
  "2_2": "艾爾莎的夜曲——奧特魯德的咒詛",
  "2_4": "大教堂前——奧特魯德的挑釁",
  "2_5": "泰拉蒙德的公開控訴",
  "3_1": "婚禮進行曲",
  "3_2": "新房——禁問的破碎",
  "3_3": "聖杯敘事——告別與解咒",
};

const PREDEFINED_COLORS = {
  lohengrin: "#c9a86a",
  elsa: "#e8d8b8",
  ortrud: "#a05a6e",
  friedrich_telramund: "#7b6a52",
  koenig_heinrich: "#7b8ec9",
  heerrufer: "#9aa1ad",
  gottfried: "#6aae7f",
  chor: "#a08550",
};

const GERMAN_ACT_NUMS = { 1: "einem", 2: "zwei", 3: "drei", 4: "vier", 5: "fünf" };

let WORK_INDEX = []; // [{id, title, titleEn, author}]

async function loadWorkIndex() {
  const base = DATA_BASE;
  try {
    const res = await fetch(`${base}/index.json`);
    WORK_INDEX = await res.json();
  } catch { WORK_INDEX = [{ id: "lohengrin", title: "羅恩格林", titleEn: "Lohengrin", author: "Richard Wagner" }]; }
}

async function loadAllData(workId = "lohengrin") {
  const base = DATA_BASE;
  await loadWorkIndex();

  const safeFetch = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res;
  };

  const [workResult, charsResult, linesResult] = await Promise.allSettled([
    safeFetch(`${base}/works/${workId}.json`),
    safeFetch(`${base}/characters/${workId}_characters.json`),
    safeFetch(`${base}/lines/${workId}_lines.jsonl`),
  ]);

  if (workResult.status === "rejected") console.error("作品資料載入失敗:", workResult.reason);
  if (charsResult.status === "rejected") console.error("角色資料載入失敗:", charsResult.reason);
  if (linesResult.status === "rejected") console.error("台詞資料載入失敗:", linesResult.reason);

  const work = workResult.status === "fulfilled" ? await workResult.value.json() : {};
  const chars = charsResult.status === "fulfilled" ? await charsResult.value.json() : [];
  const linesText = linesResult.status === "fulfilled" ? await linesResult.value.text() : "";
  const lines = linesText ? linesText.trim().split("\n").map(l => JSON.parse(l)) : [];

  // ── Works ──
  const genreLabel = (work.genre || []).find(g => g.includes("Oper")) ||
                     (work.genre || []).find(g => g.includes("drama")) ||
                     (work.genre || [])[0] || "";
  WORKS = [{
    id: work.work_id,
    title: work.title_zh,
    titleEn: work.title_original,
    composer: work.author,
    license: (work.copyright_status || "unchecked").replace(/_/g, "-"),
    synopsis: work.synopsis_zh,
    premiereYear: work.premiere_year,
    setting: work.setting,
    copyrightNote: work.copyright_note,
    acts: work.acts,
    genreLabel: genreLabel.charAt(0).toUpperCase() + genreLabel.slice(1),
    actsLabel: `in ${GERMAN_ACT_NUMS[work.acts] || work.acts} Akten`,
  }];

  // ── Characters ──
  CHARACTERS = chars.map(c => ({
    id: c.character_id,
    name: c.name_zh,
    nameEn: c.name_original,
    voice: c.voice_type,
    role: c.role_type.join(" · "),
    relations: c.relationship_tags.join("、"),
    tone: c.voice_note,
    tags: c.tags,
    notes: [],
  }));

  // Add any speaker in lines but missing from character JSON (e.g. Chor)
  const lineCharIds = [...new Set(lines.map(l => l.character_id))];
  lineCharIds.forEach(cid => {
    if (!CHARACTERS.find(c => c.id === cid)) {
      const sample = lines.find(l => l.character_id === cid);
      CHARACTERS.push({
        id: cid,
        name: sample?.speaker || cid,
        nameEn: sample?.speaker || cid,
        voice: "Ensemble",
        role: cid,
        relations: "—",
        tone: "",
        tags: [],
        notes: [],
      });
    }
  });

  // ── Colors ──
  CHAR_COLORS = {};
  CHARACTERS.forEach((c, i) => {
    CHAR_COLORS[c.id] = PREDEFINED_COLORS[c.id] || `hsl(${(i * 47) % 360}, 45%, 55%)`;
  });

  // ── Script blocks (from JSONL lines) ──
  SCRIPT = [];
  let lastScene = null;
  lines.forEach(line => {
    const sceneKey = `${line.act}_${line.scene}`;
    if (sceneKey !== lastScene) {
      SCRIPT.push({
        id: `scene_${line.act}_${line.scene}`,
        type: "scene",
        act: `Akt ${line.act} · Sz ${line.scene}`,
        subtitle: SCENE_SUBTITLES[sceneKey] || "",
        note: "",
      });
      lastScene = sceneKey;
    }
    const tags = [];
    (line.plot_tags || []).forEach(t => tags.push([t, "plot"]));
    (line.emotion_tags || []).forEach(t => tags.push([t, "emotion"]));
    (line.line_type || []).filter(t => t !== "dialogue").forEach(t => tags.push([t, "form"]));

    SCRIPT.push({
      id: line.line_id,
      type: "dialogue",
      speakerId: line.character_id,
      lineId: line.line_id,
      original: line.line_original,
      zh: line.line_zh,
      tags,
      avg: { sprite: "", position: "center", bg: "", bgm: "", sfx: "" },
    });
  });
}

// ============= ICONS =============
const SwIcon = ({ name, size = 16, stroke = 1.6 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M16 16l4 4" /></>,
    pen: <><path d="M16 4l4 4-12 12H4v-4z" /></>,
    book: <><path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4z M20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
    download: <><path d="M12 4v12M6 12l6 6 6-6" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>,
    upload: <><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>,
    close: <><path d="M6 6l12 12M18 6L6 18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 8v0M12 11v6" /></>,
    chevronRight: <><path d="M10 6l6 6-6 6" /></>,
    chevronDown: <><path d="M6 10l6 6 6-6" /></>,
    bubble: <><path d="M5 6h14v10H10l-4 4V6z" /></>,
    scroll: <><path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2V4z" /><path d="M6 4a2 2 0 00-2 2v0a2 2 0 002 2" /><path d="M9 9h7M9 13h7" /></>,
    curtain: <><path d="M3 3h18M5 3v18M19 3v18M5 7c2 1 3 3 3 6s-1 5-3 6M19 7c-2 1-3 3-3 6s1 5 3 6M12 3v18" /></>,
    note: <><path d="M5 3h11l4 4v14H5z" /><path d="M16 3v4h4M9 13h6M9 17h4" /></>,
    mask: <><path d="M3 8c0-2 2-4 5-4h8c3 0 5 2 5 4v3a9 9 0 01-18 0z" /><circle cx="9" cy="11" r="1.2" fill="currentColor" /><circle cx="15" cy="11" r="1.2" fill="currentColor" /><path d="M10 15c1 1 3 1 4 0" /></>,
    back: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
    moon: <><path d="M21 13a9 9 0 11-10-10 7 7 0 0010 10z" /></>,
    branch: <><path d="M6 4v6c0 5 6 5 6 10v0M18 4v6c0 5-6 5-6 10v0" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
    hashtag: <><path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16" /></>,
    drag: <><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></>,
    panelLeft: <><path d="M3 3h7v18H3z" /><path d="M10 3h11v18H10" /></>,
    panelRight: <><path d="M14 3h7v18h-7z" /><path d="M3 3h11v18H3" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="1" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
    music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    speaker: <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></>,
    code: <><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    layers: <><path d="M12 2L2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
    network: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="20" r="2" /><circle cx="19" cy="16" r="2" /><path d="M7 7l5 11M17 7l-5 11M17 7v7" /></>,
    quill: <><path d="M20 2c-2 0-7 1-9 5-1 2-1.5 4-1.5 6H7l-2 4.5L3 22h2l1.5-3H12c0-2 .5-4 1.5-6 2-4 5-5 7-5l1-1c0-2-1-5-1.5-5z" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ============= BLOCK VALIDATION (Phase 12-A) =============
const VALID_BLOCK_TYPES = ["dialogue", "narration", "scene", "note", "choice", "command"];
const SAFE_ID_RE = /^[a-zA-Z0-9_\-]+$/;

function validateBlock(block) {
  const errors = [];
  // Common checks
  if (!block.id) errors.push("缺少 id");
  if (block.id && !SAFE_ID_RE.test(block.id)) errors.push(`id「${block.id}」含有不安全字元（僅允許英數、_、-）`);
  if (!block.type) errors.push("缺少 type");
  if (block.type && !VALID_BLOCK_TYPES.includes(block.type)) errors.push(`未知 type「${block.type}」`);

  // Type-specific checks
  if (block.type === "dialogue") {
    // v2-fix4: isUnknown 旗標 → 跳過角色表驗證（user-authored 未綁定角色）
    if (!block.isUnknown) {
      if (!block.speakerId) errors.push("缺少 speakerId");
      if (block.speakerId) {
        if (CHARACTERS.length === 0) {
          errors.push("角色表為空，無法驗證 speakerId");
        } else if (!CHARACTERS.find(c => c.id === block.speakerId)) {
          errors.push(`speakerId「${block.speakerId}」不存在於角色表`);
        }
      }
    }
    if (!block.original && !block.zh) errors.push("原文與中譯皆為空");
    if (block.tags && !Array.isArray(block.tags)) errors.push("tags 應為陣列");
    if (block.tags && block.tags.some(t => !Array.isArray(t) || t.length !== 2)) {
      errors.push("tags 格式錯誤（應為 [[text, kind], …]）");
    }
  }
  if (block.type === "narration") {
    if (!block.text) errors.push("旁白文字為空");
  }
  if (block.type === "scene") {
    if (!block.act) errors.push("缺少幕場標記");
  }
  if (block.type === "choice") {
    if (!block.options || !Array.isArray(block.options)) errors.push("缺少 options 陣列");
    else if (block.options.length === 0) errors.push("選項不可為空（至少���一個）");
    else {
      block.options.forEach((opt, i) => {
        if (!opt.text) errors.push(`選項 ${i + 1} 文字為空`);
      });
    }
  }

  return errors;
}

function validateBlocks(blocks) {
  // Returns { valid: bool, results: [{index, id, errors}] }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: false, results: [{ index: 0, id: "(file)", errors: ["匯入資料不是有效的 block 陣列"] }] };
  }
  const results = [];
  blocks.forEach((b, i) => {
    if (b === null || typeof b !== "object" || Array.isArray(b)) {
      results.push({ index: i, id: `(line ${i + 1})`, errors: [`項目不是有效物件（收到 ${Array.isArray(b) ? "array" : typeof b}）`] });
      return;
    }
    const errs = validateBlock(b);
    if (errs.length > 0) results.push({ index: i, id: b.id || `(line ${i + 1})`, errors: errs });
  });
  return { valid: results.length === 0, results };
}

// ============= UTILS =============
function downloadFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  debounced.flush = (...args) => { clearTimeout(timer); fn(...args); };
  debounced.cancel = () => { clearTimeout(timer); };
  return debounced;
}

// ============= NOTES (localStorage CRUD) =============
function getWorkId() { return WORKS[0]?.id || "lohengrin"; }

function loadNotes() {
  try {
    const raw = localStorage.getItem(`notes_${getWorkId()}`);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[Archive] 筆記資料解析失敗，已重設為空白:", e);
    alert("⚠️ 本機筆記資料損壞，無法解析。筆記已重設為空白。\n（原始資料仍保留在 localStorage 中）");
    return {};
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(`notes_${getWorkId()}`, JSON.stringify(notes));
  } catch (e) {
    console.error("[Archive] 筆記儲存失敗:", e);
    alert("⚠️ 筆記儲存失敗：本機儲存空間不足。\n請清除不需要的立繪或匯出備份後重試。");
  }
}

function useNotes() {
  const [notes, setNotes] = React.useState(loadNotes);

  const addNote = (charId, text) => {
    setNotes(prev => {
      const arr = prev[charId] || [];
      const next = { ...prev, [charId]: [...arr, { id: Date.now().toString(36), text, ts: Date.now() }] };
      saveNotes(next);
      return next;
    });
  };

  const updateNote = (charId, noteId, text) => {
    setNotes(prev => {
      const arr = (prev[charId] || []).map(n => n.id === noteId ? { ...n, text } : n);
      const next = { ...prev, [charId]: arr };
      saveNotes(next);
      return next;
    });
  };

  const removeNote = (charId, noteId) => {
    if (!window.confirm("確定刪除此筆記？此操作無法復原。")) return;
    setNotes(prev => {
      const arr = (prev[charId] || []).filter(n => n.id !== noteId);
      const next = { ...prev, [charId]: arr };
      saveNotes(next);
      return next;
    });
  };

  return { notes, addNote, updateNote, removeNote };
}

// ============= BLOCKS localStorage PERSISTENCE =============
function loadBlocksFromStorage() {
  try {
    const raw = localStorage.getItem(`blocks_${getWorkId()}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("[Archive] blocks 資料解析失敗，將使用原始 SCRIPT:", e);
    alert("⚠️ 本機稿件資料損壞，無法解析。將使用原始資料載入。\n（原始資料仍保留在 localStorage 中）");
    return null;
  }
}

function saveBlocksToStorage(blocks) {
  try {
    localStorage.setItem(`blocks_${getWorkId()}`, JSON.stringify(blocks));
  } catch (e) {
    console.error("[Archive] localStorage 寫入失敗:", e);
    alert("⚠️ 儲存失敗：本機儲存空間不足。\n請清除不需要的立繪或匯出備份後重試。");
  }
}

// ============= TAG =============
const TAG_PALETTE = {
  plot:    { bg: "rgba(201,168,106,0.15)", fg: "#C9A86A", bd: "#C9A86A" },
  emotion: { bg: "rgba(196,96,79,0.15)",    fg: "#c4604f", bd: "rgba(196,96,79,0.25)" },
  theme:   { bg: "rgba(138,128,196,0.12)", fg: "#a89cd8", bd: "rgba(138,128,196,0.2)" },
  form:    { bg: "rgba(123,142,201,0.15)", fg: "#7B8EC9", bd: "#7B8EC9" },
  role:    { bg: "rgba(160,133,80,0.15)",  fg: "#A08550", bd: "#A08550" },
};

function Tag({ kind = "plot", children, onRemove, dim = false }) {
  const c = TAG_PALETTE[kind] || TAG_PALETTE.plot;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px",
      borderRadius: 10,
      fontFamily: "var(--font-body)", fontSize: 11,
      letterSpacing: "0.04em",
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      opacity: dim ? 0.6 : 1,
      whiteSpace: "nowrap",
      transition: "opacity 150ms",
    }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} aria-label="remove tag"
          style={{ background: "transparent", border: "none", color: "inherit",
            cursor: "pointer", padding: 0, opacity: 0.7, display: "flex" }}>
          <SwIcon name="close" size={9} stroke={1.8} />
        </button>
      )}
    </span>
  );
}

// ============= BUTTONS =============
function SwBtn({ children, onClick, variant = "ghost", size = "md", icon, title }) {
  const [h, setH] = React.useState(false);
  const v = {
    gold:  { bg: h ? "var(--gold)" : "rgba(201,168,106,0.12)", bd: "var(--gold)",      fg: h ? "var(--navy-deep)" : "var(--gold-bright)" },
    ghost: { bg: h ? "rgba(201,168,106,0.05)" : "transparent",  bd: "var(--navy-line)", fg: h ? "var(--gold-bright)" : "var(--text-secondary)" },
    danger:{ bg: h ? "var(--danger)" : "rgba(196,96,79,0.10)",  bd: "var(--danger)",    fg: h ? "var(--cream)" : "var(--danger)" },
  }[variant];
  const s = { sm: { padding: "5px 10px", fontSize: 11.5 }, md: { padding: "7px 14px", fontSize: 12.5 } }[size];
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: v.bg, border: `1px solid ${v.bd}`, color: v.fg,
        ...s, fontFamily: "var(--font-serif-tc)", letterSpacing: "0.12em",
        borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 7,
        cursor: "pointer", transition: "all 160ms",
      }}>
      {icon && <SwIcon name={icon} size={size === "sm" ? 12 : 14} />}
      {children}
    </button>
  );
}

// ============= TOPBAR =============
function SwHeader({ tab, setTab, onBack }) {
  const tabs = [
    { id: "write",  tc: "速寫", en: "Write",  ic: "quill" },
    { id: "search", tc: "搜尋", en: "Search", ic: "search" },
    { id: "editor", tc: "編輯", en: "Editor", ic: "pen" },
    { id: "reader", tc: "閱讀", en: "Reader", ic: "book" },
  ];
  return (
    <header style={{
      height: 64, minHeight: 64,
      borderBottom: "1px solid var(--navy-line)",
      background: "linear-gradient(180deg, var(--navy-light) 0%, var(--navy) 100%)",
      display: "flex", alignItems: "center", padding: "0 24px", gap: 18,
      position: "relative",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", left: 24, right: 24, bottom: -1, height: 1,
        background: "linear-gradient(90deg, transparent, var(--gold-line) 20%, var(--gold-line) 80%, transparent)",
      }} />

      <button onClick={onBack} style={{
        background: "transparent", border: "1px solid var(--navy-line)",
        borderRadius: 2, color: "var(--text-secondary)",
        padding: "6px 8px", cursor: "pointer", display: "flex",
      }} title="返回阿卡夏">
        <SwIcon name="back" size={14} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "var(--gold)" }}><SwIcon name="mask" size={22} stroke={1.4} /></span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <div style={{
            fontFamily: "var(--font-serif-en)", fontSize: 10.5,
            letterSpacing: "0.34em", color: "var(--gold)",
            fontVariant: "small-caps", textTransform: "uppercase",
          }}>Script Workshop · IV</div>
          <div style={{
            display: "flex", gap: 8, alignItems: "baseline",
            fontFamily: "var(--font-serif-tc)", fontSize: 16,
            color: "var(--text-primary)", letterSpacing: "0.16em",
          }}>
            劇本工房
            <span style={{
              fontFamily: "var(--font-serif-en)", fontStyle: "italic",
              fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.04em",
            }}>— Dramaturgica</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* 3-tab pill switcher */}
      <div style={{
        display: "flex", gap: 2,
        padding: 3,
        background: "rgba(0,0,0,0.28)",
        border: "1px solid var(--navy-line)",
        borderRadius: 2,
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: active ? "var(--gold-glow)" : "transparent",
                border: "none",
                padding: "7px 16px",
                color: active ? "var(--gold-bright)" : "var(--text-secondary)",
                fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
                letterSpacing: "0.16em",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
                transition: "all 160ms",
              }}>
              <SwIcon name={t.ic} size={13} />
              {t.tc}
              <span style={{
                fontFamily: "var(--font-serif-en)", fontStyle: "italic",
                fontSize: 10.5, opacity: 0.7, letterSpacing: "0.14em",
              }}>{t.en}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", gap: 6 }}>
        <SwBtn icon="moon" size="sm" onClick={() => alert("AI 輔助功能開發中，敬請期待。")}>AI</SwBtn>
        <SwBtn icon="info" size="sm" onClick={() => alert("Archive Script Editor — 戲劇文本資料庫與劇本編輯器。\n\n快捷鍵：\n• Tab 切換：搜尋 / 編輯 / 閱讀\n• 編輯器內可匯入 / 匯出 JSONL\n• 閱讀模式支援 PDF 匯出（公共領域作品）")}>說明</SwBtn>
      </div>
    </header>
  );
}

// ============= INPUTS =============
function SwInput({ value, onChange, placeholder, icon }) {
  const [f, setF] = React.useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {icon && (
        <span style={{ position: "absolute", left: 10, color: f ? "var(--gold)" : "var(--text-tertiary)", display: "flex" }}>
          <SwIcon name={icon} size={13} />
        </span>
      )}
      <input value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "var(--navy-light)",
          border: `1px solid ${f ? "var(--gold-line)" : "var(--navy-line)"}`,
          color: "var(--cream)",
          padding: icon ? "7px 10px 7px 30px" : "7px 10px",
          fontFamily: "var(--font-body)",
          fontSize: 12.5, letterSpacing: "0.04em",
          borderRadius: 2, outline: "none",
          transition: "border-color 160ms",
        }} />
    </div>
  );
}

function SwSelect({ value, onChange, options }) {
  const [f, setF] = React.useState(false);
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        background: "var(--navy-light)",
        border: `1px solid ${f ? "var(--gold-line)" : "var(--navy-line)"}`,
        color: value ? "var(--cream)" : "var(--text-tertiary)",
        padding: "7px 24px 7px 10px",
        fontFamily: "var(--font-body)", fontSize: 12.5,
        borderRadius: 2, outline: "none", cursor: "pointer", appearance: "none",
        backgroundImage: "linear-gradient(45deg, transparent 50%, var(--gold-dim) 50%), linear-gradient(135deg, var(--gold-dim) 50%, transparent 50%)",
        backgroundPosition: "calc(100% - 14px) 50%, calc(100% - 9px) 50%",
        backgroundSize: "5px 5px",
        backgroundRepeat: "no-repeat",
      }}>
      {options.map(([v, l]) => <option key={v} value={v} style={{ background: "var(--navy-deep)" }}>{l}</option>)}
    </select>
  );
}

// ============= SECTION HEADER (Small Caps Latin) =============
function SectionLabel({ latin, zh, accent = "tertiary" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: "var(--font-serif-en)",
      fontVariant: "small-caps",
      fontSize: 11, letterSpacing: "0.34em",
      color: accent === "gold" ? "var(--gold)" : "var(--text-tertiary)",
      textTransform: "uppercase",
    }}>
      <span>{latin}</span>
      {zh && <>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ fontFamily: "var(--font-serif-tc)", letterSpacing: "0.16em", textTransform: "none", fontVariant: "normal" }}>{zh}</span>
      </>}
      <span style={{ flex: 1, height: 1, background: "var(--navy-line)" }} />
    </div>
  );
}

// ============= SEARCH VIEW =============
function SearchView({ blocks, characters, goToEditor, goToReader, goToBlock }) {
  const allCharacters = useCharactersOfWork(blocks, characters);
  const [filters, setFilters] = React.useState({
    q: "", work: "", character: "", plot: "", emotion: "", license: "",
  });

  const dialogues = blocks.filter(b => b.type === "dialogue");
  const filtered = React.useMemo(() => {
    return dialogues.filter(r => {
      const ch = allCharacters.find(c => c.id === r.speakerId);
      if (filters.q && !((r.original + r.zh + (ch?.name || "")).toLowerCase().includes(filters.q.toLowerCase()))) return false;
      if (filters.work && (r.workId || WORKS[0]?.id) !== filters.work) return false;
      if (filters.character && r.speakerId !== filters.character) return false;
      if (filters.plot && !(r.tags || []).some(([t, k]) => k === "plot" && t.includes(filters.plot))) return false;
      if (filters.emotion && !(r.tags || []).some(([t, k]) => k === "emotion" && t.includes(filters.emotion))) return false;
      if (filters.license) {
        const workObj = WORKS.find(w => w.id === (r.workId || WORKS[0]?.id));
        if (workObj && workObj.license !== filters.license) return false;
      }
      return true;
    });
  }, [filters, blocks]);

  const checkExportLicense = () => {
    const work = WORKS[0];
    if (work && work.license !== "public-domain" && work.license !== "fair-use") {
      alert(`版權狀態「${work.license || "unchecked"}」不允許全文匯出。\n僅 public-domain 與 fair-use 作品可匯出。`);
      return false;
    }
    return true;
  };

  const exportMarkdown = () => {
    if (!checkExportLicense()) return;
    const lines = filtered.map(r => {
      const ch = allCharacters.find(c => c.id === r.speakerId);
      return `### ${ch?.name || r.speakerId}\n> ${r.original}\n\n${r.zh}\n\nTags: ${(r.tags || []).map(([t]) => t).join(", ")}`;
    });
    downloadFile("search-results.md", lines.join("\n\n---\n\n"));
  };

  const exportCsv = () => {
    if (!checkExportLicense()) return;
    const header = "LineID,Speaker,Original,Translation,Tags";
    const rows = filtered.map(r => {
      const ch = allCharacters.find(c => c.id === r.speakerId);
      const tags = (r.tags || []).map(([t]) => t).join("; ");
      return `"${r.lineId || ""}","${ch?.name || r.speakerId}","${(r.original || "").replace(/"/g, '""')}","${(r.zh || "").replace(/"/g, '""')}","${tags}"`;
    });
    downloadFile("search-results.csv", [header, ...rows].join("\n"), "text/csv");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* Filter Bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(17,21,29,0.88)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--navy-line)",
        padding: "16px 28px",
      }}>
        <div style={{ marginBottom: 10 }}>
          <SectionLabel latin="Filtra" zh="篩選" />
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr auto auto",
          gap: 8, alignItems: "center",
        }}>
          <SwInput placeholder="關鍵字 · keyword"
            value={filters.q} onChange={v => setFilters({ ...filters, q: v })} icon="search" />
          <SwSelect value={filters.work} onChange={v => setFilters({ ...filters, work: v })}
            options={[["", "全部作品"], ...WORKS.map(w => [w.id, `${w.title} · ${w.titleEn}`])]} />
          <SwSelect value={filters.character} onChange={v => setFilters({ ...filters, character: v })}
            options={[["", "全部角色"], ...allCharacters.map(c => [c.id, `${c.name} · ${c.nameEn}`])]} />
          <SwInput placeholder="劇情 TAG"
            value={filters.plot} onChange={v => setFilters({ ...filters, plot: v })} />
          <SwInput placeholder="情緒 TAG"
            value={filters.emotion} onChange={v => setFilters({ ...filters, emotion: v })} />
          <SwSelect value={filters.license} onChange={v => setFilters({ ...filters, license: v })}
            options={[["", "全部版權"], ["public-domain", "公共領域"], ["fair-use", "合理使用"]]} />
          <SwBtn variant="gold" size="sm" icon="search" onClick={() => document.activeElement?.blur()}>搜尋</SwBtn>
          <button onClick={() => setFilters({ q: "", work: "", character: "", plot: "", emotion: "", license: "" })}
            style={{
              background: "transparent", border: "none", color: "var(--text-secondary)",
              fontFamily: "var(--font-serif-tc)", fontSize: 12, letterSpacing: "0.1em",
              cursor: "pointer", padding: "5px 6px",
            }}>清除</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        padding: "14px 28px 8px",
        display: "flex", alignItems: "baseline", gap: 14,
        fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
        color: "var(--text-secondary)", letterSpacing: "0.06em",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 17, color: "var(--gold)",
        }}>{filtered.length}</span>
        <span>筆結果 ·</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--text-tertiary)", letterSpacing: "0.08em",
        }}>{filtered.length} matches in {WORKS.length} works</span>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 28px 80px" }}>
        {filtered.length === 0 ? <EmptyState /> :
          filtered.map(r => <ResultCard key={r.id} r={r} characters={allCharacters} onClick={() => goToBlock(r.id)} />)}
      </div>

      {/* Export Bar */}
      {filtered.length > 0 && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20,
          background: "rgba(17,21,29,0.94)", backdropFilter: "blur(8px)",
          borderTop: "1px solid var(--gold-line)",
          padding: "12px 28px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <SectionLabel latin="Exportare" zh="匯出" />
          <SwBtn icon="download" size="sm" onClick={exportMarkdown}>匯出 Markdown</SwBtn>
          <SwBtn icon="download" size="sm" onClick={exportCsv}>匯出 CSV</SwBtn>
          <SwBtn variant="gold" size="sm" icon="book" onClick={goToReader}>跳到閱讀模式 →</SwBtn>
        </div>
      )}
    </div>
  );
}

function ResultCard({ r, characters, onClick }) {
  const [hover, setHover] = React.useState(false);
  const ch = (characters || CHARACTERS).find(c => c.id === r.speakerId);
  const work = WORKS[0]; // simplified
  const charColor = CHAR_COLORS[r.speakerId] || "var(--gold-dim)";
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: "var(--navy-light)",
        border: "1px solid var(--navy-hover)",
        borderLeft: `3px solid ${hover ? "var(--gold)" : "var(--gold-dim)"}`,
        marginBottom: 12,
        overflow: "hidden", cursor: "pointer",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hover ? "var(--shadow-lift)" : "var(--shadow-card)",
        transition: "all 200ms",
      }}>
      {/* header row */}
      <div style={{
        padding: "10px 18px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--navy-line)",
        background: "var(--navy)",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-tc)", fontSize: 13,
          color: "var(--gold)", letterSpacing: "0.14em",
        }}>{work.title}</span>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 11.5, color: "var(--gold-deep)",
        }}>{work.titleEn}</span>
        <span style={{ width: 1, height: 14, background: "var(--navy-line)" }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--text-tertiary)", letterSpacing: "0.08em",
        }}>Akt 1 · Sz 3</span>
        <span style={{ marginLeft: "auto",
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-tertiary)", opacity: 0.7,
        }}>#{r.lineId}</span>
      </div>
      {/* body */}
      <div style={{ padding: "14px 18px 16px" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--text-tertiary)", letterSpacing: "0.08em",
          marginBottom: 8,
          display: "flex", gap: 6, alignItems: "center",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: charColor }} />
          <span>speaker:</span>
          <span style={{ color: "var(--gold-dim)" }}>{ch?.nameEn}</span>
          <span>·</span>
          <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--cream-dim)" }}>{ch?.name}</span>
        </div>
        {r.original && r.original.trim() && (
          <div style={{
            fontFamily: "var(--font-serif-en)", fontStyle: "italic",
            fontSize: 14.5, lineHeight: 1.7, color: "var(--cream)",
            marginBottom: 4,
          }}>「{r.original}」</div>
        )}
        {r.zh && r.zh.trim() && (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 13,
            lineHeight: 1.7, color: "var(--cream)", opacity: 0.85,
            marginBottom: 12, letterSpacing: "0.04em",
          }}>「{r.zh}」</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(r.tags || []).map(([t, k], i) => <Tag key={i} kind={k}>{t}</Tag>)}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 16, padding: "80px 20px",
      color: "var(--text-tertiary)", textAlign: "center",
    }}>
      <div style={{
        width: 60, height: 60,
        border: "1px solid var(--gold-line)", borderRadius: 2,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--gold-deep)",
      }}><SwIcon name="search" size={26} stroke={1.4} /></div>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
        fontSize: 11, letterSpacing: "0.34em", color: "var(--gold-deep)",
        textTransform: "uppercase",
      }}>Nullum Inventum</div>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 13.5,
        color: "var(--text-secondary)", letterSpacing: "0.06em",
      }}>輸入條件後點擊搜尋</div>
    </div>
  );
}

// ============= EDITOR VIEW =============
const BLOCK_META = {
  scene:     { ic: "curtain", color: "var(--success)",        label: "SCENE",     zh: "場次" },
  narration: { ic: "scroll",  color: "var(--text-secondary)", label: "NARRATION", zh: "旁白" },
  dialogue:  { ic: "bubble",  color: "var(--gold)",           label: "DIALOGUE",  zh: "對白" },
  choice:    { ic: "branch",  color: "#7B8EC9",               label: "CHOICE",    zh: "選項" },
  command:   { ic: "cog",     color: "var(--text-secondary)", label: "COMMAND",   zh: "指令" },
  note:      { ic: "note",    color: "var(--gold-dim)",       label: "NOTE",      zh: "編註" },
};

// ============= AVG PANEL (Phase 11) =============
const AVG_POSITIONS = [["left","左"], ["center","中"], ["right","右"]];

function AvgField({ label, en, value, onChange, placeholder }) {
  const [f, setF] = React.useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
        fontSize: 10, letterSpacing: "0.14em",
        color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 3,
      }}>{en} · {label}</div>
      <input value={value || ""} onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        placeholder={placeholder || ""}
        style={{
          width: "100%", background: "var(--navy-deep)",
          border: `1px solid ${f ? "var(--gold-line)" : "var(--navy-line)"}`,
          color: "var(--cream)", padding: "6px 8px",
          fontFamily: "var(--font-mono)", fontSize: 11.5,
          borderRadius: 2, outline: "none",
          transition: "border-color 160ms",
        }} />
    </div>
  );
}

function SpritePreview({ block, characters }) {
  const ch = characters.find(c => c.id === block?.speakerId);
  const avg = block?.avg || {};
  const posX = { left: "15%", center: "50%", right: "85%" }[avg.position || "center"];
  return (
    <div style={{
      width: "100%", aspectRatio: "16/9",
      background: "linear-gradient(180deg, #1a1e2a 0%, #0d1119 100%)",
      border: "1px solid var(--navy-line)",
      borderRadius: 2, position: "relative", overflow: "hidden",
      marginBottom: 12,
    }}>
      {/* BG label */}
      {avg.bg && (
        <div style={{
          position: "absolute", top: 6, left: 8,
          fontFamily: "var(--font-mono)", fontSize: 9.5,
          color: "var(--text-tertiary)", opacity: 0.7,
          letterSpacing: "0.06em",
        }}>BG: {avg.bg}</div>
      )}
      {/* sprite placeholder / imported image */}
      <div style={{
        position: "absolute", bottom: 0,
        left: posX, transform: "translateX(-50%)",
        width: avg.spriteData ? "auto" : 60, height: "75%",
        maxWidth: "80%",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-end",
      }}>
        {avg.spriteData ? (
          <img src={avg.spriteData} style={{
            maxHeight: "85%", maxWidth: "100%",
            objectFit: "contain", borderRadius: 2,
            marginBottom: 4,
          }} alt={avg.sprite || "sprite"} />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: CHAR_COLORS[block?.speakerId] || "var(--gold-dim)",
            border: "2px solid var(--navy-line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 6,
          }}>
            <span style={{
              fontFamily: "var(--font-serif-tc)", fontSize: 14,
              color: "var(--navy-deep)", fontWeight: 700,
            }}>{ch?.name?.[0] || "?"}</span>
          </div>
        )}
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--gold-dim)", letterSpacing: "0.04em",
          textAlign: "center", lineHeight: 1.3,
          whiteSpace: "nowrap",
        }}>{avg.sprite || "no sprite"}</div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 8,
          color: "var(--text-tertiary)", opacity: 0.6,
          marginTop: 2,
        }}>{avg.position || "center"}</div>
      </div>
      {/* BGM / SFX indicators */}
      <div style={{
        position: "absolute", bottom: 6, right: 8,
        display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end",
      }}>
        {avg.bgm && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8.5,
            color: "var(--gold-dim)", opacity: 0.8,
            display: "flex", alignItems: "center", gap: 3,
          }}><SwIcon name="music" size={9} />{avg.bgm}</span>
        )}
        {avg.sfx && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8.5,
            color: "var(--text-tertiary)", opacity: 0.7,
            display: "flex", alignItems: "center", gap: 3,
          }}><SwIcon name="speaker" size={9} />{avg.sfx}</span>
        )}
      </div>
      {/* 16:9 label */}
      <div style={{
        position: "absolute", bottom: 6, left: 8,
        fontFamily: "var(--font-mono)", fontSize: 8,
        color: "var(--text-tertiary)", opacity: 0.4,
      }}>16 : 9</div>
    </div>
  );
}

function AvgPanel({ block, onUpdate }) {
  const avg = block?.avg || {};
  const update = (key, val) => onUpdate({ avg: { ...avg, [key]: val } });
  const spriteFileRef = React.useRef(null);
  const handleSpriteFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(`檔案格式不支援（${file.type || "未知"}）。\n請選擇圖片檔（PNG、JPG、WebP 等）。`);
      return;
    }
    const MAX_SPRITE_SIZE = 512 * 1024; // 512 KB
    if (file.size > MAX_SPRITE_SIZE) {
      alert(`立繪檔案過大（${(file.size / 1024).toFixed(0)} KB）。\n上限為 512 KB，請壓縮後再匯入。`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onUpdate({ avg: { ...avg, spriteData: ev.target.result, sprite: avg.sprite || file.name.replace(/\.[^.]+$/, '') } });
    };
    reader.readAsDataURL(file);
  };
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 10, letterSpacing: "0.14em",
          color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 3,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>Sprite · 立繪</span>
          <button onClick={() => spriteFileRef.current?.click()} style={{
            background: "transparent", border: "1px solid var(--navy-line)",
            color: "var(--gold-dim)", padding: "2px 8px",
            fontFamily: "var(--font-serif-en)", fontSize: 9,
            letterSpacing: "0.1em", cursor: "pointer", borderRadius: 2,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <SwIcon name="image" size={10} /> Import
          </button>
          <input ref={spriteFileRef} type="file" accept="image/*" onChange={handleSpriteFile}
            style={{ display: "none" }} />
        </div>
        <input value={avg.sprite || ""} onChange={e => update("sprite", e.target.value)}
          placeholder="sprite_id"
          style={{
            width: "100%", background: "var(--navy-deep)",
            border: "1px solid var(--navy-line)",
            color: "var(--cream)", padding: "6px 8px",
            fontFamily: "var(--font-mono)", fontSize: 11.5,
            borderRadius: 2, outline: "none",
            transition: "border-color 160ms",
          }} />
        {avg.spriteData && (
          <div style={{
            marginTop: 6, padding: "4px 8px",
            border: "1px solid var(--navy-line)", borderRadius: 2,
            background: "var(--navy-deep)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <img src={avg.spriteData} style={{ height: 36, borderRadius: 2 }} alt="sprite" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-tertiary)" }}>已匯入</span>
            <button onClick={() => onUpdate({ avg: { ...avg, spriteData: null } })}
              style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", display: "flex" }}>
              <SwIcon name="close" size={10} />
            </button>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 10, letterSpacing: "0.14em",
          color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 3,
        }}>Position · 位置</div>
        <div style={{ display: "flex", gap: 4 }}>
          {AVG_POSITIONS.map(([v, l]) => (
            <button key={v} onClick={() => update("position", v)}
              style={{
                flex: 1, padding: "5px 0",
                background: avg.position === v ? "var(--gold-glow)" : "var(--navy-deep)",
                border: `1px solid ${avg.position === v ? "var(--gold-line)" : "var(--navy-line)"}`,
                color: avg.position === v ? "var(--gold-bright)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)", fontSize: 10.5,
                cursor: "pointer", borderRadius: 2, transition: "all 140ms",
              }}>{l}</button>
          ))}
        </div>
      </div>
      <AvgField label="背景" en="Background" value={avg.bg} onChange={v => update("bg", v)} placeholder="bg_id" />
      <AvgField label="BGM" en="Music" value={avg.bgm} onChange={v => update("bgm", v)} placeholder="bgm_id" />
      <AvgField label="音效" en="SFX" value={avg.sfx} onChange={v => update("sfx", v)} placeholder="sfx_id" />
    </>
  );
}

function JsonPreview({ block }) {
  const json = React.useMemo(() => {
    if (!block) return "// select a dialogue block";
    const out = { ...block };
    delete out.id;
    return JSON.stringify(out, null, 2);
  }, [block]);
  return (
    <pre style={{
      margin: 0, padding: "10px 12px",
      background: "var(--navy-deep)",
      border: "1px solid var(--navy-line)",
      borderRadius: 2,
      fontFamily: "var(--font-mono)", fontSize: 10.5,
      color: "var(--cream-dim)", lineHeight: 1.6,
      letterSpacing: "0.02em",
      overflowX: "auto", overflowY: "auto",
      maxHeight: 260, whiteSpace: "pre-wrap", wordBreak: "break-all",
    }}>{json}</pre>
  );
}

// ============= TABLE FORGE =============
function TableForge({ blocks, onUpdateBlock, onClose }) {
  const [filterChar, setFilterChar] = React.useState("");
  const [filterText, setFilterText] = React.useState("");
  const [editCell, setEditCell] = React.useState(null); // { id, field }
  const [editValue, setEditValue] = React.useState("");
  const [dirty, setDirty] = React.useState(new Set());

  const dialogues = blocks.filter(b => b.type === "dialogue");
  const filtered = dialogues.filter(b => {
    if (filterChar && b.speakerId !== filterChar) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      if (!((b.original || "").toLowerCase().includes(q) || (b.zh || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const startEdit = (id, field, val) => {
    setEditCell({ id, field });
    setEditValue(val || "");
  };
  const commitEdit = () => {
    if (!editCell) return;
    onUpdateBlock(editCell.id, { [editCell.field]: editValue });
    setDirty(prev => new Set([...prev, editCell.id]));
    setEditCell(null);
  };

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      background: "var(--navy-deep)",
      display: "flex", flexDirection: "column",
      animation: "swFade 150ms ease",
    }}>
      {/* Toolbar */}
      <div style={{
        padding: "12px 20px",
        borderBottom: "1px solid var(--navy-line)",
        background: "var(--navy)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <SectionLabel latin="Table Forge" zh="表格鍛造" accent="gold" />
        <SwSelect value={filterChar} onChange={setFilterChar}
          options={[["", "全部角色"], ...CHARACTERS.map(c => [c.id, c.name])]} />
        <SwInput placeholder="文字搜尋…" value={filterText} onChange={setFilterText} icon="search" />
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: dirty.size > 0 ? "var(--gold)" : "var(--text-tertiary)",
          letterSpacing: "0.06em",
        }}>{dirty.size > 0 ? `${dirty.size} 筆已修改` : `${filtered.length} / ${dialogues.length} rows`}</span>
        <SwBtn variant="gold" size="sm" icon="close" onClick={onClose}>關閉 Forge</SwBtn>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 12px 20px" }}>
        <table style={{
          width: "100%", borderCollapse: "collapse", marginTop: 8,
          fontFamily: "var(--font-body)", fontSize: 12.5,
        }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--navy)" }}>
              {["#", "角色", "原文", "中譯", "Tags"].map(h => (
                <th key={h} style={{
                  padding: "10px 8px", textAlign: "left",
                  fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
                  fontSize: 10.5, letterSpacing: "0.16em",
                  color: "var(--gold-dim)", textTransform: "uppercase",
                  borderBottom: "1px solid var(--gold-line)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const ch = CHARACTERS.find(c => c.id === b.speakerId);
              const isDirty = dirty.has(b.id);
              return (
                <tr key={b.id} style={{
                  borderBottom: "1px solid var(--navy-line)",
                  background: isDirty ? "rgba(201,168,106,0.04)" : "transparent",
                }}>
                  <td style={{
                    padding: "8px 8px", fontFamily: "var(--font-mono)",
                    fontSize: 10, color: "var(--text-tertiary)", width: 40,
                  }}>{b.lineId || b.id}</td>
                  <td style={{ padding: "8px", width: 110 }}
                    onDoubleClick={() => startEdit(b.id, "speakerId", b.speakerId)}>
                    {editCell?.id === b.id && editCell?.field === "speakerId" ? (
                      <select value={editValue} onChange={e => { setEditValue(e.target.value); }}
                        onBlur={commitEdit}
                        autoFocus style={{
                          width: "100%", background: "var(--navy-light)",
                          border: "1px solid var(--gold-line)", color: "var(--cream)",
                          padding: "4px 6px", fontFamily: "var(--font-body)", fontSize: 12,
                          borderRadius: 2, outline: "none",
                        }}>
                        {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5, cursor: "text",
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: CHAR_COLORS[b.speakerId] || "var(--gold-dim)",
                        }} />
                        <span style={{
                          fontFamily: "var(--font-serif-tc)", fontSize: 12,
                          color: "var(--cream-dim)", letterSpacing: "0.04em",
                        }}>{ch?.name || b.speakerId}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px", minWidth: 180 }}
                    onDoubleClick={() => startEdit(b.id, "original", b.original)}>
                    {editCell?.id === b.id && editCell?.field === "original" ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()}
                        autoFocus style={{
                          width: "100%", background: "var(--navy-light)",
                          border: "1px solid var(--gold-line)", color: "var(--cream)",
                          padding: "4px 6px", fontFamily: "var(--font-serif-en)",
                          fontStyle: "italic", fontSize: 13,
                          borderRadius: 2, outline: "none",
                        }} />
                    ) : (
                      <span style={{
                        fontFamily: "var(--font-serif-en)", fontStyle: "italic",
                        fontSize: 13, color: "var(--cream)", cursor: "text",
                        lineHeight: 1.5,
                      }}>{b.original || "—"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px", minWidth: 160 }}
                    onDoubleClick={() => startEdit(b.id, "zh", b.zh)}>
                    {editCell?.id === b.id && editCell?.field === "zh" ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()}
                        autoFocus style={{
                          width: "100%", background: "var(--navy-light)",
                          border: "1px solid var(--gold-line)", color: "var(--cream)",
                          padding: "4px 6px", fontFamily: "var(--font-body)", fontSize: 12.5,
                          borderRadius: 2, outline: "none",
                        }} />
                    ) : (
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: 12.5,
                        color: "var(--cream)", opacity: 0.85, cursor: "text",
                        letterSpacing: "0.04em", lineHeight: 1.5,
                      }}>{b.zh || "—"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(b.tags || []).slice(0, 3).map(([t, k], i) => (
                        <Tag key={i} kind={k} dim>{t}</Tag>
                      ))}
                      {(b.tags || []).length > 3 && (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9.5,
                          color: "var(--text-tertiary)",
                        }}>+{b.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            fontFamily: "var(--font-body)", fontSize: 13,
            color: "var(--text-tertiary)", letterSpacing: "0.06em",
          }}>無符合條件的對白行</div>
        )}
      </div>
    </div>
  );
}

// ============= RELATIONSHIP GRAPH (Phase 12-C) =============
function parseRelationshipEdges(characters) {
  // Build lookup: name fragments → character ID (sorted by length desc for greedy matching)
  const namePairs = [];
  characters.forEach(c => {
    const cleaned = c.name.replace(/（.*）/, "").trim();
    const parts = cleaned.split("·").map(p => p.trim()).filter(Boolean);
    // Add each name part (e.g. "弗里德里希", "馮", "泰拉���德")
    parts.forEach(p => { if (p.length >= 2) namePairs.push([p, c.id]); });
    // English name first word
    const enFirst = (c.nameEn || "").split(/[\s·]/)[0];
    if (enFirst && enFirst.length >= 3) namePairs.push([enFirst.toLowerCase(), c.id]);
  });
  // Sort by key length descending → longest match wins
  namePairs.sort((a, b) => b[0].length - a[0].length);

  const edges = [];
  const seen = new Set(); // avoid duplicates

  characters.forEach(c => {
    const rels = (c.relations || "").split("、").filter(Boolean);
    rels.forEach(tag => {
      // Try to find a referenced character in this tag (longest match first)
      let targetId = null;
      for (const [name, id] of namePairs) {
        if (id !== c.id && tag.includes(name)) {
          targetId = id;
          break;
        }
      }
      if (targetId) {
        const key = [c.id, targetId].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ from: c.id, to: targetId, label: tag });
        }
      }
    });
  });
  return edges;
}

function RelationshipGraph({ onClose }) {
  const canvasRef = React.useRef(null);
  const [nodes, setNodes] = React.useState([]);
  const [edges, setEdges] = React.useState([]);
  const [hoveredNode, setHoveredNode] = React.useState(null);
  const [selectedNode, setSelectedNode] = React.useState(null);
  const [dragging, setDragging] = React.useState(null);
  const [dim, setDim] = React.useState({ w: 800, h: 600 });
  const animRef = React.useRef(null);
  const nodesRef = React.useRef([]);

  // Initialize graph
  React.useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (container) {
      setDim({ w: container.clientWidth, h: container.clientHeight });
    }

    const cx = (container?.clientWidth || 800) / 2;
    const cy = (container?.clientHeight || 600) / 2;
    const radius = Math.min(cx, cy) * 0.55;

    // Create nodes in a circle
    const initNodes = CHARACTERS.map((c, i) => {
      const angle = (2 * Math.PI * i) / CHARACTERS.length - Math.PI / 2;
      return {
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        voice: c.voice,
        role: c.role,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0, vy: 0,
        color: CHAR_COLORS[c.id] || "var(--gold)",
      };
    });

    const parsedEdges = parseRelationshipEdges(CHARACTERS);
    nodesRef.current = initNodes;
    setNodes(initNodes);
    setEdges(parsedEdges);

    // Run force simulation
    let frame = 0;
    const MAX_FRAMES = 200;
    const simulate = () => {
      const ns = nodesRef.current;
      const W = container?.clientWidth || 800;
      const H = container?.clientHeight || 600;
      const centerX = W / 2, centerY = H / 2;

      ns.forEach(n => { n.fx = 0; n.fy = 0; });

      // Repulsion between all nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          let dx = ns[j].x - ns[i].x;
          let dy = ns[j].y - ns[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const repulse = 18000 / (dist * dist);
          const fx = (dx / dist) * repulse;
          const fy = (dy / dist) * repulse;
          ns[i].fx -= fx; ns[i].fy -= fy;
          ns[j].fx += fx; ns[j].fy += fy;
        }
      }

      // Attraction along edges
      parsedEdges.forEach(e => {
        const a = ns.find(n => n.id === e.from);
        const b = ns.find(n => n.id === e.to);
        if (!a || !b) return;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const attract = (dist - 160) * 0.04;
        const fx = (dx / dist) * attract;
        const fy = (dy / dist) * attract;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      });

      // Center gravity
      ns.forEach(n => {
        n.fx += (centerX - n.x) * 0.005;
        n.fy += (centerY - n.y) * 0.005;
      });

      // Apply velocity with damping
      const damping = 0.88;
      ns.forEach(n => {
        if (n.pinned) return;
        n.vx = (n.vx + n.fx) * damping;
        n.vy = (n.vy + n.fy) * damping;
        n.x += n.vx;
        n.y += n.vy;
        // Boundary
        n.x = Math.max(40, Math.min(W - 40, n.x));
        n.y = Math.max(40, Math.min(H - 40, n.y));
      });

      frame++;
      setNodes([...ns]);
      if (frame < MAX_FRAMES) {
        animRef.current = requestAnimationFrame(simulate);
      } else {
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, []);

  // Drag handlers
  const handleMouseDown = (e, nodeId) => {
    e.preventDefault();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      node.pinned = true;
      setDragging(nodeId);
      setSelectedNode(nodeId);
    }
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const svg = canvasRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = nodesRef.current.find(n => n.id === dragging);
    if (node) {
      node.x = x; node.y = y;
      node.vx = 0; node.vy = 0;
      setNodes([...nodesRef.current]);
    }
  };

  const handleMouseUp = () => {
    if (dragging) {
      const node = nodesRef.current.find(n => n.id === dragging);
      if (node) node.pinned = false;
      setDragging(null);
    }
  };

  const isConnected = (nodeId) => {
    if (!selectedNode) return true;
    if (nodeId === selectedNode) return true;
    return edges.some(e =>
      (e.from === selectedNode && e.to === nodeId) ||
      (e.to === selectedNode && e.from === nodeId)
    );
  };

  const isEdgeHighlighted = (edge) => {
    if (!selectedNode) return true;
    return edge.from === selectedNode || edge.to === selectedNode;
  };

  const hoveredChar = hoveredNode ? CHARACTERS.find(c => c.id === hoveredNode) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(13,17,25,0.96)", backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column",
      animation: "swFade 150ms ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px",
        borderBottom: "1px solid var(--navy-line)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <SwIcon name="network" size={16} />
        <span style={{
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 14, letterSpacing: "0.16em", color: "var(--gold-bright)",
          textTransform: "uppercase",
        }}>Nexus Personarum</span>
        <span style={{
          fontFamily: "var(--font-serif-tc)", fontSize: 12,
          color: "var(--text-secondary)", letterSpacing: "0.06em",
        }}>角色關係圖</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--text-tertiary)", letterSpacing: "0.04em",
        }}>{CHARACTERS.length} nodes · {edges.length} edges</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 11,
          color: "var(--text-tertiary)", letterSpacing: "0.04em",
        }}>拖曳移動 · 點擊聚焦 · 再點擊取消</span>
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      {/* Graph */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <svg ref={canvasRef} width="100%" height="100%"
          style={{ display: "block", cursor: dragging ? "grabbing" : "default" }}
          onClick={() => { if (!dragging) setSelectedNode(null); }}>

          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodes.find(n => n.id === e.from);
            const b = nodes.find(n => n.id === e.to);
            if (!a || !b) return null;
            const highlighted = isEdgeHighlighted(e);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={i} opacity={highlighted ? 1 : 0.15}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={highlighted ? "var(--gold-dim)" : "var(--navy-line)"}
                  strokeWidth={highlighted ? 1.5 : 1}
                  strokeDasharray={highlighted ? undefined : "4 3"}
                />
                <text x={mx} y={my - 6}
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-body)", fontSize: 10,
                    fill: highlighted ? "var(--cream-dim)" : "var(--text-tertiary)",
                    letterSpacing: "0.04em",
                    pointerEvents: "none",
                  }}>{e.label}</text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const connected = isConnected(n.id);
            const isHover = hoveredNode === n.id;
            const isSelected = selectedNode === n.id;
            const r = isSelected ? 26 : (isHover ? 24 : 20);
            return (
              <g key={n.id}
                opacity={connected ? 1 : 0.25}
                style={{ cursor: "grab", transition: "opacity 200ms" }}
                onMouseDown={(e) => handleMouseDown(e, n.id)}
                onMouseEnter={() => setHoveredNode(n.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(prev => prev === n.id ? null : n.id);
                }}>
                {/* Glow */}
                {(isSelected || isHover) && (
                  <circle cx={n.x} cy={n.y} r={r + 6}
                    fill="none" stroke={n.color} strokeWidth={1}
                    opacity={0.3} />
                )}
                {/* Node circle */}
                <circle cx={n.x} cy={n.y} r={r}
                  fill={n.color} fillOpacity={0.18}
                  stroke={n.color}
                  strokeWidth={isSelected ? 2.5 : (isHover ? 2 : 1.5)} />
                {/* Character name */}
                <text x={n.x} y={n.y + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  style={{
                    fontFamily: "var(--font-serif-tc)", fontSize: 12,
                    fill: connected ? "var(--cream)" : "var(--text-tertiary)",
                    letterSpacing: "0.06em",
                    pointerEvents: "none",
                    fontWeight: isSelected ? "bold" : "normal",
                  }}>{n.name.replace(/（.*）/, "").split("·")[0].trim()}</text>
                {/* Voice type below */}
                <text x={n.x} y={n.y + r + 14}
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-serif-en)", fontStyle: "italic",
                    fontSize: 9.5, fill: "var(--text-tertiary)",
                    letterSpacing: "0.06em",
                    pointerEvents: "none",
                  }}>{n.voice}</text>
              </g>
            );
          })}
        </svg>

        {/* Hover info panel */}
        {hoveredChar && (
          <div style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(17,21,29,0.92)", backdropFilter: "blur(6px)",
            border: "1px solid var(--navy-line)", borderRadius: 3,
            padding: "14px 18px", maxWidth: 280,
            pointerEvents: "none",
            animation: "swFade 100ms ease",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: CHAR_COLORS[hoveredChar.id],
              }} />
              <span style={{
                fontFamily: "var(--font-serif-tc)", fontSize: 14,
                color: "var(--cream)", letterSpacing: "0.06em",
              }}>{hoveredChar.name}</span>
              <span style={{
                fontFamily: "var(--font-serif-en)", fontStyle: "italic",
                fontSize: 11, color: "var(--text-tertiary)",
              }}>{hoveredChar.nameEn}</span>
            </div>
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 11.5,
              color: "var(--text-secondary)", lineHeight: 1.6,
              letterSpacing: "0.04em",
            }}>
              <div><span style={{ color: "var(--gold-dim)" }}>聲部</span> {hoveredChar.voice}</div>
              <div><span style={{ color: "var(--gold-dim)" }}>身份</span> {hoveredChar.role}</div>
              <div><span style={{ color: "var(--gold-dim)" }}>關係</span> {hoveredChar.relations}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============= SOUND PANEL (Phase 12-D) — TsukiSynth Bridge =============
const SOUND_LIBRARY_PATH = `${DATA_BASE}/sounds/library.json`;

// Zero-Rhyme interface contract (future AI integration pipeline)
const ZeroRhyme = {
  // MVP: keyword-based library search
  searchLibrary: (query, library) => {
    const keywords = query.toLowerCase().split(/[，、,\s]+/).filter(Boolean);
    const moodMap = { "溫和": "calm", "平靜": "calm", "溫柔": "calm", "療癒": "calm",
      "神秘": "mystical", "神聖": "sacred", "莊嚴": "sacred",
      "緊張": "tense", "不祥": "ominous", "暗黑": "ominous", "黑暗": "ominous",
      "活潑": "playful", "可愛": "playful", "歡快": "playful",
      "壯闊": "epic", "史詩": "epic",
      "憂鬱": "melancholic", "感傷": "melancholic",
      "壓迫": "oppressive", "激烈": "aggressive" };
    const worldMap = { "圖書館": "akashic", "阿卡西": "akashic", "書庫": "akashic",
      "兔": "rabbit", "兔兔": "rabbit",
      "森林": "forest", "自然": "forest", "木": "forest",
      "海洋": "ocean", "水": "ocean", "深海": "ocean",
      "齒輪": "clockwork", "機械": "clockwork", "蒸氣": "clockwork",
      "拘束": "restraint", "鐵": "restraint", "鎖鏈": "restraint" };
    let mood = null, world = null;
    const remainKw = [];
    for (const kw of keywords) {
      let matched = false;
      for (const [zh, en] of Object.entries(moodMap)) { if (kw.includes(zh)) { mood = en; matched = true; break; } }
      if (!matched) { for (const [zh, en] of Object.entries(worldMap)) { if (kw.includes(zh)) { world = en; matched = true; break; } } }
      if (!matched) remainKw.push(kw);
    }
    return library.filter(s => {
      if (mood && s.mood !== mood) return false;
      if (world && s.world !== world) return false;
      if (remainKw.length === 0) return true; // mood/world filter alone is enough
      const hay = [s.name, s.name_zh, ...(s.tags || []), s.mood, s.world, ...(s.character || [])].join(" ").toLowerCase();
      return remainKw.some(kw => hay.includes(kw));
    });
  },
  // Future: AI generates score.json → returns TsukiSynth Score v1 object
  generateScore: async (prompt) => { console.log("[ZeroRhyme] generateScore:", prompt); return null; },
  // Future: renders score.json to WAV via tsukisynth-cli or microservice
  renderScore: async (scoreJson) => { console.log("[ZeroRhyme] renderScore:", scoreJson?.meta?.id); return null; },

  // ── Phase 12-E: Script Format Check (劇本顧問) ──
  checkScript: (blocks, characters, tagDict) => {
    const issues = []; // { severity: "error"|"warning"|"info", blockId, blockIndex, message, rule }
    const charIds = characters.map(c => c.id);
    const validPlotTags = tagDict?.plot_tags || [];
    const validEmotionTags = tagDict?.emotion_tags || [];
    const validFormTags = tagDict?.form_tags || [];
    const allValidTags = [...validPlotTags, ...validEmotionTags, ...(tagDict?.character_tags||[]), ...(tagDict?.theme_tags||[]), ...validFormTags];

    const blockIdSet = new Set(blocks.map(b => b.id));

    blocks.forEach((b, i) => {
      const loc = { blockId: b.id, blockIndex: i };

      // ── Structural (error) ──
      if (b.type === "dialogue") {
        // v2-fix4: isUnknown 表示 user-authored 未綁定角色 → 降為 info，不算 error
        if (b.isUnknown) {
          issues.push({ ...loc, severity: "info", message: `新角色「${b.speaker || "?"}」尚未綁定角色表`, rule: "new-speaker" });
        } else {
          if (!b.speakerId) issues.push({ ...loc, severity: "error", message: "對白缺少角色（speakerId）", rule: "no-speaker" });
        }
        if (!b.original && !b.zh) issues.push({ ...loc, severity: "error", message: "對白內容為空（原文與中譯皆無）", rule: "empty-dialogue" });
        if (!b.isUnknown && b.speakerId && charIds.length > 0 && !charIds.includes(b.speakerId))
          issues.push({ ...loc, severity: "error", message: `角色「${b.speakerId}��不在角色表中`, rule: "unknown-speaker" });
      }
      if (b.type === "scene" && !b.act && !b.scene)
        issues.push({ ...loc, severity: "error", message: "場次缺少幕場標記（act / scene）", rule: "no-act" });
      if (b.type === "choice") {
        if (!b.options || b.options.length === 0)
          issues.push({ ...loc, severity: "error", message: "選項 block 缺少選項", rule: "no-options" });
        else b.options.forEach((opt, oi) => {
          if (!opt.text) issues.push({ ...loc, severity: "error", message: `選項 ${oi+1} 文字為空`, rule: "empty-option" });
        });
      }

      // ── Quality (warning) ──
      if (b.type === "dialogue") {
        if (b.original && !b.zh)
          issues.push({ ...loc, severity: "warning", message: "有原文但缺少中譯", rule: "missing-zh" });
        if (b.zh && !b.original)
          issues.push({ ...loc, severity: "warning", message: "有中譯但缺少原文", rule: "missing-original" });
        if (!b.tags || b.tags.length === 0)
          issues.push({ ...loc, severity: "warning", message: "對白缺少 TAG 標記", rule: "no-tags" });
        if ((b.original && b.original.length < 3) || (b.zh && b.zh.length < 2 && !b.original))
          issues.push({ ...loc, severity: "warning", message: "對白文字過短（< 3 字元）", rule: "short-text" });
        // Consecutive same speaker
        if (i > 0 && blocks[i-1].type === "dialogue" && blocks[i-1].speakerId === b.speakerId)
          issues.push({ ...loc, severity: "info", message: "與前一句角色相同（可能可合併）", rule: "consecutive-speaker" });
      }
      if (b.type === "choice") {
        b.options?.forEach((opt, oi) => {
          if (!opt.nextBlockId)
            issues.push({ ...loc, severity: "warning", message: `選項 ${oi+1}「${(opt.text||"").substring(0,10)}」缺少跳轉目標`, rule: "no-next" });
          else if (!blockIdSet.has(opt.nextBlockId))
            issues.push({ ...loc, severity: "warning", message: `選項 ${oi+1} 跳轉目標「${opt.nextBlockId}」不存在`, rule: "broken-link" });
        });
      }

      // ── TAG consistency (info) ──
      if (b.tags && Array.isArray(b.tags)) {
        b.tags.forEach(tag => {
          if (Array.isArray(tag) && tag.length === 2) {
            const [text, kind] = tag;
            if (kind === "plot" && validPlotTags.length > 0 && !validPlotTags.includes(text))
              issues.push({ ...loc, severity: "info", message: `劇情 TAG「${text}」不在字典中`, rule: "unknown-plot-tag" });
            if (kind === "emotion" && validEmotionTags.length > 0 && !validEmotionTags.includes(text))
              issues.push({ ...loc, severity: "info", message: `情緒 TAG「${text}」不在字典中`, rule: "unknown-emotion-tag" });
          }
        });
      }

      // ── AVG consistency (info) ──
      if (b.type === "dialogue" && b.avg) {
        if (b.avg.sprite && !b.avg.position)
          issues.push({ ...loc, severity: "info", message: "有立繪但未指定位置", rule: "sprite-no-pos" });
      }
    });

    // ── Flow analysis ──
    const sceneIndices = blocks.map((b,i) => b.type === "scene" ? i : -1).filter(i => i >= 0);
    sceneIndices.forEach((si, idx) => {
      const nextBoundary = idx < sceneIndices.length - 1 ? sceneIndices[idx+1] : blocks.length;
      const hasDialogue = blocks.slice(si+1, nextBoundary).some(b => b.type === "dialogue");
      if (!hasDialogue)
        issues.push({ blockId: blocks[si].id, blockIndex: si, severity: "info", message: "場次後無對白（空場景）", rule: "empty-scene" });
    });

    return issues;
  },
};

// ============= DRAFT GENERATOR (Phase 12-F) — 零韻初稿生成 =============
let _draftSeq = 0;
function draftId(suffix) { return `draft_${Date.now()}_${_draftSeq++}_${suffix}`; }
const DRAFT_TEMPLATES = {
  opening: { label: "開場", labelEn: "Opening", desc: "旁白引導 → 場次宣告 → 首句對白",
    generate: (chars, act, scene, mood) => {
      const blocks = [];
      blocks.push({ id: draftId("nar"), type: "narration", text: `【${mood || ""}開場敘述——請填入場景描寫】` });
      blocks.push({ id: draftId("sc"), type: "scene", act: `Akt ${act || "1"} · Sz ${scene || "1"}`, subtitle: "【場次標題】", note: "" });
      const c = chars[0];
      if (c) blocks.push({ id: draftId("d1"), type: "dialogue", speakerId: c.id, original: "", zh: "【首句台詞】", tags: mood ? [[mood, "emotion"]] : [] });
      return blocks;
    }},
  confrontation: { label: "對峙", labelEn: "Confrontation", desc: "兩角色衝突對話（4-6 句交替）",
    generate: (chars, act, scene, mood) => {
      if (chars.length < 2) return [{ id: draftId("err"), type: "note", text: "⚠️ 對峙模板需要至少選擇兩位角色" }];
      const blocks = [];
      const [a, b] = [chars[0], chars[1]];
      const turns = [a, b, a, b, a, b];
      turns.forEach((c, i) => {
        if (c) blocks.push({ id: draftId(`d${i}`), type: "dialogue", speakerId: c.id, original: "", zh: `【第 ${i+1} 句——${(c.name_zh || c.name || c.id).split("·")[0]}】`, tags: mood ? [[mood, "emotion"]] : [] });
      });
      return blocks;
    }},
  monologue: { label: "獨白", labelEn: "Monologue", desc: "單一角色內心獨白（3 段）",
    generate: (chars, act, scene, mood) => {
      const c = chars[0];
      if (!c) return [];
      return [0,1,2].map(i => ({ id: draftId(`m${i}`), type: "dialogue", speakerId: c.id, original: "", zh: `【獨白第 ${i+1} 段】`, tags: mood ? [[mood, "emotion"]] : (i === 2 ? [["獨白","form"]] : []) }));
    }},
  duet: { label: "二重唱", labelEn: "Love Duet", desc: "兩角色情感交匯（溫柔交替 + 合聲）",
    generate: (chars, act, scene, mood) => {
      if (chars.length < 2) return [{ id: draftId("err"), type: "note", text: "⚠️ 二重唱模板需要至少選擇兩位角色" }];
      const [a, b] = [chars[0], chars[1]];
      const blocks = [];
      if (a) blocks.push({ id: draftId("l1"), type: "dialogue", speakerId: a.id, original: "", zh: "【起唱——訴說心意】", tags: [["愛慕","emotion"]] });
      if (b) blocks.push({ id: draftId("l2"), type: "dialogue", speakerId: b.id, original: "", zh: "【回應——接受 / 猶豫】", tags: [["愛慕","emotion"]] });
      if (a) blocks.push({ id: draftId("l3"), type: "dialogue", speakerId: a.id, original: "", zh: "【再詠——加深情感】", tags: mood ? [[mood,"emotion"]] : [["溫柔","emotion"]] });
      if (b) blocks.push({ id: draftId("l4"), type: "dialogue", speakerId: b.id, original: "", zh: "【合聲——兩人同聲���", tags: [["二重唱","form"]] });
      return blocks;
    }},
  farewell: { label: "離別", labelEn: "Farewell", desc: "告別場景（感傷交代 + 離場旁白）",
    generate: (chars, act, scene, mood) => {
      const [a, b] = chars.length >= 2 ? [chars[0], chars[1]] : [chars[0], chars[0]];
      const blocks = [];
      if (a) blocks.push({ id: draftId("f1"), type: "dialogue", speakerId: a.id, original: "", zh: "【告別宣言——我必須離開】", tags: [["離別","plot"],["哀傷","emotion"]] });
      if (b) blocks.push({ id: draftId("f2"), type: "dialogue", speakerId: b.id, original: "", zh: "【挽��� / 接受】", tags: [["離別","plot"]] });
      if (a) blocks.push({ id: draftId("f3"), type: "dialogue", speakerId: a.id, original: "", zh: "【最後囑咐】", tags: mood ? [[mood,"emotion"]] : [["堅定","emotion"]] });
      blocks.push({ id: draftId("nar2"), type: "narration", text: "【離場描寫——角色退場動作】" });
      return blocks;
    }},
  trial: { label: "審判", labelEn: "Trial", desc: "正式審問場景（宣告 + 問答 + 裁決）",
    generate: (chars, act, scene, mood) => {
      const [judge, accused, witness] = chars.length >= 3 ? chars.slice(0,3) : [chars[0], chars[1] || chars[0], chars[0]];
      const blocks = [];
      blocks.push({ id: draftId("nar"), type: "narration", text: "【審��場景——莊嚴肅穆】" });
      if (judge) blocks.push({ id: draftId("t1"), type: "dialogue", speakerId: judge.id, original: "", zh: "【宣布開庭 / 提出指控】", tags: [["審判","plot"],["冷靜","emotion"]] });
      if (accused) blocks.push({ id: draftId("t2"), type: "dialogue", speakerId: accused.id, original: "", zh: "【被告回應——抗辯 / 沉默】", tags: [["審判","plot"]] });
      if (judge) blocks.push({ id: draftId("t3"), type: "dialogue", speakerId: judge.id, original: "", zh: "【追問 / 質疑】", tags: [["審判","plot"]] });
      if (accused) blocks.push({ id: draftId("t4"), type: "dialogue", speakerId: accused.id, original: "", zh: "【最終��述】", tags: mood ? [[mood,"emotion"]] : [["掙扎","emotion"]] });
      if (judge) blocks.push({ id: draftId("t5"), type: "dialogue", speakerId: judge.id, original: "", zh: "【宣判】", tags: [["審判","plot"],["崇高","emotion"]] });
      return blocks;
    }},
  choice_branch: { label: "分歧", labelEn: "Choice", desc: "選項分歧點（情境 + 選項 block）",
    generate: (chars, act, scene, mood) => {
      const c = chars[0];
      const blocks = [];
      if (c) blocks.push({ id: draftId("cb1"), type: "dialogue", speakerId: c.id, original: "", zh: "【面臨抉擇的台詞】", tags: [["迷惘","emotion"]] });
      blocks.push({ id: draftId("ch"), type: "choice", prompt: "【選擇提示文字】", options: [
        { text: "【選項 A】", nextBlockId: "" },
        { text: "【選項 B】", nextBlockId: "" },
        { text: "【選項 C】", nextBlockId: "" },
      ]});
      return blocks;
    }},
  freeform: { label: "自由", labelEn: "Freeform", desc: "依提示詞生成骨架（角色 × 句數）",
    generate: (chars, act, scene, mood, count) => {
      const n = count || 4;
      const blocks = [];
      for (let i = 0; i < n; i++) {
        const c = chars[i % chars.length];
        if (c) blocks.push({ id: draftId(`fr${i}`), type: "dialogue", speakerId: c.id, original: "", zh: `【第 ${i+1} 句】`, tags: mood ? [[mood,"emotion"]] : [] });
      }
      return blocks;
    }},
};

// Zero-Rhyme draft generation interface (future: AI replaces templates)
ZeroRhyme.generateDraft = (template, characters, options = {}) => {
  const tmpl = DRAFT_TEMPLATES[template];
  if (!tmpl) return [];
  const { act, scene, mood, count } = options;
  return tmpl.generate(characters, act, scene, mood, count);
};

function DraftGenerator({ onClose, onInsert, characters }) {
  const [template, setTemplate] = React.useState("opening");
  const [selectedChars, setSelectedChars] = React.useState([]);
  const [mood, setMood] = React.useState("");
  const [act, setAct] = React.useState("");
  const [scene, setScene] = React.useState("");
  const [count, setCount] = React.useState(4);
  const [preview, setPreview] = React.useState([]);
  const [freePrompt, setFreePrompt] = React.useState("");

  const MOODS = ["憤怒","哀傷","恐懼","狂喜","迷惘","愛慕","壓抑","冷靜","嘲諷","絕望","平靜","崇高","虔誠","溫柔","堅定","掙扎","敬畏"];

  const toggleChar = (charId) => {
    setSelectedChars(prev => prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]);
  };

  const doGenerate = () => {
    const chars = selectedChars.map(id => characters.find(c => c.id === id)).filter(Boolean);
    if (chars.length === 0 && characters.length > 0) chars.push(characters[0]);
    const blocks = ZeroRhyme.generateDraft(template, chars, { act, scene, mood, count });
    setPreview(blocks);
  };

  const doInsert = () => {
    if (preview.length > 0) {
      onInsert(preview);
      onClose();
    }
  };

  const tmpl = DRAFT_TEMPLATES[template];
  const selectStyle = {display:"block",width:"100%",marginTop:3,background:"var(--navy-deep)",border:"1px solid var(--navy-line)",color:"var(--cream)",padding:"6px 8px",fontFamily:"var(--font-body)",fontSize:12,borderRadius:2,outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(13,17,25,0.96)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="quill" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Scriptum Genesis</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>初稿生成</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>零韻 · Draft Engine</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Config */}
        <aside style={{width:280,minWidth:280,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
          {/* Template select */}
          <div>
            <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:10,letterSpacing:"0.14em",color:"var(--gold-dim)",textTransform:"uppercase",marginBottom:6}}>Template 模板</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {Object.entries(DRAFT_TEMPLATES).map(([key, t]) => (
                <div key={key} onClick={() => setTemplate(key)}
                  style={{padding:"8px 10px",borderRadius:3,cursor:"pointer",border:`1px solid ${template===key?"var(--gold-line)":"var(--navy-line)"}`,background:template===key?"rgba(201,168,106,0.08)":"transparent",transition:"all 120ms"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:template===key?"var(--gold-bright)":"var(--cream)"}}>{t.label}</span>
                    <span style={{fontFamily:"var(--font-serif-en)",fontStyle:"italic",fontSize:10,color:"var(--text-tertiary)"}}>{t.labelEn}</span>
                  </div>
                  <div style={{fontFamily:"var(--font-body)",fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center — Settings + Preview */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Settings row */}
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--navy-line)",display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            {/* Characters */}
            <div style={{flex:"1 1 200px"}}>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>角色（依序指派）</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {characters.map(c => (
                  <span key={c.id} onClick={() => toggleChar(c.id)}
                    style={{padding:"4px 8px",borderRadius:2,fontSize:11,fontFamily:"var(--font-serif-tc)",cursor:"pointer",
                      background: selectedChars.includes(c.id) ? (CHAR_COLORS[c.id]||"var(--gold)")+"22" : "transparent",
                      border: `1px solid ${selectedChars.includes(c.id) ? (CHAR_COLORS[c.id]||"var(--gold)") : "var(--navy-line)"}`,
                      color: selectedChars.includes(c.id) ? (CHAR_COLORS[c.id]||"var(--gold)") : "var(--text-tertiary)",
                    }}>
                    {selectedChars.indexOf(c.id) >= 0 && <span style={{marginRight:3,fontSize:9}}>#{selectedChars.indexOf(c.id)+1}</span>}
                    {(c.name_zh || c.name || c.id).split("·")[0]}
                  </span>
                ))}
              </div>
            </div>
            {/* Mood */}
            <div style={{width:120}}>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>情緒���調</div>
              <select value={mood} onChange={e => setMood(e.target.value)} style={selectStyle}>
                <option value="">（無）</option>
                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {/* Act/Scene */}
            <div style={{width:60}}>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>幕</div>
              <input value={act} onChange={e => setAct(e.target.value)} placeholder="1" style={{...selectStyle,padding:"6px 8px"}} />
            </div>
            <div style={{width:60}}>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>場</div>
              <input value={scene} onChange={e => setScene(e.target.value)} placeholder="1" style={{...selectStyle,padding:"6px 8px"}} />
            </div>
            {template === "freeform" && (
              <div style={{width:60}}>
                <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>句數</div>
                <input type="number" min={1} max={20} value={count} onChange={e => setCount(parseInt(e.target.value)||4)} style={{...selectStyle,padding:"6px 8px"}} />
              </div>
            )}
            {/* Generate button */}
            <SwBtn icon="quill" size="sm" variant="gold" onClick={doGenerate}>生成預覽</SwBtn>
          </div>

          {/* Preview area */}
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
            {preview.length === 0 ? (
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontFamily:"var(--font-serif-tc)",fontSize:15,color:"var(--text-tertiary)",marginBottom:8}}>選擇模板與角色，點擊「生成預覽」</div>
                <div style={{fontFamily:"var(--font-body)",fontSize:12,color:"var(--text-tertiary)",lineHeight:1.8,maxWidth:360,margin:"0 auto"}}>
                  零韻將根據模板結構生成劇本骨架，<br/>
                  包含正確的 block 結構、角色指派、TAG 標記。<br/>
                  生成後可預覽再插入編輯器。
                </div>
                <div style={{marginTop:20,padding:"12px 16px",background:"rgba(201,168,106,0.04)",border:"1px solid rgba(201,168,106,0.15)",borderRadius:3,display:"inline-block"}}>
                  <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:9,letterSpacing:"0.12em",color:"var(--gold-dim)",textTransform:"uppercase",marginBottom:4}}>Future: AI Generation</div>
                  <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-tertiary)"}}>
                    未來版本將串接 LLM，從自然語言提示詞直接生成完整台詞
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-tertiary)",marginBottom:12}}>
                  {preview.length} blocks 已生成 — 預覽
                </div>
                {preview.map((b, i) => (
                  <div key={i} style={{padding:"10px 14px",marginBottom:4,borderRadius:3,border:"1px solid var(--navy-line)",
                    borderLeft:`3px solid ${b.type==="dialogue"?"var(--gold)":b.type==="scene"?"#7b8ec9":b.type==="choice"?"#6aae7f":"var(--text-tertiary)"}`,
                    background:"rgba(255,255,255,0.015)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:9,padding:"2px 5px",borderRadius:2,background:"rgba(255,255,255,0.05)",color:"var(--text-tertiary)"}}>{b.type}</span>
                      {b.type === "dialogue" && (
                        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:11.5,color:CHAR_COLORS[b.speakerId]||"var(--cream)"}}>
                          {(c => (c?.name_zh || c?.name || b.speakerId).split("·")[0])(characters.find(c=>c.id===b.speakerId))}
                        </span>
                      )}
                      {b.type === "scene" && <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"#7b8ec9"}}>Act {b.act} · Scene {b.scene}</span>}
                      {b.tags && b.tags.length > 0 && (
                        <span style={{display:"flex",gap:3}}>
                          {b.tags.map((t,ti) => <span key={ti} style={{padding:"1px 5px",borderRadius:2,fontSize:9,fontFamily:"var(--font-mono)",background:t[1]==="emotion"?"rgba(224,92,108,0.12)":"rgba(123,142,201,0.12)",color:t[1]==="emotion"?"#e88a96":"#9aaad4"}}>{t[0]}</span>)}
                        </span>
                      )}
                    </div>
                    <div style={{marginTop:4,fontFamily:"var(--font-body)",fontSize:12,color:"var(--cream-dim)",letterSpacing:"0.02em"}}>
                      {b.type === "dialogue" ? (b.zh || b.original || "—") : b.type === "narration" ? b.text : b.type === "choice" ? `❖ ${b.prompt || ""} (${b.options?.length || 0} 選項)` : b.title || ""}
                    </div>
                  </div>
                ))}

                {/* Insert buttons */}
                <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"center"}}>
                  <SwBtn icon="quill" variant="gold" onClick={doInsert}>插入編輯器尾端</SwBtn>
                  <SwBtn icon="back" variant="ghost" onClick={() => setPreview([])}>清除預覽</SwBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= SCRIPT LINTER (Phase 12-E) — 零韻劇本顧問 =============
const TAG_DICT_PATH = `${DATA_BASE}/tags/tag_dictionary.json`;

function ScriptLinter({ blocks, characters, onClose, onGoToBlock }) {
  const [issues, setIssues] = React.useState([]);
  const [tagDict, setTagDict] = React.useState(null);
  const [filterSev, setFilterSev] = React.useState("all");
  const [filterRule, setFilterRule] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(TAG_DICT_PATH).then(r => r.json()).then(d => {
      setTagDict(d);
      const result = ZeroRhyme.checkScript(blocks, characters, d);
      setIssues(result);
      setLoading(false);
    }).catch(() => {
      const result = ZeroRhyme.checkScript(blocks, characters, null);
      setIssues(result);
      setLoading(false);
    });
  }, [blocks, characters]);

  const errorCount = issues.filter(i => i.severity === "error").length;
  const warnCount = issues.filter(i => i.severity === "warning").length;
  const infoCount = issues.filter(i => i.severity === "info").length;

  const filtered = issues.filter(i => {
    if (filterSev !== "all" && i.severity !== filterSev) return false;
    if (filterRule && i.rule !== filterRule) return false;
    return true;
  });

  const ruleGroups = [...new Set(issues.map(i => i.rule))].sort();

  const sevIcon = (sev) => sev === "error" ? "✕" : sev === "warning" ? "△" : "○";
  const sevColor = (sev) => sev === "error" ? "#e05c6c" : sev === "warning" ? "#c9a86a" : "var(--text-tertiary)";

  const handleClick = (issue) => {
    if (onGoToBlock && issue.blockId) {
      onGoToBlock(issue.blockId);
      onClose();
    }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(13,17,25,0.96)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="scroll" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Scriptum Examen</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>格式檢查</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>零韻 · 劇本顧問</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Summary + Filters */}
        <aside style={{width:240,minWidth:240,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
          {/* Summary cards */}
          <div style={{display:"flex",gap:8}}>
            <div onClick={() => setFilterSev(filterSev==="error"?"all":"error")} style={{flex:1,padding:"10px 8px",background:filterSev==="error"?"rgba(224,92,108,0.1)":"rgba(224,92,108,0.03)",border:`1px solid ${filterSev==="error"?"#e05c6c":"var(--navy-line)"}`,borderRadius:3,cursor:"pointer",textAlign:"center"}}>
              <div style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:700,color:"#e05c6c"}}>{errorCount}</div>
              <div style={{fontFamily:"var(--font-body)",fontSize:9.5,color:"var(--text-tertiary)",marginTop:2}}>錯誤</div>
            </div>
            <div onClick={() => setFilterSev(filterSev==="warning"?"all":"warning")} style={{flex:1,padding:"10px 8px",background:filterSev==="warning"?"rgba(201,168,106,0.1)":"rgba(201,168,106,0.03)",border:`1px solid ${filterSev==="warning"?"var(--gold-line)":"var(--navy-line)"}`,borderRadius:3,cursor:"pointer",textAlign:"center"}}>
              <div style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:700,color:"var(--gold)"}}>{warnCount}</div>
              <div style={{fontFamily:"var(--font-body)",fontSize:9.5,color:"var(--text-tertiary)",marginTop:2}}>警告</div>
            </div>
            <div onClick={() => setFilterSev(filterSev==="info"?"all":"info")} style={{flex:1,padding:"10px 8px",background:filterSev==="info"?"rgba(150,160,180,0.1)":"rgba(150,160,180,0.03)",border:`1px solid ${filterSev==="info"?"var(--text-tertiary)":"var(--navy-line)"}`,borderRadius:3,cursor:"pointer",textAlign:"center"}}>
              <div style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:700,color:"var(--text-secondary)"}}>{infoCount}</div>
              <div style={{fontFamily:"var(--font-body)",fontSize:9.5,color:"var(--text-tertiary)",marginTop:2}}>資訊</div>
            </div>
          </div>

          {/* Rule filter */}
          <div>
            <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:10,letterSpacing:"0.14em",color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:6}}>Filter by Rule</div>
            <select value={filterRule} onChange={e => setFilterRule(e.target.value)}
              style={{display:"block",width:"100%",background:"var(--navy-deep)",border:"1px solid var(--navy-line)",color:"var(--cream)",padding:"6px 8px",fontFamily:"var(--font-body)",fontSize:11,borderRadius:2,outline:"none"}}>
              <option value="">全部規則</option>
              {ruleGroups.map(r => <option key={r} value={r}>{r} ({issues.filter(i=>i.rule===r).length})</option>)}
            </select>
          </div>

          {/* Legend */}
          <div style={{padding:"10px 12px",background:"rgba(201,168,106,0.04)",border:"1px solid rgba(201,168,106,0.15)",borderRadius:3}}>
            <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:9.5,letterSpacing:"0.1em",color:"var(--gold-dim)",textTransform:"uppercase",marginBottom:6}}>Rule Categories</div>
            <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-tertiary)",lineHeight:1.8}}>
              <div><span style={{color:"#e05c6c"}}>✕ 錯誤</span> — 結構性問題，必須修正</div>
              <div><span style={{color:"var(--gold)"}}>△ 警告</span> — 品質建議，建議修正</div>
              <div><span style={{color:"var(--text-secondary)"}}>○ 資訊</span> — 一致性提示</div>
            </div>
          </div>

          {filterSev !== "all" || filterRule ? (
            <button onClick={() => {setFilterSev("all");setFilterRule("");}}
              style={{background:"transparent",border:"1px solid var(--navy-line)",color:"var(--text-tertiary)",padding:"5px 10px",fontFamily:"var(--font-body)",fontSize:11,cursor:"pointer",borderRadius:2,width:"100%"}}>清除篩選</button>
          ) : null}

          {/* Score */}
          <div style={{marginTop:"auto",padding:"10px 12px",background: errorCount === 0 ? "rgba(106,174,127,0.06)" : "rgba(224,92,108,0.04)",border:`1px solid ${errorCount===0?"rgba(106,174,127,0.2)":"rgba(224,92,108,0.15)"}`,borderRadius:3,textAlign:"center"}}>
            <div style={{fontFamily:"var(--font-serif-tc)",fontSize:13,color: errorCount === 0 ? "#6aae7f" : "#e05c6c"}}>
              {errorCount === 0 ? "結構完整 ✓" : `${errorCount} 項結構錯誤`}
            </div>
            <div style={{fontFamily:"var(--font-body)",fontSize:10,color:"var(--text-tertiary)",marginTop:4}}>
              {blocks.length} blocks 已檢查
            </div>
          </div>
        </aside>

        {/* Center — Issue list */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"10px 20px",borderBottom:"1px solid var(--navy-line)",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-tertiary)"}}>
            {filtered.length} / {issues.length} issues
            {filterSev !== "all" && <span style={{color:sevColor(filterSev),marginLeft:8}}>{filterSev}</span>}
            {filterRule && <span style={{color:"var(--gold-dim)",marginLeft:8}}>{filterRule}</span>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"12px 20px"}}>
            {loading ? <div style={{textAlign:"center",padding:40,color:"var(--text-tertiary)"}}>檢查中…</div>
            : filtered.length === 0 ? (
              <div style={{textAlign:"center",padding:60}}>
                <div style={{fontSize:32,marginBottom:12}}>✓</div>
                <div style={{fontFamily:"var(--font-serif-tc)",fontSize:15,color:"var(--gold-bright)"}}>零問題</div>
                <div style={{fontFamily:"var(--font-body)",fontSize:12,color:"var(--text-tertiary)",marginTop:6}}>
                  {issues.length === 0 ? "劇本結構完美，無任何問題" : "此篩選條件下無問題"}
                </div>
              </div>
            )
            : filtered.map((issue, idx) => (
              <div key={idx} onClick={() => handleClick(issue)}
                style={{padding:"10px 14px",marginBottom:4,background:"rgba(255,255,255,0.015)",border:"1px solid var(--navy-line)",borderLeft:`3px solid ${sevColor(issue.severity)}`,borderRadius:3,cursor:"pointer",transition:"background 140ms"}}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.015)"}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:13,color:sevColor(issue.severity),fontWeight:700,width:16,textAlign:"center"}}>{sevIcon(issue.severity)}</span>
                  <span style={{fontFamily:"var(--font-body)",fontSize:12.5,color:"var(--cream)",letterSpacing:"0.02em"}}>{issue.message}</span>
                  <span style={{flex:1}} />
                  <span style={{fontFamily:"var(--font-mono)",fontSize:9.5,color:"var(--text-tertiary)",background:"rgba(255,255,255,0.04)",padding:"2px 6px",borderRadius:2}}>{issue.rule}</span>
                </div>
                <div style={{marginTop:4,display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-tertiary)"}}>#{issue.blockIndex+1}</span>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--gold-dim)"}}>{issue.blockId?.substring(0,24)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SoundPanel({ onClose, onAssign, currentBlockBgm }) {
  const [library, setLibrary] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filterMood, setFilterMood] = React.useState("");
  const [filterWorld, setFilterWorld] = React.useState("");
  const [filterType, setFilterType] = React.useState("");
  const [searchText, setSearchText] = React.useState("");
  const [selectedSound, setSelectedSound] = React.useState(null);
  const [promptText, setPromptText] = React.useState("");
  const [promptResults, setPromptResults] = React.useState(null);

  React.useEffect(() => {
    fetch(SOUND_LIBRARY_PATH)
      .then(r => r.json())
      .then(data => { setLibrary(data.library || []); setLoading(false); })
      .catch(() => { setLibrary([]); setLoading(false); });
  }, []);

  const MOODS = ["sacred","mystical","tense","ominous","playful","calm","epic","melancholic","neutral","aggressive","oppressive"];
  const WORLDS = ["akashic","rabbit","restraint","forest","ocean","clockwork"];
  const TYPES = ["ambience","magic","ui","whoosh","impact","foley","mechanical"];
  const MOOD_ZH = {sacred:"神聖",mystical:"神秘",tense:"緊張",ominous:"不祥",playful:"活潑",calm:"平靜",epic:"壯闊",melancholic:"憂鬱",neutral:"中性",aggressive:"激烈",oppressive:"壓迫"};
  const WORLD_ZH = {akashic:"阿卡西",rabbit:"兔兔",restraint:"拘束",forest:"森林",ocean:"海洋",clockwork:"齒輪"};

  const filtered = (promptResults || library).filter(s => {
    if (filterMood && s.mood !== filterMood) return false;
    if (filterWorld && s.world !== filterWorld) return false;
    if (filterType && s.primary_type !== filterType) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (![s.name,s.name_zh,...(s.tags||[]),s.mood,s.world].join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handlePrompt = () => {
    if (!promptText.trim()) { setPromptResults(null); return; }
    const results = ZeroRhyme.searchLibrary(promptText, library);
    setPromptResults(results.length > 0 ? results : null);
    if (results.length === 0) setSearchText(promptText);
  };

  const doAssign = (sound, target) => {
    onAssign(target, {
      scoreId: sound.id, source: "library",
      scorePath: sound.score_file, wavPath: sound.wav_file,
      mood: sound.mood, world: sound.world, name: sound.name_zh || sound.name,
    });
  };

  const energyBar = (level) => {
    const map = {"very-low":1,"low":2,"medium":3,"high":4,"very-high":5};
    const n = map[level]||0;
    return Array.from({length:5},(_,i) => (
      <span key={i} style={{display:"inline-block",width:3,height:i<n?10:5,background:i<n?"var(--gold)":"var(--navy-line)",borderRadius:1,marginRight:1}} />
    ));
  };

  const selectStyle = {display:"block",width:"100%",marginTop:3,background:"var(--navy-deep)",border:"1px solid var(--navy-line)",color:"var(--cream)",padding:"6px 8px",fontFamily:"var(--font-body)",fontSize:12,borderRadius:2,outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(13,17,25,0.96)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="music" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Sonus Bibliothecae</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>音效庫</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>{library.length} sounds · TsukiSynth Score v1</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Filters + 零韻 */}
        <aside style={{width:260,minWidth:260,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
          {/* 零韻 */}
          <div>
            <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:10,letterSpacing:"0.14em",color:"var(--gold-dim)",textTransform:"uppercase",marginBottom:6}}>零韻 · Zero Rhyme</div>
            <div style={{display:"flex",gap:4}}>
              <input value={promptText} onChange={e => setPromptText(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handlePrompt()}
                placeholder="描述你想要的氛圍…"
                style={{flex:1,background:"var(--navy-deep)",border:"1px solid var(--navy-line)",color:"var(--cream)",padding:"7px 10px",fontFamily:"var(--font-body)",fontSize:12,borderRadius:2,outline:"none",letterSpacing:"0.04em"}} />
              <button onClick={handlePrompt} style={{background:"var(--gold-glow)",border:"1px solid var(--gold-line)",color:"var(--gold)",padding:"6px 10px",fontFamily:"var(--font-serif-tc)",fontSize:11,cursor:"pointer",borderRadius:2}}>尋</button>
            </div>
            <div style={{marginTop:4,fontFamily:"var(--font-body)",fontSize:10,color:"var(--text-tertiary)",lineHeight:1.5}}>
              試試：「溫和的音樂」「神秘氛圍」「森林 平靜」
            </div>
          </div>
          {/* Filters */}
          <div>
            <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:10,letterSpacing:"0.14em",color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:6}}>Filters</div>
            <label style={{display:"block",marginBottom:8}}>
              <span style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)"}}>Mood 氛圍</span>
              <select value={filterMood} onChange={e => setFilterMood(e.target.value)} style={selectStyle}>
                <option value="">全部</option>
                {MOODS.map(m => <option key={m} value={m}>{MOOD_ZH[m]} ({m})</option>)}
              </select>
            </label>
            <label style={{display:"block",marginBottom:8}}>
              <span style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)"}}>World 世界觀</span>
              <select value={filterWorld} onChange={e => setFilterWorld(e.target.value)} style={selectStyle}>
                <option value="">全部</option>
                {WORLDS.map(w => <option key={w} value={w}>{WORLD_ZH[w]}</option>)}
              </select>
            </label>
            <label style={{display:"block",marginBottom:8}}>
              <span style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)"}}>Type 類型</span>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
                <option value="">全部</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{display:"block",marginBottom:8}}>
              <span style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)"}}>Search 搜尋</span>
              <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="tag / keyword"
                style={{...selectStyle,padding:"6px 8px"}} />
            </label>
            {(filterMood||filterWorld||filterType||searchText||promptResults) && (
              <button onClick={() => {setFilterMood("");setFilterWorld("");setFilterType("");setSearchText("");setPromptResults(null);setPromptText("");}}
                style={{background:"transparent",border:"1px solid var(--navy-line)",color:"var(--text-tertiary)",padding:"5px 10px",fontFamily:"var(--font-body)",fontSize:11,cursor:"pointer",borderRadius:2,width:"100%"}}>清除篩選</button>
            )}
          </div>
          {/* Pipeline info */}
          <div style={{marginTop:"auto",padding:"10px 12px",background:"rgba(201,168,106,0.04)",border:"1px solid rgba(201,168,106,0.15)",borderRadius:3}}>
            <div style={{fontFamily:"var(--font-serif-en)",fontSize:9.5,color:"var(--gold-dim)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>TsukiSynth Pipeline</div>
            <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-tertiary)",lineHeight:1.6}}>
              Score v1 JSON → CLI render → WAV<br/>零韻：搜尋 / 生成 / 渲染
            </div>
          </div>
        </aside>

        {/* Center — Sound list */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"10px 20px",borderBottom:"1px solid var(--navy-line)",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-tertiary)"}}>
            {filtered.length} / {library.length} sounds
            {promptResults && <span style={{color:"var(--gold-dim)",marginLeft:8}}>零韻搜尋結果</span>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"12px 20px"}}>
            {loading ? <div style={{textAlign:"center",padding:40,color:"var(--text-tertiary)"}}>Loading…</div>
            : filtered.length === 0 ? <div style={{textAlign:"center",padding:40,color:"var(--text-tertiary)",fontFamily:"var(--font-body)",fontSize:13}}>無符合條件的音效</div>
            : filtered.map(s => (
              <div key={s.id} onClick={() => setSelectedSound(selectedSound?.id===s.id?null:s)}
                style={{padding:"12px 14px",marginBottom:6,background:selectedSound?.id===s.id?"rgba(201,168,106,0.06)":"rgba(255,255,255,0.015)",border:`1px solid ${selectedSound?.id===s.id?"var(--gold-line)":"var(--navy-line)"}`,borderRadius:3,cursor:"pointer",transition:"all 140ms"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:s.world==="akashic"?"#c9a86a":s.world==="rabbit"?"#e8d8b8":s.world==="restraint"?"#a05a6e":s.world==="forest"?"#6aae7f":s.world==="ocean"?"#7b8ec9":"#9aa1ad"}} />
                  <span style={{fontFamily:"var(--font-serif-tc)",fontSize:13,color:"var(--cream)",letterSpacing:"0.04em"}}>{s.name_zh}</span>
                  <span style={{fontFamily:"var(--font-serif-en)",fontStyle:"italic",fontSize:11,color:"var(--text-tertiary)"}}>{s.name}</span>
                  <span style={{flex:1}} />
                  <span style={{display:"flex",alignItems:"flex-end"}}>{energyBar(s.energy)}</span>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-tertiary)",minWidth:40,textAlign:"right"}}>{s.duration_sec}s</span>
                </div>
                <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                  <span style={{padding:"2px 6px",borderRadius:2,background:"rgba(123,142,201,0.12)",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--text-secondary)"}}>{MOOD_ZH[s.mood]||s.mood}</span>
                  <span style={{padding:"2px 6px",borderRadius:2,background:"rgba(106,174,127,0.12)",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--text-secondary)"}}>{WORLD_ZH[s.world]||s.world}</span>
                  {(s.character||[]).slice(0,2).map((c,i) => <span key={i} style={{padding:"2px 6px",borderRadius:2,background:"rgba(201,168,106,0.08)",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--text-tertiary)"}}>{c}</span>)}
                </div>
                {selectedSound?.id===s.id && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--navy-line)"}}>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <SwBtn icon="music" size="sm" variant="gold" onClick={e=>{e.stopPropagation();doAssign(s,"bgm");}}>指派 BGM</SwBtn>
                      <SwBtn icon="speaker" size="sm" variant="gold" onClick={e=>{e.stopPropagation();doAssign(s,"sfx");}}>指派 SFX</SwBtn>
                    </div>
                    <div style={{fontFamily:"var(--font-body)",fontSize:11,color:"var(--text-secondary)",lineHeight:1.7}}>
                      <div><span style={{color:"var(--gold-dim)"}}>Engine</span> {s.engine}</div>
                      <div><span style={{color:"var(--gold-dim)"}}>Material</span> {s.primary_material}</div>
                      <div><span style={{color:"var(--gold-dim)"}}>Type</span> {s.primary_type} / {s.sound_type}</div>
                      <div><span style={{color:"var(--gold-dim)"}}>Tags</span> {(s.tags||[]).join(", ")}</div>
                      {s.variant_description && <div><span style={{color:"var(--gold-dim)"}}>Variant</span> {s.variant_description}</div>}
                      <div style={{marginTop:4}}><span style={{color:"var(--gold-dim)"}}>Score</span> <code style={{fontSize:10,color:"var(--cream-dim)"}}>{s.score_file}</code></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right — Current assignment info */}
        <aside style={{width:200,minWidth:200,borderLeft:"1px solid var(--navy-line)",padding:"16px 14px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:10,letterSpacing:"0.14em",color:"var(--text-tertiary)",textTransform:"uppercase"}}>Current Block</div>
          {currentBlockBgm ? (
            <div>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--gold-dim)",marginBottom:3}}>BGM</div>
              <div style={{padding:"8px 10px",background:"var(--navy-deep)",border:"1px solid var(--navy-line)",borderRadius:2,fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--cream)"}}>{currentBlockBgm.name||currentBlockBgm.scoreId||"—"}</div>
            </div>
          ) : (
            <div style={{fontFamily:"var(--font-body)",fontSize:12,color:"var(--text-tertiary)",lineHeight:1.6}}>
              選擇 dialogue block<br/>後從左側指派 BGM/SFX
            </div>
          )}
          <div style={{marginTop:"auto",padding:"10px 12px",background:"var(--navy-deep)",border:"1px solid var(--navy-line)",borderRadius:3}}>
            <div style={{fontFamily:"var(--font-serif-en)",fontSize:9.5,color:"var(--gold-dim)",letterSpacing:"0.08em",marginBottom:4,textTransform:"uppercase"}}>Score Reference</div>
            <pre style={{margin:0,fontFamily:"var(--font-mono)",fontSize:9.5,color:"var(--text-tertiary)",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{`{ scoreId, source,\n  scorePath, wavPath,\n  mood, world, name }`}</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============= EDITOR VIEW (Phase 11 — three columns) =============
function EditorView({ blocks, setBlocks }) {
  const [activeChar, setActiveChar] = React.useState("lohengrin");
  const [focusedBlockId, setFocusedBlockId] = React.useState(() => {
    const first = blocks.find(b => b.type === "dialogue");
    return first?.id || null;
  });
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [forgeOpen, setForgeOpen] = React.useState(false);
  const [graphOpen, setGraphOpen] = React.useState(false);
  const [soundOpen, setSoundOpen] = React.useState(false);
  const [linterOpen, setLinterOpen] = React.useState(false);
  const [draftOpen, setDraftOpen] = React.useState(false);
  const { notes, addNote, updateNote, removeNote } = useNotes();
  const importFileRef = React.useRef(null);
  const ch = CHARACTERS.find(c => c.id === activeChar);
  const focusedBlock = blocks.find(b => b.id === focusedBlockId);

  // Pick up focus request from search → editor bridge (runs on mount; tab switch forces remount via key)
  React.useEffect(() => {
    const target = localStorage.getItem("sw_focusBlock");
    if (target) {
      localStorage.removeItem("sw_focusBlock");
      const found = blocks.find(b => b.id === target);
      if (found) {
        setFocusedBlockId(target);
        setTimeout(() => {
          const el = document.querySelector(`[data-block-id="${CSS.escape(target)}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, []);

  const addBlock = (type) => {
    const id = "b_" + Date.now().toString(36);
    const templates = {
      dialogue: { id, type, speakerId: ch?.id || "lohengrin", original: "", zh: "", tags: [],
                  avg: { sprite: "", position: "center", bg: "", bgm: "", sfx: "" } },
      narration:{ id, type, text: "" },
      scene:    { id, type, act: "Akt _ · Sz _", subtitle: "", note: "" },
      note:     { id, type, text: "" },
      choice:   { id, type, prompt: "", options: [{ text: "選項 1", nextBlockId: "" }] },
    };
    const tpl = templates[type];
    if (!tpl) {
      console.error(`[Archive] 未知的 block type：「${type}」`);
      return;
    }
    setBlocks(prev => [...prev, tpl]);
  };
  const removeBlock = (id) => {
    if (!window.confirm("確定刪除此 block？此操作無法復原。")) return;
    setBlocks(blocks.filter(b => b.id !== id));
    if (focusedBlockId === id) setFocusedBlockId(null);
  };
  const updateBlock = (id, patch) => setBlocks(blocks.map(b => b.id === id ? { ...b, ...patch } : b));

  // ── Import JSONL ──
  const [importWarnings, setImportWarnings] = React.useState(null); // validation overlay

  const handleImportJsonl = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result.trim();
        let imported = [];
        const parseErrors = [];
        // Detect JSON array vs JSONL
        if (text.startsWith("[")) {
          try {
            const arr = JSON.parse(text);
            if (!Array.isArray(arr)) throw new Error("JSON 頂層不是陣列");
            imported = arr;
          } catch (pe) {
            parseErrors.push({ index: 0, id: "file", errors: [`JSON 解析失敗：${pe.message}`] });
          }
        } else {
          const lines = text.split("\n");
          lines.forEach((line, i) => {
            if (!line.trim()) return;
            try { imported.push(JSON.parse(line)); }
            catch (pe) { parseErrors.push({ index: i, id: `line ${i + 1}`, errors: [`JSON 解析失敗：${pe.message}`] }); }
          });
        }
        if (parseErrors.length > 0) {
          setImportWarnings(parseErrors);
          return;
        }
        // Validate imported blocks
        const { valid, results } = validateBlocks(imported);
        if (!valid) {
          setImportWarnings(results);
          return; // 有驗證錯誤時不覆蓋目前稿件，等使用者確認
        }
        setImportWarnings(null);
        if (imported.length > 0) {
          setBlocks(imported);
          setFocusedBlockId(imported.find(b => b.type === "dialogue")?.id || null);
        }
      } catch (err) {
        alert("JSONL 匯入失敗：" + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-import same file
  };

  // ── Reset to original data ──
  const resetBlocks = () => {
    if (confirm("確定要重設為原始資料？未存檔的修改將遺失。")) {
      localStorage.removeItem(`blocks_${getWorkId()}`);
      setBlocks(SCRIPT);
      setFocusedBlockId(SCRIPT.find(b => b.type === "dialogue")?.id || null);
    }
  };

  const exportJsonl = () => {
    const lines = blocks.map(b => JSON.stringify(b));
    downloadFile("script-blocks.jsonl", lines.join("\n"), "application/jsonl");
  };

  const exportAvgJson = () => {
    const avgData = blocks.filter(b => b.type === "dialogue" && b.avg).map(b => ({
      lineId: b.lineId || b.id, speakerId: b.speakerId, avg: b.avg
    }));
    downloadFile("avg-settings.json", JSON.stringify(avgData, null, 2), "application/json");
  };

  const exportNotes = () => {
    const entries = [];
    Object.entries(notes).forEach(([charId, arr]) => {
      const ch = CHARACTERS.find(c => c.id === charId);
      arr.forEach(n => {
        entries.push({ charId, charName: ch?.name || charId, text: n.text, ts: n.ts });
      });
    });
    if (entries.length === 0) { alert("目前無筆記可匯出"); return; }
    const lines = entries.map(e => JSON.stringify(e));
    downloadFile(`notes-${getWorkId()}.jsonl`, lines.join("\n"), "application/jsonl");
  };

  const leftW = leftOpen ? 280 : 0;
  const rightW = rightOpen ? 320 : 0;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* LEFT — PERSONAE */}
      {leftOpen && (
        <aside style={{
          width: leftW, minWidth: leftW,
          borderRight: "1px solid var(--navy-line)",
          background: "linear-gradient(180deg, var(--navy-light), var(--navy))",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center" }}>
            <SectionLabel latin="Personae" zh="角色" />
          </div>
          <div style={{ overflowY: "auto", padding: "0 10px 12px", flex: "0 0 auto", maxHeight: 200 }}>
            {CHARACTERS.map(c => (
              <CharRow key={c.id} c={c} active={c.id === activeChar} onClick={() => setActiveChar(c.id)} />
            ))}
          </div>
          <div style={{
            margin: "0 14px", height: 1,
            background: "linear-gradient(90deg, transparent, var(--gold-line), transparent)",
          }} />
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {ch && <CharDetail c={ch} notes={notes}
              onAddNote={addNote} onUpdateNote={updateNote} onRemoveNote={removeNote} />}
          </div>
        </aside>
      )}

      {/* MIDDLE — BLOCKS */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--navy-line)",
          background: "var(--navy)",
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          <button onClick={() => setLeftOpen(o => !o)} title={leftOpen ? "收合角色欄" : "展開角色欄"}
            style={{
              background: leftOpen ? "var(--gold-glow)" : "transparent",
              border: `1px solid ${leftOpen ? "var(--gold-line)" : "var(--navy-line)"}`,
              color: leftOpen ? "var(--gold)" : "var(--text-tertiary)",
              padding: "5px 6px", borderRadius: 2, cursor: "pointer", display: "flex",
            }}><SwIcon name="panelLeft" size={13} /></button>

          <span style={{
            fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
            fontSize: 11, letterSpacing: "0.32em", color: "var(--text-tertiary)",
            textTransform: "uppercase", margin: "0 4px",
          }}>Add Block</span>
          <SwBtn icon="bubble"  size="sm" onClick={() => addBlock("dialogue")}>對白</SwBtn>
          <SwBtn icon="scroll"  size="sm" onClick={() => addBlock("narration")}>旁白</SwBtn>
          <SwBtn icon="curtain" size="sm" onClick={() => addBlock("scene")}>場次</SwBtn>
          <SwBtn icon="branch"  size="sm" onClick={() => addBlock("choice")}>選項</SwBtn>
          <SwBtn icon="note"    size="sm" onClick={() => addBlock("note")}>編註</SwBtn>

          {/* Table Forge toggle */}
          <span style={{ width: 1, height: 18, background: "var(--navy-line)", margin: "0 2px" }} />
          <SwBtn icon="hashtag" size="sm" variant={forgeOpen ? "gold" : "ghost"}
            onClick={() => setForgeOpen(o => !o)}>Table Forge</SwBtn>
          <SwBtn icon="network" size="sm" variant="ghost"
            onClick={() => setGraphOpen(true)}>關係圖</SwBtn>
          <SwBtn icon="music" size="sm" variant="ghost"
            onClick={() => setSoundOpen(true)}>音效庫</SwBtn>
          <SwBtn icon="scroll" size="sm" variant="ghost"
            onClick={() => setLinterOpen(true)}>格式檢查</SwBtn>
          <SwBtn icon="quill" size="sm" variant="ghost"
            onClick={() => setDraftOpen(true)}>初稿生成</SwBtn>

          <span style={{ flex: 1 }} />

          {/* Import */}
          <input ref={importFileRef} type="file" accept=".jsonl,.json"
            onChange={handleImportJsonl} style={{ display: "none" }} />
          <SwBtn icon="upload" size="sm" onClick={() => importFileRef.current?.click()}>匯入 JSONL</SwBtn>
          <SwBtn icon="back" size="sm" onClick={resetBlocks} title="重設為原始資料">重設</SwBtn>

          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--text-tertiary)", letterSpacing: "0.06em",
          }}>{blocks.length} blocks · {blocks !== SCRIPT ? "已自動存檔" : "原始資料"}</span>

          <button onClick={() => setRightOpen(o => !o)} title={rightOpen ? "收合 AVG 欄" : "展開 AVG 欄"}
            style={{
              background: rightOpen ? "var(--gold-glow)" : "transparent",
              border: `1px solid ${rightOpen ? "var(--gold-line)" : "var(--navy-line)"}`,
              color: rightOpen ? "var(--gold)" : "var(--text-tertiary)",
              padding: "5px 6px", borderRadius: 2, cursor: "pointer", display: "flex",
            }}><SwIcon name="panelRight" size={13} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 110px" }}>
          {blocks.map(b => (
            <BlockCard key={b.id} b={b} blocks={blocks}
              focused={b.id === focusedBlockId}
              onFocus={() => setFocusedBlockId(b.id)}
              onRemove={() => removeBlock(b.id)}
              onUpdate={p => updateBlock(b.id, p)} />
          ))}
        </div>

      </main>

      {/* export bar — outside main to avoid overflow clipping */}
      <div style={{
        position: "absolute", left: leftW, right: rightW, bottom: 0, zIndex: 20,
        background: "rgba(17,21,29,0.94)", backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--gold-line)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        transition: "left 200ms, right 200ms",
      }}>
        <SectionLabel latin="Exportare" zh="匯出" />
        <SwBtn variant="gold" icon="download" size="sm" onClick={exportJsonl}>匯出 JSONL</SwBtn>
        <SwBtn variant="gold" icon="download" size="sm" onClick={exportAvgJson}>匯出 AVG JSON</SwBtn>
        <SwBtn variant="ghost" icon="note" size="sm" onClick={exportNotes}>匯出筆記</SwBtn>
      </div>

      {/* Validation warnings overlay */}
      {importWarnings && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 60,
          background: "rgba(13,17,25,0.92)", backdropFilter: "blur(6px)",
          display: "flex", flexDirection: "column",
          animation: "swFade 150ms ease",
        }}>
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--navy-line)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{
              fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
              fontSize: 13, letterSpacing: "0.16em", color: "var(--danger)",
              textTransform: "uppercase",
            }}>⚠ Validation Warnings</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--text-tertiary)", letterSpacing: "0.04em",
            }}>{importWarnings.length} 筆問題</span>
            <span style={{ flex: 1 }} />
            <SwBtn variant="gold" size="sm" icon="close" onClick={() => setImportWarnings(null)}>關閉</SwBtn>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px 24px" }}>
            {importWarnings.map((w, i) => (
              <div key={i} style={{
                padding: "10px 14px", marginBottom: 8,
                background: "rgba(196,96,79,0.08)",
                border: "1px solid rgba(196,96,79,0.25)",
                borderRadius: 3,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--danger)", letterSpacing: "0.04em",
                }}>#{w.id}</span>
                <ul style={{
                  margin: "6px 0 0", paddingLeft: 18,
                  fontFamily: "var(--font-body)", fontSize: 12,
                  color: "var(--cream-dim)", lineHeight: 1.7,
                }}>
                  {w.errors.map((err, j) => <li key={j}>{err}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table Forge overlay */}
      {forgeOpen && <TableForge blocks={blocks} onUpdateBlock={updateBlock} onClose={() => setForgeOpen(false)} />}

      {/* Relationship Graph overlay (Phase 12-C) */}
      {graphOpen && <RelationshipGraph onClose={() => setGraphOpen(false)} />}

      {/* Sound Panel overlay (Phase 12-D) */}
      {soundOpen && <SoundPanel
        onClose={() => setSoundOpen(false)}
        currentBlockBgm={focusedBlock?.avg?.bgmRef ?? null}
        onAssign={(target, ref) => {
          if (focusedBlockId && focusedBlock?.type === "dialogue") {
            const avg = { ...(focusedBlock.avg || {}) };
            if (target === "bgm") { avg.bgm = ref.scoreId; avg.bgmRef = ref; }
            else { avg.sfx = ref.scoreId; avg.sfxRef = ref; }
            updateBlock(focusedBlockId, { avg });
          }
        }}
      />}

      {/* Script Linter overlay (Phase 12-E) */}
      {linterOpen && <ScriptLinter
        blocks={blocks}
        characters={CHARACTERS}
        onClose={() => setLinterOpen(false)}
        onGoToBlock={(blockId) => {
          setFocusedBlockId(blockId);
          setTimeout(() => {
            const el = document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        }}
      />}

      {/* Draft Generator overlay (Phase 12-F) */}
      {draftOpen && <DraftGenerator
        characters={CHARACTERS}
        onClose={() => setDraftOpen(false)}
        onInsert={(newBlocks) => {
          setBlocks(prev => [...prev, ...newBlocks]);
          setFocusedBlockId(newBlocks[0]?.id || null);
          setTimeout(() => {
            const el = newBlocks[0]?.id ? document.querySelector(`[data-block-id="${CSS.escape(newBlocks[0].id)}"]`) : null;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 200);
        }}
      />}

      {/* RIGHT — AVG PANEL (Phase 11) */}
      {rightOpen && (
        <aside style={{
          width: rightW, minWidth: rightW,
          borderLeft: "1px solid var(--navy-line)",
          background: "linear-gradient(180deg, var(--navy-light), var(--navy))",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "16px 16px 12px" }}>
            <SectionLabel latin="Apparatus" zh="AVG 設定" accent="gold" />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 16px" }}>
            {focusedBlock?.type === "dialogue" ? (
              <>
                {/* sprite preview */}
                <SpritePreview block={focusedBlock} characters={CHARACTERS} />

                {/* AVG fields */}
                <AvgPanel block={focusedBlock}
                  onUpdate={p => updateBlock(focusedBlockId, p)} />

                {/* separator */}
                <div style={{
                  height: 1, margin: "16px 0 12px",
                  background: "linear-gradient(90deg, transparent, var(--gold-line), transparent)",
                }} />

                {/* JSON preview */}
                <div style={{ marginBottom: 8 }}>
                  <SectionLabel latin="Inspectio" zh="JSON 預覽" />
                </div>
                <JsonPreview block={focusedBlock} />
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 12, padding: "60px 16px",
                color: "var(--text-tertiary)", textAlign: "center",
              }}>
                <div style={{
                  width: 48, height: 48,
                  border: "1px solid var(--navy-line)", borderRadius: 2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--gold-deep)",
                }}><SwIcon name="layers" size={22} stroke={1.4} /></div>
                <div style={{
                  fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
                  fontSize: 10.5, letterSpacing: "0.3em", color: "var(--gold-deep)",
                  textTransform: "uppercase",
                }}>Nullum Selectum</div>
                <div style={{
                  fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
                  color: "var(--text-secondary)", letterSpacing: "0.06em",
                }}>點擊任一對白區塊<br />以編輯 AVG 設定</div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function CharRow({ c, active, onClick }) {
  const [h, setH] = React.useState(false);
  const dot = CHAR_COLORS[c.id] || "var(--gold-deep)";
  return (
    <div onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 10px",
        background: active ? "var(--gold-glow)" : (h ? "rgba(255,255,255,0.025)" : "transparent"),
        cursor: "pointer", transition: "all 140ms",
      }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: dot,
        boxShadow: active ? `0 0 6px ${dot}` : "none",
      }} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
        <div style={{
          fontFamily: "var(--font-serif-tc)", fontSize: 13.5,
          color: active ? "var(--gold-bright)" : "var(--text-primary)",
          letterSpacing: "0.06em",
        }}>{c.name}</div>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 11, color: "var(--text-tertiary)",
          letterSpacing: "0.06em", marginTop: 1,
        }}>{c.nameEn} · {c.voice}</div>
      </div>
      {active && <SwIcon name="chevronRight" size={12} />}
    </div>
  );
}

function CharDetail({ c, notes, onAddNote, onUpdateNote, onRemoveNote }) {
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [newNote, setNewNote] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState("");
  const charNotes = notes[c.id] || [];

  const handleAdd = () => {
    const t = newNote.trim();
    if (!t) return;
    onAddNote(c.id, t);
    setNewNote("");
  };

  const startEdit = (n) => { setEditingId(n.id); setEditText(n.text); };
  const confirmEdit = () => {
    if (editText.trim()) onUpdateNote(c.id, editingId, editText.trim());
    setEditingId(null);
  };

  const Field = ({ label, en, value }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
        fontSize: 10.5, letterSpacing: "0.16em",
        color: "var(--text-tertiary)",
        textTransform: "uppercase", marginBottom: 3,
      }}>{label} · {en}</div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 12.5,
        color: "var(--cream)", lineHeight: 1.6,
      }}>{value}</div>
    </div>
  );
  return (
    <div style={{
      background: "var(--navy)",
      border: "1px solid var(--navy-line)",
      padding: "14px 14px 16px",
    }}>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 17,
        color: "var(--cream)", letterSpacing: "0.14em",
        marginBottom: 1,
      }}>{c.name}</div>
      <div style={{
        fontFamily: "var(--font-serif-en)", fontStyle: "italic",
        fontSize: 13.5, color: "var(--gold)", letterSpacing: "0.06em",
        marginBottom: 12,
      }}>{c.nameEn}</div>
      <div style={{
        height: 1,
        background: "linear-gradient(90deg, var(--gold-line), transparent)",
        marginBottom: 12,
      }} />
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--gold-dim)", letterSpacing: "0.08em",
        marginBottom: 12,
      }}>speakerId: <span style={{ color: "var(--gold)" }}>{c.id}</span></div>
      <Field label="聲部" en="Voice" value={c.voice} />
      <Field label="身份" en="Role" value={c.role} />
      <Field label="關係" en="Relations" value={c.relations} />
      <Field label="口吻" en="Tone" value={c.tone} />

      <div style={{
        fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
        fontSize: 10.5, letterSpacing: "0.16em",
        color: "var(--text-tertiary)",
        textTransform: "uppercase", marginBottom: 6, marginTop: 6,
      }}>Tags</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {c.tags.map(t => <Tag key={t} kind="role">{t}</Tag>)}
      </div>

      <div style={{ height: 1, background: "var(--navy-line)", margin: "14px 0 10px" }} />

      {/* ── Notes Section (CRUD) ── */}
      <button onClick={() => setNotesOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none",
          padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 10.5, letterSpacing: "0.16em",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
        }}>
        <span style={{ display: "inline-block",
          transform: notesOpen ? "rotate(90deg)" : "rotate(0)",
          transition: "transform 160ms" }}>▸</span>
        Notae · 筆記 ({charNotes.length})
      </button>
      {notesOpen && (
        <div style={{ marginTop: 10 }}>
          {/* Note list */}
          {charNotes.length === 0 && (
            <div style={{
              fontFamily: "var(--font-body)", fontSize: 12,
              color: "var(--text-tertiary)", opacity: 0.6, marginBottom: 10,
              letterSpacing: "0.04em",
            }}>暫無筆記</div>
          )}
          {charNotes.map(n => (
            <div key={n.id} style={{
              padding: "8px 10px",
              borderLeft: "2px solid var(--gold-line)",
              background: "rgba(0,0,0,0.2)",
              marginBottom: 6, position: "relative",
            }}>
              {editingId === n.id ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && confirmEdit()}
                    autoFocus
                    style={{
                      flex: 1, background: "var(--navy-deep)",
                      border: "1px solid var(--gold-line)",
                      color: "var(--cream)", padding: "4px 8px",
                      fontFamily: "var(--font-body)", fontSize: 12,
                      borderRadius: 2, outline: "none",
                    }} />
                  <button onClick={confirmEdit} style={{
                    background: "var(--gold-glow)", border: "1px solid var(--gold-line)",
                    color: "var(--gold)", padding: "2px 8px", borderRadius: 2, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 10,
                  }}>✓</button>
                  <button onClick={() => setEditingId(null)} style={{
                    background: "transparent", border: "1px solid var(--navy-line)",
                    color: "var(--text-tertiary)", padding: "2px 8px", borderRadius: 2, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 10,
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <div style={{
                    flex: 1, fontFamily: "var(--font-body)", fontSize: 12,
                    color: "var(--text-secondary)", lineHeight: 1.7,
                    letterSpacing: "0.04em",
                  }}>「{n.text}」</div>
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    <button onClick={() => startEdit(n)} title="編輯" style={{
                      background: "transparent", border: "none",
                      color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", display: "flex",
                    }}><SwIcon name="pen" size={10} /></button>
                    <button onClick={() => onRemoveNote(c.id, n.id)} title="刪除" style={{
                      background: "transparent", border: "none",
                      color: "var(--danger)", cursor: "pointer", padding: "2px", display: "flex",
                      opacity: 0.7,
                    }}><SwIcon name="trash" size={10} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* Add note input */}
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            <input value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="新增筆記…"
              style={{
                flex: 1, background: "var(--navy-deep)",
                border: "1px solid var(--navy-line)",
                color: "var(--cream)", padding: "5px 8px",
                fontFamily: "var(--font-body)", fontSize: 12,
                borderRadius: 2, outline: "none",
              }} />
            <button onClick={handleAdd} style={{
              background: "var(--gold-glow)", border: "1px solid var(--gold-line)",
              color: "var(--gold)", padding: "4px 10px", borderRadius: 2,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              fontFamily: "var(--font-mono)", fontSize: 10.5,
            }}><SwIcon name="plus" size={10} />Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagAdder({ onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [kind, setKind] = React.useState("plot");
  const inputRef = React.useRef(null);

  React.useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const submit = () => {
    const t = text.trim();
    if (!t) { setOpen(false); return; }
    onAdd([t, kind]);
    setText("");
    // keep open for batch adding
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        padding: "2px 10px", borderRadius: 2,
        background: "transparent", border: "1px dashed var(--navy-line)",
        color: "var(--text-tertiary)", fontSize: 11,
        fontFamily: "var(--font-body)", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 4,
      }}>
        <SwIcon name="plus" size={9} /> 新增 TAG
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <select value={kind} onChange={e => setKind(e.target.value)}
        style={{
          background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
          color: "var(--cream)", padding: "3px 6px",
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          borderRadius: 2, outline: "none", cursor: "pointer",
        }}>
        <option value="plot">劇情</option>
        <option value="emotion">情緒</option>
        <option value="theme">主題</option>
        <option value="form">形式</option>
        <option value="role">角色</option>
      </select>
      <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="TAG 名稱…"
        style={{
          width: 90, background: "var(--navy-deep)",
          border: "1px solid var(--gold-line)", color: "var(--cream)",
          padding: "3px 6px", fontFamily: "var(--font-body)", fontSize: 11.5,
          borderRadius: 2, outline: "none",
        }} />
      <button onClick={submit} style={{
        background: "var(--gold-glow)", border: "1px solid var(--gold-line)",
        color: "var(--gold)", padding: "2px 8px", borderRadius: 2,
        fontSize: 10.5, fontFamily: "var(--font-mono)", cursor: "pointer",
      }}>+</button>
      <button onClick={() => setOpen(false)} style={{
        background: "transparent", border: "1px solid var(--navy-line)",
        color: "var(--text-tertiary)", padding: "2px 6px", borderRadius: 2,
        fontSize: 10.5, cursor: "pointer",
      }}>✕</button>
    </span>
  );
}

function BlockCard({ b, blocks, onRemove, onUpdate, focused, onFocus }) {
  const meta = BLOCK_META[b.type];
  const charDot = b.type === "dialogue" ? (CHAR_COLORS[b.speakerId] || meta.color) : meta.color;
  const isFocused = focused && b.type === "dialogue";
  const blockErrors = React.useMemo(() => validateBlock(b), [b]);
  return (
    <div data-block-id={b.id}
      onClick={b.type === "dialogue" ? onFocus : undefined}
      style={{
      background: blockErrors.length > 0 ? "rgba(196,96,79,0.04)" : (isFocused ? "rgba(201,168,106,0.04)" : "var(--navy-light)"),
      border: `1px solid ${blockErrors.length > 0 ? "rgba(196,96,79,0.3)" : (isFocused ? "var(--gold-line)" : "var(--navy-hover)")}`,
      borderLeft: `3px solid ${blockErrors.length > 0 ? "var(--danger)" : charDot}`,
      marginBottom: 10,
      padding: "12px 14px 14px",
      cursor: b.type === "dialogue" ? "pointer" : "default",
      transition: "border-color 160ms, background 160ms",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
      }}>
        <span style={{ color: meta.color, display: "flex" }}><SwIcon name={meta.ic} size={14} /></span>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 11.5, color: meta.color, letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>· {meta.label}</span>

        {b.type === "dialogue" && (
          <select value={b.speakerId} onChange={e => onUpdate({ speakerId: e.target.value })}
            style={{
              background: "var(--navy-deep)",
              border: "1px solid var(--navy-line)",
              color: "var(--cream)",
              padding: "4px 22px 4px 8px",
              fontFamily: "var(--font-body)", fontSize: 12,
              borderRadius: 2, outline: "none", cursor: "pointer", appearance: "none",
              backgroundImage: "linear-gradient(45deg, transparent 50%, var(--gold-dim) 50%), linear-gradient(135deg, var(--gold-dim) 50%, transparent 50%)",
              backgroundPosition: "calc(100% - 12px) 50%, calc(100% - 7px) 50%",
              backgroundSize: "5px 5px", backgroundRepeat: "no-repeat",
            }}>
            {CHARACTERS.map(c => <option key={c.id} value={c.id} style={{ background: "var(--navy-deep)" }}>{c.name}（{c.id}）</option>)}
          </select>
        )}

        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-tertiary)", opacity: 0.65, letterSpacing: "0.05em",
        }}>#{b.id}</span>
        <span style={{ display: "flex", color: "var(--text-tertiary)", opacity: 0.4 }}>
          <SwIcon name="drag" size={12} stroke={1.5} />
        </span>
        <button onClick={onRemove} title="刪除"
          style={{
            background: "transparent", border: "1px solid var(--navy-line)",
            color: "var(--text-tertiary)", padding: "3px 6px",
            borderRadius: 2, cursor: "pointer", display: "flex",
          }}><SwIcon name="trash" size={12} /></button>
      </div>

      {blockErrors.length > 0 && (
        <div style={{
          padding: "5px 10px", marginBottom: 8,
          background: "rgba(196,96,79,0.1)",
          border: "1px solid rgba(196,96,79,0.25)",
          borderRadius: 2,
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--danger)", lineHeight: 1.6, letterSpacing: "0.02em",
        }}>
          {blockErrors.map((err, i) => <div key={i}>⚠ {err}</div>)}
        </div>
      )}

      {b.type === "dialogue" && (
        <>
          <BlockTextarea placeholder="原文（德 / 英 / 義…）"
            value={b.original} onChange={v => onUpdate({ original: v })} font="serif-en" />
          <BlockTextarea placeholder="中譯"
            value={b.zh} onChange={v => onUpdate({ zh: v })} font="serif-tc" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8, alignItems: "center" }}>
            {(b.tags || []).map(([t, k], i) => (
              <Tag key={i} kind={k}
                onRemove={() => {
                  const ts = [...(b.tags || [])]; ts.splice(i, 1);
                  onUpdate({ tags: ts });
                }}>{t}</Tag>
            ))}
            <TagAdder onAdd={tag => onUpdate({ tags: [...(b.tags || []), tag] })} />
          </div>
        </>
      )}

      {b.type === "narration" && (
        <BlockTextarea placeholder="旁白文字"
          value={b.text} onChange={v => onUpdate({ text: v })} font="serif-tc" />
      )}

      {b.type === "scene" && (
        <>
          <BlockTextarea placeholder="幕場標記"
            value={b.act} onChange={v => onUpdate({ act: v })} font="mono" rows={1} />
          <BlockTextarea placeholder="場景副標"
            value={b.subtitle || ""} onChange={v => onUpdate({ subtitle: v })} font="serif-tc" rows={1} />
          <BlockTextarea placeholder="舞台註記（可選）"
            value={b.note || ""} onChange={v => onUpdate({ note: v })} font="serif-tc" rows={2} />
        </>
      )}

      {b.type === "choice" && (
        <div>
          <BlockTextarea placeholder="分歧提示文字（可選，如「你要怎麼做？」）"
            value={b.prompt || ""} onChange={v => onUpdate({ prompt: v })} font="serif-tc" rows={1} />
          <div style={{ marginTop: 8 }}>
            {(b.options || []).map((opt, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
              }}>
                <span style={{
                  width: 20, textAlign: "center",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "#7B8EC9", fontWeight: 700,
                }}>{i + 1}</span>
                <input value={opt.text} placeholder="選項文字"
                  onChange={e => {
                    const opts = [...(b.options || [])];
                    opts[i] = { ...opts[i], text: e.target.value };
                    onUpdate({ options: opts });
                  }}
                  style={{
                    flex: 1, background: "var(--navy-deep)",
                    border: "1px solid var(--navy-line)", color: "var(--cream)",
                    padding: "5px 8px", fontFamily: "var(--font-body)", fontSize: 12,
                    borderRadius: 2, outline: "none",
                  }} />
                <select value={opt.nextBlockId || ""}
                  onChange={e => {
                    const opts = [...(b.options || [])];
                    opts[i] = { ...opts[i], nextBlockId: e.target.value };
                    onUpdate({ options: opts });
                  }}
                  style={{
                    width: 130, background: "var(--navy-deep)",
                    border: "1px solid var(--navy-line)", color: "var(--cream-dim)",
                    padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 10.5,
                    borderRadius: 2, outline: "none", cursor: "pointer",
                  }}>
                  <option value="">→ 無指向</option>
                  {blocks.filter(s => s.type === "scene").map(s => (
                    <option key={s.id} value={s.id}>{s.act || s.id}</option>
                  ))}
                </select>
                <button onClick={() => {
                  if ((b.options || []).length <= 1) return;
                  const opts = [...(b.options || [])]; opts.splice(i, 1);
                  onUpdate({ options: opts });
                }} style={{
                  background: "transparent", border: "1px solid var(--navy-line)",
                  color: "var(--text-tertiary)", padding: "3px 5px",
                  borderRadius: 2, cursor: "pointer", display: "flex",
                }}><SwIcon name="close" size={10} /></button>
              </div>
            ))}
            <button onClick={() => {
              const opts = [...(b.options || []), { text: "", nextBlockId: "" }];
              onUpdate({ options: opts });
            }} style={{
              padding: "3px 10px", borderRadius: 2, marginTop: 4,
              background: "transparent", border: "1px dashed var(--navy-line)",
              color: "#7B8EC9", fontSize: 11,
              fontFamily: "var(--font-body)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <SwIcon name="plus" size={9} /> 新增選項
            </button>
          </div>
        </div>
      )}

      {b.type === "note" && (
        <BlockTextarea placeholder="編輯備註"
          value={b.text} onChange={v => onUpdate({ text: v })} font="serif-tc" />
      )}
    </div>
  );
}

function BlockTextarea({ value, onChange, placeholder, font = "serif-tc", rows = 2 }) {
  const [f, setF] = React.useState(false);
  const fontFam = {
    "serif-en": "var(--font-serif-en)",
    "serif-tc": "var(--font-body)",
    "mono":     "var(--font-mono)",
  }[font];
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      placeholder={placeholder} rows={rows}
      style={{
        width: "100%",
        background: "var(--navy-deep)",
        border: `1px solid ${f ? "var(--gold-line)" : "var(--navy-line)"}`,
        color: "var(--cream)",
        padding: "8px 10px",
        fontFamily: fontFam,
        fontSize: font === "serif-en" ? 14 : font === "mono" ? 12 : 13,
        lineHeight: 1.7, letterSpacing: "0.04em",
        borderRadius: 2, outline: "none", resize: "vertical",
        marginBottom: 6,
        fontStyle: font === "serif-en" ? "italic" : "normal",
        transition: "border-color 160ms",
      }} />
  );
}

// ============= READER VIEW — black-box theater =============
function ReaderView({ blocks, goToBlock }) {
  const work = WORKS[0]; // current work
  const sceneIndices = blocks.map((b, i) => b.type === "scene" ? i : -1).filter(i => i >= 0);
  const scenes = sceneIndices.map(i => blocks[i]);
  const [activeScene, setActiveScene] = React.useState(scenes[0]?.id);
  const [showNotes, setShowNotes] = React.useState(false);
  const containerRef = React.useRef(null);
  const sceneRefs = React.useRef({});
  const [readerNotes] = React.useState(loadNotes);

  // Track first appearance of each character for note display
  const firstAppearance = React.useMemo(() => {
    const seen = new Set();
    const map = {};
    blocks.forEach(b => {
      if (b.type === "dialogue" && !seen.has(b.speakerId)) {
        seen.add(b.speakerId);
        map[b.id] = b.speakerId;
      }
    });
    return map;
  }, [blocks]);

  const canExportPdf = work.license === "public-domain" || work.license === "fair-use";

  const handleExportPdf = () => {
    if (!canExportPdf) {
      alert(`版權狀態「${work.license || "unchecked"}」不允許全文匯出 PDF。\n僅 public-domain 與 fair-use 作品可匯出。`);
      return;
    }
    window.print();
  };

  // observe scene visibility for TOC highlight
  React.useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveScene(visible[0].target.dataset.sceneId);
    }, { root, threshold: 0.1, rootMargin: "-30% 0px -50% 0px" });
    Object.values(sceneRefs.current).forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [blocks]);

  const scrollToScene = (id) => {
    const el = sceneRefs.current[id];
    if (el && containerRef.current) {
      const top = el.offsetTop - 40;
      containerRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  // group blocks by scene
  const groups = [];
  let cur = null;
  blocks.forEach(b => {
    if (b.type === "scene") {
      cur = { scene: b, blocks: [] };
      groups.push(cur);
    } else {
      if (!cur) {
        cur = { scene: { id: "_preamble", act: "Prolog", subtitle: "", note: "" }, blocks: [] };
        groups.push(cur);
      }
      cur.blocks.push(b);
    }
  });

  return (
    <div className="reader-root" style={{ display: "flex", flex: 1, overflow: "hidden", background: "#0d1119", position: "relative" }}>
      {/* TOC */}
      <aside className="reader-toc" style={{
        width: 180, minWidth: 180,
        padding: "26px 14px",
        borderRight: "1px solid var(--navy-line)",
        background: "linear-gradient(180deg, rgba(20,24,33,0.6), rgba(13,17,25,0.6))",
        overflowY: "auto",
      }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
          fontSize: 10.5, letterSpacing: "0.34em",
          color: "var(--text-tertiary)",
          textTransform: "uppercase", marginBottom: 16,
          paddingBottom: 10, borderBottom: "1px solid var(--navy-line)",
        }}>Lectio · 場景目錄</div>
        {groups.map((g, i) => {
          const active = activeScene === g.scene.id;
          const [actLabel, sceneLabel] = (g.scene.act || "").split("·").map(s => s.trim());
          return (
            <div key={g.scene.id}
              onClick={() => scrollToScene(g.scene.id)}
              style={{
                padding: "8px 8px 8px 18px",
                position: "relative",
                cursor: "pointer",
                fontFamily: "var(--font-serif-en)",
                fontSize: 12.5,
                color: active ? "var(--gold)" : "var(--text-secondary)",
                letterSpacing: "0.04em",
                lineHeight: 1.4,
                transition: "color 200ms",
              }}>
              {active && (
                <span style={{
                  position: "absolute", left: 4, top: 12,
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--gold)",
                  boxShadow: "0 0 6px var(--gold)",
                }} />
              )}
              <div style={{ fontStyle: "italic" }}>{actLabel}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{sceneLabel}</div>
              {g.scene.subtitle && (
                <div style={{
                  fontFamily: "var(--font-serif-tc)",
                  fontSize: 10.5, marginTop: 2,
                  color: active ? "var(--gold-dim)" : "var(--text-tertiary)",
                  letterSpacing: "0.06em",
                }}>{g.scene.subtitle}</div>
              )}
            </div>
          );
        })}
      </aside>

      {/* READING AREA */}
      <div ref={containerRef} className="reader-content"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 0 80px",
          background: `
            radial-gradient(ellipse at 50% -20%, rgba(201,168,106,0.05) 0%, transparent 60%),
            #0d1119
          `,
        }}>
        <div style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "60px 56px 40px",
          minHeight: "100%",
        }}>
          <div style={{
            textAlign: "center",
            marginBottom: 40,
            paddingBottom: 24,
            borderBottom: "1px solid var(--navy-line)",
          }}>
            <div style={{
              fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
              fontSize: 11, letterSpacing: "0.4em",
              color: "var(--gold-deep)",
              textTransform: "uppercase", marginBottom: 8,
            }}>{[work.genreLabel, work.actsLabel].filter(Boolean).join(" · ")}</div>
            <div style={{
              fontFamily: "var(--font-serif-en)", fontStyle: "italic",
              fontSize: 28, color: "var(--cream)",
              letterSpacing: "0.06em",
            }}>{work.titleEn}</div>
            <div style={{
              fontFamily: "var(--font-serif-tc)", fontSize: 14,
              color: "var(--text-secondary)", letterSpacing: "0.18em",
              marginTop: 4,
            }}>{work.title}</div>
            <div style={{
              fontFamily: "var(--font-serif-en)", fontStyle: "italic",
              fontSize: 12, color: "var(--text-tertiary)",
              letterSpacing: "0.08em", marginTop: 12,
            }}>— {work.composer}, {work.premiereYear}</div>
          </div>

          {groups.map((g, i) => (
            <div key={g.scene.id}
              ref={el => sceneRefs.current[g.scene.id] = el}
              data-scene-id={g.scene.id}>
              {i > 0 && (
                <hr style={{
                  border: "none",
                  borderTop: "1px solid var(--navy-hover)",
                  width: "55%", margin: "60px auto 50px",
                }} />
              )}
              {/* scene header */}
              <div style={{ marginBottom: 30 }}>
                <div style={{
                  fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
                  fontSize: 16, color: "var(--gold)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--navy-hover)",
                  marginBottom: 8,
                }}>{g.scene.act}</div>
                {g.scene.subtitle && (
                  <div style={{
                    fontFamily: "var(--font-serif-tc)", fontSize: 14,
                    color: "var(--text-secondary)", letterSpacing: "0.14em",
                  }}>{g.scene.subtitle}</div>
                )}
                {g.scene.note && (
                  <div style={{
                    fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
                    color: "var(--text-tertiary)", letterSpacing: "0.06em",
                    fontStyle: "italic", marginTop: 6, opacity: 0.8,
                  }}>（{g.scene.note}）</div>
                )}
              </div>

              {g.blocks.map(b => {
                if (b.type === "narration") {
                  return (
                    <div key={b.id} style={{
                      fontFamily: "var(--font-body)", fontSize: 13.5,
                      color: "var(--text-secondary)", lineHeight: 1.85,
                      margin: "22px 32px",
                      paddingLeft: 16,
                      borderLeft: "2px solid var(--navy-hover)",
                      letterSpacing: "0.04em",
                    }}>{b.text}</div>
                  );
                }
                if (b.type === "dialogue") {
                  const ch = CHARACTERS.find(c => c.id === b.speakerId);
                  const isFirst = firstAppearance[b.id] === b.speakerId;
                  const charNotes = (isFirst && showNotes) ? (readerNotes[b.speakerId] || []) : [];
                  return <ReaderDialogue key={b.id} block={b} ch={ch} charNotes={charNotes} goToBlock={goToBlock} />;
                }
                if (b.type === "choice") {
                  return (
                    <div key={b.id} style={{
                      margin: "28px 32px",
                      padding: "16px 20px",
                      background: "rgba(123,142,201,0.06)",
                      border: "1px solid rgba(123,142,201,0.2)",
                      borderRadius: 4,
                    }}>
                      {b.prompt && (
                        <div style={{
                          fontFamily: "var(--font-serif-tc)", fontSize: 13.5,
                          color: "var(--cream)", marginBottom: 12,
                          letterSpacing: "0.06em",
                        }}>{b.prompt}</div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {(b.options || []).map((opt, i) => (
                          <div key={i} onClick={() => {
                            if (opt.nextBlockId) { scrollToScene(opt.nextBlockId); setActiveScene(opt.nextBlockId); }
                          }} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 14px",
                            background: "rgba(123,142,201,0.08)",
                            border: "1px solid rgba(123,142,201,0.18)",
                            borderRadius: 3,
                            cursor: opt.nextBlockId ? "pointer" : "default",
                            transition: "background 120ms",
                          }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 11,
                              color: "#7B8EC9", fontWeight: 700,
                              minWidth: 18,
                            }}>{i + 1}.</span>
                            <span style={{
                              fontFamily: "var(--font-body)", fontSize: 13,
                              color: "var(--cream)", letterSpacing: "0.04em",
                            }}>{opt.text || "（空選項）"}</span>
                            {opt.nextBlockId && (
                              <span style={{
                                marginLeft: "auto",
                                fontFamily: "var(--font-mono)", fontSize: 10,
                                color: "var(--text-tertiary)", opacity: 0.7,
                              }}>→ {opt.nextBlockId}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          <div style={{
            textAlign: "center",
            margin: "60px 0 20px",
            fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
            fontSize: 11, letterSpacing: "0.4em",
            color: "var(--gold-deep)",
            textTransform: "uppercase",
          }}>— Finis —</div>
        </div>
      </div>

      {/* PDF export bar */}
      <div className="reader-export-bar" style={{
        position: "absolute", left: 180, right: 0, bottom: 0,
        background: "rgba(13,17,25,0.94)", backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--gold-line)",
        padding: "12px 28px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <SwBtn variant={showNotes ? "gold" : "ghost"} icon="note" size="sm"
          onClick={() => setShowNotes(n => !n)}>
          {showNotes ? "隱藏筆記" : "顯示筆記"}
        </SwBtn>
        <span style={{ width: 1, height: 18, background: "var(--navy-line)" }} />
        <SwBtn variant="gold" icon="download" size="sm" onClick={handleExportPdf}>
          匯出 PDF
        </SwBtn>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px",
          borderRadius: 2,
          background: canExportPdf ? "rgba(106,174,127,0.12)" : "rgba(196,96,79,0.12)",
          border: `1px solid ${canExportPdf ? "rgba(106,174,127,0.3)" : "rgba(196,96,79,0.3)"}`,
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: canExportPdf ? "var(--success)" : "var(--danger)",
          letterSpacing: "0.04em",
        }}>
          {canExportPdf ? "✓" : "⚠"} {work.license || "unchecked"}
        </span>
        {!canExportPdf && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--danger)", letterSpacing: "0.04em",
          }}>版權限制：無法匯出</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-tertiary)", letterSpacing: "0.06em",
        }}>{work.title} · {work.titleEn}</span>
      </div>
    </div>
  );
}

function ReaderDialogue({ block, ch, charNotes = [], goToBlock }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ margin: "32px 0 8px" }}>
      {/* speaker name — centered, gold, bold — click to jump to Editor */}
      <div
        onClick={() => goToBlock && goToBlock(block.id)}
        style={{
        textAlign: "center",
        fontFamily: "var(--font-serif-tc)",
        fontWeight: 700,
        fontSize: 14.5,
        color: hover ? "var(--gold-bright, #f0d680)" : "var(--gold)",
        letterSpacing: "0.32em",
        marginBottom: 14,
        cursor: "pointer",
        transition: "color 150ms",
      }}>{ch?.name}</div>

      {/* Notes — shown at character's first appearance when toggled on */}
      {charNotes.length > 0 && (
        <div style={{
          margin: "0 32px 16px",
          padding: "10px 14px",
          background: "rgba(201,168,106,0.05)",
          border: "1px solid var(--gold-line)",
          borderRadius: 2,
        }}>
          <div style={{
            fontFamily: "var(--font-serif-en)", fontVariant: "small-caps",
            fontSize: 9.5, letterSpacing: "0.2em",
            color: "var(--gold-dim)", textTransform: "uppercase",
            marginBottom: 6,
          }}>Notae · {ch?.name}</div>
          {charNotes.map(n => (
            <div key={n.id} style={{
              fontFamily: "var(--font-body)", fontSize: 12,
              color: "var(--text-secondary)", lineHeight: 1.7,
              letterSpacing: "0.04em",
              paddingLeft: 10,
              borderLeft: "2px solid var(--gold-line)",
              marginBottom: 4,
            }}>「{n.text}」</div>
          ))}
        </div>
      )}

      {/* original — italic Cormorant — 只在有原文時顯示 */}
      {block.original && block.original.trim() && (
        <div style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 16.5,
          color: "var(--cream)",
          lineHeight: 1.85,
          margin: "0 32px 6px",
          textAlign: "left",
        }}>「{block.original}」</div>
      )}
      {/* translation — Noto Serif TC, slightly dimmer — 只在有中譯時顯示 */}
      {block.zh && block.zh.trim() && (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 14.5,
          color: "var(--cream)", opacity: 0.78,
          lineHeight: 1.85,
          margin: "0 32px 4px",
          letterSpacing: "0.04em",
        }}>「{block.zh}」</div>
      )}
      {/* tags — hover only */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 4,
        margin: "8px 32px 0",
        opacity: hover ? 0.65 : 0,
        transform: hover ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 160ms, transform 160ms",
      }}>
        {(block.tags || []).map(([t, k], i) => (
          <span key={i} style={{
            display: "inline-block",
            fontFamily: "var(--font-body)",
            fontSize: 10.5,
            padding: "1px 7px",
            borderRadius: 10,
            background: TAG_PALETTE[k].bg,
            color: TAG_PALETTE[k].fg,
            border: `1px solid ${TAG_PALETTE[k].bd}`,
            letterSpacing: "0.04em",
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ============= APP =============
function WorkSwitcher({ currentId, onSwitch }) {
  if (WORK_INDEX.length <= 1) return null;
  return (
    <select value={currentId} onChange={e => onSwitch(e.target.value)}
      style={{
        position: "absolute", top: 10, right: 120, zIndex: 100,
        background: "var(--navy-deep)", border: "1px solid var(--gold-line)",
        color: "var(--gold)", padding: "4px 24px 4px 10px",
        fontFamily: "var(--font-serif-tc)", fontSize: 12,
        borderRadius: 2, outline: "none", cursor: "pointer", appearance: "none",
        backgroundImage: "linear-gradient(45deg, transparent 50%, var(--gold-dim) 50%), linear-gradient(135deg, var(--gold-dim) 50%, transparent 50%)",
        backgroundPosition: "calc(100% - 12px) 50%, calc(100% - 7px) 50%",
        backgroundSize: "5px 5px", backgroundRepeat: "no-repeat",
      }}>
      {WORK_INDEX.map(w => <option key={w.id} value={w.id}>{w.title}（{w.titleEn}）</option>)}
    </select>
  );
}

function App() {
  const [tab, setTab] = React.useState("write"); // Phase 17 v2-2: Write is now the default first TAB
  const [currentWork, setCurrentWork] = React.useState(WORKS[0]?.id || "lohengrin");
  const [loading, setLoading] = React.useState(false);
  const [blocks, setBlocks] = React.useState(() => loadBlocksFromStorage() || SCRIPT);
  const goBack = () => { window.location.href = "../../index.html"; };

  // Persist blocks to localStorage on change (debounced)
  const saveRef = React.useRef(debounce(saveBlocksToStorage, 800));
  React.useEffect(() => { saveRef.current(blocks); }, [blocks]);

  // localStorage bridge: search → editor block focus
  const goToBlock = (blockId) => {
    localStorage.setItem("sw_focusBlock", blockId);
    setTab("editor");
  };

  const switchWork = async (workId) => {
    if (workId === currentWork) return;
    setLoading(true);
    // Flush pending debounced save before work switch to prevent writing to wrong key
    saveRef.current.flush(blocks);
    try {
      await loadAllData(workId);
      setBlocks(loadBlocksFromStorage() || SCRIPT);
      setCurrentWork(workId);
      setTab("reader");
    } catch (e) { console.error("Work load failed:", e); }
    setLoading(false);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      position: "relative",
    }}>
      <SwHeader tab={tab} setTab={setTab} onBack={goBack} />
      <WorkSwitcher currentId={currentWork} onSwitch={switchWork} />
      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 200,
          background: "rgba(13,17,25,0.8)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-serif-en)", fontSize: 16,
          color: "var(--gold)", letterSpacing: "0.1em",
        }}>Loading…</div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "swFade 200ms ease" }} key={tab + currentWork}>
        {tab === "write"  && <WriteTab  blocks={blocks} setBlocks={setBlocks} characters={CHARACTERS} />}
        {tab === "search" && <SearchView blocks={blocks} characters={CHARACTERS} goToEditor={() => setTab("editor")} goToReader={() => setTab("reader")} goToBlock={goToBlock} />}
        {tab === "editor" && <EditorView blocks={blocks} setBlocks={setBlocks} />}
        {tab === "reader" && <ReaderView blocks={blocks} goToBlock={goToBlock} />}
      </div>
    </div>
  );
}

// Mount logic moved to main.jsx. Export App + loader for Vite entry.
export default App;
export { loadAllData };
