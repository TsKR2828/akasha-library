export const MSG_TYPES = {
  READER_EXPORT_TO_SPREADSHEET: 'READER_EXPORT_TO_SPREADSHEET',
  SCRIPT_EDITOR_EXPORT_TO_TABLE: 'SCRIPT_EDITOR_EXPORT_TO_TABLE',
};

export const STORAGE_KEY = 'reader_export_payload';

export function blocksToTablePayload(blocks, filename) {
  const rows = blocks
    .filter(b => b.speaker || b.speakerId || b.type === 'dialogue' || b.type === 'narration')
    .map((b, i) => ({
      '#': i + 1,
      type: b.type || 'dialogue',
      speaker: b.speaker || b.speakerId || '',
      text: b.text || b.original || b.zh || '',
      ...(b.emotion ? { emotion: b.emotion } : {}),
      ...(b.voice ? { voice: b.voice } : {}),
    }));

  if (!rows.length) return null;

  const head = Object.keys(rows[0]);
  const body = rows.map(r => head.map(k => String(r[k] ?? '')));
  return {
    filename: filename || 'script-blocks',
    mode: 'json',
    blocks: [
      { type: 'heading', level: 2, text: filename || 'Script Blocks' },
      { type: 'table', head, body },
    ],
  };
}
