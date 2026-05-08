/**
 * Akasha Library — Persona Module
 *
 * Loads and parses persona.md into structured data for system prompts.
 * Supports user overrides via localStorage.
 */

const PERSONA_STORAGE_KEY = 'akasha-persona-override';
const PERSONA_PATH = './persona.md';

let cachedPersona = null;

const MODULE_NAME_MAP = {
  'pdf reader': 'pdf-reader',
  'code & data': 'markdown',
  'table forge': 'table-forge',
  'script editor': 'script-editor',
  'private reading room': 'private-reading-room',
  'general': '_default',
};

// ===== Parser =====

export function parsePersonaMd(text) {
  const result = { raw: text, core: '', tone: '', rules: [], modules: {} };

  const h2Sections = {};
  let currentH2 = null;
  let buf = [];

  for (const line of text.split('\n')) {
    const m = line.match(/^## (.+)/);
    if (m) {
      if (currentH2) h2Sections[currentH2] = buf.join('\n').trim();
      currentH2 = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (currentH2) h2Sections[currentH2] = buf.join('\n').trim();

  result.core = h2Sections['Core Identity'] || '';
  result.tone = h2Sections['Tone'] || '';

  const rulesText = h2Sections['Global Rules'] || '';
  result.rules = rulesText.split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  const modulesText = h2Sections['Module Contexts'] || '';
  let curMod = null;
  let modBuf = [];

  for (const line of modulesText.split('\n')) {
    const m3 = line.match(/^### (.+)/);
    if (m3) {
      if (curMod) {
        const key = MODULE_NAME_MAP[curMod.toLowerCase()] || curMod.toLowerCase().replace(/\s+/g, '-');
        result.modules[key] = modBuf.join('\n').trim();
      }
      curMod = m3[1].trim();
      modBuf = [];
    } else {
      modBuf.push(line);
    }
  }
  if (curMod) {
    const key = MODULE_NAME_MAP[curMod.toLowerCase()] || curMod.toLowerCase().replace(/\s+/g, '-');
    result.modules[key] = modBuf.join('\n').trim();
  }

  return result;
}

// ===== Default (file:// fallback) =====

const DEFAULT_MD = `# Persona

## Core Identity
月上零韻（Tsukiue Rein），阿卡夏圖書館的司書。
以使用者使用的語言回應。
保持圖書館員的知性語氣，但不要過度角色扮演而影響回答品質。
回答要準確、簡潔。

## Tone
清楚、帶圖書館員式儀式感，協助使用者整理、翻譯、檢查與保存內容。

## Global Rules
- 不擅自改寫使用者原文
- 不把草稿當最終稿
- 需要外部 API 時先提示成本與用途
- 版權受限內容不可帶出書庫

## Module Contexts

### PDF Reader
身份：圖書館員 — 專責 PDF 伴讀與內容問答。
根據提供的 PDF 頁面內容回答使用者的問題。
如果頁面內容中沒有答案，誠實告知「在目前閱覽的頁面範圍中未找到相關資訊」，並建議翻到其他頁面後再詢問。
優先引用原文。

### Code & Data
身份：手稿解讀員 — 專責分析程式碼、資料檔與文件。
若是程式碼（.py .js 等），解釋邏輯、指出潛在問題、提供改進建議。
若是 JSON，分析結構、說明欄位意義、檢查格式正確性。
若是 Markdown，解釋內容結構與重點。
若檔案內容不足以回答，誠實告知。

### Table Forge
身份：資料檢查員 — 專責分析表格資料的完整性與一致性。
可以檢查空欄位、資料一致性、分佈異常。
可以建議資料清理或補全方式。
若資料不足以回答，誠實告知。

### General
身份：圖書館員 — 阿卡夏圖書館的總導覽員。
目前沒有開啟任何特定檔案。
可以回答關於阿卡夏圖書館功能的問題。
可以引導使用者開啟模組（PDF 閱讀器、Code & Data、Table Forge）。
若使用者詢問特定內容，建議先開啟對應的模組和檔案。`;

// ===== Loader =====

export async function loadPersona() {
  // 1. localStorage override
  try {
    const override = localStorage.getItem(PERSONA_STORAGE_KEY);
    if (override) {
      cachedPersona = parsePersonaMd(override);
      return cachedPersona;
    }
  } catch { /* ignore */ }

  // 2. Fetch default file (HTTP only)
  try {
    const res = await fetch(PERSONA_PATH);
    if (res.ok) {
      const text = await res.text();
      cachedPersona = parsePersonaMd(text);
      return cachedPersona;
    }
  } catch { /* fetch fails on file:// */ }

  // 3. Hardcoded fallback
  cachedPersona = parsePersonaMd(DEFAULT_MD);
  return cachedPersona;
}

export function getPersona() {
  return cachedPersona || parsePersonaMd(DEFAULT_MD);
}

/**
 * Build the core persona block for system prompts.
 * Combines Core Identity + Tone + Global Rules.
 */
export function buildPersonaCore() {
  const p = getPersona();
  const parts = [p.core];
  if (p.tone) parts.push(`語氣風格：${p.tone}`);
  if (p.rules.length) parts.push(p.rules.map(r => `- ${r}`).join('\n'));
  return parts.join('\n');
}

/**
 * Get module-specific persona directives.
 * Returns empty string if module has no persona entry.
 */
export function getModulePersona(moduleName) {
  const p = getPersona();
  return p.modules[moduleName] || '';
}

// ===== User Override =====

export function savePersonaOverride(mdText) {
  localStorage.setItem(PERSONA_STORAGE_KEY, mdText);
  cachedPersona = parsePersonaMd(mdText);
  return cachedPersona;
}

export function resetPersona() {
  localStorage.removeItem(PERSONA_STORAGE_KEY);
  cachedPersona = null;
}

export function hasPersonaOverride() {
  try { return !!localStorage.getItem(PERSONA_STORAGE_KEY); }
  catch { return false; }
}

export function exportPersonaMd() {
  return getPersona().raw;
}
