/* ============================================================
   Plain Script ↔ Blocks parser  (Phase 17 v2-3)

   Grammar (line-based):
     #cmd: value         → command block      e.g. #bgm: piano_morning
     // comment           → ignored
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
    if (!line || COMMENT_RE.test(line)) continue;

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
        out.push(`旁白：${b.text || b.zh || b.original || ""}`);
        break;
      case "dialogue": {
        const speaker =
          b.speaker ||
          nameById.get(b.speakerId) ||
          b.speakerId ||
          "???";
        out.push(`${speaker}：${b.text || b.zh || b.original || ""}`);
        break;
      }
      case "scene": {
        const parts = [b.act, b.subtitle].filter(Boolean).join(" ").trim();
        out.push(`#scene：${parts}`);
        break;
      }
      case "choice":
        out.push(`#choice：${(b.options || []).map(o => o.text).join(" / ")}`);
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
