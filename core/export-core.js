/**
 * Akasha Library — Export Core (Phase 16-A)
 *
 * Unified export engine. Routes (dataType, outputFormat) → converter.
 *
 * Data types: markdown, table, dialogue, score, memory
 * Each converter: (data, opts) → { blob, filename, mimeType }
 */

// ── Public API ─────────────────────────────────────────────

/**
 * Export data to a specific format.
 * @param {'markdown'|'table'|'dialogue'|'score'|'memory'} dataType
 * @param {string} outputFormat — e.g. 'md', 'html', 'pdf', 'docx', 'csv', 'ks', 'avg-json'
 * @param {object} data — shape depends on dataType (see converter docs)
 * @param {object} [opts] — { title?, filename? }
 * @returns {Promise<{ blob: Blob, filename: string, mimeType: string }>}
 */
export async function exportAs(dataType, outputFormat, data, opts = {}) {
  const key = `${dataType}:${outputFormat}`;
  const converter = CONVERTERS[key];
  if (!converter) {
    const avail = listFormats(dataType);
    throw new Error(`Unsupported export "${key}". Available for ${dataType}: ${avail.join(', ')}`);
  }
  return converter(data, opts);
}

export function listFormats(dataType) {
  const prefix = dataType + ':';
  return Object.keys(CONVERTERS).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
}

export function listAllFormats() {
  const result = {};
  for (const key of Object.keys(CONVERTERS)) {
    const [dt, fmt] = key.split(':');
    (result[dt] ??= []).push(fmt);
  }
  return result;
}

export async function exportAndDownload(dataType, outputFormat, data, opts = {}) {
  const result = await exportAs(dataType, outputFormat, data, opts);
  triggerDownload(result.blob, result.filename);
  return result;
}

// ── Download helper ────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
}

function textBlob(text, mime) {
  return new Blob([text], { type: mime + ';charset=utf-8' });
}

function baseName(opts) {
  return (opts.filename || opts.title || 'export').replace(/\.[^.]+$/, '');
}

// ── Converters ─────────────────────────────────────────────

const CONVERTERS = {};

function register(key, fn) { CONVERTERS[key] = fn; }

// ─── Markdown ──────────────────────────────────────────────

register('markdown:md', (data, opts) => ({
  blob: textBlob(data.text, 'text/markdown'),
  filename: baseName(opts) + '.md',
  mimeType: 'text/markdown',
}));

register('markdown:html', (data, opts) => {
  const html = markdownToHtml(data.text, opts.title);
  return { blob: textBlob(html, 'text/html'), filename: baseName(opts) + '.html', mimeType: 'text/html' };
});

register('markdown:pdf', (data, opts) => {
  const html = markdownToHtml(data.text, opts.title);
  return { blob: textBlob(html, 'text/html'), filename: baseName(opts) + '_print.html', mimeType: 'text/html', _openForPrint: true };
});

register('markdown:docx', async (data, opts) => {
  const { exportDocx } = await import('./document-bridge.js');
  const blob = await exportDocx(data.text, opts.title || baseName(opts));
  return { blob, filename: baseName(opts) + '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
});

// ─── Table ─────────────────────────────────────────────────

register('table:csv', (data, opts) => {
  const text = tableToDelimited(data.head, data.body, ',');
  return { blob: textBlob(text, 'text/csv'), filename: baseName(opts) + '.csv', mimeType: 'text/csv' };
});

register('table:tsv', (data, opts) => {
  const text = tableToDelimited(data.head, data.body, '\t');
  return { blob: textBlob(text, 'text/tab-separated-values'), filename: baseName(opts) + '.tsv', mimeType: 'text/tab-separated-values' };
});

register('table:json', (data, opts) => {
  const arr = data.body.map(row => {
    const obj = {};
    data.head.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
  const text = JSON.stringify(arr, null, 2);
  return { blob: textBlob(text, 'application/json'), filename: baseName(opts) + '.json', mimeType: 'application/json' };
});

register('table:md', (data, opts) => {
  const text = tableToMarkdown(data.head, data.body);
  return { blob: textBlob(text, 'text/markdown'), filename: baseName(opts) + '.md', mimeType: 'text/markdown' };
});

// ─── Dialogue (Script blocks) ──────────────────────────────

register('dialogue:ks', (data, opts) => {
  const text = blocksToTyranoScript(data.blocks);
  return { blob: textBlob(text, 'text/plain'), filename: baseName(opts) + '.ks', mimeType: 'text/plain' };
});

register('dialogue:avg-json', (data, opts) => {
  const obj = { title: opts.title || baseName(opts), blocks: data.blocks };
  const text = JSON.stringify(obj, null, 2);
  return { blob: textBlob(text, 'application/json'), filename: baseName(opts) + '.avg.json', mimeType: 'application/json' };
});

register('dialogue:md', (data, opts) => {
  const text = blocksToMarkdown(data.blocks, opts.title);
  return { blob: textBlob(text, 'text/markdown'), filename: baseName(opts) + '.md', mimeType: 'text/markdown' };
});

register('dialogue:jsonl', (data, opts) => {
  const text = data.blocks.map(b => JSON.stringify(b)).join('\n') + '\n';
  return { blob: textBlob(text, 'application/x-ndjson'), filename: baseName(opts) + '.blocks.jsonl', mimeType: 'application/x-ndjson' };
});

register('dialogue:docx', async (data, opts) => {
  const { exportScriptDocx } = await import('./document-bridge.js');
  const blob = await exportScriptDocx(data.blocks, opts.title || baseName(opts));
  return { blob, filename: baseName(opts) + '_script.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
});

register('dialogue:pdf', (data, opts) => {
  const html = scriptBlocksToHtml(data.blocks, opts.title || baseName(opts));
  return { blob: textBlob(html, 'text/html'), filename: baseName(opts) + '_script_print.html', mimeType: 'text/html', _openForPrint: true };
});

// ─── Score ─────────────────────────────────────────────────

register('score:json', (data, opts) => {
  const text = JSON.stringify(data.data, null, 2);
  return { blob: textBlob(text, 'application/json'), filename: baseName(opts) + '.score.json', mimeType: 'application/json' };
});

// ─── Memory ────────────────────────────────────────────────

register('memory:md', (data, opts) => {
  const text = memoryToMarkdown(data.record);
  return { blob: textBlob(text, 'text/markdown'), filename: baseName(opts) + '_memory.md', mimeType: 'text/markdown' };
});

// ── Format builders ────────────────────────────────────────

function escapeCsvCell(val, sep) {
  const s = String(val ?? '');
  if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function tableToDelimited(head, body, sep) {
  const rows = [head, ...body];
  return rows.map(r => r.map(c => escapeCsvCell(c, sep)).join(sep)).join('\n');
}

function tableToMarkdown(head, body) {
  const row = cells => '| ' + cells.map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |';
  const sep = '| ' + head.map(() => '------').join(' | ') + ' |';
  return [row(head), sep, ...body.map(r => row(r))].join('\n') + '\n';
}

function blocksToTyranoScript(blocks) {
  const lines = [];
  for (const b of blocks) {
    if (b.type === 'dialogue') {
      lines.push(`#${b.speaker || '???'}`);
      if (b.emotion) lines.push(`[emote name="${b.emotion}"]`);
      lines.push(`${b.text}[p]`);
      lines.push('');
    } else if (b.type === 'narration') {
      lines.push('[cm]');
      lines.push(`${b.text}[p]`);
      lines.push('');
    } else if (b.type === 'command') {
      const cmd = b.command;
      const val = b.value;
      if (cmd === 'bg') lines.push(`[bg storage="${val}"]`);
      else if (cmd === 'bgm') lines.push(`[playbgm storage="${val}"]`);
      else if (cmd === 'emotion') lines.push(`[emote name="${val}"]`);
      else lines.push(`[${cmd} value="${val}"]`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function blocksToMarkdown(blocks, title) {
  const lines = [];
  if (title) { lines.push(`# ${title}`, ''); }
  for (const b of blocks) {
    if (b.type === 'dialogue') {
      lines.push(`**${b.speaker || '???'}**：${b.text}`, '');
    } else if (b.type === 'narration') {
      lines.push(`*${b.text}*`, '');
    } else if (b.type === 'command') {
      lines.push(`\`[${b.command}: ${b.value}]\``, '');
    }
  }
  return lines.join('\n');
}

function scriptBlocksToHtml(blocks, title) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = blocks.map(b => {
    if (b.type === 'dialogue')
      return `<div class="block dialogue"><span class="speaker">${esc(b.speaker || '???')}</span><p class="text">${esc(b.text)}</p></div>`;
    if (b.type === 'narration')
      return `<div class="block narration"><p>（${esc(b.text)}）</p></div>`;
    if (b.type === 'command')
      return `<div class="block command"><p>[${esc(b.command)}: ${esc(b.value)}]</p></div>`;
    return '';
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(title || '劇本')}</title>
<style>
@media print { @page { margin: 2cm 2.5cm; } }
body { font-family: "Noto Sans TC","Microsoft JhengHei",sans-serif; max-width: 680px; margin: 40px auto; line-height: 1.7; color: #222; }
h1 { text-align: center; font-size: 1.6em; margin-bottom: 1.5em; border-bottom: 2px solid #c8a96e; padding-bottom: .4em; }
.block { margin-bottom: .6em; }
.dialogue .speaker { font-weight: 700; display: block; }
.dialogue .text { margin: .1em 0 0 1.5em; }
.narration p { font-style: italic; color: #555; margin-left: .8em; }
.command p { font-family: Consolas, monospace; font-size: .85em; color: #999; text-align: right; }
@media print { .no-print { display: none; } }
</style></head><body>
${title ? `<h1>${esc(title)}</h1>` : ''}
${body}
<div class="no-print" style="margin-top:2em;text-align:center;"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">列印 / 儲存 PDF</button></div>
</body></html>`;
}

function markdownToHtml(mdText, title) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = mdText.split('\n');
  const html = [];
  let inCode = false, codeLang = '', codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], tr = line.trim();

    if (tr.startsWith('```')) {
      if (!inCode) { inCode = true; codeLang = tr.slice(3).trim(); codeLines = []; }
      else { html.push(`<pre><code class="lang-${esc(codeLang)}">${esc(codeLines.join('\n'))}</code></pre>`); inCode = false; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!tr) { html.push(''); continue; }

    const hm = tr.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { html.push(`<h${hm[1].length}>${inlineFormat(hm[2])}</h${hm[1].length}>`); continue; }

    if (tr.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s:]*-{2,}/.test(lines[i + 1])) {
      const tRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tRows.push(lines[i].trim()); i++; }
      i--;
      const split = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const hd = split(tRows[0]);
      const bd = tRows.slice(2).map(split);
      html.push('<table><thead><tr>' + hd.map(c => `<th>${inlineFormat(c)}</th>`).join('') + '</tr></thead><tbody>');
      bd.forEach(r => html.push('<tr>' + r.map(c => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>'));
      html.push('</tbody></table>');
      continue;
    }

    if (/^\s*[-*+]\s/.test(tr)) { html.push(`<li>${inlineFormat(tr.replace(/^\s*[-*+]\s/, ''))}</li>`); continue; }
    if (/^\s*\d+\.\s/.test(tr)) { html.push(`<li>${inlineFormat(tr.replace(/^\s*\d+\.\s/, ''))}</li>`); continue; }
    if (/^[-*_]{3,}\s*$/.test(tr)) { html.push('<hr>'); continue; }
    if (tr.startsWith('> ')) { html.push(`<blockquote>${inlineFormat(tr.slice(2))}</blockquote>`); continue; }

    html.push(`<p>${inlineFormat(tr)}</p>`);
  }
  if (inCode) html.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(title || 'Document')}</title>
<style>
@media print { @page { margin: 2cm; } }
body { font-family: "Noto Serif TC",Georgia,serif; font-size: 12pt; line-height: 1.8; max-width: 720px; margin: 40px auto; color: #1a1a1a; padding: 0 20px; }
h1 { font-size: 22pt; margin: 0 0 16pt; }
h2 { font-size: 18pt; margin: 24pt 0 12pt; border-bottom: .5pt solid #ccc; padding-bottom: 4pt; }
h3 { font-size: 14pt; margin: 20pt 0 8pt; }
table { border-collapse: collapse; width: 100%; margin: 12pt 0; font-size: 10pt; }
th, td { border: .5pt solid #999; padding: 6pt 8pt; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
code { font-family: Consolas,monospace; background: #f4f4f4; padding: 1pt 4pt; border-radius: 2pt; }
pre { background: #f4f4f4; padding: 12pt; overflow: auto; border-radius: 4pt; font-size: 10pt; }
blockquote { border-left: 3pt solid #ddd; margin: 8pt 0; padding: 4pt 12pt; color: #555; }
@media print { .no-print { display: none; } }
</style></head><body>
${html.join('\n')}
<div class="no-print" style="margin-top:2em;text-align:center;"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">列印 / 儲存 PDF</button></div>
</body></html>`;
}

function inlineFormat(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function memoryToMarkdown(record) {
  const lines = [];
  lines.push(`# ${record.title || 'Memory Record'}`);
  lines.push('');
  if (record.scope) lines.push(`**Scope:** ${record.scope}`);
  if (record.module) lines.push(`**Module:** ${record.module}`);
  if (record.tags?.length) lines.push(`**Tags:** ${record.tags.join(', ')}`);
  if (record.createdAt) lines.push(`**Created:** ${record.createdAt}`);
  if (record.updatedAt) lines.push(`**Updated:** ${record.updatedAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(record.content || '');
  lines.push('');
  return lines.join('\n');
}
