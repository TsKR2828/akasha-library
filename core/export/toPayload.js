function isTableRow(line) {
  return /^\s*\|/.test(line) && /\|\s*$/.test(line);
}

function isSeparatorRow(line) {
  return /^\s*\|[\s:]*-{2,}[\s:|-]*\|\s*$/.test(line);
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(c => c.trim());
}

function parseTable(lines, start) {
  if (!isTableRow(lines[start])) return null;
  if (start + 1 >= lines.length || !isSeparatorRow(lines[start + 1])) return null;
  const head = splitRow(lines[start]);
  const body = [];
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i])) {
    body.push(splitRow(lines[i]));
    i++;
  }
  return { head, body, nextIndex: i };
}

function mdBlocks(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        flushParagraph();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') });
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    if (!trimmed) { flushParagraph(); continue; }

    const table = parseTable(lines, i);
    if (table) {
      flushParagraph();
      blocks.push({ type: 'table', head: table.head, body: table.body });
      i = table.nextIndex - 1;
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      flushParagraph();
      blocks.push({ type: 'heading', level: hMatch[1].length, text: hMatch[2].trim() });
      continue;
    }

    const li = trimmed.match(/^\s*[-*]\s+(.+)$/);
    if (li) { flushParagraph(); blocks.push({ type: 'paragraph', text: '• ' + li[1] }); continue; }

    const ol = trimmed.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ol) { flushParagraph(); blocks.push({ type: 'paragraph', text: ol[1] + '. ' + ol[2] }); continue; }

    paragraph.push(trimmed);
  }
  flushParagraph();
  if (inCode) blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') });
  return blocks;
}

function jsonBlocks(content, parsedJson) {
  const data = parsedJson ?? JSON.parse(content);
  const blocks = [{ type: 'heading', level: 2, text: 'JSON Data' }];

  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && data[0] !== null) {
    const keys = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    const body = data.map(obj => keys.map(k => String(obj[k] ?? '')));
    blocks.push({ type: 'table', head: keys, body });
  } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const head = ['Key', 'Value'];
    const body = Object.entries(data).map(([k, v]) => [
      k,
      typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
    ]);
    blocks.push({ type: 'table', head, body });
  } else {
    blocks.push({ type: 'paragraph', text: JSON.stringify(data, null, 2) });
  }
  return blocks;
}

function codeBlocks(content, lang) {
  return [{ type: 'code', lang, text: content }];
}

function txtBlocks(content) {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(p => ({ type: 'paragraph', text: p.trim() }));
}

export function contentToPayload(content, mode, filename, parsedJson) {
  let blocks;
  switch (mode) {
    case 'md':   blocks = mdBlocks(content); break;
    case 'json': blocks = jsonBlocks(content, parsedJson); break;
    case 'py':   blocks = codeBlocks(content, 'python'); break;
    default:     blocks = txtBlocks(content); break;
  }
  return { filename, mode, blocks };
}
