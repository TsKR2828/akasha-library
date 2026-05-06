export function copyPlainText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

function htmlToPlainText(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  const rows = Array.from(el.querySelectorAll('tr'));
  if (rows.length) {
    return rows
      .map(tr => Array.from(tr.children).map(td => td.innerText.trim()).join('\t'))
      .join('\n');
  }
  return el.innerText;
}

export async function copyRichHtml(html) {
  const plain = htmlToPlainText(html);
  if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return true;
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  container.contentEditable = 'true';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  document.body.appendChild(container);
  const range = document.createRange();
  range.selectNodeContents(container);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand('copy');
  sel.removeAllRanges();
  document.body.removeChild(container);
  return ok;
}
