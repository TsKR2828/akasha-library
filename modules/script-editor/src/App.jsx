/* Script Workshop · v2 — three-tab edition.
   Search | Editor | Reader (new).
   Reader view = black-box theater script reading.

   Phase 17 v2 (Archive-host merge): migrated from React CDN + Babel Standalone
   to Vite + ES modules. Data folder served from public/data/ → ./data/. */

import React from "react";
import WriteTab from "./components/WriteTab.jsx";
import { useCharactersOfWork } from "./hooks/useCharactersOfWork.js";
import { parsePlainScript, blocksToPlainScript } from "./lib/parser.js";
import { MSG_TYPES } from "../../../core/export/bridge.js";

// ============= DATA (loaded from ./data/ JSONL via Vite public folder) =============
const DATA_BASE = "./data";
let WORKS = [];
let CHAR_COLORS = {};
let CHARACTERS = [];
let SCRIPT = [];

// Default seed for new custom works — parsed synchronously in switchWork
// to guarantee blocks persist before any debounce timing race.
// (Comment line intentionally omitted: it's lost in blocks round-trip anyway.)
const DEFAULT_SEED = `#scene：第一幕 · 第一場
旁白：（在此描述場景氛圍與舞台指示。）
角色A：對白範例——直接輸入角色名加冒號。
角色B：（表情）第二位角色的台詞。
#bgm：背景音樂標記`;

const DEFAULT_SCENE_LABEL_TEMPLATE = "Act {act} · Scene {scene}";

function formatSceneLabel(template, fields = {}) {
  const source = template || DEFAULT_SCENE_LABEL_TEMPLATE;
  const valueFor = (key) => fields[key] ?? "";
  const rendered = source.replace(/\{(\w+)\}/g, (_, key) => String(valueFor(key))).trim();
  if (rendered || !template) return rendered;
  return DEFAULT_SCENE_LABEL_TEMPLATE.replace(/\{(\w+)\}/g, (_, key) => String(valueFor(key))).trim();
}

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


let WORK_INDEX = []; // [{id, title, titleEn, author}]

// ── Custom works (localStorage) ──
function getCustomWorks() {
  try { return JSON.parse(localStorage.getItem("sw_custom_works") || "[]"); }
  catch { return []; }
}
function saveCustomWorks(works) {
  localStorage.setItem("sw_custom_works", JSON.stringify(works));
}

function titleFromFilename(filename) {
  return (filename || "Imported Script").replace(/\.[^.]+$/, "").trim() || "Imported Script";
}

function createImportedWork(filename) {
  const title = titleFromFilename(filename);
  const id = "import_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  return { id, title, titleEn: title, author: "Imported" };
}

async function loadWorkIndex() {
  const base = DATA_BASE;
  try {
    const res = await fetch(`${base}/index.json`);
    WORK_INDEX = await res.json();
  } catch { WORK_INDEX = [{ id: "lohengrin", title: "羅恩格林", titleEn: "Lohengrin", author: "Richard Wagner" }]; }
  // Merge localStorage custom works
  const custom = getCustomWorks();
  custom.forEach(cw => {
    if (!WORK_INDEX.find(w => w.id === cw.id)) {
      WORK_INDEX.push({ ...cw, _custom: true });
    }
  });
}

async function loadAllData(workId = "lohengrin") {
  const base = DATA_BASE;
  await loadWorkIndex();

  // Custom (localStorage-only) work — no server data to fetch
  const isCustomWork = WORK_INDEX.find(w => w.id === workId)?._custom;
  if (isCustomWork) {
    const cwMeta = getCustomWorks().find(w => w.id === workId) || { id: workId, title: workId, titleEn: workId, author: "" };
    WORKS = [{
      id: cwMeta.id, title: cwMeta.title, titleEn: cwMeta.titleEn,
      composer: cwMeta.author, license: "unchecked", synopsis: "",
      premiereYear: "", setting: "", copyrightNote: "", acts: 0,
      genreLabel: "Custom", actsLabel: "",
      sceneLabelTemplate: cwMeta.sceneLabelTemplate || "",
    }];
    CHARACTERS = [];
    CHAR_COLORS = {};
    SCRIPT = [];
    return { works: WORKS, characters: CHARACTERS, charColors: CHAR_COLORS, script: SCRIPT, workIndex: WORK_INDEX };
  }

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
    actsLabel: work.acts_label || (work.acts ? `${work.acts} Acts` : ""),
    sceneLabelTemplate: work.scene_label_template || "",
  }];

  const sceneSubtitles = work.scene_subtitles || {};
  const sceneLabelTemplate = work.scene_label_template || "";

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
        act: formatSceneLabel(sceneLabelTemplate, line),
        subtitle: sceneSubtitles[sceneKey] || "",
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

  return { works: WORKS, characters: CHARACTERS, charColors: CHAR_COLORS, script: SCRIPT, workIndex: WORK_INDEX };
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
    chevronUp: <><path d="M6 14l6-6 6 6" /></>,
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
    send: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
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

function validateBlock(block, characters = [], blocks = []) {
  const errors = [];
  // Common checks
  if (!block.id) errors.push("缺少 id");
  if (block.id && !SAFE_ID_RE.test(block.id)) errors.push(`id「${block.id}」含有不安全字元（僅允許英數、_、-）`);
  if (!block.type) errors.push("缺少 type");
  if (block.type && !VALID_BLOCK_TYPES.includes(block.type)) errors.push(`未知 type「${block.type}」`);

  // Type-specific checks
  if (block.type === "dialogue") {
    if (!block.isUnknown) {
      if (!block.speakerId) errors.push("缺少 speakerId");
      if (block.speakerId) {
        if (characters.length === 0) {
          errors.push("角色表為空，無法驗證 speakerId");
        } else if (!characters.find(c => c.id === block.speakerId)) {
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
    else if (block.options.length === 0) errors.push("選項不可為空（至少一個）");
    else {
      const sceneIds = new Set(blocks.filter(b => b.type === "scene").map(b => b.id));
      block.options.forEach((opt, i) => {
        if (!opt.text) errors.push(`選項 ${i + 1} 文字為空`);
        if (!opt.nextBlockId) errors.push(`選項 ${i + 1} 未指定跳轉目標`);
        else if (sceneIds.size > 0 && !sceneIds.has(opt.nextBlockId)) errors.push(`選項 ${i + 1} 指向不存在的場次「${opt.nextBlockId}」`);
      });
    }
  }
  if (block.type === "command") {
    if (!block.command) errors.push("缺少指令名稱");
    if (!block.value) errors.push("缺少指令值");
  }

  return errors;
}

function validateBlocks(blocks, characters = []) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: false, results: [{ index: 0, id: "(file)", errors: ["匯入資料不是有效的 block 陣列"] }] };
  }
  const results = [];
  blocks.forEach((b, i) => {
    if (b === null || typeof b !== "object" || Array.isArray(b)) {
      results.push({ index: i, id: `(line ${i + 1})`, errors: [`項目不是有效物件（收到 ${Array.isArray(b) ? "array" : typeof b}）`] });
      return;
    }
    const errs = validateBlock(b, characters);
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
function loadNotes(workId) {
  try {
    const raw = localStorage.getItem(`notes_${workId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("[Archive] 筆記資料解析失敗，已重設為空白:", e);
    alert("⚠️ 本機筆記資料損壞，無法解析。筆記已重設為空白。\n（原始資料仍保留在 localStorage 中）");
    return {};
  }
}

function saveNotes(notes, workId) {
  try {
    localStorage.setItem(`notes_${workId}`, JSON.stringify(notes));
  } catch (e) {
    console.error("[Archive] 筆記儲存失敗:", e);
    alert("⚠️ 筆記儲存失敗：本機儲存空間不足。\n請清除不需要的立繪或匯出備份後重試。");
  }
}

function useNotes(workId) {
  const [notes, setNotes] = React.useState(() => loadNotes(workId));

  const addNote = (charId, text) => {
    setNotes(prev => {
      const arr = prev[charId] || [];
      const next = { ...prev, [charId]: [...arr, { id: Date.now().toString(36), text, ts: Date.now() }] };
      saveNotes(next, workId);
      return next;
    });
  };

  const updateNote = (charId, noteId, text) => {
    setNotes(prev => {
      const arr = (prev[charId] || []).map(n => n.id === noteId ? { ...n, text } : n);
      const next = { ...prev, [charId]: arr };
      saveNotes(next, workId);
      return next;
    });
  };

  const removeNote = (charId, noteId) => {
    if (!window.confirm("確定刪除此筆記？此操作無法復原。")) return;
    setNotes(prev => {
      const arr = (prev[charId] || []).filter(n => n.id !== noteId);
      const next = { ...prev, [charId]: arr };
      saveNotes(next, workId);
      return next;
    });
  };

  return { notes, addNote, updateNote, removeNote };
}

// ============= AUTO-POPULATE CHARACTERS FROM BLOCKS =============
function populateCharsFromBlocks(loadedBlocks, existingChars = []) {
  if (existingChars.length > 0) {
    // Start with existing characters, then add unknown speakers from blocks
    const existingIds = new Set(existingChars.map(c => c.id));
    const existingNames = new Set(existingChars.flatMap(c => [c.name, c.nameEn, c.id].filter(Boolean)));
    const extras = [];
    for (const b of (loadedBlocks || [])) {
      if (b.type !== "dialogue") continue;
      const id = b.speakerId || b.speaker;
      if (!id || existingIds.has(id) || existingNames.has(id)) continue;
      existingIds.add(id);
      extras.push({
        id, name: b.speaker || id, nameEn: b.speaker || id,
        voice: "", role: "", relations: "", tone: "",
        tags: [], notes: [], _auto: true,
      });
    }
    const chars = [...existingChars, ...extras];
    const colors = {};
    chars.forEach((c, i) => {
      colors[c.id] = PREDEFINED_COLORS[c.id] || `hsl(${(i * 47) % 360}, 45%, 55%)`;
    });
    CHARACTERS = chars; CHAR_COLORS = colors;
    return { characters: chars, charColors: colors };
  }
  if (!loadedBlocks || loadedBlocks.length === 0) {
    CHARACTERS = []; CHAR_COLORS = {};
    return { characters: [], charColors: {} };
  }
  const seen = new Map();
  loadedBlocks.forEach(b => {
    if (b.type !== "dialogue") return;
    const id = b.speakerId || b.speaker;
    if (!id || seen.has(id)) return;
    seen.set(id, {
      id, name: b.speaker || b.speakerId || id,
      nameEn: b.speaker || b.speakerId || id,
      voice: "", role: "", relations: "", tone: "",
      tags: [], notes: [],
    });
  });
  const chars = [...seen.values()];
  const colors = {};
  chars.forEach((c, i) => {
    colors[c.id] = PREDEFINED_COLORS[c.id] || `hsl(${(i * 47) % 360}, 45%, 55%)`;
  });
  CHARACTERS = chars; CHAR_COLORS = colors;
  return { characters: chars, charColors: colors };
}

// ============= BLOCKS localStorage PERSISTENCE =============
function loadBlocksFromStorage(workId) {
  try {
    const raw = localStorage.getItem(`blocks_${workId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("[Archive] blocks 資料解析失敗，將使用原始 SCRIPT:", e);
    alert("⚠️ 本機稿件資料損壞，無法解析。將使用原始資料載入。\n（原始資料仍保留在 localStorage 中）");
    return null;
  }
}

function saveBlocksToStorage(blocks, workId) {
  if (!workId) return;
  try {
    localStorage.setItem(`blocks_${workId}`, JSON.stringify(blocks));
  } catch (e) {
    console.error("[Archive] localStorage 寫入失敗:", e);
    alert("⚠️ 儲存失敗：本機儲存空間不足。\n請清除不需要的立繪或匯出備份後重試。");
  }
}

function saveWriteDraft(text, workId) {
  if (!workId) return;
  try {
    localStorage.setItem(`sw_write_draft_v1_${workId}`, text);
  } catch {}
}

// ============= CHARACTERS localStorage PERSISTENCE =============
function loadCustomCharacters(workId) {
  try {
    const raw = localStorage.getItem(`characters_${workId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCustomCharacters(characters, workId) {
  if (!workId) return;
  localStorage.setItem(`characters_${workId}`, JSON.stringify(characters));
}

// ============= BLOCK HISTORY (snapshot / rollback) =============
const HISTORY_MAX = 15;
function historyKey(workId) { return `sw_history_v1_${workId}`; }

function loadHistory(workId) {
  try {
    const raw = localStorage.getItem(historyKey(workId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushHistoryEntry(workId, blocks, label) {
  try {
    const entries = loadHistory(workId);
    entries.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      label,
      blockCount: blocks.length,
      blocks,
    });
    if (entries.length > HISTORY_MAX) entries.length = HISTORY_MAX;
    localStorage.setItem(historyKey(workId), JSON.stringify(entries));
    return entries;
  } catch (e) {
    console.error("[Archive] 歷史紀錄寫入失敗:", e);
    return loadHistory(workId);
  }
}

function clearHistory(workId) {
  localStorage.removeItem(historyKey(workId));
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

// ============= DESKBAR (module's only chrome row — HANDOFF §5) =============
// No module title/subtitle/brand row here (rule: iframes render zero self-drawn
// titles). LEFT = 4-mode seg (速寫/搜尋/編輯/閱讀, the existing top-level tab
// switcher). RIGHT = 作品切換▾ + 從劇本回填 + 範例 + 清空 + 更多▾（說明／AI）.
function SwHeader({ tab, setTab, onAI, workSwitcher, isScriptMode, canLoadFromBlocks, onLoadFromBlocks, onLoadSeed, onClearDraft }) {
  const tabs = [
    { id: "write",  tc: "速寫" },
    { id: "search", tc: "搜尋" },
    { id: "editor", tc: "編輯" },
    { id: "reader", tc: "閱讀" },
  ];
  const [moreOpen, setMoreOpen] = React.useState(false);
  React.useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [moreOpen]);

  return (
    <header className="deskbar" style={{
      "--zone-ink": "var(--ink-dramaturgica)",
      "--zone-ink-glow": "rgba(201,168,106,0.14)",
      "--zone-ink-line": "rgba(201,168,106,0.32)",
    }}>
      <span className="seg" role="tablist" aria-label="劇本工房模式">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={"seg__opt" + (tab === t.id ? " is-active" : "")}
            onClick={() => setTab(t.id)}>{t.tc}</button>
        ))}
      </span>

      <span className="desk-spacer" />

      <div className="desk-actions">
        {workSwitcher}
        {tab === "write" && isScriptMode && (
          <>
            <button type="button" className="btn" disabled={!canLoadFromBlocks}
              onClick={onLoadFromBlocks} title="從 Editor/Reader 的劇本載入到速寫區">從劇本回填</button>
            <button type="button" className="btn" onClick={onLoadSeed} title="以範例覆蓋草稿">範例</button>
          </>
        )}
        {tab === "write" && (
          <button type="button" className="btn btn--danger" onClick={onClearDraft} title="清除草稿">清空</button>
        )}
        <div className="mh-more">
          <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setMoreOpen(o => !o); }}>更多 ▾</button>
          <div className={"mh-menu" + (moreOpen ? " open" : "")} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn" onClick={() => { setMoreOpen(false); onAI(); }}>召喚圖書館員 · AI</button>
            <button type="button" className="btn" onClick={() => { setMoreOpen(false); alert("劇本工房 — 戲劇文本資料庫與劇本編輯器。\n\n快捷鍵：\n• Alt+1~9 快速插入角色（單擊 slot 指派）\n• 雙擊 slot 插入前綴\n• 編輯器內可匯入 / 匯出 JSONL\n• 閱讀模式支援 PDF 匯出（公共領域作品）"); }}>說明</button>
          </div>
        </div>
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
function SearchView({ blocks, characters, charColors, work, goToEditor, goToReader, goToBlock }) {
  const allCharacters = useCharactersOfWork(blocks, characters);
  const [filters, setFilters] = React.useState({
    q: "", work: "", character: "", plot: "", emotion: "", license: "",
  });

  const searchable = React.useMemo(() => {
    return blocks
      .filter(b => b.type === "dialogue" || b.type === "narration" || b.type === "scene")
      .map(b => {
        if (b.type === "narration") return { ...b, speakerId: "__narration__", original: "", zh: b.text || "", tags: b.tags || [], _isNarration: true };
        if (b.type === "scene") return { ...b, speakerId: "__scene__", original: "", zh: (b.act || "") + (b.subtitle ? " — " + b.subtitle : ""), tags: [], _isScene: true };
        return b;
      });
  }, [blocks]);
  const filtered = React.useMemo(() => {
    return searchable.filter(r => {
      const ch = allCharacters.find(c => c.id === r.speakerId);
      const textPool = (r.original + r.zh + (ch?.name || "") + (r.text || "")).toLowerCase();
      if (filters.q && !textPool.includes(filters.q.toLowerCase())) return false;
      if (filters.work && (r.workId || work?.id) !== filters.work) return false;
      if (filters.character && r.speakerId !== filters.character) return false;
      if (filters.plot && !(r.tags || []).some(([t, k]) => k === "plot" && t.includes(filters.plot))) return false;
      if (filters.emotion && !(r.tags || []).some(([t, k]) => k === "emotion" && t.includes(filters.emotion))) return false;
      if (filters.license) {
        if (work && work.license !== filters.license) return false;
      }
      return true;
    });
  }, [filters, blocks]);

  const checkExportLicense = () => {
    if (work && work.license !== "public-domain" && work.license !== "fair-use") {
      alert(`版權狀態「${work.license || "unchecked"}」不允許全文匯出。\n僅 public-domain 與 fair-use 作品可匯出。`);
      return false;
    }
    return true;
  };

  const exportMarkdown = () => {
    if (!checkExportLicense()) return;
    const lines = filtered.map(r => {
      if (r._isNarration) return `### 旁白\n*${r.zh}*`;
      if (r._isScene) return `---\n## ${r.zh}`;
      const ch = allCharacters.find(c => c.id === r.speakerId);
      return `### ${ch?.name || r.speakerId}\n> ${r.original}\n\n${r.zh}\n\nTags: ${(r.tags || []).map(([t]) => t).join(", ")}`;
    });
    downloadFile("search-results.md", lines.join("\n\n---\n\n"));
  };

  const exportCsv = () => {
    if (!checkExportLicense()) return;
    const header = "LineID,Type,Speaker,Original,Translation,Tags";
    const rows = filtered.map(r => {
      const speaker = r._isNarration ? "旁白" : r._isScene ? "場景" : ((allCharacters.find(c => c.id === r.speakerId))?.name || r.speakerId);
      const tags = (r.tags || []).map(([t]) => t).join("; ");
      return `"${r.lineId || ""}","${r.type}","${speaker}","${(r.original || "").replace(/"/g, '""')}","${(r.zh || "").replace(/"/g, '""')}","${tags}"`;
    });
    downloadFile("search-results.csv", [header, ...rows].join("\n"), "text/csv");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* Filter Bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "color-mix(in srgb, var(--navy-deep) 88%, transparent)",
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
            options={[["", "全部作品"], ...(work ? [[work.id, `${work.title} · ${work.titleEn}`]] : [])]} />
          <SwSelect value={filters.character} onChange={v => setFilters({ ...filters, character: v })}
            options={[["", "全部角色"], ["__narration__", "旁白 · Narration"], ["__scene__", "場景 · Scene"], ...allCharacters.map(c => [c.id, `${c.name} · ${c.nameEn}`])]} />
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
        }}>{filtered.length} matches in {work?.title || "—"}</span>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 28px 80px" }}>
        {filtered.length === 0 ? <EmptyState /> :
          filtered.map(r => <ResultCard key={r.id} r={r} characters={allCharacters} charColors={charColors} work={work} onClick={() => goToBlock(r.id)} />)}
      </div>

      {/* Export Bar */}
      {filtered.length > 0 && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20,
          background: "color-mix(in srgb, var(--navy-deep) 94%, transparent)", backdropFilter: "blur(8px)",
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

function ResultCard({ r, characters, charColors = {}, work, onClick }) {
  const [hover, setHover] = React.useState(false);
  const isNarr = r._isNarration;
  const isScene = r._isScene;
  const ch = (!isNarr && !isScene) ? (characters || []).find(c => c.id === r.speakerId) : null;
  const charColor = isNarr ? "var(--text-secondary)" : isScene ? "var(--success)" : (charColors[r.speakerId] || "var(--gold-dim)");
  const speakerLabel = isNarr ? "旁白" : isScene ? "場景" : (ch?.name || r.speakerId);
  const speakerLabelEn = isNarr ? "Narration" : isScene ? "Scene" : (ch?.nameEn || "");
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: "var(--navy-light)",
        border: "1px solid var(--navy-hover)",
        borderLeft: `3px solid ${hover ? charColor : "var(--gold-dim)"}`,
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
        }}>{work?.title || "—"}</span>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontStyle: "italic",
          fontSize: 11.5, color: "var(--gold-deep)",
        }}>{work?.titleEn || ""}</span>
        <span style={{ width: 1, height: 14, background: "var(--navy-line)" }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: isScene ? "var(--success)" : "var(--text-tertiary)", letterSpacing: "0.08em",
        }}>{isScene ? "SCENE" : isNarr ? "NARRATION" : `#${r.lineId || ""}`}</span>
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
          <span>{isNarr || isScene ? "type:" : "speaker:"}</span>
          <span style={{ color: "var(--gold-dim)" }}>{speakerLabelEn}</span>
          <span>·</span>
          <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--cream-dim)" }}>{speakerLabel}</span>
        </div>
        {!isNarr && !isScene && r.original && r.original.trim() && (
          <div style={{
            fontFamily: "var(--font-serif-en)", fontStyle: "italic",
            fontSize: 14.5, lineHeight: 1.7, color: "var(--cream)",
            marginBottom: 4,
          }}>「{r.original}」</div>
        )}
        {r.zh && r.zh.trim() && (
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 13,
            lineHeight: 1.7, color: "var(--cream)", opacity: isNarr ? 0.7 : 0.85,
            marginBottom: 12, letterSpacing: "0.04em",
            fontStyle: isNarr ? "italic" : "normal",
            borderLeft: isNarr ? "2px solid var(--gold-dim)" : isScene ? "2px solid var(--success)" : "none",
            paddingLeft: (isNarr || isScene) ? 12 : 0,
          }}>{isScene ? r.zh : `「${r.zh}」`}</div>
        )}
        {!isScene && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(r.tags || []).map(([t, k], i) => <Tag key={i} kind={k}>{t}</Tag>)}
        </div>}
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

function SpritePreview({ block, characters, charColors = {} }) {
  const ch = characters.find(c => c.id === block?.speakerId);
  const avg = block?.avg || {};
  const posX = { left: "15%", center: "50%", right: "85%" }[avg.position || "center"];
  return (
    <div style={{
      width: "100%", aspectRatio: "16/9",
      background: "linear-gradient(180deg, var(--navy) 0%, var(--navy-deep) 100%)",
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
            background: charColors[block?.speakerId] || "var(--gold-dim)",
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
function TableForge({ blocks, characters = [], charColors = {}, onUpdateBlock, onClose }) {
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
          options={[["", "全部角色"], ...characters.map(c => [c.id, c.name])]} />
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
              const ch = characters.find(c => c.id === b.speakerId);
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
                        {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5, cursor: "text",
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: charColors[b.speakerId] || "var(--gold-dim)",
                        }} />
                        <span style={{
                          fontFamily: "var(--font-serif-tc)", fontSize: 12,
                          color: "var(--cream-dim)", letterSpacing: "0.04em",
                        }}>{ch?.name || b.speaker || b.speakerId || "???"}</span>
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
    // Add each name part (e.g. "弗里德里希", "馮", "泰拉蒙德")
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

function loadCustomEdges(workId) {
  try { const raw = localStorage.getItem(`edges_${workId}`); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveCustomEdges(edges, workId) {
  if (!workId) return;
  localStorage.setItem(`edges_${workId}`, JSON.stringify(edges));
}

function RelationshipGraph({ onClose, characters: charsProp, charColors = {}, setCharacters, workId }) {
  const chars = charsProp || [];
  const canvasRef = React.useRef(null);
  const [nodes, setNodes] = React.useState([]);
  const [edges, setEdges] = React.useState([]);
  const [customEdges, setCustomEdges] = React.useState(() => loadCustomEdges(workId));
  const [hoveredNode, setHoveredNode] = React.useState(null);
  const [selectedNode, setSelectedNode] = React.useState(null);
  const [dragging, setDragging] = React.useState(null);
  const [dim, setDim] = React.useState({ w: 800, h: 600 });
  const [editMode, setEditMode] = React.useState(false);
  const [addEdgeOpen, setAddEdgeOpen] = React.useState(false);
  const [addFrom, setAddFrom] = React.useState("");
  const [addTo, setAddTo] = React.useState("");
  const [addLabel, setAddLabel] = React.useState("");
  const [editingEdge, setEditingEdge] = React.useState(null); // index in allEdges
  const [editLabel, setEditLabel] = React.useState("");
  const animRef = React.useRef(null);
  const nodesRef = React.useRef([]);

  // Merge parsed + custom edges
  const allEdges = React.useMemo(() => {
    const parsed = parseRelationshipEdges(chars).map(e => ({ ...e, _source: "parsed" }));
    const custom = customEdges.map(e => ({ ...e, _source: "custom" }));
    return [...parsed, ...custom];
  }, [chars, customEdges]);

  // Persist custom edges
  React.useEffect(() => { saveCustomEdges(customEdges, workId); }, [customEdges, workId]);

  // Initialize graph
  React.useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (container) {
      setDim({ w: container.clientWidth, h: container.clientHeight });
    }

    const cx = (container?.clientWidth || 800) / 2;
    const cy = (container?.clientHeight || 600) / 2;
    const radius = Math.min(cx, cy) * 0.55;

    const initNodes = chars.map((c, i) => {
      const angle = (2 * Math.PI * i) / chars.length - Math.PI / 2;
      return {
        id: c.id, name: c.name, nameEn: c.nameEn, voice: c.voice, role: c.role,
        x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle),
        vx: 0, vy: 0, color: charColors[c.id] || "var(--gold)",
      };
    });

    nodesRef.current = initNodes;
    setNodes(initNodes);
    setEdges(allEdges);

    let frame = 0;
    const MAX_FRAMES = 200;
    const simulate = () => {
      const ns = nodesRef.current;
      const W = container?.clientWidth || 800;
      const H = container?.clientHeight || 600;
      const centerX = W / 2, centerY = H / 2;

      ns.forEach(n => { n.fx = 0; n.fy = 0; });
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          let dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const repulse = 18000 / (dist * dist);
          ns[i].fx -= (dx / dist) * repulse; ns[i].fy -= (dy / dist) * repulse;
          ns[j].fx += (dx / dist) * repulse; ns[j].fy += (dy / dist) * repulse;
        }
      }
      allEdges.forEach(e => {
        const a = ns.find(n => n.id === e.from), b = ns.find(n => n.id === e.to);
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const attract = (dist - 160) * 0.04;
        a.fx += (dx / dist) * attract; a.fy += (dy / dist) * attract;
        b.fx -= (dx / dist) * attract; b.fy -= (dy / dist) * attract;
      });
      ns.forEach(n => { n.fx += (centerX - n.x) * 0.005; n.fy += (centerY - n.y) * 0.005; });
      const damping = 0.88;
      ns.forEach(n => {
        if (n.pinned) return;
        n.vx = (n.vx + n.fx) * damping; n.vy = (n.vy + n.fy) * damping;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(40, Math.min(W - 40, n.x)); n.y = Math.max(40, Math.min(H - 40, n.y));
      });
      frame++;
      setNodes([...ns]);
      if (frame < MAX_FRAMES) animRef.current = requestAnimationFrame(simulate);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(simulate);
    return () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; } };
  }, []);

  // Update edges when customEdges change (after init)
  React.useEffect(() => { setEdges(allEdges); }, [allEdges]);

  // Drag handlers
  const handleMouseDown = (e, nodeId) => {
    e.preventDefault();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) { node.pinned = true; setDragging(nodeId); setSelectedNode(nodeId); }
  };
  const handleMouseMove = (e) => {
    if (!dragging) return;
    const svg = canvasRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const node = nodesRef.current.find(n => n.id === dragging);
    if (node) { node.x = e.clientX - rect.left; node.y = e.clientY - rect.top; node.vx = 0; node.vy = 0; setNodes([...nodesRef.current]); }
  };
  const handleMouseUp = () => {
    if (dragging) { const node = nodesRef.current.find(n => n.id === dragging); if (node) node.pinned = false; setDragging(null); }
  };

  const isConnected = (nodeId) => {
    if (!selectedNode) return true;
    if (nodeId === selectedNode) return true;
    return edges.some(e => (e.from === selectedNode && e.to === nodeId) || (e.to === selectedNode && e.from === nodeId));
  };
  const isEdgeHighlighted = (edge) => !selectedNode || edge.from === selectedNode || edge.to === selectedNode;

  // ── Edge CRUD ──
  const handleAddEdge = () => {
    if (!addFrom || !addTo || addFrom === addTo || !addLabel.trim()) return;
    setCustomEdges(prev => [...prev, { from: addFrom, to: addTo, label: addLabel.trim() }]);
    setAddFrom(""); setAddTo(""); setAddLabel(""); setAddEdgeOpen(false);
  };

  const handleEditEdgeSave = () => {
    if (editingEdge == null || !editLabel.trim()) { setEditingEdge(null); return; }
    const edge = allEdges[editingEdge];
    if (edge._source === "custom") {
      // Find index in customEdges
      const ci = customEdges.findIndex(e => e.from === edge.from && e.to === edge.to && e.label === edge.label);
      if (ci >= 0) setCustomEdges(prev => { const next = [...prev]; next[ci] = { ...next[ci], label: editLabel.trim() }; return next; });
    }
    // For parsed edges: update character relations string
    if (edge._source === "parsed" && setCharacters) {
      setCharacters(prev => prev.map(c => {
        if (c.id !== edge.from && c.id !== edge.to) return c;
        const rels = (c.relations || "").split("、").map(r => r === edge.label ? editLabel.trim() : r).join("、");
        return { ...c, relations: rels };
      }));
      if (workId) saveCustomCharacters(chars.map(c => {
        if (c.id !== edge.from && c.id !== edge.to) return c;
        const rels = (c.relations || "").split("、").map(r => r === edge.label ? editLabel.trim() : r).join("、");
        return { ...c, relations: rels };
      }), workId);
    }
    setEditingEdge(null);
  };

  const handleDeleteEdge = (idx) => {
    const edge = allEdges[idx];
    if (edge._source === "custom") {
      const ci = customEdges.findIndex(e => e.from === edge.from && e.to === edge.to && e.label === edge.label);
      if (ci >= 0) setCustomEdges(prev => prev.filter((_, i) => i !== ci));
    }
    setEditingEdge(null);
  };

  const hoveredChar = hoveredNode ? chars.find(c => c.id === hoveredNode) : null;
  const charName = (id) => { const c = chars.find(c => c.id === id); return c ? c.name.replace(/（.*）/, "").split("·")[0].trim() : id; };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "color-mix(in srgb, var(--navy-deep) 96%, transparent)", backdropFilter: "blur(8px)",
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
        }}>{chars.length} nodes · {edges.length} edges</span>
        <span style={{ flex: 1 }} />
        <SwBtn icon={editMode ? "check" : "pen"} size="sm"
          onClick={() => setEditMode(!editMode)}
          style={editMode ? { background: "rgba(201,168,106,0.15)", borderColor: "var(--gold)" } : undefined}
        >{editMode ? "完成" : "編輯"}</SwBtn>
        {editMode && <SwBtn icon="plus" size="sm" onClick={() => setAddEdgeOpen(true)}>新增關係</SwBtn>}
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 11,
          color: "var(--text-tertiary)", letterSpacing: "0.04em",
        }}>{editMode ? "點擊邊標籤可編輯" : "拖曳移動 · 點擊聚焦"}</span>
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      {/* Add Edge Dialog */}
      {addEdgeOpen && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 110, background: "var(--navy)", border: "1px solid var(--gold-line)",
          borderRadius: 4, padding: "20px 24px", minWidth: 320,
          boxShadow: "var(--shadow-lift)", animation: "swFade 100ms ease",
        }}>
          <div style={{ fontFamily: "var(--font-serif-en)", fontSize: 12, letterSpacing: "0.18em",
            color: "var(--gold)", textTransform: "uppercase", marginBottom: 12 }}>Add Relation</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={addFrom} onChange={e => setAddFrom(e.target.value)}
              style={{ padding: "6px 8px", background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
                borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 12 }}>
              <option value="">— 來源角色 —</option>
              {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={addTo} onChange={e => setAddTo(e.target.value)}
              style={{ padding: "6px 8px", background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
                borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 12 }}>
              <option value="">— 目標角色 —</option>
              {chars.filter(c => c.id !== addFrom).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="text" value={addLabel} onChange={e => setAddLabel(e.target.value)}
              placeholder="關係描述（如：敵對、師徒、戀人）"
              style={{ padding: "6px 8px", background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
                borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 12 }}
              onKeyDown={e => { if (e.key === "Enter") handleAddEdge(); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <SwBtn icon="check" size="sm" onClick={handleAddEdge}>新增</SwBtn>
              <SwBtn icon="close" size="sm" onClick={() => setAddEdgeOpen(false)}>取消</SwBtn>
            </div>
          </div>
        </div>
      )}

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
            const isCustom = e._source === "custom";
            const isEditing = editingEdge === i;
            return (
              <g key={`${e.from}-${e.to}-${i}`} opacity={highlighted ? 1 : 0.15}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isCustom ? "var(--gold)" : (highlighted ? "var(--gold-dim)" : "var(--navy-line)")}
                  strokeWidth={highlighted ? 1.5 : 1}
                  strokeDasharray={isCustom ? "6 3" : (highlighted ? undefined : "4 3")}
                />
                {/* Edge label — clickable in edit mode */}
                <text x={mx} y={my - 6}
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-body)", fontSize: 10,
                    fill: isEditing ? "var(--gold-bright)" : (highlighted ? "var(--cream-dim)" : "var(--text-tertiary)"),
                    letterSpacing: "0.04em",
                    pointerEvents: editMode ? "auto" : "none",
                    cursor: editMode ? "pointer" : "default",
                    textDecoration: isEditing ? "underline" : "none",
                  }}
                  onClick={(ev) => {
                    if (!editMode) return;
                    ev.stopPropagation();
                    setEditingEdge(i);
                    setEditLabel(e.label);
                  }}
                >{e.label}</text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const connected = isConnected(n.id);
            const isHover = hoveredNode === n.id;
            const isSel = selectedNode === n.id;
            const r = isSel ? 26 : (isHover ? 24 : 20);
            return (
              <g key={n.id}
                opacity={connected ? 1 : 0.25}
                style={{ cursor: "grab", transition: "opacity 200ms" }}
                onMouseDown={(ev) => handleMouseDown(ev, n.id)}
                onMouseEnter={() => setHoveredNode(n.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(ev) => { ev.stopPropagation(); setSelectedNode(prev => prev === n.id ? null : n.id); }}>
                {(isSel || isHover) && (
                  <circle cx={n.x} cy={n.y} r={r + 6} fill="none" stroke={n.color} strokeWidth={1} opacity={0.3} />
                )}
                <circle cx={n.x} cy={n.y} r={r}
                  fill={n.color} fillOpacity={0.18} stroke={n.color}
                  strokeWidth={isSel ? 2.5 : (isHover ? 2 : 1.5)} />
                <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                  style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12,
                    fill: connected ? "var(--cream)" : "var(--text-tertiary)",
                    letterSpacing: "0.06em", pointerEvents: "none",
                    fontWeight: isSel ? "bold" : "normal",
                  }}>{n.name.replace(/（.*）/, "").split("·")[0].trim()}</text>
                <text x={n.x} y={n.y + r + 14} textAnchor="middle"
                  style={{ fontFamily: "var(--font-serif-en)", fontStyle: "italic",
                    fontSize: 9.5, fill: "var(--text-tertiary)", letterSpacing: "0.06em", pointerEvents: "none",
                  }}>{n.voice}</text>
              </g>
            );
          })}
        </svg>

        {/* Hover info panel */}
        {hoveredChar && !addEdgeOpen && (
          <div style={{
            position: "absolute", top: 16, left: 16,
            background: "color-mix(in srgb, var(--navy-deep) 92%, transparent)", backdropFilter: "blur(6px)",
            border: "1px solid var(--navy-line)", borderRadius: 3,
            padding: "14px 18px", maxWidth: 280, pointerEvents: "none",
            animation: "swFade 100ms ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: charColors[hoveredChar.id] || "var(--gold)" }} />
              <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 14, color: "var(--cream)", letterSpacing: "0.06em" }}>{hoveredChar.name}</span>
              <span style={{ fontFamily: "var(--font-serif-en)", fontStyle: "italic", fontSize: 11, color: "var(--text-tertiary)" }}>{hoveredChar.nameEn}</span>
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.6, letterSpacing: "0.04em" }}>
              <div><span style={{ color: "var(--gold-dim)" }}>聲部</span> {hoveredChar.voice}</div>
              <div><span style={{ color: "var(--gold-dim)" }}>身份</span> {hoveredChar.role}</div>
              <div><span style={{ color: "var(--gold-dim)" }}>關係</span> {hoveredChar.relations}</div>
            </div>
          </div>
        )}

        {/* Edge edit panel (bottom-right) */}
        {editingEdge != null && allEdges[editingEdge] && (
          <div style={{
            position: "absolute", bottom: 16, right: 16,
            background: "color-mix(in srgb, var(--navy-deep) 95%, transparent)", backdropFilter: "blur(6px)",
            border: "1px solid var(--gold-line)", borderRadius: 4,
            padding: "14px 18px", minWidth: 260,
            animation: "swFade 100ms ease",
          }}>
            <div style={{ fontFamily: "var(--font-serif-en)", fontSize: 10, letterSpacing: "0.16em",
              color: "var(--gold-dim)", textTransform: "uppercase", marginBottom: 8 }}>Edit Edge</div>
            <div style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              {charName(allEdges[editingEdge].from)} → {charName(allEdges[editingEdge].to)}
              {allEdges[editingEdge]._source === "parsed" && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 6 }}>(from data)</span>
              )}
            </div>
            <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleEditEdgeSave(); if (e.key === "Escape") setEditingEdge(null); }}
              autoFocus
              style={{ width: "100%", padding: "6px 8px", background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
                borderRadius: 2, color: "var(--text-primary)", fontFamily: "var(--font-serif-tc)", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <SwBtn icon="check" size="sm" onClick={handleEditEdgeSave}>儲存</SwBtn>
              {allEdges[editingEdge]._source === "custom" && (
                <SwBtn icon="trash" size="sm" onClick={() => handleDeleteEdge(editingEdge)}
                  style={{ color: "var(--danger)", borderColor: "rgba(196,96,79,0.3)" }}>刪除</SwBtn>
              )}
              <SwBtn icon="close" size="sm" onClick={() => setEditingEdge(null)}>取消</SwBtn>
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
          issues.push({ ...loc, severity: "error", message: `角色「${b.speakerId}」不在角色表中`, rule: "unknown-speaker" });
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
    generate: (chars, act, scene, mood, count, sceneLabelTemplate) => {
      const blocks = [];
      blocks.push({ id: draftId("nar"), type: "narration", text: `【${mood || ""}開場敘述——請填入場景描寫】` });
      blocks.push({
        id: draftId("sc"),
        type: "scene",
        act: formatSceneLabel(sceneLabelTemplate, { act: act || "1", scene: scene || "1" }),
        subtitle: "【場次標題】",
        note: "",
      });
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
      if (b) blocks.push({ id: draftId("l4"), type: "dialogue", speakerId: b.id, original: "", zh: "【合聲——兩人同聲】", tags: [["二重唱","form"]] });
      return blocks;
    }},
  farewell: { label: "離別", labelEn: "Farewell", desc: "告別場景（感傷交代 + 離場旁白）",
    generate: (chars, act, scene, mood) => {
      const [a, b] = chars.length >= 2 ? [chars[0], chars[1]] : [chars[0], chars[0]];
      const blocks = [];
      if (a) blocks.push({ id: draftId("f1"), type: "dialogue", speakerId: a.id, original: "", zh: "【告別宣言——我必須離開】", tags: [["離別","plot"],["哀傷","emotion"]] });
      if (b) blocks.push({ id: draftId("f2"), type: "dialogue", speakerId: b.id, original: "", zh: "【挽留 / 接受】", tags: [["離別","plot"]] });
      if (a) blocks.push({ id: draftId("f3"), type: "dialogue", speakerId: a.id, original: "", zh: "【最後囑咐】", tags: mood ? [[mood,"emotion"]] : [["堅定","emotion"]] });
      blocks.push({ id: draftId("nar2"), type: "narration", text: "【離場描寫——角色退場動作】" });
      return blocks;
    }},
  trial: { label: "審判", labelEn: "Trial", desc: "正式審問場景（宣告 + 問答 + 裁決）",
    generate: (chars, act, scene, mood) => {
      const [judge, accused, witness] = chars.length >= 3 ? chars.slice(0,3) : [chars[0], chars[1] || chars[0], chars[0]];
      const blocks = [];
      blocks.push({ id: draftId("nar"), type: "narration", text: "【審判場景——莊嚴肅穆】" });
      if (judge) blocks.push({ id: draftId("t1"), type: "dialogue", speakerId: judge.id, original: "", zh: "【宣布開庭 / 提出指控】", tags: [["審判","plot"],["冷靜","emotion"]] });
      if (accused) blocks.push({ id: draftId("t2"), type: "dialogue", speakerId: accused.id, original: "", zh: "【被告回應——抗辯 / 沉默】", tags: [["審判","plot"]] });
      if (judge) blocks.push({ id: draftId("t3"), type: "dialogue", speakerId: judge.id, original: "", zh: "【追問 / 質疑】", tags: [["審判","plot"]] });
      if (accused) blocks.push({ id: draftId("t4"), type: "dialogue", speakerId: accused.id, original: "", zh: "【最終陳述】", tags: mood ? [[mood,"emotion"]] : [["掙扎","emotion"]] });
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
  const { act, scene, mood, count, sceneLabelTemplate } = options;
  return tmpl.generate(characters, act, scene, mood, count, sceneLabelTemplate);
};

function DraftGenerator({ onClose, onInsert, characters, charColors = {}, sceneLabelTemplate = "" }) {
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
    const blocks = ZeroRhyme.generateDraft(template, chars, { act, scene, mood, count, sceneLabelTemplate });
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
    <div style={{position:"fixed",inset:0,zIndex:100,background:"color-mix(in srgb, var(--navy-deep) 96%, transparent)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="quill" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Scriptum Genesis</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>初稿生成</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>零韻 · Draft Engine</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div className="sw-modal-row" style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Config */}
        <aside className="sw-modal-aside" style={{width:280,minWidth:280,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
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
                      background: selectedChars.includes(c.id) ? (charColors[c.id]||"var(--gold)")+"22" : "transparent",
                      border: `1px solid ${selectedChars.includes(c.id) ? (charColors[c.id]||"var(--gold)") : "var(--navy-line)"}`,
                      color: selectedChars.includes(c.id) ? (charColors[c.id]||"var(--gold)") : "var(--text-tertiary)",
                    }}>
                    {selectedChars.indexOf(c.id) >= 0 && <span style={{marginRight:3,fontSize:9}}>#{selectedChars.indexOf(c.id)+1}</span>}
                    {(c.name_zh || c.name || c.id).split("·")[0]}
                  </span>
                ))}
              </div>
            </div>
            {/* Mood */}
            <div style={{width:120}}>
              <div style={{fontFamily:"var(--font-body)",fontSize:10.5,color:"var(--text-secondary)",marginBottom:4}}>情緒基調</div>
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
                        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:11.5,color:charColors[b.speakerId]||"var(--cream)"}}>
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

// ============= HISTORY PANEL — 歷史紀錄面板 =============

function HistoryPanel({ workId, onClose, onRestore }) {
  const [entries, setEntries] = React.useState(() => loadHistory(workId));

  const handleRestore = (entry) => {
    if (!window.confirm(`確定還原到「${entry.label}」？\n當前稿件會先自動存入歷史。`)) return;
    onRestore(entry.blocks);
    setTimeout(() => setEntries(loadHistory(workId)), 100);
  };

  const handleClear = () => {
    if (!window.confirm("確定清除全部歷史紀錄？此操作無法復原。")) return;
    clearHistory(workId);
    setEntries([]);
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"color-mix(in srgb, var(--navy-deep) 96%, transparent)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="history" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>History</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>歷史紀錄</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>{entries.length} 筆</span>
        <span style={{flex:1}} />
        {entries.length > 0 && <SwBtn icon="trash" size="sm" variant="ghost" onClick={handleClear}>清除全部</SwBtn>}
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>
      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        {entries.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontFamily:"var(--font-serif-tc)",fontSize:15,color:"var(--text-tertiary)",marginBottom:8}}>尚無歷史紀錄</div>
            <div style={{fontFamily:"var(--font-body)",fontSize:12,color:"var(--text-tertiary)",lineHeight:1.8}}>
              執行破壞性操作（匯入、重設、初稿插入、刪除 block）時<br/>系統會自動保存當前狀態作為快照。
            </div>
          </div>
        ) : (
          entries.map((entry, i) => (
            <div key={entry.id} style={{padding:"12px 16px",marginBottom:6,borderRadius:3,border:"1px solid var(--navy-line)",background:"rgba(255,255,255,0.015)",display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,padding:"2px 6px",borderRadius:2,background:"rgba(201,168,106,0.1)",color:"var(--gold-dim)"}}>#{entries.length - i}</span>
                  <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12.5,color:"var(--cream)"}}>{entry.label}</span>
                </div>
                <div style={{display:"flex",gap:12,marginTop:4}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-tertiary)"}}>{fmtTime(entry.timestamp)}</span>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-tertiary)"}}>{entry.blockCount} blocks</span>
                </div>
              </div>
              <SwBtn icon="back" size="sm" variant="gold" onClick={() => handleRestore(entry)}>還原</SwBtn>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============= SCRIPT LINTER (Phase 12-E) — 零韻劇本顧問 =============
const TAG_DICT_PATH = `${DATA_BASE}/tags/tag_dictionary.json`;

function ScriptLinter({ blocks, characters, charColors = {}, onClose, onGoToBlock }) {
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
    <div style={{position:"fixed",inset:0,zIndex:100,background:"color-mix(in srgb, var(--navy-deep) 96%, transparent)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="scroll" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Scriptum Examen</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>格式檢查</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>零韻 · 劇本顧問</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div className="sw-modal-row" style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Summary + Filters */}
        <aside className="sw-modal-aside" style={{width:240,minWidth:240,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
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
    <div style={{position:"fixed",inset:0,zIndex:100,background:"color-mix(in srgb, var(--navy-deep) 96%, transparent)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",animation:"swFade 150ms ease"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid var(--navy-line)",display:"flex",alignItems:"center",gap:12}}>
        <SwIcon name="music" size={16} />
        <span style={{fontFamily:"var(--font-serif-en)",fontVariant:"small-caps",fontSize:14,letterSpacing:"0.16em",color:"var(--gold-bright)",textTransform:"uppercase"}}>Sonus Bibliothecae</span>
        <span style={{fontFamily:"var(--font-serif-tc)",fontSize:12,color:"var(--text-secondary)",letterSpacing:"0.06em"}}>音效庫</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10.5,color:"var(--text-tertiary)"}}>{library.length} sounds · TsukiSynth Score v1</span>
        <span style={{flex:1}} />
        <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
      </div>

      <div className="sw-modal-row" style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Left — Filters + 零韻 */}
        <aside className="sw-modal-aside" style={{width:260,minWidth:260,borderRight:"1px solid var(--navy-line)",padding:"16px 14px",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
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
        <aside className="sw-modal-aside" style={{width:200,minWidth:200,borderLeft:"1px solid var(--navy-line)",padding:"16px 14px",display:"flex",flexDirection:"column",gap:12}}>
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
function EditorView({ blocks, setBlocks, characters, charColors, setCharacters, setCharColors, script, workId, work }) {
  const [activeChar, setActiveChar] = React.useState(() => characters[0]?.id || "");
  const [focusedBlockId, setFocusedBlockId] = React.useState(() => {
    const first = blocks.find(b => b.type === "dialogue");
    return first?.id || null;
  });
  // 手機（≤900px）預設收合左右欄，避免兩個 fixed 覆蓋層在載入瞬間疊滿整個
  // 螢幕、擋住中央 BLOCKS 欄與收合按鈕本身（卡6 響應式）；桌面沿用原預設展開
  const [leftOpen, setLeftOpen] = React.useState(() => typeof window === "undefined" || window.innerWidth > 900);
  const [rightOpen, setRightOpen] = React.useState(() => typeof window === "undefined" || window.innerWidth > 900);
  const [forgeOpen, setForgeOpen] = React.useState(false);
  const [graphOpen, setGraphOpen] = React.useState(false);
  const [soundOpen, setSoundOpen] = React.useState(false);
  const [linterOpen, setLinterOpen] = React.useState(false);
  const [draftOpen, setDraftOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [charModalOpen, setCharModalOpen] = React.useState(false);
  const [charModalTarget, setCharModalTarget] = React.useState(null);

  // 手機斷點下 Personae/AVG 欄變成覆蓋層時，補 Esc 關閉（退件修復，卡6）；
  // 桌面版欄位是 in-flow 排版，Esc 沒有「覆蓋層」語意，故只在 ≤900px 生效
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (typeof window !== "undefined" && window.innerWidth > 900) return;
      if (leftOpen) setLeftOpen(false);
      if (rightOpen) setRightOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leftOpen, rightOpen]);

  const recomputeColors = (chars) => {
    const colors = {};
    chars.forEach((c, i) => { colors[c.id] = PREDEFINED_COLORS[c.id] || `hsl(${(i * 47) % 360}, 45%, 55%)`; });
    return colors;
  };
  const persistCharacters = (chars) => {
    const cc = recomputeColors(chars);
    setCharacters(chars); setCharColors(cc);
    CHARACTERS = chars; CHAR_COLORS = cc;
    saveCustomCharacters(chars, workId);
  };
  const pushSnapshot = (label) => { pushHistoryEntry(workId, blocks, label); };

  const handleCharSave = (charData) => {
    const exists = characters.find(c => c.id === charData.id);
    const updated = exists ? characters.map(c => c.id === charData.id ? { ...c, ...charData } : c) : [...characters, charData];
    persistCharacters(updated);
    setActiveChar(charData.id);
  };
  const handleCharDelete = (charId) => {
    if (!window.confirm("確定刪除此角色？")) return;
    const updated = characters.filter(c => c.id !== charId);
    persistCharacters(updated);
    if (activeChar === charId) setActiveChar(updated[0]?.id || "");
  };
  const { notes, addNote, updateNote, removeNote } = useNotes(workId);
  const importFileRef = React.useRef(null);
  const ch = characters.find(c => c.id === activeChar);
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
      dialogue: { id, type, speakerId: ch?.id || characters[0]?.id || "", original: "", zh: "", tags: [],
                  avg: { sprite: "", position: "center", bg: "", bgm: "", sfx: "" } },
      narration:{ id, type, text: "" },
      scene:    { id, type, act: formatSceneLabel(work?.sceneLabelTemplate, { act: "_", scene: "_" }), subtitle: "", note: "" },
      note:     { id, type, text: "" },
      choice:   { id, type, prompt: "", options: [{ text: "選項 1", nextBlockId: "" }] },
      command:  { id, type, command: "", value: "" },
    };
    const tpl = templates[type];
    if (!tpl) {
      console.error(`[Archive] 未知的 block type：「${type}」`);
      return;
    }
    setBlocks(prev => [...prev, tpl]);
  };
  const removeBlock = (id) => {
    if (!window.confirm("確定刪除此 block？")) return;
    pushSnapshot("刪除 block");
    setBlocks(blocks.filter(b => b.id !== id));
    if (focusedBlockId === id) setFocusedBlockId(null);
  };
  const updateBlock = (id, patch) => setBlocks(blocks.map(b => b.id === id ? { ...b, ...patch } : b));
  const moveBlock = (id, dir) => {
    const idx = blocks.findIndex(b => b.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    pushSnapshot("移動 block");
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
  };

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
        const { valid, results } = validateBlocks(imported, characters);
        if (!valid) {
          setImportWarnings(results);
          return; // 有驗證錯誤時不覆蓋目前稿件，等使用者確認
        }
        setImportWarnings(null);
        if (imported.length > 0) {
          pushSnapshot("匯入 JSONL 前備份");
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
    if (confirm("確定要重設為原始資料？")) {
      pushSnapshot("重設前備份");
      localStorage.removeItem(`blocks_${workId}`);
      setBlocks(script);
      setFocusedBlockId(script.find(b => b.type === "dialogue")?.id || null);
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
      const c = characters.find(c => c.id === charId);
      arr.forEach(n => {
        entries.push({ charId, charName: c?.name || charId, text: n.text, ts: n.ts });
      });
    });
    if (entries.length === 0) { alert("目前無筆記可匯出"); return; }
    const lines = entries.map(e => JSON.stringify(e));
    downloadFile(`notes-${workId}.jsonl`, lines.join("\n"), "application/jsonl");
  };

  const leftW = leftOpen ? 280 : 0;
  const rightW = rightOpen ? 320 : 0;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
      {/* LEFT — PERSONAE */}
      {leftOpen && (
        <>
          {/* 手機斷點覆蓋層的關閉面（退件修復，卡6）：桌面 in-flow 版面下
              CSS 維持 display:none，點擊不會誤觸任何東西 */}
          <div className="sw-aside-backdrop" onClick={() => setLeftOpen(false)} aria-hidden="true" />
          <aside className="sw-editor-aside sw-editor-aside--left" style={{
            width: leftW, minWidth: leftW,
            borderRight: "1px solid var(--navy-line)",
            background: "linear-gradient(180deg, var(--navy-light), var(--navy))",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
          <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <SectionLabel latin="Personae" zh="角色" />
            <span style={{ flex: 1 }} />
            <button className="sw-aside-close" onClick={() => setLeftOpen(false)} title="關閉角色欄"
              style={{ background: "transparent", border: "1px solid var(--navy-line)", color: "var(--text-tertiary)", width: 22, height: 22, borderRadius: 2, cursor: "pointer", alignItems: "center", justifyContent: "center", fontSize: 13, padding: 0 }}>&times;</button>
            <button onClick={() => { setCharModalTarget(null); setCharModalOpen(true); }} title="新增角色"
              style={{ background: "transparent", border: "1px solid var(--navy-line)", color: "var(--gold-dim)", width: 22, height: 22, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0 }}>+</button>
            {ch && <button onClick={() => { setCharModalTarget(ch); setCharModalOpen(true); }} title="編輯角色"
              style={{ background: "transparent", border: "1px solid var(--navy-line)", color: "var(--gold-dim)", width: 22, height: 22, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, padding: 0 }}>&#9998;</button>}
            {ch && <button onClick={() => handleCharDelete(ch.id)} title="刪除角色"
              style={{ background: "transparent", border: "1px solid rgba(196,96,79,0.3)", color: "var(--danger,#c4604f)", width: 22, height: 22, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, padding: 0 }}>&times;</button>}
          </div>
          <div style={{ overflowY: "auto", padding: "0 10px 12px", flex: "0 0 auto", maxHeight: 200 }}>
            {characters.map(c => (
              <CharRow key={c.id} c={c} active={c.id === activeChar} onClick={() => setActiveChar(c.id)} charColors={charColors}
                onEdit={(cc) => { setCharModalTarget(cc); setCharModalOpen(true); }}
                onDelete={(id) => handleCharDelete(id)} />
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
        </>
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
          <SwBtn icon="cog"     size="sm" onClick={() => addBlock("command")}>指令</SwBtn>

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
          <SwBtn icon="history" size="sm" variant="ghost"
            onClick={() => setHistoryOpen(true)}>歷史</SwBtn>

          <span style={{ flex: 1 }} />

          {/* Import */}
          <input ref={importFileRef} type="file" accept=".jsonl,.json"
            onChange={handleImportJsonl} style={{ display: "none" }} />
          <SwBtn icon="upload" size="sm" onClick={() => importFileRef.current?.click()}>匯入 JSONL</SwBtn>
          <SwBtn icon="back" size="sm" onClick={resetBlocks} title="重設為原始資料">重設</SwBtn>

          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--text-tertiary)", letterSpacing: "0.06em",
          }}>{blocks.length} blocks · {blocks !== script ? "已自動存檔" : "原始資料"}</span>

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
              characters={characters} charColors={charColors}
              focused={b.id === focusedBlockId}
              onFocus={() => setFocusedBlockId(b.id)}
              onRemove={() => removeBlock(b.id)}
              onUpdate={p => updateBlock(b.id, p)}
              onMoveUp={() => moveBlock(b.id, -1)}
              onMoveDown={() => moveBlock(b.id, 1)} />
          ))}
        </div>

      </main>

      {/* export bar — outside main to avoid overflow clipping */}
      <div className="sw-editor-exportbar" style={{
        position: "absolute", left: leftW, right: rightW, bottom: 0, zIndex: 20,
        background: "color-mix(in srgb, var(--navy-deep) 94%, transparent)", backdropFilter: "blur(8px)",
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
          background: "color-mix(in srgb, var(--navy-deep) 92%, transparent)", backdropFilter: "blur(6px)",
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
      {forgeOpen && <TableForge blocks={blocks} characters={characters} charColors={charColors} onUpdateBlock={updateBlock} onClose={() => setForgeOpen(false)} />}

      {/* Relationship Graph overlay (Phase 12-C) */}
      {graphOpen && <RelationshipGraph onClose={() => setGraphOpen(false)} characters={characters} charColors={charColors} setCharacters={setCharacters} workId={workId} />}

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
        characters={characters}
        charColors={charColors}
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
        characters={characters}
        charColors={charColors}
        sceneLabelTemplate={work?.sceneLabelTemplate || ""}
        onClose={() => setDraftOpen(false)}
        onInsert={(newBlocks) => {
          pushSnapshot("初稿插入前備份");
          setBlocks(prev => [...prev, ...newBlocks]);
          setFocusedBlockId(newBlocks[0]?.id || null);
          setTimeout(() => {
            const el = newBlocks[0]?.id ? document.querySelector(`[data-block-id="${CSS.escape(newBlocks[0].id)}"]`) : null;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 200);
        }}
      />}

      {/* History Panel */}
      {historyOpen && <HistoryPanel
        workId={workId}
        onClose={() => setHistoryOpen(false)}
        onRestore={(restoredBlocks) => {
          pushSnapshot("還原前自動備份");
          setBlocks(restoredBlocks);
          setFocusedBlockId(restoredBlocks.find(b => b.type === "dialogue")?.id || null);
          setHistoryOpen(false);
        }}
      />}

      {charModalOpen && <CharacterModal character={charModalTarget} onSave={handleCharSave} onClose={() => setCharModalOpen(false)} />}

      {/* RIGHT — AVG PANEL (Phase 11) */}
      {rightOpen && (
        <>
          <div className="sw-aside-backdrop" onClick={() => setRightOpen(false)} aria-hidden="true" />
          <aside className="sw-editor-aside sw-editor-aside--right" style={{
            width: rightW, minWidth: rightW,
            borderLeft: "1px solid var(--navy-line)",
            background: "linear-gradient(180deg, var(--navy-light), var(--navy))",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
          <div style={{ padding: "16px 16px 12px", position: "relative" }}>
            <SectionLabel latin="Apparatus" zh="AVG 設定" accent="gold" />
            <button className="sw-aside-close" onClick={() => setRightOpen(false)} title="關閉 AVG 欄"
              style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "1px solid var(--navy-line)", color: "var(--text-tertiary)", width: 22, height: 22, borderRadius: 2, cursor: "pointer", alignItems: "center", justifyContent: "center", fontSize: 13, padding: 0 }}>&times;</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 16px" }}>
            {focusedBlock?.type === "dialogue" ? (
              <>
                {/* sprite preview */}
                <SpritePreview block={focusedBlock} characters={characters} charColors={charColors} />

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
        </>
      )}
    </div>
  );
}

function CharRow({ c, active, onClick, charColors = {}, onEdit, onDelete }) {
  const [h, setH] = React.useState(false);
  const dot = charColors[c.id] || "var(--gold-deep)";
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
      {(h || active) ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            title="編輯角色"
            onClick={(e) => { e.stopPropagation(); onEdit && onEdit(c); }}
            style={{
              width: 18, height: 18, padding: 0,
              background: "transparent", border: "1px solid var(--navy-line)",
              color: "var(--gold-dim)", borderRadius: 2,
              cursor: "pointer", fontSize: 10, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>&#9998;</button>
          <button
            title="刪除角色"
            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(c.id); }}
            style={{
              width: 18, height: 18, padding: 0,
              background: "transparent", border: "1px solid rgba(196,96,79,0.3)",
              color: "var(--danger,#c4604f)", borderRadius: 2,
              cursor: "pointer", fontSize: 10, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>×</button>
        </div>
      ) : (
        <SwIcon name="chevronRight" size={12} />
      )}
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

function BlockCard({ b, blocks, characters = [], charColors = {}, onRemove, onUpdate, focused, onFocus, onMoveUp, onMoveDown }) {
  const meta = BLOCK_META[b.type];
  const charDot = b.type === "dialogue" ? (charColors[b.speakerId] || meta.color) : meta.color;
  const isFocused = focused && b.type === "dialogue";
  const blockErrors = React.useMemo(() => validateBlock(b, characters, blocks), [b, characters, blocks]);
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
            {characters.map(c => <option key={c.id} value={c.id} style={{ background: "var(--navy-deep)" }}>{c.name}（{c.id}）</option>)}
          </select>
        )}

        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-tertiary)", opacity: 0.65, letterSpacing: "0.05em",
        }}>#{b.id}</span>
        <button onClick={onMoveUp} title="上移"
          style={{
            background: "transparent", border: "1px solid var(--navy-line)",
            color: "var(--text-tertiary)", padding: "3px 5px",
            borderRadius: 2, cursor: "pointer", display: "flex",
          }}><SwIcon name="chevronUp" size={12} /></button>
        <button onClick={onMoveDown} title="下移"
          style={{
            background: "transparent", border: "1px solid var(--navy-line)",
            color: "var(--text-tertiary)", padding: "3px 5px",
            borderRadius: 2, cursor: "pointer", display: "flex",
          }}><SwIcon name="chevronDown" size={12} /></button>
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

      {b.type === "command" && (
        <>
          <BlockTextarea placeholder="指令名稱（如 bgm、sfx、transition）"
            value={b.command || ""} onChange={v => onUpdate({ command: v })} font="mono" rows={1} />
          <BlockTextarea placeholder="指令值"
            value={b.value || ""} onChange={v => onUpdate({ value: v })} font="serif-tc" rows={1} />
        </>
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
function ReaderView({ blocks, goToBlock, work, characters, charColors = {}, workId }) {
  const sceneIndices = blocks.map((b, i) => b.type === "scene" ? i : -1).filter(i => i >= 0);
  const scenes = sceneIndices.map(i => blocks[i]);
  const [activeScene, setActiveScene] = React.useState(scenes[0]?.id);
  const [showNotes, setShowNotes] = React.useState(false);
  const containerRef = React.useRef(null);
  const sceneRefs = React.useRef({});
  const [readerNotes] = React.useState(() => loadNotes(workId));

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
    <div className="reader-root" style={{ display: "flex", flex: 1, overflow: "hidden", background: "var(--navy-deep)", position: "relative" }}>
      {/* TOC */}
      <aside className="reader-toc" style={{
        width: 180, minWidth: 180,
        padding: "26px 14px",
        borderRight: "1px solid var(--navy-line)",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--navy) 60%, transparent), color-mix(in srgb, var(--navy-deep) 60%, transparent))",
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
            var(--navy-deep)
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
                  const ch = characters.find(c => c.id === b.speakerId);
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
        background: "color-mix(in srgb, var(--navy-deep) 94%, transparent)", backdropFilter: "blur(8px)",
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
      }}>{ch?.name || block.speaker || block.speakerId || "???"}</div>

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

// ============= AI ASSIST PANEL =============
function AiAssistPanel({ onClose, blocks, characters }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const scrollRef = React.useRef(null);
  const inIframe = window.parent !== window;

  // Listen for AI response from parent shell
  React.useEffect(() => {
    const handler = (e) => {
      // Security: only accept messages from same origin
      if (e.origin !== location.origin) return;
      if (e.data?.type === MSG_TYPES.READING_ROOM_RESPONSE) {
        setPending(false);
        if (e.data.error) {
          setMessages(prev => [...prev, { role: "error", text: e.data.error }]);
        } else if (e.data.response) {
          setMessages(prev => [...prev, { role: "ai", text: e.data.response }]);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending]);

  const buildContext = () => {
    const charNames = (characters || []).map(c => c.name).join("、") || "(無角色)";
    const blockCount = (blocks || []).length;
    const lastBlocks = (blocks || []).slice(-5).map(b => {
      if (b.type === "scene") return `[場景] ${b.act || ""}`;
      if (b.type === "narration") return `[旁白] ${b.text || ""}`;
      if (b.type === "dialogue") return `${b.speaker || b.speakerId || "???"}: ${b.zh || b.text || ""}`;
      return `[${b.type}]`;
    }).join("\n");
    return `--- 劇本工房上下文 ---\n角色：${charNames}\n總 blocks 數：${blockCount}\n最近 5 個 block：\n${lastBlocks}\n---`;
  };

  const sendMessage = (text) => {
    if (!text.trim() || pending) return;
    if (!inIframe) {
      setMessages(prev => [...prev,
        { role: "user", text },
        { role: "error", text: "AI 功能需要在阿卡夏圖書館內使用（iframe 環境）。獨立運行時無法連接 AI 服務。" },
      ]);
      return;
    }
    setMessages(prev => [...prev, { role: "user", text }]);
    setPending(true);
    const contextPrompt = buildContext() + "\n\n用戶提問：" + text;
    window.parent.postMessage({
      type: MSG_TYPES.READING_ROOM_SEND,
      text: contextPrompt,
      module: "script-editor",
      noTrace: false,
    }, location.origin);
  };

  const presets = [
    { label: "格式檢查", icon: "check", prompt: "請檢查目前劇本的格式是否正確，有沒有常見問題（如缺少場景標記、角色名不一致、空白對白等）。" },
    { label: "劇情摘要", icon: "book", prompt: "請根據目前的劇本內容，用 3-5 句話摘要目前的劇情發展。" },
    { label: "角色分析", icon: "user", prompt: "請分析目前劇本中各角色的出場次數、台詞量和主要互動關係。" },
    { label: "續寫建議", icon: "quill", prompt: "根據目前劇本的最後幾個 block，請建議接下來可能的劇情發展方向（2-3 個方案）。" },
  ];

  const msgBubbleStyle = (role) => ({
    padding: "8px 12px", borderRadius: 6, marginBottom: 6,
    fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6,
    maxWidth: "85%", wordBreak: "break-word", whiteSpace: "pre-wrap",
    ...(role === "user" ? {
      background: "rgba(201,168,106,0.15)", color: "var(--gold-bright)",
      alignSelf: "flex-end", borderBottomRightRadius: 2,
    } : role === "error" ? {
      background: "rgba(196,96,79,0.15)", color: "#c4604f",
      alignSelf: "flex-start", borderBottomLeftRadius: 2,
    } : {
      background: "rgba(255,255,255,0.06)", color: "var(--cream)",
      alignSelf: "flex-start", borderBottomLeftRadius: 2,
    }),
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "color-mix(in srgb, var(--navy-deep) 92%, transparent)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "swFade 120ms ease",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column",
        background: "var(--navy-light)", border: "1px solid var(--gold-line)",
        borderRadius: 6, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--navy-line)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <SwIcon name="moon" size={15} />
          <span style={{ fontFamily: "var(--font-serif-en)", fontVariant: "small-caps", fontSize: 13, letterSpacing: "0.14em", color: "var(--gold-bright)" }}>AI Dramaturg</span>
          <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12, color: "var(--text-secondary)" }}>劇本顧問</span>
          <span style={{ flex: 1 }} />
          <SwBtn icon="close" size="sm" onClick={onClose}>關閉</SwBtn>
        </div>

        {/* Quick actions */}
        <div style={{ padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--navy-line)" }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => sendMessage(p.prompt)} disabled={pending}
              style={{
                background: "rgba(201,168,106,0.08)", border: "1px solid var(--gold-line)",
                color: "var(--gold)", padding: "4px 10px", borderRadius: 3,
                fontFamily: "var(--font-serif-tc)", fontSize: 11.5, cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4,
              }}>
              <SwIcon name={p.icon} size={11} />{p.label}
            </button>
          ))}
        </div>

        {/* Chat messages */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 4,
          minHeight: 200, maxHeight: "50vh",
        }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontSize: 12, paddingTop: 40 }}>
              點擊上方快速指令，或輸入自由提問
              {!inIframe && <div style={{ color: "#c4604f", marginTop: 8 }}>（需在阿卡夏圖書館內使用）</div>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={msgBubbleStyle(m.role)}>
              {m.role === "ai" && <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 10, color: "var(--text-tertiary)", display: "block", marginBottom: 2 }}>AI Dramaturg</span>}
              {m.text}
            </div>
          ))}
          {pending && (
            <div style={{ ...msgBubbleStyle("ai"), opacity: 0.6 }}>
              <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 10, color: "var(--text-tertiary)", display: "block", marginBottom: 2 }}>AI Dramaturg</span>
              思考中…
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: "8px 12px", borderTop: "1px solid var(--navy-line)",
          display: "flex", gap: 6,
        }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); setInput(""); } }}
            placeholder="輸入問題…" disabled={pending}
            style={{
              flex: 1, background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
              color: "var(--cream)", padding: "7px 10px",
              fontFamily: "var(--font-body)", fontSize: 13, borderRadius: 3, outline: "none",
            }} />
          <SwBtn icon="send" size="sm" onClick={() => { sendMessage(input); setInput(""); }}>送出</SwBtn>
        </div>
      </div>
    </div>
  );
}

// ============= CHARACTER MODAL =============
function CharacterModal({ character, onSave, onClose }) {
  const editing = !!character;
  const [name, setName] = React.useState(character?.name || "");
  const [nameEn, setNameEn] = React.useState(character?.nameEn || "");
  const [voice, setVoice] = React.useState(character?.voice || "");
  const [role, setRole] = React.useState(character?.role || "");
  const [relations, setRelations] = React.useState(character?.relations || "");
  const [tone, setTone] = React.useState(character?.tone || "");
  const [tagInput, setTagInput] = React.useState((character?.tags || []).join("、"));
  const inputSt = {
    width: "100%", boxSizing: "border-box", marginBottom: 10,
    background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
    color: "var(--cream)", padding: "7px 10px",
    fontFamily: "var(--font-body)", fontSize: 13, borderRadius: 2, outline: "none",
  };
  const labelSt = { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 };
  const handleSave = () => {
    if (!name.trim()) return alert("請輸入角色名稱");
    const id = character?.id || name.trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "_") || ("char_" + Date.now().toString(36));
    const tags = tagInput.split(/[,、\s]+/).map(t => t.trim()).filter(Boolean);
    onSave({ id, name: name.trim(), nameEn: nameEn.trim() || name.trim(), voice: voice.trim(), role: role.trim(), relations: relations.trim(), tone: tone.trim(), tags, notes: character?.notes || [] });
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "color-mix(in srgb, var(--navy-deep) 85%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", animation: "swFade 120ms ease" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--navy-light)", border: "1px solid var(--gold-line)", borderRadius: 4, padding: "24px 28px", width: 380, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "var(--font-serif-tc)", fontSize: 15, color: "var(--gold-bright)", marginBottom: 14, letterSpacing: "0.1em" }}>
          <SwIcon name={editing ? "quill" : "plus"} size={13} /> {editing ? "編輯角色" : "新增角色"}
        </div>
        <label style={labelSt}>角色名稱 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="例：艾爾莎" style={inputSt} autoFocus
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
        <label style={labelSt}>English Name</label>
        <input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="e.g. Elsa" style={inputSt} />
        <label style={labelSt}>聲部 Voice</label>
        <input value={voice} onChange={e => setVoice(e.target.value)} placeholder="e.g. Soprano" style={inputSt} />
        <label style={labelSt}>身份 Role</label>
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. protagonist · princess" style={inputSt} />
        <label style={labelSt}>關係 Relations</label>
        <input value={relations} onChange={e => setRelations(e.target.value)} placeholder="e.g. 羅恩格林之妻" style={inputSt} />
        <label style={labelSt}>口吻 Tone</label>
        <input value={tone} onChange={e => setTone(e.target.value)} placeholder="角色說話風格描述" style={inputSt} />
        <label style={labelSt}>標籤 Tags（以「、」分隔）</label>
        <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="例：純潔、夢境、信任" style={inputSt} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <SwBtn icon="close" size="sm" onClick={onClose}>取消</SwBtn>
          <SwBtn icon={editing ? "check" : "plus"} size="sm" onClick={handleSave}>{editing ? "儲存" : "新增"}</SwBtn>
        </div>
      </div>
    </div>
  );
}

// ============= APP =============
function NewWorkModal({ onClose, onCreated }) {
  const [title, setTitle] = React.useState("");
  const [titleEn, setTitleEn] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const inputSt = {
    width: "100%", boxSizing: "border-box", marginBottom: 10,
    background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
    color: "var(--cream)", padding: "7px 10px",
    fontFamily: "var(--font-body)", fontSize: 13, borderRadius: 2, outline: "none",
  };
  const handleCreate = () => {
    if (!title.trim()) return alert("請輸入作品名稱");
    const id = "custom_" + Date.now().toString(36);
    const newWork = { id, title: title.trim(), titleEn: titleEn.trim() || title.trim(), author: author.trim() || "—" };
    const customs = getCustomWorks();
    customs.push(newWork);
    saveCustomWorks(customs);
    WORK_INDEX.push({ ...newWork, _custom: true });
    onCreated(id);
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "color-mix(in srgb, var(--navy-deep) 85%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", animation: "swFade 120ms ease" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--navy-light)", border: "1px solid var(--gold-line)", borderRadius: 4, padding: "24px 28px", width: 340 }}>
        <div style={{ fontFamily: "var(--font-serif-tc)", fontSize: 15, color: "var(--gold-bright)", marginBottom: 14, letterSpacing: "0.1em" }}>
          <SwIcon name="plus" size={13} /> 新增作品
        </div>
        <label style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>作品名稱 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：乘風之翼" style={inputSt} autoFocus
          onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
        <label style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>English Title</label>
        <input value={titleEn} onChange={e => setTitleEn(e.target.value)} placeholder="e.g. Wings of the Wind" style={inputSt} />
        <label style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>作者</label>
        <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="例：匿名" style={inputSt} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <SwBtn icon="close" size="sm" onClick={onClose}>取消</SwBtn>
          <SwBtn icon="plus" size="sm" onClick={handleCreate}>建立</SwBtn>
        </div>
      </div>
    </div>
  );
}

function WorkSwitcher({ currentId, onSwitch, workIndex, onNewWork, onDeleteWork }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginRight: 8, minWidth: 0 }}>
      <select value={currentId} onChange={e => onSwitch(e.target.value)}
        style={{
          background: "var(--navy-deep)", border: "1px solid var(--gold-line)",
          color: "var(--gold)", padding: "4px 24px 4px 10px",
          fontFamily: "var(--font-serif-tc)", fontSize: 12,
          borderRadius: 2, outline: "none", cursor: "pointer", appearance: "none",
          maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
          backgroundImage: "linear-gradient(45deg, transparent 50%, var(--gold-dim) 50%), linear-gradient(135deg, var(--gold-dim) 50%, transparent 50%)",
          backgroundPosition: "calc(100% - 12px) 50%, calc(100% - 7px) 50%",
          backgroundSize: "5px 5px", backgroundRepeat: "no-repeat",
        }}>
        {(workIndex || []).map(w => <option key={w.id} value={w.id}>{w.title}{w.titleEn ? `（${w.titleEn}）` : ""}{w._custom ? " *" : ""}</option>)}
      </select>
      <button onClick={onNewWork} title="新增作品" style={{
        background: "var(--navy-deep)", border: "1px solid var(--gold-line)",
        color: "var(--gold)", width: 26, height: 26, borderRadius: 2,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontFamily: "var(--font-mono)", padding: 0,
      }}>+</button>
      {(workIndex || []).find(w => w.id === currentId)?._custom ? (
        <button onClick={onDeleteWork} title="刪除此自訂作品" style={{
          background: "rgba(196,96,79,0.14)", border: "1px solid rgba(196,96,79,0.5)",
          color: "var(--danger,#c4604f)", width: 26, height: 26, borderRadius: 2,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontFamily: "var(--font-mono)", padding: 0,
        }}>🗑</button>
      ) : (
        <button disabled title="內建作品不可刪除" style={{
          background: "transparent", border: "1px solid var(--navy-line)",
          color: "var(--text-tertiary)", width: 26, height: 26, borderRadius: 2,
          cursor: "default", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontFamily: "var(--font-mono)", padding: 0, opacity: 0.3,
        }}>🗑</button>
      )}
    </div>
  );
}

function App() {
  const [tab, setTab] = React.useState("write");
  const [currentWork, setCurrentWork] = React.useState(() => localStorage.getItem("sw_last_work") || WORKS[0]?.id || "lohengrin");
  const [loading, setLoading] = React.useState(false);

  // Per-work React state — initialized from globals set by main.jsx's loadAllData
  const [workMeta, setWorkMeta] = React.useState(() => WORKS[0] || null);
  const [characters, setCharacters] = React.useState(() => [...CHARACTERS]);
  const [charColors, setCharColors] = React.useState(() => ({ ...CHAR_COLORS }));
  const [script, setScript] = React.useState(() => [...SCRIPT]);
  const [workIndex, setWorkIndex] = React.useState(() => [...WORK_INDEX]);

  const [blocks, setBlocks] = React.useState(() => {
    const initWorkId = localStorage.getItem("sw_last_work") || WORKS[0]?.id || "lohengrin";
    const fromStorage = loadBlocksFromStorage(initWorkId);
    let b = fromStorage || SCRIPT;
    const customChars = loadCustomCharacters(initWorkId);
    const baseChars = customChars || CHARACTERS;
    // Seed: empty blocks (new custom work) → parse DEFAULT_SEED synchronously
    if (b.length === 0) {
      b = parsePlainScript(DEFAULT_SEED, baseChars);
      saveBlocksToStorage(b, initWorkId);
    } else if (!fromStorage) {
      // First-time seed for server works
      saveBlocksToStorage(b, initWorkId);
    }
    const { characters: ch, charColors: cc } = populateCharsFromBlocks(b, baseChars);
    return b;
  });
  const [showNewWork, setShowNewWork] = React.useState(false);
  const [showAI, setShowAI] = React.useState(false);
  const [writeMode, setWriteMode] = React.useState("script");
  const writeTabRef = React.useRef(null);
  const blocksRef = React.useRef(blocks);
  const workIdRef = React.useRef(currentWork);
  React.useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  React.useEffect(() => { workIdRef.current = currentWork; }, [currentWork]);

  // Re-sync characters state after initial populateCharsFromBlocks
  React.useEffect(() => {
    setCharacters([...CHARACTERS]);
    setCharColors({ ...CHAR_COLORS });
  }, []);

  // Shell import: receive file from parent via postMessage
  React.useEffect(() => {
    const handler = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type !== MSG_TYPES.OPEN_SCRIPT) return;
      const { filename, content } = e.data;
      if (!content) return;
      const ext = (filename || "").split(".").pop().toLowerCase();
      let imported = [];
      if (ext === "jsonl" || ext === "json") {
        const text = content.trim();
        if (text.startsWith("[")) {
          try { imported = JSON.parse(text); } catch { /* fall through to line parse */ }
        }
        if (imported.length === 0) {
          const lines = text.split("\n");
          const errors = [];
          for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line.trim()) continue;
            try {
              imported.push(JSON.parse(line));
            } catch (err) {
              errors.push({ line: lineNum + 1, text: line.slice(0, 60), error: err.message });
            }
          }
          if (errors.length > 0) {
            const errorMsg = errors.slice(0, 5).map(e =>
              '第 ' + e.line + ' 行: ' + e.error
            ).join('\n');
            const total = errors.length;
            const msg = '解析失敗：' + total + ' 行無法讀取\n\n' + errorMsg +
              (total > 5 ? '\n...及其他 ' + (total - 5) + ' 行' : '') +
              '\n\n已略過錯誤行，僅匯入 ' + imported.length + ' 筆有效資料。' +
              '\n\n確定要以部分資料建立作品嗎？';
            if (imported.length === 0) {
              alert('匯入失敗：所有 ' + total + ' 行均無法解析。\n\n' + errorMsg);
              return;
            }
            if (!confirm(msg)) return;
          }
        }
      }
      let nextBlocks;
      if (imported.length > 0) {
        nextBlocks = imported;
      } else {
        nextBlocks = parsePlainScript(content, []);
      }
      if (Array.isArray(blocksRef.current) && blocksRef.current.length > 0) {
        saveBlocksToStorage(blocksRef.current, workIdRef.current);
      }
      const importedWork = createImportedWork(filename);
      const customs = getCustomWorks();
      customs.push(importedWork);
      saveCustomWorks(customs);
      WORK_INDEX = [...WORK_INDEX.filter(w => w.id !== importedWork.id), { ...importedWork, _custom: true }];

      const { characters: ch, charColors: cc } = populateCharsFromBlocks(nextBlocks, []);
      saveBlocksToStorage(nextBlocks, importedWork.id);
      saveCustomCharacters(ch, importedWork.id);
      saveWriteDraft(blocksToPlainScript(nextBlocks, ch), importedWork.id);

      setWorkMeta({
        id: importedWork.id,
        title: importedWork.title,
        titleEn: importedWork.titleEn,
        composer: importedWork.author,
        license: "unchecked",
        synopsis: "",
        premiereYear: "",
        setting: "",
        copyrightNote: "",
        acts: 0,
        genreLabel: "Imported",
        actsLabel: "",
        sceneLabelTemplate: "",
      });
      setCharacters(ch);
      setCharColors(cc);
      setScript(nextBlocks);
      setWorkIndex([...WORK_INDEX]);
      setBlocks(nextBlocks);
      setCurrentWork(importedWork.id);
      localStorage.setItem("sw_last_work", importedWork.id);
      setTab("editor");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Shell AI: respond to context request from App Shell's AI panel
  React.useEffect(() => {
    const handler = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type !== MSG_TYPES.AI_GET_CONTEXT) return;
      const plainText = blocksToPlainScript(blocksRef.current, CHARACTERS);
      const truncated = plainText.length > 12000 ? plainText.slice(0, 12000) + "\n…（內容已截斷）" : plainText;
      window.parent.postMessage({
        type: MSG_TYPES.AI_CONTEXT_RESPONSE,
        module: "script-editor",
        fileName: workMeta?.title || currentWork,
        fileType: "script",
        content: truncated,
        blockCount: blocksRef.current.length,
        characters: CHARACTERS.map(c => c.name),
      }, location.origin);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [workMeta, currentWork]);

  // Inherit dark/light mode from parent on mount
  React.useEffect(() => {
    try {
      const parentMode = window.parent?.document?.documentElement?.getAttribute("data-mode");
      if (parentMode) document.documentElement.setAttribute("data-mode", parentMode);
    } catch {}
  }, []);

  // Shell: dark/light mode sync from App Shell
  React.useEffect(() => {
    const handler = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type !== MSG_TYPES.MODE_CHANGE) return;
      document.documentElement.setAttribute("data-mode", e.data.mode);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Persist blocks to localStorage on change (debounced) — uses currentWork via ref
  // Guard: skip empty blocks to prevent overwriting seed data with [] during switch transitions
  const saveRef = React.useRef(debounce((b) => {
    if (Array.isArray(b) && b.length > 0) saveBlocksToStorage(b, workIdRef.current);
  }, 800));
  React.useEffect(() => { saveRef.current(blocks); }, [blocks]);

  const goToBlock = (blockId) => {
    localStorage.setItem("sw_focusBlock", blockId);
    setTab("editor");
  };

  const switchWork = async (workId, { skipSave = false } = {}) => {
    if (workId === currentWork) return;
    setLoading(true);
    // Synchronously persist current blocks before switching (debounce may not have flushed)
    saveRef.current.cancel();
    if (!skipSave) saveBlocksToStorage(blocks, currentWork);
    try {
      const data = await loadAllData(workId);
      const fromStorage = loadBlocksFromStorage(workId);
      let loaded = fromStorage || data.script;
      const customChars = loadCustomCharacters(workId);
      const baseChars = customChars || data.characters;
      // Seed: custom work with no data → parse DEFAULT_SEED synchronously
      // (bypasses the fragile WriteTab forward-sync → debounce chain)
      if (loaded.length === 0) {
        loaded = parsePlainScript(DEFAULT_SEED, baseChars);
        saveBlocksToStorage(loaded, workId);
      } else if (!fromStorage) {
        // First-time seed for server works: persist so quick switch-away won't lose data
        saveBlocksToStorage(loaded, workId);
      }
      const { characters: ch, charColors: cc } = populateCharsFromBlocks(loaded, baseChars);
      setWorkMeta(data.works[0] || null);
      setCharacters(ch);
      setCharColors(cc);
      setScript(data.script);
      setWorkIndex([...WORK_INDEX]);
      setBlocks(loaded);
      setCurrentWork(workId);
      localStorage.setItem("sw_last_work", workId);
      setTab("write");
    } catch (e) { console.error("Work load failed:", e); }
    setLoading(false);
  };

  const deleteCurrentWork = () => {
    const entry = workIndex.find(w => w.id === currentWork);
    if (!entry?._custom) return;
    if (!window.confirm(`確定刪除自訂作品「${entry.title}」？\n草稿與筆記也會一併清除。`)) return;
    const customs = getCustomWorks().filter(w => w.id !== currentWork);
    saveCustomWorks(customs);
    localStorage.removeItem(`blocks_${currentWork}`);
    localStorage.removeItem(`notes_${currentWork}`);
    localStorage.removeItem(`characters_${currentWork}`);
    localStorage.removeItem(`sw_write_draft_v1_${currentWork}`);
    localStorage.removeItem(`sw_write_draft_v1_${currentWork}__novel`);
    localStorage.removeItem(`sw_write_draft_v1_${currentWork}__notes`);
    localStorage.removeItem(`sw_write_mode_v1_${currentWork}`);
    localStorage.removeItem(`sw_slot_locks_v1_${currentWork}`);
    localStorage.removeItem(`edges_${currentWork}`);
    clearHistory(currentWork);
    WORK_INDEX = WORK_INDEX.filter(w => w.id !== currentWork);
    setWorkIndex([...WORK_INDEX]);
    const fallback = WORK_INDEX[0]?.id || "lohengrin";
    switchWork(fallback, { skipSave: true });
  };

  const handleWorkCreated = (newWorkId) => {
    setWorkIndex([...WORK_INDEX]);
    switchWork(newWorkId);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      position: "relative",
    }}>
      <SwHeader tab={tab} setTab={setTab} onAI={() => setShowAI(true)}
        workSwitcher={<WorkSwitcher currentId={currentWork} onSwitch={switchWork}
          workIndex={workIndex}
          onNewWork={() => setShowNewWork(true)} onDeleteWork={deleteCurrentWork} />}
        isScriptMode={writeMode === "script"}
        canLoadFromBlocks={Array.isArray(blocks) && blocks.length > 0}
        onLoadFromBlocks={() => writeTabRef.current?.loadFromBlocks()}
        onLoadSeed={() => writeTabRef.current?.loadSeed()}
        onClearDraft={() => writeTabRef.current?.clearDraft()} />
      {showNewWork && <NewWorkModal onClose={() => setShowNewWork(false)} onCreated={handleWorkCreated} />}
      {showAI && <AiAssistPanel onClose={() => setShowAI(false)} blocks={blocks} characters={characters} />}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 200,
          background: "color-mix(in srgb, var(--navy-deep) 80%, transparent)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-serif-en)", fontSize: 16,
          color: "var(--gold)", letterSpacing: "0.1em",
        }}>Loading…</div>
      )}
      {/* 廳墨色 accent — 劇本工房 = 莓紅（HANDOFF §5: Editor/Reader/Search「apply
          deskbar + berry ink accents」；套在共用書桌列下方，四個 tab 都吃得到，
          不必逐一改 Editor/Reader/Search 內部樣式） */}
      <div style={{ height: 2, flex: "none", background: "var(--ink-dramaturgica)", opacity: 0.55 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "swFade 200ms ease" }} key={tab + currentWork}>
        {tab === "write"  && <WriteTab  ref={writeTabRef} blocks={blocks} setBlocks={setBlocks} characters={characters} workId={currentWork} onModeChange={setWriteMode} />}
        {tab === "search" && <SearchView blocks={blocks} characters={characters} charColors={charColors} work={workMeta} goToEditor={() => setTab("editor")} goToReader={() => setTab("reader")} goToBlock={goToBlock} />}
        {tab === "editor" && <EditorView blocks={blocks} setBlocks={setBlocks} characters={characters} charColors={charColors} setCharacters={setCharacters} setCharColors={setCharColors} script={script} workId={currentWork} work={workMeta} />}
        {tab === "reader" && <ReaderView blocks={blocks} goToBlock={goToBlock} work={workMeta} characters={characters} charColors={charColors} workId={currentWork} />}
      </div>
    </div>
  );
}

// Mount logic moved to main.jsx. Export App + loader for Vite entry.
export default App;
export { loadAllData };
