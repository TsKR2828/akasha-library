/**
 * Akasha Library — AI Module
 *
 * Text extraction from PDFs (via pdf.js) and LLM routing
 * for the AI Librarian feature.
 *
 * Supports BYOK (Bring Your Own Key) with direct browser API calls
 * and optional proxy mode for coin-based or Anthropic fallback.
 */

// ===== Storage Keys =====
const SETTINGS_KEY = 'akasha-ai-settings';

let _apiKey = '';

import { buildPersonaCore, getModulePersona } from './persona.js';
import { CONFIG } from './config.js';
import { getToken } from './auth.js';

const SESSION_TOKEN_KEY = 'akasha-session-token';
const SESSION_EXPIRY_KEY = 'akasha-session-expiry';

export function getProxyUrl() {
  const base = CONFIG.API_BASE;
  if (!base || base.includes('your-subdomain')) return null;
  return base;
}

export async function getSessionToken() {
  const cached = sessionStorage.getItem(SESSION_TOKEN_KEY);
  const expiry = parseInt(sessionStorage.getItem(SESSION_EXPIRY_KEY) || '0', 10);
  if (cached && Date.now() < expiry) return cached;

  const proxyUrl = getProxyUrl();
  const googleToken = getToken();
  if (!proxyUrl || !googleToken) return null;

  try {
    const res = await fetch(`${proxyUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: googleToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.token) return null;

    sessionStorage.setItem(SESSION_TOKEN_KEY, data.token);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + (data.expiresIn - 300) * 1000));
    return data.token;
  } catch { return null; }
}

export function clearSessionToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_KEY);
}

// ===== Text Extraction =====

/**
 * Extract text from a single PDF page.
 * Uses pdf.js getTextContent() and reconstructs reading order.
 */
export async function extractPageText(pdfDoc, pageNum) {
  if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return '';

  const page = await pdfDoc.getPage(pageNum);
  const content = await page.getTextContent();

  if (!content.items || content.items.length === 0) return '';

  // Sort items by vertical position (top→bottom), then horizontal (left→right)
  // transform = [scaleX, skewX, skewY, scaleY, tx, ty]
  const items = content.items
    .filter(item => item.str && item.str.trim())
    .sort((a, b) => {
      const dy = b.transform[5] - a.transform[5]; // y descending (top first)
      if (Math.abs(dy) > 2) return dy;
      return a.transform[4] - b.transform[4]; // x ascending (left first)
    });

  // Group items into lines by y-coordinate proximity
  const lines = [];
  let currentLine = [];
  let lastY = null;

  for (const item of items) {
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.length > 0) {
        lines.push(currentLine.map(i => i.str).join(' '));
      }
      currentLine = [];
    }
    currentLine.push(item);
    lastY = y;
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.map(i => i.str).join(' '));
  }

  return lines.join('\n');
}

/**
 * Extract text from a range of pages around the current page.
 * Returns formatted text with page markers.
 */
export async function extractContextPages(pdfDoc, currentPage, range = 2) {
  if (!pdfDoc) return '';

  const start = Math.max(1, currentPage - range);
  const end = Math.min(pdfDoc.numPages, currentPage + range);
  const parts = [];
  let totalLength = 0;
  const MAX_CHARS = 12000; // ~5000 tokens safety cap

  for (let p = start; p <= end; p++) {
    const text = await extractPageText(pdfDoc, p);
    if (!text.trim()) continue;

    const marker = p === currentPage ? `【第 ${p} 頁 · 目前頁面】` : `【第 ${p} 頁】`;
    const section = `${marker}\n${text}`;

    if (totalLength + section.length > MAX_CHARS && parts.length > 0) break;
    parts.push(section);
    totalLength += section.length;
  }

  return parts.join('\n\n');
}

// ===== Settings =====

export function setApiKey(key) { _apiKey = key || ''; }
export function clearApiKey() { _apiKey = ''; }
export function hasApiKey() { return !!_apiKey; }

export function getAISettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { /* empty */ }

  const apiKey = _apiKey;

  const result = {
    mode: settings.mode || 'byok',
    provider: settings.provider || 'openai',
    model: settings.model || 'gpt-4o',
    endpoint: settings.endpoint || '',
    apiKey,
  };

  // Validation
  if (result.mode === 'byok' && !result.apiKey) {
    result.error = 'no-api-key';
  }
  if (result.mode === 'coin' && !getProxyUrl()) {
    result.error = 'no-proxy';
  }

  return result;
}

// ===== System Prompt =====

/**
 * Build the system prompt for the AI Librarian persona.
 * All prompt builders read from persona.md via core/persona.js.
 */
export function buildSystemPrompt(pageContext, currentPage, fileName) {
  const moduleDirectives = getModulePersona('pdf-reader');
  return `${buildPersonaCore()}

## 目前身份與職責
${moduleDirectives}

## 目前閱讀狀態
- 書籍：「${fileName}」
- 目前頁面：第 ${currentPage} 頁

## 頁面內容
${pageContext}`;
}

export function buildCodeSystemPrompt(fileContent, fileName, fileType) {
  const moduleDirectives = getModulePersona('markdown');
  return `${buildPersonaCore()}

## 目前身份與職責
${moduleDirectives}

## 目前檔案
- 檔名：「${fileName}」
- 類型：${fileType}

## 檔案內容
${fileContent}`;
}

export function buildTableSystemPrompt(tableData, fileName) {
  const moduleDirectives = getModulePersona('table-forge');
  return `${buildPersonaCore()}

## 目前身份與職責
${moduleDirectives}

## 目前資料
- 來源：「${fileName || '未命名表格'}」

## 表格內容
${tableData}`;
}

export function buildGeneralSystemPrompt() {
  const moduleDirectives = getModulePersona('_default');
  return `${buildPersonaCore()}

## 目前身份與職責
${moduleDirectives}`;
}

// ===== LLM Calls =====

/**
 * Call LLM with provider routing.
 * BYOK mode: direct browser API calls.
 * Coin mode: routes through Workers proxy.
 *
 * @param {object} settings
 * @param {string} systemPrompt
 * @param {string|Array<{role:string,content:string}>} messages
 *   String (single user message) or array of {role, content} turns.
 */
export async function callLLM(settings, systemPrompt, messages) {
  const msgs = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : messages;

  if (settings.mode === 'coin') {
    return callViaProxy(settings, systemPrompt, msgs);
  }

  switch (settings.provider) {
    case 'openai':
      return callOpenAI(settings, systemPrompt, msgs);
    case 'anthropic':
      return callAnthropic(settings, systemPrompt, msgs);
    case 'google':
      return callGoogle(settings, systemPrompt, msgs);
    case 'custom':
      return callCustom(settings, systemPrompt, msgs);
    default:
      throw new Error(`不支援的 AI 供應商：${settings.provider}`);
  }
}

async function callOpenAI(settings, systemPrompt, msgs) {
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...msgs,
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.choices[0].message.content;
}

async function callAnthropic(settings, systemPrompt, msgs) {
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': settings.apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      system: systemPrompt,
      messages: msgs,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.content[0].text;
}

async function callGoogle(settings, systemPrompt, msgs) {
  const model = settings.model || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;
  const contents = msgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google AI ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

async function callCustom(settings, systemPrompt, msgs) {
  if (!settings.endpoint) throw new Error('自訂端點未設定');

  // OpenAI-compatible format (works with Ollama, LM Studio, vLLM, etc.)
  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...msgs,
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || err.message || res.statusText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || json.content?.[0]?.text || JSON.stringify(json);
}

async function callViaProxy(settings, systemPrompt, msgs) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) throw new Error('月幣模式尚未啟用（代理伺服器未設定）');

  const headers = { 'Content-Type': 'application/json' };
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const res = await fetch(`${proxyUrl}/v1/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: settings.provider,
      model: settings.model,
      system: systemPrompt,
      messages: msgs,
      mode: 'coin',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) clearSessionToken();
    throw new Error(`Proxy ${res.status}: ${err.error || res.statusText}`);
  }

  const json = await res.json();
  return json.content;
}

// ===== Coin System (delegated to billing.js) =====
export { estimateTokens, coinCost, deductCoins, getBalance, hasSufficientBalance, getUsageLog, FREE_ALLOWANCE } from './billing.js';
