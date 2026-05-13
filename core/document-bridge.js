/**
 * Akasha Library — Document Bridge (Feature Additions Spec §9)
 *
 * DOCX import: mammoth.js → HTML → Markdown
 * DOCX export: Markdown → docx library → .docx Blob
 *
 * V1 scope: paragraphs, headings (h1-h6), tables, bold, italic, lists, code
 * Not supported: headers/footers, footnotes, floating images, complex styles
 */

const MAMMOTH_CDN = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.min.js';

let _mammothReady = false;
let _docxReady = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureMammoth() {
  if (_mammothReady) return;
  await loadScript(MAMMOTH_CDN);
  _mammothReady = true;
}

async function ensureDocx() {
  if (_docxReady) return;
  await loadScript(DOCX_CDN);
  _docxReady = true;
}

// ===== DOCX Import =====

/**
 * Convert a .docx ArrayBuffer to Markdown.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} filename
 * @returns {{ markdown: string, outName: string, meta: object, warnings: string[] }}
 */
export async function importDocx(arrayBuffer, filename) {
  await ensureMammoth();
  /* global mammoth */
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const markdown = htmlToMarkdown(result.value);
  const meta = extractImportMeta(markdown);
  const warnings = (result.messages || [])
    .filter(m => m.type === 'warning')
    .map(m => m.message);
  return {
    markdown,
    outName: filename.replace(/\.docx?$/i, '.md'),
    meta,
    warnings,
  };
}

// ===== DOCX Export =====

/**
 * Convert Markdown text to a .docx Blob.
 * @param {string} mdText
 * @param {string} [title]
 * @returns {Promise<Blob>}
 */
export async function exportDocx(mdText, title) {
  await ensureDocx();
  const doc = buildDocxDoc(mdText, title);
  /* global docx */
  return docx.Packer.toBlob(doc);
}

// ===== HTML → Markdown =====

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return walkChildren(doc.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function walkChildren(node) {
  let out = '';
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) {
      out += ch.textContent;
    } else if (ch.nodeType === 1) {
      out += convertElement(ch);
    }
  }
  return out;
}

function convertElement(el) {
  const tag = el.tagName.toLowerCase();
  const inner = () => walkChildren(el);

  switch (tag) {
    case 'h1': return `\n# ${inner().trim()}\n\n`;
    case 'h2': return `\n## ${inner().trim()}\n\n`;
    case 'h3': return `\n### ${inner().trim()}\n\n`;
    case 'h4': return `\n#### ${inner().trim()}\n\n`;
    case 'h5': return `\n##### ${inner().trim()}\n\n`;
    case 'h6': return `\n###### ${inner().trim()}\n\n`;
    case 'p': {
      const t = inner().trim();
      return t ? t + '\n\n' : '';
    }
    case 'strong': case 'b': return `**${inner()}**`;
    case 'em': case 'i': return `*${inner()}*`;
    case 'code': return `\`${inner()}\``;
    case 'pre': return `\n\`\`\`\n${el.textContent}\n\`\`\`\n\n`;
    case 'br': return '\n';
    case 'a': return `[${inner()}](${el.getAttribute('href') || ''})`;
    case 'blockquote': {
      const lines = inner().trim().split('\n');
      return '\n' + lines.map(l => '> ' + l).join('\n') + '\n\n';
    }
    case 'ul': return '\n' + convertListItems(el, 'ul') + '\n';
    case 'ol': return '\n' + convertListItems(el, 'ol') + '\n';
    case 'li': return inner();
    case 'table': return '\n' + convertTable(el) + '\n';
    case 'sup': return `^${inner()}`;
    case 'sub': return `~${inner()}`;
    default: return inner();
  }
}

function convertListItems(listEl, type) {
  const items = Array.from(listEl.children).filter(c => c.tagName === 'LI');
  return items.map((li, i) => {
    const prefix = type === 'ol' ? `${i + 1}. ` : '- ';
    return prefix + walkChildren(li).trim();
  }).join('\n') + '\n';
}

function convertTable(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const matrix = rows.map(tr =>
    Array.from(tr.querySelectorAll('th, td')).map(c => walkChildren(c).trim().replace(/\|/g, '\\|'))
  );

  const colCount = Math.max(...matrix.map(r => r.length));
  const pad = (arr) => {
    while (arr.length < colCount) arr.push('');
    return arr;
  };

  const header = pad(matrix[0]);
  const sep = header.map(() => '------');
  const lines = [
    '| ' + header.join(' | ') + ' |',
    '| ' + sep.join(' | ') + ' |',
    ...matrix.slice(1).map(r => '| ' + pad(r).join(' | ') + ' |'),
  ];
  return lines.join('\n') + '\n';
}

// ===== Markdown → DOCX Document =====

function buildDocxDoc(mdText, title) {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, NumberFormat, LevelFormat,
    convertInchesToTwip } = window.docx;

  const lines = mdText.split('\n');
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      const lvl = hm[1].length;
      const headings = [null,
        HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
      children.push(new Paragraph({ heading: headings[lvl], children: mdInlineRuns(hm[2]) }));
      i++; continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      children.push(new Paragraph({
        children: [new TextRun({ text: codeLines.join('\n'), font: 'Consolas', size: 20 })],
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      children.push(new Paragraph({
        indent: { left: convertInchesToTwip(0.5) },
        children: mdInlineRuns(line.slice(2)),
        spacing: { before: 60, after: 60 },
      }));
      i++; continue;
    }

    // Table block
    if (line.startsWith('|')) {
      const tLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tLines.push(lines[i]);
        i++;
      }
      const tbl = buildDocxTable(tLines);
      if (tbl) children.push(tbl);
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s/)) {
      const text = line.replace(/^\s*[-*+]\s/, '');
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: mdInlineRuns(text),
      }));
      i++; continue;
    }

    // Ordered list
    const olm = line.match(/^\s*\d+\.\s+(.+)/);
    if (olm) {
      children.push(new Paragraph({
        numbering: { reference: 'akasha-ol', level: 0 },
        children: mdInlineRuns(olm[1]),
      }));
      i++; continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      children.push(new Paragraph({
        thematicBreak: true,
      }));
      i++; continue;
    }

    // Regular paragraph
    children.push(new Paragraph({ children: mdInlineRuns(line) }));
    i++;
  }

  return new Document({
    numbering: {
      config: [{
        reference: 'akasha-ol',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  });
}

/**
 * Parse inline Markdown formatting into TextRun array.
 * Handles: **bold**, *italic*, ***bold italic***, `code`
 */
function mdInlineRuns(text) {
  const runs = [];
  // Regex: bold-italic (***), bold (**), italic (*), code (`), or plain text
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new window.docx.TextRun(text.slice(last, m.index)));
    }
    if (m[2]) { // bold-italic
      runs.push(new window.docx.TextRun({ text: m[2], bold: true, italics: true }));
    } else if (m[3]) { // bold
      runs.push(new window.docx.TextRun({ text: m[3], bold: true }));
    } else if (m[4]) { // italic
      runs.push(new window.docx.TextRun({ text: m[4], italics: true }));
    } else if (m[5]) { // code
      runs.push(new window.docx.TextRun({ text: m[5], font: 'Consolas', size: 20 }));
    }
    last = re.lastIndex;
  }

  if (last < text.length) {
    runs.push(new window.docx.TextRun(text.slice(last)));
  }
  if (runs.length === 0) {
    runs.push(new window.docx.TextRun(text));
  }
  return runs;
}

function buildDocxTable(lines) {
  const { Table, TableRow, TableCell, Paragraph, WidthType } = window.docx;

  // Filter separator row
  const dataLines = lines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
  const rows = dataLines.map(l =>
    l.split('|').slice(1, -1).map(c => c.trim())
  );
  if (rows.length === 0) return null;

  const colCount = Math.max(...rows.map(r => r.length));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, ri) => new TableRow({
      children: Array.from({ length: colCount }, (_, ci) => new TableCell({
        children: [new Paragraph({ children: mdInlineRuns(cells[ci] || '') })],
        ...(ri === 0 ? { shading: { fill: 'E0E0E0' } } : {}),
      })),
    })),
  });
}

// ===== Script blocks → DOCX (Phase 13-C) =====

/**
 * Convert script blocks (dialogue/narration/command) to a .docx Blob.
 * @param {Array} blocks — output of translation-core extractPlainScript
 * @param {string} [title]
 * @returns {Promise<Blob>}
 */
export async function exportScriptDocx(blocks, title) {
  await ensureDocx();
  const doc = buildScriptDocxDoc(blocks, title);
  return docx.Packer.toBlob(doc);
}

/**
 * Convert script blocks to printable HTML string (for PDF via browser print).
 * @param {Array} blocks
 * @param {string} [title]
 * @returns {string}
 */
export function exportScriptHtml(blocks, title) {
  return buildScriptHtml(blocks, title);
}

function buildScriptDocxDoc(blocks, title) {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
    LevelFormat, convertInchesToTwip } = window.docx;

  const children = [];

  if (title) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title })],
      spacing: { after: 400 },
    }));
  }

  for (const b of blocks) {
    if (b.type === 'dialogue') {
      children.push(new Paragraph({
        children: [new TextRun({ text: b.speaker || '???', bold: true, size: 24 })],
        spacing: { before: 240 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: b.text, size: 24 })],
        indent: { left: convertInchesToTwip(0.5) },
      }));
    } else if (b.type === 'narration') {
      children.push(new Paragraph({
        children: [new TextRun({ text: `（${b.text}）`, italics: true, size: 24, color: '555555' })],
        spacing: { before: 200 },
        indent: { left: convertInchesToTwip(0.3) },
      }));
    } else if (b.type === 'command') {
      children.push(new Paragraph({
        children: [new TextRun({ text: `[${b.command}: ${b.value}]`, size: 20, color: '999999', font: 'Consolas' })],
        spacing: { before: 120 },
        alignment: AlignmentType.RIGHT,
      }));
    }
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  });
}

function buildScriptHtml(blocks, title) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [];

  for (const b of blocks) {
    if (b.type === 'dialogue') {
      lines.push(`<div class="block dialogue"><span class="speaker">${esc(b.speaker || '???')}</span><p class="text">${esc(b.text)}</p></div>`);
    } else if (b.type === 'narration') {
      lines.push(`<div class="block narration"><p>（${esc(b.text)}）</p></div>`);
    } else if (b.type === 'command') {
      lines.push(`<div class="block command"><p>[${esc(b.command)}: ${esc(b.value)}]</p></div>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${esc(title || '劇本')}</title>
<style>
  @media print { @page { margin: 2cm 2.5cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; max-width: 680px; margin: 40px auto; line-height: 1.7; color: #222; }
  h1 { text-align: center; font-size: 1.6em; margin-bottom: 1.5em; border-bottom: 2px solid #c8a96e; padding-bottom: .4em; }
  .block { margin-bottom: .6em; }
  .dialogue .speaker { font-weight: 700; display: block; }
  .dialogue .text { margin: .1em 0 0 1.5em; }
  .narration p { font-style: italic; color: #555; margin-left: .8em; }
  .command p { font-family: Consolas, monospace; font-size: .85em; color: #999; text-align: right; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
${title ? `<h1>${esc(title)}</h1>` : ''}
${lines.join('\n')}
<div class="no-print" style="margin-top:2em;text-align:center;">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">列印 / 儲存 PDF</button>
</div>
</body>
</html>`;
}

// ===== Metadata =====

function extractImportMeta(markdown) {
  const headings = [];
  let wordCount = 0;
  for (const line of markdown.split('\n')) {
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) headings.push({ level: hm[1].length, text: hm[2] });
    wordCount += line.split(/\s+/).filter(Boolean).length;
  }
  return { headings, wordCount };
}

// ===== DOC (legacy) =====

/**
 * Rough text extraction from legacy .doc binary.
 * Only pulls ASCII/CJK text — no formatting.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function extractDocText(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  let current = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // printable ASCII or common CJK range detected via UTF-16 LE pairs
    if (b >= 0x20 && b < 0x7F) {
      current += String.fromCharCode(b);
    } else if (b === 0x0A || b === 0x0D) {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    } else {
      if (current.length > 2) chunks.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  // Filter noise: only keep lines with 4+ chars
  return chunks.filter(c => c.length >= 4).join('\n');
}
