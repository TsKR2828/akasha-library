import React from "react";
import { parsePlainScript, blocksToPlainScript, diffMergeBlocks, computeStats, getLineCol } from "../lib/parser.js";
import { useVoiceTTS } from "../hooks/useVoiceTTS.js";
import BgmPanel from "./BgmPanel.jsx";

/* ===========================================================
   WriteTab — Phase 17 (v2-3 ~ v2-6 cumulative)
   ─────────────────────────────────────────────────────────
   Layout:    [ textarea (1fr) | preview pane (360px) ]
   Parser:    Plain Script regex → blocks[] (local, not committed to main state)
   Stores:    localStorage "sw_write_draft" (debounced 500ms)
   Roadmap:   v2-4 Alt+N shortcuts ✓
              v2-5 Voice TTS (Web Speech API) ✓
              v2-6 BGM/SFX panel — placeholder; audio synth handled by
                   sister project tsuki-synth (C++/JUCE VST3, see BgmPanel.jsx)
              v2-7 cross-TAB sync (Write ↔ Editor/Reader) — pending
   =========================================================== */

// Draft & locks are now per-work (workId passed as prop)
const DRAFT_BASE = "sw_write_draft_v1";
const LOCKS_BASE = "sw_slot_locks_v1";
const MODE_BASE = "sw_write_mode_v1";
const WRITE_MODES = ["novel", "script", "notes"];
const MODE_CONFIG = {
  novel:  { label: "Novel",  zh: "小說",   badge: "Novel",        defaultPreviewTab: "outline" },
  script: { label: "Script", zh: "劇本",   badge: "Plain Script", defaultPreviewTab: "blocks" },
  notes:  { label: "Notes",  zh: "筆記",   badge: "Notes",        defaultPreviewTab: "outline" },
};

const PREVIEW_TAB_LABELS = {
  blocks:  { en: "PARA",  zh: "段落" },
  stats:   { en: "STATS", zh: "統計" },
  outline: { en: "OUTL",  zh: "大綱" },
  voice:   { en: "VOICE", zh: "語音" },
  bgm:     { en: "BGM",   zh: "配樂" },
};

function normalizeMode(mode) { return WRITE_MODES.includes(mode) ? mode : "script"; }
function modeKey(workId) { return workId ? `${MODE_BASE}_${workId}` : MODE_BASE; }
function draftKey(workId, mode = "script") {
  const suffix = normalizeMode(mode) === "script" ? "" : `__${normalizeMode(mode)}`;
  return workId ? `${DRAFT_BASE}_${workId}${suffix}` : `${DRAFT_BASE}${suffix}`;
}
function locksKey(workId) { return workId ? `${LOCKS_BASE}_${workId}` : LOCKS_BASE; }

function loadLocks(workId) {
  try { return JSON.parse(localStorage.getItem(locksKey(workId)) || "{}"); }
  catch { return {}; }
}
function saveLocks(obj, workId) {
  try { localStorage.setItem(locksKey(workId), JSON.stringify(obj)); } catch {}
}
function loadMode(workId) {
  try { return normalizeMode(localStorage.getItem(modeKey(workId)) || "script"); }
  catch { return "script"; }
}
function saveMode(mode, workId) {
  try { localStorage.setItem(modeKey(workId), normalizeMode(mode)); } catch {}
}
const SEED = `#scene：第一幕 · 第一場
旁白：（在此描述場景氛圍與舞台指示。）
角色A：對白範例——直接輸入角色名加冒號。
角色B：（表情）第二位角色的台詞。
// 這是註解，會以「編註」區塊保留
#bgm：背景音樂標記`;

const TYPE_COLORS = {
  dialogue:  { fg: "var(--gold)",          bg: "rgba(201,168,106,0.10)", bd: "var(--gold-line)" },
  narration: { fg: "rgb(154,161,173)",     bg: "rgba(154,161,173,0.08)", bd: "rgba(154,161,173,0.20)" },
  scene:     { fg: "var(--gold-bright)",   bg: "rgba(227,196,134,0.10)", bd: "rgba(227,196,134,0.25)" },
  command:   { fg: "rgb(123,142,201)",     bg: "rgba(123,142,201,0.10)", bd: "rgba(123,142,201,0.25)" },
  choice:    { fg: "rgb(168,156,216)",     bg: "rgba(168,156,216,0.10)", bd: "rgba(168,156,216,0.25)" },
  note:      { fg: "rgb(100,107,120)",     bg: "rgba(100,107,120,0.08)", bd: "rgba(100,107,120,0.20)" },
};

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '') ? '⌥' : 'Alt+';

function loadDraft(workId, mode = "script") {
  try { return localStorage.getItem(draftKey(workId, mode)); }
  catch { return null; }
}
function saveDraft(text, workId, mode = "script") {
  try { localStorage.setItem(draftKey(workId, mode), text); } catch {}
}
function initialContentForMode(workId, mode, blocks, characters) {
  const normalized = normalizeMode(mode);
  const saved = loadDraft(workId, normalized);
  if (saved != null && saved !== "") return saved;
  if (normalized === "script") {
    if (Array.isArray(blocks) && blocks.length > 0) {
      return blocksToPlainScript(blocks, characters);
    }
    return SEED;
  }
  return "";
}

const WriteTab = React.forwardRef(function WriteTab({ blocks, setBlocks, characters, workId, onModeChange }, ref) {
  /* ---------- initial textarea content ----------
     1) localStorage draft 優先（user-authored 不該被 Lohengrin 覆寫）
     2) 否則用 blocks 反向產生（讓 Reader/Editor 載入的劇本能在 Write 看見）
     3) 都沒有 → SEED 範例 */
  const initialMode = React.useMemo(() => loadMode(workId), []);
  const initialContent = React.useMemo(() => {
    return initialContentForMode(workId, initialMode, blocks, characters);
    // 只在 mount 時計算一次（後續同步交給 effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [writeMode, setWriteMode] = React.useState(initialMode);
  const [content, setContent] = React.useState(initialContent);
  const [previewTab, setPreviewTab] = React.useState(() => MODE_CONFIG[initialMode].defaultPreviewTab);
  const [caret, setCaret] = React.useState(0);
  const taRef = React.useRef(null);
  const isScriptMode = writeMode === "script";
  const activeModeConfig = MODE_CONFIG[writeMode] || MODE_CONFIG.script;
  const availablePreviewTabs = React.useMemo(
    () => isScriptMode ? ["blocks", "stats", "outline", "voice", "bgm"] : ["stats", "outline"],
    [isScriptMode]
  );

  /* parse + stats — v2-fix4: 把 characters 傳給 parser 反查 speakerId */
  const parsedBlocks = React.useMemo(() => isScriptMode ? parsePlainScript(content, characters) : [], [content, characters, isScriptMode]);
  const stats = React.useMemo(() => computeStats(parsedBlocks), [parsedBlocks]);
  React.useEffect(() => { saveMode(writeMode, workId); }, [writeMode, workId]);
  React.useEffect(() => {
    if (!availablePreviewTabs.includes(previewTab)) {
      setPreviewTab(activeModeConfig.defaultPreviewTab);
    }
  }, [activeModeConfig.defaultPreviewTab, availablePreviewTabs, previewTab]);
  /* ---------- chapter pagination ----------
     content 是完整原文（source of truth）；chapter 模式下 textarea 只顯示一章。
     章節由 #scene: 行自動切分。編輯單章時 splice 回完整 content，
     parsedBlocks / forward sync / stats 全都從完整 content 計算。 */
  const [activeChapter, setActiveChapter] = React.useState(null); // null=全部, number=index
  React.useEffect(() => {
    if (!isScriptMode && activeChapter != null) setActiveChapter(null);
  }, [isScriptMode, activeChapter]);

  const chapters = React.useMemo(() => {
    if (!isScriptMode) return [];
    if (!content) return [];
    const lines = content.split('\n');
    const scenes = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^#scene\s*[：:]/i.test(lines[i])) {
        scenes.push({ lineIdx: i, label: lines[i].replace(/^#scene\s*[：:]\s*/i, '').trim() });
      }
    }
    if (scenes.length === 0) return [];
    const result = [];
    if (scenes[0].lineIdx > 0) {
      result.push({ label: '（序）', startLine: 0, endLine: scenes[0].lineIdx - 1 });
    }
    for (let i = 0; i < scenes.length; i++) {
      const endLine = i + 1 < scenes.length ? scenes[i + 1].lineIdx - 1 : lines.length - 1;
      result.push({ label: scenes[i].label, startLine: scenes[i].lineIdx, endLine });
    }
    return result;
  }, [content, isScriptMode]);

  const chapterView = React.useMemo(() => {
    if (activeChapter == null || !chapters[activeChapter]) {
      return { text: content, lineOffset: 0 };
    }
    const ch = chapters[activeChapter];
    const lines = content.split('\n');
    return { text: lines.slice(ch.startLine, ch.endLine + 1).join('\n'), lineOffset: ch.startLine };
  }, [content, activeChapter, chapters]);

  // Clamp activeChapter when chapters shrink
  React.useEffect(() => {
    if (activeChapter != null && activeChapter >= chapters.length) {
      setActiveChapter(chapters.length > 0 ? chapters.length - 1 : null);
    }
  }, [chapters.length, activeChapter]);

  // Chapter-aware content setter: splices chapter text back into full content
  const setVisibleContent = React.useCallback((newText) => {
    if (activeChapter == null || !chapters[activeChapter]) {
      setContent(newText);
      return;
    }
    const ch = chapters[activeChapter];
    const allLines = content.split('\n');
    const before = allLines.slice(0, ch.startLine);
    const after = allLines.slice(ch.endLine + 1);
    setContent([...before, ...newText.split('\n'), ...after].join('\n'));
  }, [content, activeChapter, chapters]);

  // Line/col relative to visible text (chapter slice or full)
  const { line, col } = React.useMemo(() => getLineCol(chapterView.text, caret), [chapterView.text, caret]);
  // Global line for outline active-scene tracking
  const globalLine = line + chapterView.lineOffset;

  /* ---------- content-level stats (raw textarea) ---------- */
  const contentStats = React.useMemo(() => {
    const lines = content.split('\n');
    const lineCount = lines.length;
    const charCount = content.replace(/[\s\n]/g, '').length;
    const readingMin = Math.max(1, Math.round(charCount / 400));
    return { lineCount, charCount, readingMin };
  }, [content]);

  /* ---------- scene outline for structure panel ---------- */
  const sceneOutline = React.useMemo(() => {
    if (!isScriptMode) return [];
    const sections = [];
    let cur = { scene: null, dialogues: 0, narrations: 0, commands: 0 };
    for (const b of parsedBlocks) {
      if (b.type === 'scene') {
        if (cur.scene || cur.dialogues + cur.narrations > 0) sections.push({ ...cur });
        cur = { scene: b, dialogues: 0, narrations: 0, commands: 0 };
      } else {
        if (b.type === 'dialogue') cur.dialogues++;
        else if (b.type === 'narration') cur.narrations++;
        else if (b.type === 'command') cur.commands++;
      }
    }
    if (cur.scene || cur.dialogues + cur.narrations > 0) sections.push({ ...cur });
    return sections;
  }, [parsedBlocks, isScriptMode]);

  /* ---------- heading outline (H1~H4 from raw content) ---------- */
  const headingOutline = React.useMemo(() => {
    const result = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,4})\s+(.+)$/);
      // Skip #command: lines (they start with #word: not # space)
      if (m && !/^#\w+[：:]/.test(lines[i])) {
        result.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
      }
    }
    return result;
  }, [content]);

  /* ---------- jump to line (for outline clicks) ---------- */
  const jumpToLine = React.useCallback((lineNum) => {
    const lineIdx = lineNum - 1; // 0-indexed
    // Always exit chapter mode — show full content so user can see context
    if (activeChapter != null) setActiveChapter(null);
    // Use rAF to wait for React to commit full content after chapter exit
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const lines = ta.value.split('\n');
      let off = 0;
      for (let i = 0; i < Math.min(lineIdx, lines.length); i++) off += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(off, off);
      setCaret(off);
      // anchorCaretView will handle scroll via useLayoutEffect on caret change
    });
  }, [content, activeChapter]);

  /* Voice TTS (v2-5) */
  const voice = useVoiceTTS();

  /* ---------- v2-7 BI-DIRECTIONAL SYNC ----------
     Forward:  textarea → parsedBlocks → setBlocks   (debounced 350ms)
     Reverse:  blocks → blocksToPlainScript → textarea (when external)
     Loop guards:
       - syncTokenRef: 自己 push 造成 blocks 變動 → reverse useEffect 消化跳過
       - lastReverseRef: reverse 設進來的 content 不要再回 forward push
                         （否則 round-trip 的元數據遺失會回頭覆寫 Editor）
       - lastBlocksRef:  reverse sync 只在 blocks 物件真正變動時執行；
                         模式切換 / workId 變動觸發 effect 但 blocks 沒變時不重生成 */
  const syncTokenRef = React.useRef(0);
  const lastReverseRef = React.useRef(null);
  const lastBlocksRef = React.useRef(null); // I2: 首次 null → 第一輪 reverse 照常執行
  const initializedRef = React.useRef(false);
  const forwardTimer = React.useRef(null);
  const [syncStatus, setSyncStatus] = React.useState("idle"); // idle | pushing | external

  // 以 ref 追蹤最新值，供 unmount flush 使用（deps [] effect 無法捕捉 closure 最新值）
  const contentRef = React.useRef(content);
  const writeModeRef = React.useRef(writeMode);
  const workIdRef = React.useRef(workId);
  const blocksRef = React.useRef(blocks);
  const charactersRef = React.useRef(characters);
  React.useEffect(() => { contentRef.current = content; });
  React.useEffect(() => { writeModeRef.current = writeMode; });
  React.useEffect(() => { workIdRef.current = workId; });
  React.useEffect(() => { blocksRef.current = blocks; });
  React.useEffect(() => { charactersRef.current = characters; });

  // Forward sync — push parsedBlocks 到 parent blocks
  React.useEffect(() => {
    if (!isScriptMode) {
      clearTimeout(forwardTimer.current);
      setSyncStatus("idle");
      return;
    }
    if (!setBlocks) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      // 首次 mount：blocks 有資料時跳過（避免 SEED/draft 吞掉 server data）
      // 但 blocks 為空時立即同步（新建作品需要 SEED 寫入 blocks）
      if (Array.isArray(blocks) && blocks.length > 0) return;
    }
    if (content === lastReverseRef.current) {
      // 這次 content 是 reverse 推進來的，不要 echo 回去
      lastReverseRef.current = null;
      setSyncStatus("idle");
      return;
    }
    clearTimeout(forwardTimer.current);
    setSyncStatus("pushing");
    forwardTimer.current = setTimeout(() => {
      syncTokenRef.current++;
      setBlocks(diffMergeBlocks(blocks, parsedBlocks));
      setSyncStatus("idle");
    }, 350);
    return () => clearTimeout(forwardTimer.current);
  }, [parsedBlocks, setBlocks, content, isScriptMode]);

  // Reverse sync — blocks 從外部變動時，重產 textarea
  React.useEffect(() => {
    if (!isScriptMode) return;
    // novel/notes early-return 時不更新 lastBlocksRef：
    // 切回 script 時要讓 blocks-ref 判斷重新執行，以免漏掉真正的外部變動
    if (syncTokenRef.current > 0) {
      syncTokenRef.current--;
      return; // 自己 push 造成的 echo，跳過
    }
    if (!Array.isArray(blocks)) return;
    // blocks 物件沒變時不重生成，防止模式切換觸發假覆蓋
    if (blocks === lastBlocksRef.current) return;
    lastBlocksRef.current = blocks;
    const regenerated = blocksToPlainScript(blocks, characters);
    if (regenerated && regenerated !== content) {
      lastReverseRef.current = regenerated;
      setContent(regenerated);
      saveDraft(regenerated, workId, writeMode);
      setSyncStatus("external");
      setTimeout(() => setSyncStatus("idle"), 600);
    }
    // 不把 content 加進依賴（避免 setContent → 再觸發）；blocks 變了才同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, characters, isScriptMode, workId, writeMode]);

  // Unmount flush — 元件卸載前把未到期的 debounce 立即補完
  React.useEffect(() => {
    return () => {
      const mode = writeModeRef.current;
      const wid = workIdRef.current;
      const text = contentRef.current;
      // 換/刪作品時(switchWork 已同步改寫 sw_last_work)不准 flush：
      // setBlocks 會把舊作品內容灌進新作品；saveDraft 會復活剛刪除作品的 key。
      // sw_last_work 為 null（首次啟動、從未切換）視為同作品。
      let last = null;
      try { last = localStorage.getItem("sw_last_work"); } catch { /* 隱私模式拋錯，視為同作品 */ }
      if (last !== null && last !== wid) return;
      // (a) 草稿立即存入 localStorage（補 500ms save debounce）
      saveDraft(text, wid, mode);
      // (b) script 模式：若 content 不是 reverse 推進來的，立即 push blocks
      //     不用 syncTokenRef++：靠 lastBlocksRef gating 防 reverse echo
      if (mode === "script" && setBlocks && text !== lastReverseRef.current) {
        const blks = blocksRef.current;
        const chars = charactersRef.current;
        setBlocks(diffMergeBlocks(blks, parsePlainScript(text, chars)));
      }
    };
    // deps [] — 只在 unmount 時跑一次；最新值靠 ref 取得
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── v2-4 + fix5: Alt+N slots with lock/assign ─────────
     1, 2 固定（場景 / 旁白）；3-9 先看 locks 再 auto-bind */
  const [locks, setLocks] = React.useState(() => loadLocks(workId));
  const [ctxMenu, setCtxMenu] = React.useState(null); // { slotN, x, y }

  React.useEffect(() => { saveLocks(locks, workId); }, [locks, workId]);

  // close context menu on any click
  React.useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  const allSpeakers = React.useMemo(() => {
    if (!isScriptMode) return [];
    const seen = [];
    // Characters from the character table first (stable source)
    for (const c of (characters || [])) {
      const name = c.name || c.nameEn || c.id;
      if (name && !seen.includes(name)) seen.push(name);
    }
    // Then speakers from parsed text (catches new/unbound names)
    for (const b of parsedBlocks) {
      if (b.type === "dialogue" && b.speaker && !seen.includes(b.speaker))
        seen.push(b.speaker);
    }
    return seen;
  }, [parsedBlocks, characters, isScriptMode]);

  const dynamicSlots = React.useMemo(() => {
    const slots = Array(7).fill(null);
    const used = new Set();
    const cleared = new Set();
    // 1. locked slots first
    for (let i = 0; i < 7; i++) {
      const n = i + 3;
      if (!locks[n]) continue;
      if (locks[n] === "__clear__") { cleared.add(i); continue; }
      if (allSpeakers.includes(locks[n])) {
        slots[i] = locks[n];
        used.add(locks[n]);
      }
    }
    // 2. auto-fill remaining (skip cleared slots)
    let ai = 0;
    for (let i = 0; i < 7; i++) {
      if (slots[i] || cleared.has(i)) continue;
      while (ai < allSpeakers.length && used.has(allSpeakers[ai])) ai++;
      if (ai < allSpeakers.length) {
        slots[i] = allSpeakers[ai];
        used.add(allSpeakers[ai]);
        ai++;
      }
    }
    return slots;
  }, [allSpeakers, locks]);

  const overflow = allSpeakers.filter(s => !dynamicSlots.includes(s));

  // All 9 slots are assignable. Defaults: 1=#scene, 2=旁白, 3-9=dynamic speakers.
  const slotLabels = React.useMemo(() => {
    const result = {};
    for (let n = 1; n <= 9; n++) {
      if (locks[n] && locks[n] !== "__clear__") {
        // User-assigned override (including #scene / 旁白 if re-assigned)
        result[n] = locks[n];
      } else if (locks[n] === "__clear__") {
        result[n] = null;
      } else if (n === 1) {
        result[n] = "#scene";
      } else if (n === 2) {
        result[n] = "旁白";
      } else {
        result[n] = dynamicSlots[n - 3] || null;
      }
    }
    return result;
  }, [dynamicSlots, locks]);

  const isLocked = (n) => !!locks[n] && locks[n] !== "__clear__";

  const onSlotContext = React.useCallback((e, n) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || rect.left;
    const y = e.clientY || rect.bottom + 4;
    setCtxMenu({ slotN: n, x, y });
  }, []);

  const lockSlot = (n) => {
    const label = slotLabels[n];
    if (label) setLocks(prev => ({ ...prev, [n]: label }));
  };
  const unlockSlot = (n) => {
    setLocks(prev => { const next = { ...prev }; delete next[n]; return next; });
  };
  const clearSlot = (n) => {
    setLocks(prev => { const next = { ...prev }; next[n] = "__clear__"; return next; });
  };
  const assignSlot = (n, speaker) => {
    setLocks(prev => ({ ...prev, [n]: speaker }));
  };

  /* insertSpeakerPrefix — Alt+N or click slot:
     於目前游標所在行的開頭塞入 prefix；若該行已有 speaker：前綴就替換之，
     不論前綴是命令（#xxx：）或對白（X：）。游標跳到「：」之後。 */
  const insertSpeakerPrefix = React.useCallback((slotN) => {
    if (!isScriptMode) return;
    const ta = taRef.current;
    if (!ta) return;
    const label = slotLabels[slotN];
    if (!label) return;
    const prefix = `${label}：`;

    const value = ta.value;
    const start = ta.selectionStart ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNl   = value.indexOf("\n", start);
    const lineEnd  = nextNl === -1 ? value.length : nextNl;
    const currentLine = value.slice(lineStart, lineEnd);

    // 偵測既有前綴：#cmd：  或  Speaker：
    const m = currentLine.match(/^(#[\w.\-]+|[^#\n][^：:]{0,20})[：:]/);
    const newLine = m
      ? prefix + currentLine.slice(m[0].length).replace(/^\s+/, "")
      : prefix + currentLine;

    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    setVisibleContent(newValue);

    const caretPos = lineStart + prefix.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretPos, caretPos);
      setCaret(caretPos);
    });
  }, [slotLabels, isScriptMode]);

  const onKeyDown = React.useCallback((e) => {
    if (!isScriptMode) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      insertSpeakerPrefix(Number(e.key));
    }
  }, [insertSpeakerPrefix, isScriptMode]);

  /* debounced auto-save */
  const saveTimer = React.useRef(null);
  React.useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(content, workId, writeMode), 500);
    return () => clearTimeout(saveTimer.current);
  }, [content, workId, writeMode]);

  const onTextChange = e => setVisibleContent(e.target.value);
  const onCaretMove  = e => setCaret(e.target.selectionStart || 0);

  /* v2-fix6: 打字機捲動 — mirror div 量測真實 caret Y 位置
     解決 pre-wrap 軟換行導致 \n 行數 ≠ 視覺行數的問題。
     使用隱藏 mirror div 複製 textarea 樣式，插入 marker span 量測 offsetTop。
     舒適區 25%–55%：游標在此範圍內不捲動，超出才對齊 42%。 */
  const mirrorRef = React.useRef(null);
  React.useEffect(() => () => {
    if (mirrorRef.current?.parentNode) mirrorRef.current.parentNode.removeChild(mirrorRef.current);
  }, []);

  const anchorCaretView = React.useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;

    // Lazy-create mirror div
    if (!mirrorRef.current) {
      mirrorRef.current = document.createElement('div');
      Object.assign(mirrorRef.current.style, {
        position: 'absolute', top: '-9999px', left: '-9999px',
        visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden',
      });
      document.body.appendChild(mirrorRef.current);
    }

    const mirror = mirrorRef.current;
    const cs = getComputedStyle(ta);
    Object.assign(mirror.style, {
      whiteSpace: cs.whiteSpace,
      overflowWrap: cs.overflowWrap || 'break-word',
      wordBreak: cs.wordBreak,
      width: ta.clientWidth + 'px',
      font: cs.font,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      padding: cs.paddingTop + ' ' + cs.paddingRight + ' 0 ' + cs.paddingLeft,
      boxSizing: 'border-box',
    });

    const pos = ta.selectionStart || 0;
    mirror.textContent = '';
    mirror.appendChild(document.createTextNode(ta.value.slice(0, pos)));
    const marker = document.createElement('span');
    marker.textContent = '​'; // zero-width space for height
    mirror.appendChild(marker);

    const caretPx = marker.offsetTop;
    const viewportH = ta.clientHeight;
    const anchor = viewportH * 0.42;
    const currentTop = caretPx - ta.scrollTop;
    if (currentTop < viewportH * 0.25 || currentTop > viewportH * 0.55) {
      ta.scrollTop = Math.max(0, caretPx - anchor);
    }
  }, []);

  /* After React commits new textarea value to DOM, re-anchor before paint.
     This defeats the browser's auto-scroll-to-caret that overrides our scrollTop. */
  React.useLayoutEffect(() => {
    anchorCaretView();
  }, [chapterView.text, caret, anchorCaretView]);

  const switchWriteMode = React.useCallback((nextMode) => {
    const normalized = normalizeMode(nextMode);
    if (normalized === writeMode) return;
    saveDraft(content, workId, writeMode);
    // script 模式離開前：立即 flush 未到期的 forward debounce（補 350ms）
    // 不用 syncTokenRef++：依賴 lastBlocksRef gating 防止 reverse echo
    if (writeMode === "script" && setBlocks && content !== lastReverseRef.current) {
      clearTimeout(forwardTimer.current);
      setBlocks(diffMergeBlocks(blocks, parsePlainScript(content, characters)));
    }
    saveMode(normalized, workId);
    const nextContent = initialContentForMode(workId, normalized, blocks, characters);
    lastReverseRef.current = nextContent;
    setWriteMode(normalized);
    setContent(nextContent);
    setPreviewTab(MODE_CONFIG[normalized].defaultPreviewTab);
    setActiveChapter(null);
    setCtxMenu(null);
    setCaret(0);
    setSyncStatus("idle");
  }, [blocks, characters, content, workId, writeMode]);

  const onClearDraft = () => {
    if (!confirm("清除草稿？此動作會清除本地儲存的速寫內容。")) return;
    setContent("");
    saveDraft("", workId, writeMode);
  };
  const onResetSeed = () => {
    if (content && !confirm("以範例覆蓋目前草稿？")) return;
    setContent(SEED);
  };
  const onLoadFromBlocks = () => {
    if (!Array.isArray(blocks) || blocks.length === 0) return;
    if (content && !confirm("以目前劇本覆蓋草稿？")) return;
    const text = blocksToPlainScript(blocks, characters);
    setContent(text);
    saveDraft(text, workId, writeMode);
  };

  /* deskbar (App.jsx) lives above this component and needs to know the
     current write mode (to show/hide 從劇本回填／範例) and needs to trigger
     these actions — exposed via ref since the deskbar is now the module's
     only chrome row (HANDOFF §5), not a toolbar drawn inside WriteTab. */
  React.useEffect(() => { onModeChange?.(writeMode); }, [writeMode, onModeChange]);
  React.useImperativeHandle(ref, () => ({
    loadFromBlocks: onLoadFromBlocks,
    loadSeed: onResetSeed,
    clearDraft: onClearDraft,
  }));

  return (
    <div className="sw-write-root" style={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: "1fr 300px",
      gridTemplateRows: "1fr auto",
      overflow: "hidden",
      animation: "swFade 200ms ease",
      background: "var(--page-bg)",
    }}>
      {/* ───── manuscript column (left) — paper-clip genre tabs + ruled
             manuscript paper + pen-tray persona slots, HANDOFF §5 ───── */}
      <div className="sw-manuscript-col" style={{ gridColumn: "1 / 2", gridRow: "1 / 2" }}>
        <div className="sw-genre-tabs seg seg--tab" role="tablist" aria-label="體裁">
          {WRITE_MODES.map(mode => {
            const active = writeMode === mode;
            const cfg = MODE_CONFIG[mode];
            return (
              <button key={mode} type="button" role="tab" aria-selected={active}
                className={"seg__opt" + (active ? " is-active" : "")}
                onClick={() => switchWriteMode(mode)} title={cfg.label}>
                {cfg.zh}
              </button>
            );
          })}
        </div>

        <div className="sw-manuscript">
          <div className="sw-manuscript-stats">
            {contentStats.charCount.toLocaleString()} 字 · {contentStats.lineCount} 行 · 約 {contentStats.readingMin} 分鐘
          </div>
          <textarea
            ref={taRef}
            className="sw-manuscript-textarea"
            value={chapterView.text}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => { onCaretMove(e); anchorCaretView(); }}
            onClick={(e) => { onCaretMove(e); anchorCaretView(); }}
            onSelect={onCaretMove}
            onInput={() => requestAnimationFrame(anchorCaretView)}
            spellCheck={false}
            placeholder={isScriptMode
              ? `輸入 Plain Script — 例：\n#scene：第一幕\n旁白：天色將明……\n角色名：「對白」\n#bgm：piano_morning\n\n快捷鍵：Alt+1 場景 / Alt+2 旁白 / Alt+3~9 角色`
              : `${activeModeConfig.zh}模式 — 可使用 Markdown 標題建立大綱\n# 第一章\n## 場景或段落\n\n直接開始書寫內容。`}
          />
        </div>

        {/* ───── pen tray (bottom edge) — PERSONA SLOTS, v2-4 ───── */}
        {isScriptMode && (
          <div className="sw-pen-tray">
            <span className="sw-pen-tray__label">ALT＋</span>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <SlotBadge
                key={n}
                n={n}
                label={slotLabels[n]}
                locked={isLocked(n)}
                onClick={(e) => onSlotContext(e, n)}
                onDoubleClick={() => { if (slotLabels[n]) insertSpeakerPrefix(n); }}
                onContextMenu={(e) => onSlotContext(e, n)}
              />
            ))}
            {overflow.length > 0 && (
              <span className="sw-pen-tray__overflow" title={overflow.join("、")}>⋯ +{overflow.length}</span>
            )}
            <span className="sw-pen-tray__hint">the pen tray · 右鍵可鎖定</span>
          </div>
        )}
      </div>

      {/* ───── index rail (right) — 5 preview tabs as index cards ───── */}
      <div className="sw-index-rail" style={{ gridColumn: "2 / 3", gridRow: "1 / 2" }}>
        <div className="sw-index-tabs" role="tablist" aria-label="預覽">
          {availablePreviewTabs.map(id => {
            const active = previewTab === id;
            const meta = PREVIEW_TAB_LABELS[id];
            return (
              <button key={id} type="button" role="tab" aria-selected={active}
                className={"sw-index-tab" + (active ? " is-active" : "")}
                onClick={() => setPreviewTab(id)}>
                <span className="sw-index-tab__en">{meta.en}</span>
                <span className="sw-index-tab__zh">{meta.zh}</span>
              </button>
            );
          })}
        </div>
        <div className="sw-index-card">
          {previewTab === "blocks" && isScriptMode && <BlocksPreview blocks={parsedBlocks} voice={voice} />}
          {previewTab === "stats"  && (isScriptMode ? <StatsPreview stats={stats} /> : <TextStatsPreview stats={contentStats} headings={headingOutline} mode={activeModeConfig} />)}
          {previewTab === "voice"  && isScriptMode && <VoicePanel blocks={parsedBlocks} voice={voice} />}
          {previewTab === "bgm"    && isScriptMode && <BgmPanel blocks={parsedBlocks} />}
          {previewTab === "outline" && <OutlinePanel outline={sceneOutline} headings={headingOutline} onJump={jumpToLine} activeLine={globalLine} showSceneHint={isScriptMode} />}
        </div>
      </div>

      {/* ───── status bar (row 2, spans both cols) — dark 28px, HANDOFF §5 ───── */}
      <div className="sw-statusbar" style={{ gridColumn: "1 / 3", gridRow: "2 / 3" }}>
        <span>LN {line} · COL {col}</span>
        {activeChapter != null && chapters[activeChapter] && (
          <span onClick={() => setActiveChapter(null)} title="點擊回到全部"
            className="sw-statusbar__chip" style={{ cursor: "pointer" }}>
            ◂ {chapters[activeChapter].label}
          </span>
        )}
        <span className="sw-statusbar__chip">{activeModeConfig.badge}</span>
        {isScriptMode ? (
          <>
            <span>{parsedBlocks.length} BLOCKS PARSED</span>
            {syncStatus === "pushing" && (
              <span style={{ color: "var(--gold-dim)" }}>↻ SYNC→</span>
            )}
            {syncStatus === "external" && (
              <span style={{ color: "rgb(168,156,216)" }}>← PULLED FROM EDITOR</span>
            )}
            {syncStatus === "idle" && setBlocks && (
              <span className="sw-statusbar__ok" title="Forward & reverse sync 已連通">⇄ SYNCED</span>
            )}
            {voice.state.queueActive && (
              <span className="sw-statusbar__live">▶ VOICE {voice.state.queueIdx + 1}/{voice.state.queueTotal}</span>
            )}
            {!voice.state.queueActive && voice.state.speaking && (
              <span className="sw-statusbar__live">▶ SPEAKING</span>
            )}
          </>
        ) : (
          <span>{headingOutline.length} HEADINGS</span>
        )}
        <span style={{ flex: 1 }} />
        <span className="sw-statusbar__ok">● AUTO-SAVE</span>
        <span>打字機模式 ON</span>
      </div>

      {/* ───── slot context menu ───── */}
      {isScriptMode && ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 999,
            background: "var(--navy-light)", border: "1px solid var(--navy-line)",
            borderRadius: 4, padding: "4px 0", minWidth: 140,
            boxShadow: "var(--shadow-lift)",
          }}
        >
          {/* Insert action */}
          {slotLabels[ctxMenu.slotN] && (
            <CtxItem label={`▸ 插入「${slotLabels[ctxMenu.slotN]}：」`} onClick={() => { insertSpeakerPrefix(ctxMenu.slotN); setCtxMenu(null); }} />
          )}
          {slotLabels[ctxMenu.slotN] && <div style={{ height: 1, background: "var(--navy-line)", margin: "4px 0" }} />}
          {/* Lock / Unlock */}
          {slotLabels[ctxMenu.slotN] && !isLocked(ctxMenu.slotN) && (
            <CtxItem label="🔒 鎖定" onClick={() => { lockSlot(ctxMenu.slotN); setCtxMenu(null); }} />
          )}
          {isLocked(ctxMenu.slotN) && (
            <CtxItem label="🔓 解鎖" onClick={() => { unlockSlot(ctxMenu.slotN); setCtxMenu(null); }} />
          )}
          {slotLabels[ctxMenu.slotN] && (
            <CtxItem label="✕ 清除" danger onClick={() => { clearSlot(ctxMenu.slotN); setCtxMenu(null); }} />
          )}
          <div style={{ height: 1, background: "var(--navy-line)", margin: "4px 0" }} />
          {/* Assign section — preset commands + character speakers */}
          <div style={{ padding: "2px 10px", fontSize: 9.5, color: "var(--text-tertiary)",
            fontFamily: "var(--font-serif-en)", letterSpacing: "0.14em", textTransform: "uppercase",
          }}>Assign</div>
          <CtxItem label="#scene（場景）" onClick={() => { assignSlot(ctxMenu.slotN, "#scene"); setCtxMenu(null); }} />
          <CtxItem label="旁白" onClick={() => { assignSlot(ctxMenu.slotN, "旁白"); setCtxMenu(null); }} />
          {allSpeakers.filter(s => s !== "#scene" && s !== "旁白" && s !== slotLabels[ctxMenu.slotN]).map(s => (
            <CtxItem key={s} label={s} onClick={() => { assignSlot(ctxMenu.slotN, s); setCtxMenu(null); }} />
          ))}
          {allSpeakers.length === 0 && (
            <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>（劇本中無角色）</div>
          )}
          <div style={{ height: 1, background: "var(--navy-line)", margin: "4px 0" }} />
          <div style={{ padding: "4px 8px" }}>
            <input
              placeholder="輸入新角色名…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  assignSlot(ctxMenu.slotN, e.target.value.trim());
                  setCtxMenu(null);
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus={false}
              style={{
                width: "100%", padding: "4px 6px",
                background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
                borderRadius: 2, color: "var(--cream)",
                fontFamily: "var(--font-serif-tc)", fontSize: 11.5,
                outline: "none",
              }}
            />
          </div>
        </div>
      )}

      {/* chapter bar removed — scene navigation is in the Outline panel (right) */}
    </div>
  );
});

export default WriteTab;

/* ============= Slot Badge → pen-tray chip (v2-4 + fix5, HANDOFF §5 restyle) ============= */
function SlotBadge({ n, label, locked, onClick, onDoubleClick, onContextMenu }) {
  const filled = !!label;

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={filled
        ? `單擊管理 · 雙擊插入「${label}：」· Alt+${n}${locked ? "（已鎖定）" : ""}`
        : `單擊指派角色到 Alt+${n}`}
      className={"sw-slot-chip" + (filled ? " is-filled" : "") + (locked ? " is-locked" : "")}
    >
      <span className="sw-slot-chip__n">{locked ? "🔒" : MOD_KEY}{n}</span>
      <span className="sw-slot-chip__label">{label || "—"}</span>
    </button>
  );
}

/* ============= Context Menu Item ============= */
function CtxItem({ label, danger, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "5px 12px",
        fontSize: 12,
        fontFamily: "var(--font-serif-tc)",
        color: danger ? "var(--danger)" : "var(--text-primary)",
        background: hover ? "var(--navy-hover)" : "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >{label}</div>
  );
}

/* ============= Blocks Preview ============= */
function BlocksPreview({ blocks, voice }) {
  if (!blocks.length) {
    return (
      <div className="se-panel-hint is-empty">
        尚未解析出 block。<br />
        試試在左側輸入「<code className="se-code">角色：對白</code>」或「<code className="se-code">#scene：第一幕</code>」。
      </div>
    );
  }
  return (
    <div className="se-panel-list">
      {blocks.map((b, i) => <BlockCard key={b.id} block={b} index={i + 1} voice={voice} />)}
    </div>
  );
}

function BlockCard({ block, index, voice }) {
  const color = TYPE_COLORS[block.type] || TYPE_COLORS.note;
  const speakable = (block.type === "dialogue" || block.type === "narration") && (block.text || "").trim();
  const speaking = voice?.state.speaking && voice?.state.currentText === (block.text || "");

  const onPlay = (e) => {
    e.stopPropagation();
    if (!voice?.hasTTS) return;
    if (speaking) voice.stop();
    else voice.speakOne(block.text || "");
  };

  return (
    <div style={{
      padding: "8px 10px",
      background: color.bg,
      border: `1px solid ${color.bd}`,
      borderLeft: `3px solid ${color.fg}`,
      borderRadius: "var(--r-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontSize: 9.5,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: color.fg, fontVariant: "small-caps",
        }}>{block.type}</span>
        {block.speaker && (
          <span style={{
            fontFamily: "var(--font-serif-tc)", fontSize: 12,
            color: "var(--text-primary)", fontWeight: 600,
          }}>{block.speaker}</span>
        )}
        {block.command && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--gold-dim)",
          }}>#{block.command}</span>
        )}
        <span style={{ flex: 1 }} />
        {speakable && voice?.hasTTS && (
          <button
            onClick={onPlay}
            title={speaking ? "停止" : "試聽"}
            style={{
              padding: "1px 6px",
              fontSize: 10,
              background: speaking ? "var(--gold)" : "transparent",
              color: speaking ? "var(--navy-deep)" : "var(--gold-dim)",
              border: `1px solid ${speaking ? "var(--gold)" : "var(--gold-line)"}`,
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-serif-en)",
              letterSpacing: "0.08em",
              animation: speaking ? "blink 1.2s infinite" : "none",
            }}
          >{speaking ? "■" : "▶"}</button>
        )}
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          #{index}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
        color: "var(--text-secondary)", lineHeight: 1.5,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {block.text || block.value || ""}
      </div>
    </div>
  );
}

/* ============= Voice Panel (v2-5) ============= */
function VoicePanel({ blocks, voice }) {
  if (!voice.hasTTS) {
    return (
      <div className="se-panel-hint is-empty">
        此瀏覽器不支援 <code className="se-code">speechSynthesis</code>。<br />
        請使用 Chrome / Edge / Safari。
      </div>
    );
  }

  const queue = React.useMemo(() => (blocks || []).filter(b =>
    b.type === "dialogue" || (b.type === "narration" && voice.settings.includeNarration)
  ), [blocks, voice.settings.includeNarration]);

  if (!blocks.length) {
    return (
      <div className="se-panel-hint is-empty">
        尚無對白可試聽。<br />在左側輸入劇本即可。
      </div>
    );
  }

  const onPlayAll = () => voice.playQueue(blocks);
  const onStop    = () => voice.stop();

  // group voices by lang for cleaner picker
  const sortedVoices = React.useMemo(() => {
    return [...voice.voices].sort((a, b) => {
      // prefer zh-* on top
      const aZh = /^zh/i.test(a.lang) ? -1 : 0;
      const bZh = /^zh/i.test(b.lang) ? -1 : 0;
      return aZh - bZh || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
    });
  }, [voice.voices]);

  return (
    <div className="se-panel">
      {/* controls */}
      <div className="se-panel-callout" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={onPlayAll}
          disabled={voice.state.queueActive || queue.length === 0}
          style={btnPrimaryStyle(voice.state.queueActive)}
        >▶ 全部試聽</button>
        <button
          onClick={onStop}
          disabled={!voice.state.queueActive && !voice.state.speaking}
          style={btnGhostStyle}
        >■ 停止</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 10.5, color: "var(--text-tertiary)", letterSpacing: "0.12em" }}>
          {voice.state.queueActive
            ? `${voice.state.queueIdx + 1}/${voice.state.queueTotal}`
            : voice.state.speaking ? "speaking" : `${queue.length} ready`}
        </span>
      </div>

      {/* settings */}
      <section>
        <SectionHead latin="Voice Settings" zh="語音設定" />
        <div className="se-panel-list" style={{ gap: 6 }}>
          <label style={voiceLabelStyle}>
            <span>語音</span>
            <select
              value={voice.settings.voiceId}
              onChange={e => voice.setSettings({ voiceId: e.target.value })}
              style={selectStyle}
            >
              <option value="">系統預設</option>
              {sortedVoices.map(v => (
                <option key={v.name} value={v.name}>{v.name} · {v.lang}</option>
              ))}
            </select>
          </label>

          <label style={voiceLabelStyle}>
            <span>速度</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min="0.5" max="2" step="0.1"
                value={voice.settings.rate}
                onChange={e => voice.setSettings({ rate: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={voiceValStyle}>{voice.settings.rate.toFixed(1)}</span>
            </div>
          </label>

          <label style={voiceLabelStyle}>
            <span>音調</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min="0" max="2" step="0.1"
                value={voice.settings.pitch}
                onChange={e => voice.setSettings({ pitch: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={voiceValStyle}>{voice.settings.pitch.toFixed(1)}</span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            <input
              type="checkbox"
              checked={voice.settings.includeNarration}
              onChange={e => voice.setSettings({ includeNarration: e.target.checked })}
            />
            包含旁白
          </label>
        </div>
      </section>

      {/* queue list */}
      <section>
        <SectionHead latin="Queue" zh={`待播 · ${queue.length}`} />
        <div className="se-panel-list">
          {queue.map((item, qi) => {
            const active = voice.state.queueActive && qi === voice.state.queueIdx;
            return (
              <button
                key={item.id || qi}
                onClick={() => voice.playQueue(blocks, blocks.indexOf(item) >= 0
                  ? queue.indexOf(item) : qi)}
                className={"se-panel-row" + (active ? " is-active" : "")}
                style={{ alignItems: "baseline" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", minWidth: 16 }}>
                  {qi + 1}
                </span>
                <span style={{
                  color: active ? "var(--gold-bright)" : "var(--gold-dim)",
                  fontWeight: 600,
                  minWidth: 56,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{item.speaker || "（旁白）"}</span>
                <span style={{
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}>{item.text}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const btnPrimaryStyle = (active) => ({
  padding: "5px 12px",
  background: active ? "var(--gold-deep)" : "var(--gold-dim)",
  color: active ? "var(--gold-bright)" : "var(--cream)",
  border: "1px solid var(--gold)",
  borderRadius: 2,
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
  cursor: active ? "default" : "pointer",
  letterSpacing: "0.06em",
});
const btnGhostStyle = {
  padding: "5px 12px",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
  cursor: "pointer",
  letterSpacing: "0.06em",
};
const voiceLabelStyle = {
  display: "flex", flexDirection: "column", gap: 3,
  fontFamily: "var(--font-serif-en)",
  fontSize: 10.5, letterSpacing: "0.14em",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
};
const selectStyle = {
  padding: "4px 8px",
  background: "var(--navy-deep)",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-serif-tc)",
  fontSize: 12,
};
const voiceValStyle = {
  fontFamily: "var(--font-serif-en)",
  fontSize: 11,
  color: "var(--gold-dim)",
  minWidth: 28, textAlign: "right",
};

/* ============= Stats Preview ============= */
function StatsPreview({ stats }) {
  const ROWS = [
    ["Dialogue",  stats.counts.dialogue,  TYPE_COLORS.dialogue.fg],
    ["Narration", stats.counts.narration, TYPE_COLORS.narration.fg],
    ["Scene",     stats.counts.scene,     TYPE_COLORS.scene.fg],
    ["Choice",    stats.counts.choice,    TYPE_COLORS.choice.fg],
    ["Note",      stats.counts.note,      TYPE_COLORS.note.fg],
    ["Command",   stats.counts.command,   TYPE_COLORS.command.fg],
  ];

  return (
    <div className="se-panel">
      {/* type counts */}
      <section>
        <SectionHead latin="Block Types" zh="區塊類型" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          {ROWS.map(([label, count, color]) => (
            <div key={label} className="se-panel-row" style={{ justifyContent: "space-between" }}>
              <span style={{
                fontFamily: "var(--font-serif-en)", fontSize: 10.5,
                letterSpacing: "0.14em", color: color, fontVariant: "small-caps",
              }}>{label}</span>
              <span style={{
                fontFamily: "var(--font-serif-en)", fontSize: 14, fontWeight: 600,
                color: count > 0 ? "var(--text-primary)" : "var(--text-tertiary)",
              }}>{count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* totals */}
      <section className="se-panel-callout">
        <SectionHead latin="Totals" zh="總計" />
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Blocks</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.total}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Characters</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.totalChars.toLocaleString()}</span>
        </div>
      </section>

      {/* speakers */}
      <section>
        <SectionHead latin="Speakers" zh={`角色 · ${stats.speakers.length}`} />
        {stats.speakers.length === 0 ? (
          <div className="se-panel-hint">尚無對白</div>
        ) : (
          <div className="se-panel-list">
            {stats.speakers.slice(0, 12).map(([name, n]) => (
              <div key={name} className="se-panel-row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--text-primary)" }}>{name}</span>
                <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 11, color: "var(--text-tertiary)" }}>{n} lines</span>
              </div>
            ))}
            {stats.speakers.length > 12 && (
              <div className="se-panel-hint" style={{ textAlign: "center" }}>
                … 還有 {stats.speakers.length - 12} 位
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TextStatsPreview({ stats, headings, mode }) {
  return (
    <div className="se-panel">
      <section className="se-panel-callout">
        <SectionHead latin={`${mode.label} Stats`} zh={`${mode.zh}統計`} />
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Characters</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.charCount.toLocaleString()}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Lines</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>{stats.lineCount}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Read Time</span>
          <span style={{ color: "var(--gold)", fontFamily: "var(--font-serif-en)", fontWeight: 600 }}>≈{stats.readingMin} min</span>
        </div>
      </section>

      <section>
        <SectionHead latin="Outline" zh={`標題 · ${headings.length}`} />
        {headings.length === 0 ? (
          <div className="se-panel-hint">
            可用 <code className="se-code">#</code> 到 <code className="se-code">####</code> 建立 H1-H4 大綱。
          </div>
        ) : (
          <div className="se-panel-list">
            {headings.slice(0, 12).map((h, i) => (
              <div key={i} className="se-panel-row">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)", minWidth: 22 }}>H{h.level}</span>
                <span style={{ flex: 1, fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.text}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>:{h.line}</span>
              </div>
            ))}
            {headings.length > 12 && (
              <div className="se-panel-hint" style={{ textAlign: "center" }}>
                … 還有 {headings.length - 12} 個標題
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHead({ latin, zh }) {
  return (
    <div className="se-panel-title">
      <span className="latin">{latin}</span>
      <span className="zh">{zh}</span>
    </div>
  );
}

/* ============= Scene Outline Panel ============= */
function OutlinePanel({ outline, headings = [], onJump, activeLine, showSceneHint = true }) {
  const sceneCount = outline.filter(s => s.scene).length;
  const totalDlg = outline.reduce((a, s) => a + s.dialogues, 0);
  const totalNar = outline.reduce((a, s) => a + s.narrations, 0);
  const hasHeadings = headings.length > 0;
  const hasScenes = sceneCount > 0;

  // Find active heading based on cursor line
  let activeHdgIdx = -1;
  if (hasHeadings) {
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].line <= activeLine) { activeHdgIdx = i; break; }
    }
  }

  // Find active scene index based on cursor line
  let activeScIdx = -1;
  if (hasScenes) {
    for (let i = outline.length - 1; i >= 0; i--) {
      if (outline[i].scene && outline[i].scene._line <= activeLine) { activeScIdx = i; break; }
    }
  }

  if (!hasHeadings && !hasScenes) {
    return (
      <div className="se-panel-hint is-empty">
        <div style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10,
          letterSpacing: "0.22em", color: "var(--gold-dim)",
          textTransform: "uppercase", marginBottom: 6,
        }}>Structure</div>
        <div>尚無結構標記。</div>
        <div style={{ marginTop: 12, fontSize: 11 }}>
          使用 Markdown 標題（<code className="se-code"># ~ ####</code>）<br />
          {showSceneHint && (
            <>
              或場景指令（<code className="se-code">#scene：名稱</code>）<br />
            </>
          )}
          建立大綱，即可在此導航。
        </div>
      </div>
    );
  }

  const LEVEL_INDENT = [0, 0, 14, 26, 36]; // px indent per heading level
  const LEVEL_SIZE   = [0, 13.5, 12.5, 11.5, 11]; // font size per level
  const LEVEL_WEIGHT = [0, 600, 500, 400, 400];

  let sceneNum = 0;
  return (
    <div className="se-panel">
      {/* ── Heading tree ── */}
      {hasHeadings && (
        <>
          <SectionHead latin="Heading Outline" zh={`標題大綱 · ${headings.length}`} />
          <div className="se-panel-list">
            {headings.map((h, i) => {
              const active = i === activeHdgIdx;
              return (
                <button
                  key={i}
                  onClick={() => onJump(h.line)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: `5px 10px 5px ${10 + LEVEL_INDENT[h.level]}px`,
                    background: active ? "var(--gold-glow)" : "transparent",
                    border: "none",
                    borderLeft: `2px solid ${active ? "var(--gold)" : h.level <= 2 ? "var(--gold-line)" : "transparent"}`,
                    borderRadius: 2,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 120ms",
                  }}
                >
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
                    minWidth: 18, flexShrink: 0,
                  }}>H{h.level}</span>
                  <span style={{
                    flex: 1,
                    fontFamily: "var(--font-serif-tc)",
                    fontSize: LEVEL_SIZE[h.level],
                    fontWeight: LEVEL_WEIGHT[h.level],
                    color: active ? "var(--text-primary)" : h.level <= 2 ? "var(--text-secondary)" : "var(--text-tertiary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{h.text}</span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--text-tertiary)", flexShrink: 0,
                  }}>:{h.line}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Scene outline ── */}
      {hasScenes && (
        <>
          {hasHeadings && <div style={{ height: 1, background: "var(--navy-line)", margin: "6px 0" }} />}
          <SectionHead latin="Scene Outline" zh={`場景大綱 · ${sceneCount}`} />

          <div className="se-panel-callout" style={{
            display: "flex", gap: 12,
            fontSize: 11, color: "var(--text-tertiary)",
            fontFamily: "var(--font-serif-en)",
            letterSpacing: "0.08em",
          }}>
            <span>{sceneCount} scenes</span>
            <span>{totalDlg} dialogues</span>
            <span>{totalNar} narrations</span>
          </div>

          <div className="se-panel-list">
            {outline.map((section, i) => {
              if (!section.scene) {
                if (section.dialogues + section.narrations > 0) {
                  return (
                    <div key={i} className="se-panel-hint" style={{ fontStyle: "italic", padding: "4px 10px" }}>
                      （序 · {section.dialogues} 對白 · {section.narrations} 旁白）
                    </div>
                  );
                }
                return null;
              }
              sceneNum++;
              const active = i === activeScIdx;
              return (
                <button
                  key={i}
                  onClick={() => onJump(section.scene._line)}
                  className={"se-panel-row" + (active ? " is-active" : "")}
                  style={{ borderLeft: `3px solid ${active ? "var(--gold)" : "var(--gold-line)"}`, padding: "7px 10px" }}
                >
                  <span style={{
                    fontFamily: "var(--font-serif-en)", fontSize: 10,
                    color: active ? "var(--gold-bright)" : "var(--gold-dim)",
                    fontVariant: "small-caps", letterSpacing: "0.14em",
                    minWidth: 20,
                  }}>{sceneNum}</span>
                  <span style={{
                    flex: 1,
                    fontFamily: "var(--font-serif-tc)", fontSize: 12.5,
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{section.scene.act}{section.scene.subtitle ? ` ${section.scene.subtitle}` : ""}</span>
                  <span style={{
                    fontFamily: "var(--font-serif-en)", fontSize: 10,
                    color: "var(--text-tertiary)", letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                  }}>
                    {section.dialogues > 0 ? `${section.dialogues}d` : ""}
                    {section.dialogues > 0 && section.narrations > 0 ? " · " : ""}
                    {section.narrations > 0 ? `${section.narrations}n` : ""}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9.5,
                    color: "var(--text-tertiary)",
                  }}>:{section.scene._line}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

