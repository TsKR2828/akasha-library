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
 * Score a decoded text to estimate how likely the encoding was correct.
 * Higher score = more confident the decoding is correct.
 *
 * @param {string} text
 * @returns {number}
 */
function scoreDecoding(text) {
  let score = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Reward script-specific ranges
    if (cp >= 0x3040 && cp <= 0x309F) score += 3; // Hiragana → strong Japanese signal
    if (cp >= 0x30A0 && cp <= 0x30FF) score += 3; // Katakana → strong Japanese signal
    if (cp >= 0x3100 && cp <= 0x312F) score += 3; // Bopomofo → strong Chinese signal
    if (cp >= 0x4E00 && cp <= 0x9FFF) score += 1; // CJK Unified (common to both)
    // Penalize wrong-encoding artifacts
    if (cp >= 0xE000 && cp <= 0xF8FF) score -= 5; // Private Use Area
    if (cp < 0x20 && cp !== 0x0A && cp !== 0x0D && cp !== 0x09) score -= 3; // Unexpected control chars
  }
  return score;
}

/**
 * Decode an ArrayBuffer to string with automatic encoding detection.
 *
 * Strategy:
 *  1. Check for BOM (UTF-8 / UTF-16 LE / UTF-16 BE) → use matching decoder
 *  2. Try UTF-8 strict (fatal: true) → if valid, return
 *  3. Try each FALLBACK encoding → score all clean decodings, pick highest
 *  4. Last resort: UTF-8 lossy (replacement characters allowed)
 *
 * @param {ArrayBuffer} buffer
 * @param {string} [forceEncoding] - Optional encoding override (skip auto-detection)
 * @returns {{ text: string, encoding: string }}
 */
export function decodeBuffer(buffer, forceEncoding) {
  if (forceEncoding) {
    return { text: new TextDecoder(forceEncoding, { fatal: false }).decode(new Uint8Array(buffer)), encoding: forceEncoding };
  }

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
  let bestResult = null;
  let bestScore = -Infinity;
  for (const enc of FALLBACKS) {
    try {
      const decoder = new TextDecoder(enc, { fatal: false });
      const text = decoder.decode(bytes);
      if (text.includes('�')) continue; // still skip ones with replacement chars
      const score = scoreDecoding(text);
      if (score > bestScore) {
        bestScore = score;
        bestResult = { text, encoding: enc };
      }
    } catch { /* encoding not supported in this browser */ }
  }
  if (bestResult) return bestResult;

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
