const colLabel = (i) => {
  let label = '';
  let n = i;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
};
const cid = (r, c) => `${colLabel(c)}${r + 1}`;

const base = () => ({
  bold: false, italic: false, underline: false,
  align: 'left', bg: '', color: '', fontSize: 13,
});

const HEADING_STYLES = {
  1: { bold: true, fontSize: 16, bg: '#dfe6ff' },
  2: { bold: true, fontSize: 14, bg: '#edf1ff' },
  3: { bold: true, fontSize: 13, bg: '#f4f6fb' },
};

export function payloadToCells(payload) {
  const cells = {};
  const styles = {};
  let row = 0;

  function put(r, c, value, style) {
    const id = cid(r, c);
    cells[id] = value;
    if (style) styles[id] = { ...base(), ...style };
  }

  for (const block of payload.blocks) {
    switch (block.type) {
      case 'heading': {
        const hs = HEADING_STYLES[block.level] || { bold: true, fontSize: 13 };
        put(row, 0, block.text, hs);
        row++;
        break;
      }
      case 'paragraph': {
        put(row, 0, block.text);
        row++;
        break;
      }
      case 'table': {
        block.head.forEach((h, c) =>
          put(row, c, h, { bold: true, bg: '#eef1f8' })
        );
        row++;
        block.body.forEach(bodyRow => {
          bodyRow.forEach((val, c) => put(row, c, val));
          row++;
        });
        row++;
        break;
      }
      case 'code': {
        const label = block.lang ? `[${block.lang}]` : '[code]';
        put(row, 0, label, { bold: true, bg: '#f5f5f5', color: '#6a6a6a' });
        row++;
        block.text.split('\n').forEach(line => {
          put(row, 0, line, { bg: '#fafafa', fontSize: 12 });
          row++;
        });
        row++;
        break;
      }
    }
  }

  return {
    name: payload.filename || '匯入資料',
    cells,
    styles,
  };
}
