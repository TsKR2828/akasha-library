// 以下檔案因 classic script / file:// 相容無法 import，使用字面值（檔內有對照註解）：
// index.html Layer 1、modules/markdown、modules/ai-settings、modules/reading-room、
// modules/daily-report、archive/book-editor、public-library
export const MSG_TYPES = {
  // ===== export（既有常數，值為歷史格式，不得正規化為 akasha-*）=====
  READER_EXPORT_TO_SPREADSHEET: 'READER_EXPORT_TO_SPREADSHEET',
  SCRIPT_EDITOR_EXPORT_TO_TABLE: 'SCRIPT_EDITOR_EXPORT_TO_TABLE',
  EXPORT_TO_TABLE_FORGE: 'akasha-export-to-table-forge',
  READER_PAYLOAD: 'akasha-reader-payload', // 現僅 table-forge 有接收端，寄送端不存在（legacy，保留相容）

  // ===== open / 檔案路由 =====
  OPEN_FILE: 'akasha-open-file',
  OPEN_SCRIPT: 'akasha-open-script',
  OPEN_PDF: 'akasha-open-pdf',
  OPEN_PDF_URL: 'akasha-open-pdf-url',
  OPEN_PDF_AI: 'akasha-open-pdf-ai',
  OPEN_SPREADSHEET: 'akasha-open-spreadsheet',
  OPEN_PUBLIC_PDF: 'akasha-open-public-pdf',
  FILE_OPENED: 'akasha-file-opened',

  // ===== theme =====
  MODE_CHANGE: 'akasha-mode-change',

  // ===== ai：金鑰/設定 =====
  APIKEY_UPDATE: 'akasha-apikey-update',
  APIKEY_REQUEST: 'akasha-apikey-request',
  APIKEY_CURRENT: 'akasha-apikey-current',
  NOTION_TOKEN_UPDATE: 'akasha-notion-token-update', // 無現存寄送端

  // ===== ai：PDF 問答 =====
  PDF_SETTINGS_REQUEST: 'akasha-pdf-settings-request',
  PDF_SETTINGS_RESPONSE: 'akasha-pdf-settings-response',
  PDF_AI_SEND: 'akasha-pdf-ai-send',
  PDF_AI_RESPONSE: 'akasha-pdf-ai-response',

  // ===== ai：上下文 =====
  AI_GET_CONTEXT: 'akasha-ai-get-context',
  AI_CONTEXT_RESPONSE: 'akasha-ai-context-response',

  // ===== ai：閱讀室/記憶 =====
  READING_ROOM_SEND: 'akasha-reading-room-send',
  READING_ROOM_RESPONSE: 'akasha-reading-room-response',
  READING_ROOM_MEMORY: 'akasha-reading-room-memory',
  READING_ROOM_MEMORY_RESPONSE: 'akasha-reading-room-memory-response',

  // ===== report =====
  REPORT_GENERATE: 'akasha-report-generate',
  REPORT_RESPONSE: 'akasha-report-response',

  // ===== voice =====
  VOICE_PLAY_REPORT: 'akasha-voice-play-report',
  VOICE_PAUSE: 'akasha-voice-pause',
  VOICE_RESUME: 'akasha-voice-resume',
  VOICE_STOP: 'akasha-voice-stop',
  VOICE_STATE: 'akasha-voice-state', // 無現存寄送端
  VOICE_STATE_UPDATE: 'akasha-voice-state-update',

  // ===== bgm =====
  BGM_PLAY: 'akasha-bgm-play',
  BGM_STOP: 'akasha-bgm-stop',
  BGM_TOGGLE: 'akasha-bgm-toggle', // 無現存寄送端

  // ===== misc =====
  READING_PROGRESS: 'akasha-reading-progress', // 注意：同字串亦作 localStorage key，storage 用途處保持字面值
  TRANSLATION_PREVIEW: 'akasha-translation-preview', // 無現存寄送端
};

export const STORAGE_KEY = 'reader_export_payload';

export function blocksToTablePayload(blocks, filename) {
  const rows = blocks
    .filter(b => b.speaker || b.speakerId || b.type === 'dialogue' || b.type === 'narration')
    .map((b, i) => ({
      '#': i + 1,
      type: b.type || 'dialogue',
      speaker: b.speaker || b.speakerId || '',
      text: b.zh || b.text || b.original || '',
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
