/**
 * Akasha Library — Text Decode Helper
 *
 * Solves garbled text (亂碼) when importing files with non-UTF-8 encoding.
 * Detects BOM, tries UTF-8 first, then falls back to common CJK encodings.
 *
 * Usage:
 *   import { decodeFile } from './core/text-decode.js';
 *   const text = await decodeFile(file);           // File or Blob
 *   const text = decodeBuffer(arrayBuffer);         // ArrayBuffer
 */

// Fallback encodings ordered by likelihood in a CJK environment
const FALLBACKS = ['big5', 'shift_jis', 'euc-jp', 'euc-kr', 'gb18030', 'windows-1252'];

/**
 * Decode an ArrayBuffer to string with automatic encoding detection.
 *
 * Strategy:
 *  1. Check for BOM (UTF-8 / UTF-16 LE / UTF-16 BE) → use matching decoder
 *  2. Try UTF-8 strict (fatal: true) → if valid, return
 *  3. Try each FALLBACK encoding → pick first that decodes without U+FFFD
 *  4. Last resort: UTF-8 lossy (replacement characters allowed)
 *
 * @param {ArrayBuffer} buffer
 * @returns {{ text: string, encoding: string }}
 */
export function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);

  // --- BOM detection ---
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    // UTF-8 BOM → strip BOM and decode
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }

  // --- Try UTF-8 strict ---
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch { /* not valid UTF-8 */ }

  // --- Fallback encodings ---
  for (const enc of FALLBACKS) {
    try {
      const decoder = new TextDecoder(enc, { fatal: false });
      const text = decoder.decode(bytes);
      // Accept if no replacement characters were produced
      if (!text.includes('�')) {
        return { text, encoding: enc };
      }
    } catch { /* encoding not supported in this browser */ }
  }

  // --- Last resort: lossy UTF-8 ---
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), encoding: 'utf-8-lossy' };
}

/**
 * Read a File/Blob and decode with automatic encoding detection.
 *
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export async function decodeFile(file) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer).text;
}
