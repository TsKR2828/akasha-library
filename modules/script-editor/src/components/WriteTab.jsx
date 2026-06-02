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

function draftKey(workId) { return workId ? `${DRAFT_BASE}_${workId}` : DRAFT_BASE; }
function locksKey(workId) { return workId ? `${LOCKS_BASE}_${workId}` : LOCKS_BASE; }

function loadLocks(workId) {
  try { return JSON.parse(localStorage.getItem(locksKey(workId)) || "{}"); }
  catch { return {}; }
}
function saveLocks(obj, workId) {
  try { localStorage.setItem(locksKey(workId), JSON.stringify(obj)); } catch {}
}
const SEED = `#scene：第一幕 · 第一場
旁白：（在此描述場景氛圍與舞台指示。）
角色A：對白範例——直接輸入角色名加冒號。
角色B：（表情）第二位角色的台詞。
// 這是註解，不會出現在匯出中
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

function loadDraft(workId) {
  try { return localStorage.getItem(draftKey(workId)); }
  catch { return null; }
}
function saveDraft(text, workId) {
  try { localStorage.setItem(draftKey(workId), text); } catch {}
}

export default function WriteTab({ blocks, setBlocks, characters, workId }) {
  /* ---------- initial textarea content ----------
     1) localStorage draft 優先（user-authored 不該被 Lohengrin 覆寫）
     2) 否則用 blocks 反向產生（讓 Reader/Editor 載入的劇本能在 Write 看見）
     3) 都沒有 → SEED 範例 */
  const initialContent = React.useMemo(() => {
    const saved = loadDraft(workId);
    if (saved != null && saved !== "") return saved;
    if (Array.isArray(blocks) && blocks.length > 0) {
      return blocksToPlainScript(blocks, characters);
    }
    return SEED;
    // 只在 mount 時計算一次（後續同步交給 effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [content, setContent] = React.useState(initialContent);
  const [previewTab, setPreviewTab] = React.useState("blocks"); // blocks | stats | voice | bgm | layout
  const [caret, setCaret] = React.useState(0);
  const taRef = React.useRef(null);

  /* parse + stats — v2-fix4: 把 characters 傳給 parser 反查 speakerId */
  const parsedBlocks = React.useMemo(() => parsePlainScript(content, characters), [content, characters]);
  const stats = React.useMemo(() => computeStats(parsedBlocks), [parsedBlocks]);
  /* ---------- chapter pagination ----------
     content 是完整原文（source of truth）；chapter 模式下 textarea 只顯示一章。
     章節由 #scene: 行自動切分。編輯單章時 splice 回完整 content，
     parsedBlocks / forward sync / stats 全都從完整 content 計算。 */
  const [activeChapter, setActiveChapter] = React.useState(null); // null=全部, number=index

  const chapters = React.useMemo(() => {
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
  }, [content]);

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
  }, [parsedBlocks]);

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
    // In chapter mode, switch to the correct chapter
    if (chapters.length > 0) {
      const targetCh = chapters.findIndex(ch => lineIdx >= ch.startLine && lineIdx <= ch.endLine);
      if (targetCh >= 0) {
        setActiveChapter(targetCh);
        const localLine = lineIdx - chapters[targetCh].startLine;
        requestAnimationFrame(() => {
          const ta = taRef.current;
          if (!ta) return;
          const lines = ta.value.split('\n');
          let off = 0;
          for (let i = 0; i < Math.min(localLine, lines.length); i++) off += lines[i].length + 1;
          ta.focus();
          ta.setSelectionRange(off, off);
          setCaret(off);
          const lh = parseFloat(getComputedStyle(ta).lineHeight) || 27;
          ta.scrollTop = Math.max(0, localLine * lh - ta.clientHeight / 3);
        });
        return;
      }
    }
    // No chapter mode — jump within full content
    const ta = taRef.current;
    if (!ta) return;
    const lines = content.split('\n');
    let off = 0;
    for (let i = 0; i < Math.min(lineIdx, lines.length); i++) off += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(off, off);
    setCaret(off);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 27;
    ta.scrollTop = Math.max(0, lineIdx * lh - ta.clientHeight / 3);
  }, [content, chapters]);

  /* Voice TTS (v2-5) */
  const voice = useVoiceTTS();

  /* ---------- v2-7 BI-DIRECTIONAL SYNC ----------
     Forward:  textarea → parsedBlocks → setBlocks   (debounced 350ms)
     Reverse:  blocks → blocksToPlainScript → textarea (when external)
     Loop guards:
       - syncTokenRef: 自己 push 造成 blocks 變動 → reverse useEffect 消化跳過
       - lastReverseRef: reverse 設進來的 content 不要再回 forward push
                         （否則 round-trip 的元數據遺失會回頭覆寫 Editor） */
  const syncTokenRef = React.useRef(0);
  const lastReverseRef = React.useRef(null);
  const initializedRef = React.useRef(false);
  const forwardTimer = React.useRef(null);
  const [syncStatus, setSyncStatus] = React.useState("idle"); // idle | pushing | external

  // Forward sync — push parsedBlocks 到 parent blocks
  React.useEffect(() => {
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
  }, [parsedBlocks, setBlocks, content]);

  // Reverse sync — blocks 從外部變動時，重產 textarea
  React.useEffect(() => {
    if (syncTokenRef.current > 0) {
      syncTokenRef.current--;
      return; // 自己 push 造成的 echo，跳過
    }
    if (!Array.isArray(blocks)) return;
    const regenerated = blocksToPlainScript(blocks, characters);
    if (regenerated && regenerated !== content) {
      lastReverseRef.current = regenerated;
      setContent(regenerated);
      saveDraft(regenerated, workId);
      setSyncStatus("external");
      setTimeout(() => setSyncStatus("idle"), 600);
    }
    // 不把 content 加進依賴（避免 setContent → 再觸發）；blocks 變了才同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, characters]);

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
  }, [parsedBlocks, characters]);

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
  }, [slotLabels]);

  const onKeyDown = React.useCallback((e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      insertSpeakerPrefix(Number(e.key));
    }
  }, [insertSpeakerPrefix]);

  /* debounced auto-save */
  const saveTimer = React.useRef(null);
  React.useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(content, workId), 500);
    return () => clearTimeout(saveTimer.current);
  }, [content, workId]);

  const onTextChange = e => setVisibleContent(e.target.value);
  const onCaretMove  = e => setCaret(e.target.selectionStart || 0);

  /* v2-fix3: 把當前游標所在行卷到視野「下 2/3」附近
     — 只在游標超過 2/3 視野時才下捲；不會跳回上方。 */
  /* v2-fix5: 打字機捲動 — 雙向錨定，游標保持在視窗 ~42% 處
     舒適區 25%–55%：游標在此範圍內不捲動，超出才平滑對齊 */
  const anchorCaretView = React.useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart || 0;
    const before = ta.value.slice(0, pos);
    const lineIdx = (before.match(/\n/g) || []).length;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 27;
    const caretPx = lineIdx * lineHeight + 20; /* 20 = top padding */
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

  const onClearDraft = () => {
    if (!confirm("清除草稿？此動作會清除本地儲存的速寫內容。")) return;
    setContent("");
    saveDraft("", workId);
  };
  const onResetSeed = () => {
    if (content && !confirm("以範例覆蓋目前草稿？")) return;
    setContent(SEED);
  };

  return (
    <div style={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: "1fr 360px",
      gridTemplateRows: "auto auto auto 1fr auto",
      overflow: "hidden",
      animation: "swFade 200ms ease",
      background: "var(--navy-deep)",
    }}>
      {/* ───── top toolbar (left, row 1) ───── */}
      <div style={{
        gridColumn: "1 / 2",
        gridRow: "1 / 2",
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 16px",
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-en)",
          fontSize: 10.5, letterSpacing: "0.28em",
          color: "var(--gold)",
          fontVariant: "small-caps", textTransform: "uppercase",
        }}>Scriptorium · Calamus</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
          {contentStats.charCount.toLocaleString()} 字 · {contentStats.lineCount} 行 · ≈{contentStats.readingMin} 分鐘
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => {
            if (!Array.isArray(blocks) || blocks.length === 0) return;
            if (content && !confirm("以目前劇本覆蓋草稿？")) return;
            const text = blocksToPlainScript(blocks, characters);
            setContent(text);
            saveDraft(text, workId);
          }}
          disabled={!Array.isArray(blocks) || blocks.length === 0}
          style={tbBtnStyle}
          title="從 Editor/Reader 的劇本載入到速寫區"
        >↺ 從劇本</button>
        <button
          onClick={onResetSeed}
          style={tbBtnStyle}
          title="以範例覆蓋"
        >範例</button>
        <button
          onClick={onClearDraft}
          style={{ ...tbBtnStyle, color: "var(--danger)", borderColor: "rgba(196,96,79,0.3)" }}
          title="清除草稿"
        >清空</button>
      </div>

      {/* ───── preview tabs (right, row 1) ───── */}
      <div style={{
        gridColumn: "2 / 3",
        gridRow: "1 / 2",
        display: "flex",
        background: "var(--navy)",
        borderBottom: "1px solid var(--navy-line)",
        borderLeft: "1px solid var(--navy-line)",
      }}>
        {["blocks", "stats", "outline", "voice", "bgm"].map(id => {
          const active = previewTab === id;
          return (
            <button
              key={id}
              onClick={() => setPreviewTab(id)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: active ? "var(--gold-glow)" : "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
                color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
                fontFamily: "var(--font-serif-en)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 160ms",
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {/* ───── slot badges row (left, row 2) — v2-4 ───── */}
      <div style={{
        gridColumn: "1 / 2",
        gridRow: "2 / 3",
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
        padding: "8px 16px",
        background: "var(--navy-deep)",
        borderBottom: "1px solid var(--navy-line)",
      }}>
        <span style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10,
          letterSpacing: "0.22em", color: "var(--gold-dim)",
          fontVariant: "small-caps", textTransform: "uppercase",
          marginRight: 4,
        }}>Persona Slots ·</span>
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
          <span style={{
            fontSize: 10.5, color: "var(--text-tertiary)",
            fontFamily: "var(--font-serif-en)",
            letterSpacing: "0.08em",
            marginLeft: 4,
          }} title={overflow.join("、")}>⋯ +{overflow.length}</span>
        )}
      </div>

      {/* ───── slot context menu ───── */}
      {ctxMenu && (
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

      {/* ───── chapter bar (left, row 3) ───── */}
      {chapters.length > 0 && (
        <div style={{
          gridColumn: "1 / 2",
          gridRow: "3 / 4",
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 16px",
          background: "var(--navy)",
          borderBottom: "1px solid var(--navy-line)",
          overflowX: "auto",
        }}>
          <button onClick={() => setActiveChapter(null)} style={chapterBtnStyle(activeChapter == null)}>
            全部
          </button>
          <span style={{ width: 1, height: 16, background: "var(--navy-line)", flexShrink: 0 }} />
          {chapters.map((ch, i) => (
            <button key={i} onClick={() => setActiveChapter(i)} style={chapterBtnStyle(activeChapter === i)}
              title={`${ch.endLine - ch.startLine + 1} 行`}>
              {ch.label.length > 14 ? ch.label.slice(0, 14) + "…" : ch.label}
            </button>
          ))}
          {activeChapter != null && (
            <>
              <span style={{ flex: 1 }} />
              <button onClick={() => setActiveChapter(Math.max(0, activeChapter - 1))}
                disabled={activeChapter <= 0} style={chapterNavStyle} title="上一章 (Ctrl+↑)">◂</button>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-serif-en)",
                letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                {activeChapter + 1}/{chapters.length}
              </span>
              <button onClick={() => setActiveChapter(Math.min(chapters.length - 1, activeChapter + 1))}
                disabled={activeChapter >= chapters.length - 1} style={chapterNavStyle} title="下一章 (Ctrl+↓)">▸</button>
            </>
          )}
        </div>
      )}

      {/* ───── textarea (left, row 4)
            v2-fix5: 打字機捲動 — paddingBottom 60vh 留白 + anchorCaretView 雙向錨定
                     游標保持在視窗 ~42% 位置，下方大片空白不傷眼 ───── */}
      <textarea
        ref={taRef}
        value={chapterView.text}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { onCaretMove(e); anchorCaretView(); }}
        onClick={(e) => { onCaretMove(e); anchorCaretView(); }}
        onSelect={onCaretMove}
        onInput={() => requestAnimationFrame(anchorCaretView)}
        spellCheck={false}
        placeholder={`輸入 Plain Script — 例：\n#scene：第一幕\n旁白：天色將明……\n角色名：「對白」\n#bgm：piano_morning\n\n快捷鍵：Alt+1 場景 / Alt+2 旁白 / Alt+3~9 角色`}
        style={{
          gridColumn: "1 / 2",
          gridRow: "4 / 5",
          width: "100%",
          height: "100%",
          padding: "20px 28px 60vh",
          background: "var(--navy-deep)",
          color: "var(--text-primary)",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: "var(--font-serif-tc)",
          fontSize: 14.5,
          lineHeight: 1.85,
          letterSpacing: "0.02em",
          tabSize: 4,
          whiteSpace: "pre-wrap",
          scrollPaddingBottom: "60vh",
        }}
      />

      {/* ───── preview body (right, rows 2-3 — spans the slot-badges row on left) ───── */}
      <div style={{
        gridColumn: "2 / 3",
        gridRow: "2 / 5",
        overflowY: "auto",
        background: "var(--navy)",
        borderLeft: "1px solid var(--navy-line)",
        padding: "12px 14px",
      }}>
        {previewTab === "blocks" && <BlocksPreview blocks={parsedBlocks} voice={voice} />}
        {previewTab === "stats"  && <StatsPreview stats={stats} />}
        {previewTab === "voice"  && <VoicePanel blocks={parsedBlocks} voice={voice} />}
        {previewTab === "bgm"    && <BgmPanel blocks={parsedBlocks} />}
        {previewTab === "outline" && <OutlinePanel outline={sceneOutline} headings={headingOutline} onJump={jumpToLine} activeLine={globalLine} />}
      </div>

      {/* ───── status bar (row 5, spans both cols) ───── */}
      <div style={{
        gridColumn: "1 / 3",
        gridRow: "5 / 6",
        display: "flex", alignItems: "center", gap: 14,
        padding: "5px 16px",
        background: "var(--navy)",
        borderTop: "1px solid var(--navy-line)",
        fontSize: 11, color: "var(--text-tertiary)",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-serif-en)",
      }}>
        <span>Ln {line} · Col {col}</span>
        {activeChapter != null && chapters[activeChapter] && (
          <span style={badgeStyle}>{chapters[activeChapter].label}</span>
        )}
        <span style={badgeStyle}>Plain Script</span>
        <span>{parsedBlocks.length} blocks parsed</span>
        {syncStatus === "pushing" && (
          <span style={{ color: "var(--gold-dim)" }}>↻ Sync→</span>
        )}
        {syncStatus === "external" && (
          <span style={{ color: "rgb(168,156,216)" }}>← Pulled from Editor</span>
        )}
        {syncStatus === "idle" && setBlocks && (
          <span style={{ color: "var(--success)" }} title="Forward & reverse sync 已連通">⇄ Synced</span>
        )}
        {voice.state.queueActive && (
          <span style={{ color: "var(--gold)", animation: "blink 1.2s infinite" }}>
            ▶ Voice {voice.state.queueIdx + 1}/{voice.state.queueTotal}
          </span>
        )}
        {!voice.state.queueActive && voice.state.speaking && (
          <span style={{ color: "var(--gold)", animation: "blink 1.2s infinite" }}>▶ Speaking</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--success)" }}>● Auto-save</span>
      </div>
    </div>
  );
}

const tbBtnStyle = {
  padding: "3px 10px",
  background: "transparent",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  color: "var(--text-secondary)",
  fontSize: 11,
  letterSpacing: "0.06em",
  cursor: "pointer",
  fontFamily: "var(--font-serif-tc)",
};
const chapterBtnStyle = (active) => ({
  padding: "3px 10px",
  background: active ? "var(--gold-glow)" : "transparent",
  border: `1px solid ${active ? "var(--gold-dim)" : "var(--navy-line)"}`,
  borderRadius: 2,
  color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
  fontSize: 11,
  fontFamily: "var(--font-serif-tc)",
  letterSpacing: "0.06em",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  transition: "all 150ms",
});
const chapterNavStyle = {
  padding: "2px 6px",
  background: "transparent",
  border: "1px solid var(--navy-line)",
  borderRadius: 2,
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
  flexShrink: 0,
};
const badgeStyle = {
  padding: "1px 8px",
  background: "var(--navy-light)",
  borderRadius: 2,
  color: "var(--gold-dim)",
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/* ============= Slot Badge (v2-4 + fix5) ============= */
function SlotBadge({ n, label, locked, onClick, onDoubleClick, onContextMenu }) {
  const filled = !!label;
  const color = filled
    ? (locked ? "var(--gold-bright)" : "var(--gold)")
    : "var(--text-tertiary)";
  const border = filled
    ? (locked ? "rgba(227,196,134,0.35)" : "var(--gold-line)")
    : "var(--navy-line)";
  const bg = filled
    ? (locked ? "rgba(227,196,134,0.12)" : "rgba(201,168,106,0.06)")
    : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={filled
        ? `單擊管理 · 雙擊插入「${label}：」· Alt+${n}${locked ? "（已鎖定）" : ""}`
        : `單擊指派角色到 Alt+${n}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px 3px 6px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 2,
        color,
        cursor: "pointer",
        fontSize: 11.5,
        fontFamily: "var(--font-serif-tc)",
        letterSpacing: "0.04em",
        transition: "background 150ms, border-color 150ms",
        opacity: filled ? 1 : 0.65,
      }}
    >
      <span style={{
        fontFamily: "var(--font-serif-en)",
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: filled ? "var(--gold-dim)" : "var(--text-tertiary)",
        fontVariant: "small-caps",
        textTransform: "uppercase",
      }}>{locked ? "🔒" : MOD_KEY}{n}</span>
      <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label || "—"}
      </span>
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
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
        尚未解析出 block。<br />
        試試在左側輸入「<code style={inlineCode}>角色：對白</code>」或「<code style={inlineCode}>#scene：第一幕</code>」。
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      borderRadius: 4,
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
      <div style={{ padding: "30px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
        此瀏覽器不支援 <code style={inlineCode}>speechSynthesis</code>。<br />
        請使用 Chrome / Edge / Safari。
      </div>
    );
  }

  const queue = React.useMemo(() => (blocks || []).filter(b =>
    b.type === "dialogue" || (b.type === "narration" && voice.settings.includeNarration)
  ), [blocks, voice.settings.includeNarration]);

  if (!blocks.length) {
    return (
      <div style={{ padding: "30px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* controls */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center",
        padding: "8px 10px",
        background: "rgba(201,168,106,0.06)",
        border: "1px solid var(--gold-line)",
        borderRadius: 4,
      }}>
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
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
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
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {queue.map((item, qi) => {
            const active = voice.state.queueActive && qi === voice.state.queueIdx;
            return (
              <button
                key={item.id || qi}
                onClick={() => voice.playQueue(blocks, blocks.indexOf(item) >= 0
                  ? queue.indexOf(item) : qi)}
                style={{
                  display: "flex", alignItems: "baseline", gap: 6,
                  padding: "4px 8px",
                  background: active ? "var(--gold-glow)" : "var(--navy-deep)",
                  border: `1px solid ${active ? "var(--gold-dim)" : "var(--navy-line)"}`,
                  borderRadius: 2,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-serif-tc)",
                  fontSize: 12,
                  transition: "background 150ms, border-color 150ms",
                }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* type counts */}
      <section>
        <SectionHead latin="Block Types" zh="區塊類型" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          {ROWS.map(([label, count, color]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "5px 10px",
              background: "var(--navy-light)",
              border: "1px solid var(--navy-line)",
              borderRadius: 3,
            }}>
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
      <section style={{
        padding: "10px 12px",
        background: "rgba(201,168,106,0.06)",
        border: "1px solid var(--gold-line)",
        borderRadius: 3,
      }}>
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
          <div style={{ padding: "12px 4px", fontSize: 11.5, color: "var(--text-tertiary)" }}>尚無對白</div>
        ) : (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            {stats.speakers.slice(0, 12).map(([name, n]) => (
              <div key={name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 8px", borderRadius: 2,
                background: "var(--navy-deep)", border: "1px solid var(--navy-line)",
              }}>
                <span style={{ fontFamily: "var(--font-serif-tc)", fontSize: 12.5, color: "var(--text-primary)" }}>{name}</span>
                <span style={{ fontFamily: "var(--font-serif-en)", fontSize: 11, color: "var(--text-tertiary)" }}>{n} lines</span>
              </div>
            ))}
            {stats.speakers.length > 12 && (
              <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                … 還有 {stats.speakers.length - 12} 位
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
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      paddingBottom: 4, borderBottom: "1px solid var(--navy-line)",
    }}>
      <span style={{
        fontFamily: "var(--font-serif-en)", fontSize: 10,
        letterSpacing: "0.22em", color: "var(--gold)",
        fontVariant: "small-caps", textTransform: "uppercase",
      }}>{latin}</span>
      <span style={{
        fontFamily: "var(--font-serif-tc)", fontSize: 11,
        color: "var(--text-tertiary)", letterSpacing: "0.1em",
      }}>{zh}</span>
    </div>
  );
}

/* ============= Scene Outline Panel ============= */
function OutlinePanel({ outline, headings = [], onJump, activeLine }) {
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
      <div style={{ padding: "40px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.7 }}>
        <div style={{
          fontFamily: "var(--font-serif-en)", fontSize: 10,
          letterSpacing: "0.22em", color: "var(--gold-dim)",
          textTransform: "uppercase", marginBottom: 6,
        }}>Structure</div>
        <div>尚無結構標記。</div>
        <div style={{ marginTop: 12, fontSize: 11 }}>
          使用 Markdown 標題（<code style={inlineCode}># ~ ####</code>）<br />
          或場景指令（<code style={inlineCode}>#scene：名稱</code>）<br />
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Heading tree ── */}
      {hasHeadings && (
        <>
          <SectionHead latin="Heading Outline" zh={`標題大綱 · ${headings.length}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

          <div style={{
            display: "flex", gap: 12,
            padding: "6px 10px",
            background: "rgba(201,168,106,0.06)",
            border: "1px solid var(--gold-line)",
            borderRadius: 3,
            fontSize: 11, color: "var(--text-tertiary)",
            fontFamily: "var(--font-serif-en)",
            letterSpacing: "0.08em",
          }}>
            <span>{sceneCount} scenes</span>
            <span>{totalDlg} dialogues</span>
            <span>{totalNar} narrations</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {outline.map((section, i) => {
              if (!section.scene) {
                if (section.dialogues + section.narrations > 0) {
                  return (
                    <div key={i} style={{
                      padding: "4px 10px",
                      fontSize: 11, color: "var(--text-tertiary)",
                      fontFamily: "var(--font-serif-tc)",
                      fontStyle: "italic",
                    }}>
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
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px",
                    background: active ? "var(--gold-glow)" : "var(--navy-deep)",
                    border: `1px solid ${active ? "var(--gold-dim)" : "var(--navy-line)"}`,
                    borderLeft: `3px solid ${active ? "var(--gold)" : "var(--gold-line)"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 150ms, border-color 150ms",
                  }}
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

const inlineCode = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  background: "var(--navy-deep)",
  padding: "1px 5px",
  borderRadius: 2,
  border: "1px solid var(--navy-line)",
  color: "var(--gold-dim)",
};
