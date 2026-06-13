/* ============================================================
   Plain Script ↔ Blocks parser  (Phase 17 v2-3)

   Grammar (line-based):
     #cmd: value         → command block      e.g. #bgm: piano_morning
     #choice: a / b      → choice block       (options split on "/";
                            nextBlockId 純文字無法表達，由 diffMergeBlocks 補回)
     // comment           → note block(round-trip)
     旁白：text           → narration block    (also matches Narrator: in EN)
     speaker：text        → dialogue block
     <anything else>      → narration (fallback)

   Punctuation: full-width ：or half-width : both accepted as separator.
   Source adapted from feature/akasha-4tab-attempt data-model.js.
   ============================================================ */

const DIALOGUE_RE = /^([^#/\n][^：:]{0,20})[：:](.+)/;
const COMMAND_RE  = /^#(\w[\w.\-]*)\s*[:：]\s*(.+)/;
const COMMENT_RE  = /^\s*\/\//;
const NARRATOR_RE = /^(旁白|narrator)$/i;

let _seq = 0;
export function generateId(prefix = "blk") {
  _seq = (_seq + 1) & 0xffff;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

/* choice option <-> text escaping: "/" is the option separator, so a literal
   "/" inside an option label must be escaped as "\/" to survive round-trip. */
function escapeChoiceOption(t) {
  return String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/\//g, "\\/");
}
function splitChoiceOptions(s) {
  const out = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) { buf += s[i + 1]; i++; continue; }
    if (ch === "/") { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map(x => x.trim()).filter(Boolean);
}

/* ---------- text → blocks[] ----------
   v2-7: 產出時補上 Reader/Editor 期待的欄位
         - dialogue: speakerId（從 characters 表 reverse lookup；找不到留 ""）/
                     zh（鏡射 text）/ original（空）/ avg（空殼）
         - #scene: 特殊處理為 scene block（不再列為 command）
         - narration: zh 鏡射 text
   保證 Plain Script ↔ Reader/Editor shape 雙向可用，雖然 original 欄會在 round-trip 中遺失。
   v2-fix4: 接受 optional characters[]，把 speaker 中文名反查回 speakerId（'羅恩格林' → 'lohengrin'）
            若找不到，speakerId 留空 + 加 isUnknownSpeaker:true 旗標，
            Editor / Reader 應顯示「未綁定角色」而不是 error。 */
export function parsePlainScript(content, characters = []) {
  // 建反查表：中文/英文/別名 name → id
  const idByName = new Map();
  for (const c of (characters || [])) {
    if (!c || !c.id) continue;
    if (c.name)   idByName.set(c.name, c.id);
    if (c.nameEn) idByName.set(c.nameEn, c.id);
    idByName.set(c.id, c.id); // 也允許直接用 id 當 speaker
  }
  const resolveId = (name) => idByName.get(name) || "";

  if (!content || !content.trim()) return [];
  const blocks = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line) continue;
    if (COMMENT_RE.test(line)) {
      blocks.push({ id: generateId("note"), type: "note", text: line.replace(/^\s*\/\/\s?/, "") });
      continue;
    }

    const cmd = line.match(COMMAND_RE);
    if (cmd) {
      const name = cmd[1].trim();
      const val = cmd[2].trim();
      // #scene 特殊處理：產出 scene block 供 Reader 渲染
      if (/^scene$/i.test(name)) {
        blocks.push({
          id: generateId("scn"),
          type: "scene",
          act: val,
          subtitle: "",
          _line: i + 1,
        });
      } else if (/^choice$/i.test(name)) {
        // #choice 特殊處理：產出 choice block，與 blocksToPlainScript 的
        // `#choice：a / b` 輸出 round-trip。prompt 與 nextBlockId 純文字無法
        // 表達 → 留空，文字未變時由 diffMergeBlocks 從原 block 補回。
        blocks.push({
          id: generateId("cho"),
          type: "choice",
          prompt: "",
          options: splitChoiceOptions(val)
            .map(text => ({ text, nextBlockId: "" })),
          _line: i + 1,
        });
      } else {
        blocks.push({
          id: generateId("cmd"),
          type: "command",
          command: name,
          value: val,
          _line: i + 1,
        });
      }
      continue;
    }

    const dlg = line.match(DIALOGUE_RE);
    if (dlg) {
      const speaker = dlg[1].trim();
      const text = dlg[2].trim();
      if (NARRATOR_RE.test(speaker)) {
        blocks.push({
          id: generateId("nar"),
          type: "narration",
          text,
          zh: text,
          original: "",
          _line: i + 1,
        });
      } else {
        // v2-fix4: 從 characters 反查 ID；找不到 → speakerId 空 + isUnknown 旗標
        const resolvedId = resolveId(speaker);
        blocks.push({
          id: generateId("dlg"),
          type: "dialogue",
          speaker,                     // 保留顯示用文字
          speakerId: resolvedId,       // 反查結果；找不到留空
          isUnknown: !resolvedId,      // 給 Editor/Reader UI 用，validate 也應跳過 error
          text,
          zh: text,                    // Reader 顯示 b.zh
          original: "",                // 原文留空（write-authored 無 source）
          tags: [],
          avg: { sprite: "", position: "center", bg: "", bgm: "", sfx: "" },
          _line: i + 1,
        });
      }
      continue;
    }

    // fallback: treat as narration
    blocks.push({
      id: generateId("nar"),
      type: "narration",
      text: line.trim(),
      zh: line.trim(),
      original: "",
      _line: i + 1,
    });
  }
  return blocks;
}

/* ---------- blocks[] → text  (round-trip) ----------
   v2-7: 可選 characters[] 用來把 Lohengrin 風格的 speakerId（'lohengrin'）
         映射回中文顯示名（'羅恩格林'），讓 reverse sync 出來的文稿更可讀。 */
export function blocksToPlainScript(blocks, characters = []) {
  if (!Array.isArray(blocks)) return "";
  const nameById = new Map();
  for (const c of (characters || [])) {
    if (!c || !c.id) continue;
    nameById.set(c.id, c.name || c.nameEn || c.id);
  }

  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case "command":
        out.push(`#${b.command}：${b.value || ""}`);
        break;
      case "narration":
        out.push(`旁白：${b.zh || b.text || b.original || ""}`);
        break;
      case "dialogue": {
        const speaker =
          b.speaker ||
          nameById.get(b.speakerId) ||
          b.speakerId ||
          "???";
        // Prefer zh (Editor-edited) over text (Write-parsed) to avoid showing stale values
        out.push(`${speaker}：${b.zh || b.text || b.original || ""}`);
        break;
      }
      case "scene": {
        const parts = [b.act, b.subtitle].filter(Boolean).join(" ").trim();
        out.push(`#scene：${parts}`);
        break;
      }
      case "choice":
        out.push(`#choice：${(b.options || []).map(o => escapeChoiceOption(o.text)).join(" / ")}`);
        break;
      case "note":
        out.push(`// ${b.text || ""}`);
        break;
      default:
        out.push(`// [unknown block: ${b.type}]`);
    }
  }
  return out.join("\n");
}

/* ---------- diff-merge: preserve metadata across Write ↔ Editor round-trip ----------
   Given the current rich blocks (old) and freshly-parsed blocks from the textarea (next),
   produce a merged array that keeps old metadata (lineId, tags, avg, original, id)
   while adopting text/speaker changes from the parsed version.

   Algorithm: ordered forward-scan with lookahead.
   For each new block, try to match an old block by type + key content:
     - dialogue: same speaker name
     - narration: first 10 chars of text
     - scene: same act label
     - command: same command name
     - choice: same option texts (normalized through the "/" split,
               so "a/b" and "a / b" compare equal)
   On match → merge (keep old metadata, update text).
   No match → insert as new block (no metadata to lose).
   Old blocks that nobody matched → they were deleted.                          */
export function diffMergeBlocks(oldBlocks, newBlocks) {
  if (!Array.isArray(oldBlocks) || oldBlocks.length === 0) return newBlocks;
  if (!Array.isArray(newBlocks) || newBlocks.length === 0) return newBlocks;

  const LOOKAHEAD = 10; // how far ahead in old[] to search for a match
  let oldPtr = 0;       // next unmatched position in old[]
  const used = new Set();
  const result = [];

  for (const nb of newBlocks) {
    let matchIdx = -1;

    // 1. Try exact position first
    if (oldPtr < oldBlocks.length && !used.has(oldPtr) && _isMatch(oldBlocks[oldPtr], nb)) {
      matchIdx = oldPtr;
    } else {
      // 2. Lookahead window: scan forward from oldPtr
      const end = Math.min(oldPtr + LOOKAHEAD, oldBlocks.length);
      for (let j = oldPtr; j < end; j++) {
        if (used.has(j)) continue;
        if (_isMatch(oldBlocks[j], nb)) {
          matchIdx = j;
          break;
        }
      }
      // 3. If still no match, try look-behind (user may have inserted lines above)
      if (matchIdx < 0 && oldPtr > 0) {
        const start = Math.max(0, oldPtr - 3);
        for (let j = start; j < oldPtr; j++) {
          if (used.has(j)) continue;
          if (_isMatch(oldBlocks[j], nb)) {
            matchIdx = j;
            break;
          }
        }
      }
    }

    if (matchIdx >= 0) {
      used.add(matchIdx);
      result.push(_merge(oldBlocks[matchIdx], nb));
      // advance pointer past the match
      if (matchIdx >= oldPtr) oldPtr = matchIdx + 1;
    } else {
      result.push(nb); // genuinely new block
    }
  }

  return result;
}

/* Match predicate: same type + key content overlap.
   IMPORTANT: field priority for text comparison must be text → zh → original,
   matching the output order of blocksToPlainScript (b.text || b.zh || b.original).
   This ensures the compared strings are the same text the user sees in the textarea. */
function _isMatch(old, nw) {
  if (old.type !== nw.type) return false;
  switch (old.type) {
    case "dialogue": {
      // Compare both speaker name AND speakerId — either matching is sufficient.
      // Lohengrin data has speakerId='lohengrin', Write round-trip produces speaker='羅恩格林'.
      const oldName = old.speaker || "";
      const oldId   = old.speakerId || "";
      const newName = nw.speaker || "";
      const newId   = nw.speakerId || "";
      const speakerMatch =
        (oldId && newId && oldId === newId) ||
        (oldName && newName && oldName === newName) ||
        (oldId && newName && oldId === newName) ||
        (oldName && newId && oldName === newId);
      if (!speakerMatch) return false;
      // Same speaker — further check text overlap to disambiguate
      // consecutive lines from the same speaker
      const ot = (old.text || old.zh || old.original || "").substring(0, 8);
      const nt = (nw.text || nw.zh || "").substring(0, 8);
      if (ot && nt && ot !== nt) {
        // texts diverge — still match if they share ≥ 4 leading chars
        let common = 0;
        while (common < ot.length && common < nt.length && ot[common] === nt[common]) common++;
        if (common < 4 && ot.length >= 4 && nt.length >= 4) return false;
      }
      return true;
    }
    case "narration": {
      const ot = (old.text || old.zh || "").substring(0, 10);
      const nt = (nw.text || nw.zh || "").substring(0, 10);
      return ot === nt;
    }
    case "scene":
      // subtitle is appended to act during blocksToPlainScript round-trip,
      // so parsed act may be "Act 1 The Trial" while old act is "Act 1"
      return (nw.act || "").startsWith(old.act || "") ||
             (old.act || "") === (nw.act || "");
    case "command":
      return (old.command || "") === (nw.command || "");
    case "choice":
      return _choiceKey(old) === _choiceKey(nw);
    default:
      return false;
  }
}

/* Canonical compare key for choice options: what the textarea line renders as,
   normalized through the same "/" split parsePlainScript applies — so an
   Editor-authored option text containing "/" still matches its own round-trip. */
function _choiceKey(b) {
  return splitChoiceOptions(
    (b.options || []).map(o => escapeChoiceOption(o.text || "")).join("/")
  ).join(" / ");
}

/* Merge: old metadata + new text content.
   Write produces blocks with `text`; Editor edits `zh`.
   On merge: sync Write's text → zh so Editor always shows the latest.
   Preserve old zh only when Write didn't change the text. */
function _merge(old, nw) {
  // If parser produced `text`, propagate it to `zh` so Editor stays in sync
  const mergedZh = nw.text || nw.zh || old.zh || "";
  const merged = {
    ...nw,                                       // base: new parsed shape
    id:       old.id       || nw.id,             // preserve stable ID
    lineId:   old.lineId   || nw.lineId   || "", // preserve JSONL line ID
    original: old.original || nw.original || "", // preserve foreign-language source
    zh:       mergedZh,                          // keep Editor ↔ Write in sync
    tags:     (old.tags && old.tags.length > 0) ? old.tags : (nw.tags || []),
    avg:      old.avg      || nw.avg      || { sprite: "", position: "center", bg: "", bgm: "", sfx: "" },
  };
  // choice: plain text can't carry prompt / nextBlockId — restore them from the
  // old block. Options pair up by trimmed text (first unused wins); options the
  // user removed from the line are dropped, new ones keep an empty nextBlockId.
  if (old.type === "choice" && nw.type === "choice") {
    merged.prompt = nw.prompt || old.prompt || "";
    const oldOpts = old.options || [];
    const taken = new Set();
    merged.options = (nw.options || []).map((opt) => {
      const j = oldOpts.findIndex((oo, k) =>
        !taken.has(k) && (oo.text || "").trim() === (opt.text || "").trim());
      if (j < 0) return opt;
      taken.add(j);
      return oldOpts[j];
    });
  }
  return merged;
}

/* ---------- statistics ---------- */
export function computeStats(blocks) {
  const counts = { dialogue: 0, narration: 0, scene: 0, choice: 0, note: 0, command: 0 };
  const speakers = new Map();
  let totalChars = 0;

  for (const b of (blocks || [])) {
    if (counts[b.type] != null) counts[b.type]++;
    if (b.type === "dialogue") {
      const name = b.speaker || b.speakerId || "???";
      speakers.set(name, (speakers.get(name) || 0) + 1);
      totalChars += (b.text || "").length;
    } else if (b.type === "narration") {
      totalChars += (b.text || "").length;
    }
  }

  return {
    counts,
    total: (blocks || []).length,
    speakers: [...speakers.entries()].sort((a, b) => b[1] - a[1]),
    totalChars,
  };
}

/* ---------- caret position → line / col ---------- */
export function getLineCol(text, caretIndex) {
  if (caretIndex == null || caretIndex < 0) return { line: 1, col: 1 };
  const before = text.slice(0, caretIndex);
  const line = (before.match(/\n/g) || []).length + 1;
  const lastNl = before.lastIndexOf("\n");
  const col = caretIndex - (lastNl + 1) + 1;
  return { line, col };
}
