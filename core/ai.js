/**
 * Akasha Library — AI Module
 *
 * Text extraction from PDFs (via pdf.js) and LLM routing
 * for the AI Librarian feature.
 *
 * Supports BYOK (Bring Your Own Key) with direct browser API calls
 * and optional proxy mode for coin-based or Anthropic fallback.
 */

// ===== Storage Keys (shared with modules/ai-settings) =====
const SETTINGS_KEY = 'akasha-ai-settings';
const APIKEY_KEY = 'akasha-ai-apikey';
const COIN_KEY = 'akasha-coin-balance';
const USAGE_KEY = 'akasha-coin-usage';

// Proxy URL — set when Workers proxy is deployed (null = direct mode only)
const PROXY_URL = null;

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

/**
 * Read AI settings from localStorage/sessionStorage.
 * Compatible with modules/ai-settings storage format.
 */
export function getAISettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { /* empty */ }

  const apiKey = sessionStorage.getItem(APIKEY_KEY) || '';

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
  if (result.mode === 'coin' && !PROXY_URL) {
    result.error = 'no-proxy';
  }

  return result;
}

// ===== System Prompt =====

/**
 * Build the system prompt for the AI Librarian persona.
 */
export function buildSystemPrompt(pageContext, currentPage, fileName) {
  return `${PERSONA_CORE}

## 目前身份
圖書館員 — 專責 PDF 伴讀與內容問答。

## 核心規則
- 根據以下提供的 PDF 頁面內容回答使用者的問題。
- 如果頁面內容中沒有答案，誠實告知「在目前閱覽的頁面範圍中未找到相關資訊」，並建議翻到其他頁面後再詢問。
- 優先引用原文。

## 目前閱讀狀態
- 書籍：「${fileName}」
- 目前頁面：第 ${currentPage} 頁

## 頁面內容
${pageContext}`;
}

const PERSONA_CORE = `你是「月上零韻」（Tsukiue Rein），阿卡夏圖書館的司書。
- 以使用者使用的語言回應。
- 保持圖書館員的知性語氣，但不要過度角色扮演而影響回答品質。
- 回答要準確、簡潔。`;

export function buildCodeSystemPrompt(fileContent, fileName, fileType) {
  return `${PERSONA_CORE}

## 目前身份
手稿解讀員 — 專責分析程式碼、資料檔與文件。

## 核心規則
- 根據以下提供的檔案內容回答使用者的問題。
- 若是程式碼（.py .js 等），解釋邏輯、指出潛在問題、提供改進建議。
- 若是 JSON，分析結構、說明欄位意義、檢查格式正確性。
- 若是 Markdown，解釋內容結構與重點。
- 若檔案內容不足以回答，誠實告知。

## 目前檔案
- 檔名：「${fileName}」
- 類型：${fileType}

## 檔案內容
${fileContent}`;
}

export function buildTableSystemPrompt(tableData, fileName) {
  return `${PERSONA_CORE}

## 目前身份
資料檢查員 — 專責分析表格資料的完整性與一致性。

## 核心規則
- 根據以下提供的表格資料回答使用者的問題。
- 可以檢查空欄位、資料一致性、分佈異常。
- 可以建議資料清理或補全方式。
- 若資料不足以回答，誠實告知。

## 目前資料
- 來源：「${fileName || '未命名表格'}」

## 表格內容
${tableData}`;
}

export function buildGeneralSystemPrompt() {
  return `${PERSONA_CORE}

## 目前身份
圖書館員 — 阿卡夏圖書館的總導覽員。

## 核心規則
- 你目前沒有開啟任何特定檔案。
- 可以回答關於阿卡夏圖書館功能的問題。
- 可以引導使用者開啟模組（PDF 閱讀器、Code & Data、Table Forge）。
- 若使用者詢問特定內容，建議先開啟對應的模組和檔案。`;
}

// ===== LLM Calls =====

/**
 * Call LLM with provider routing.
 * BYOK mode: direct browser API calls.
 * Coin mode: routes through Workers proxy.
 */
export async function callLLM(settings, systemPrompt, userMessage) {
  if (settings.mode === 'coin') {
    return callViaProxy(settings, systemPrompt, userMessage);
  }

  switch (settings.provider) {
    case 'openai':
      return callOpenAI(settings, systemPrompt, userMessage);
    case 'anthropic':
      return callAnthropic(settings, systemPrompt, userMessage);
    case 'google':
      return callGoogle(settings, systemPrompt, userMessage);
    case 'custom':
      return callCustom(settings, systemPrompt, userMessage);
    default:
      throw new Error(`不支援的 AI 供應商：${settings.provider}`);
  }
}

async function callOpenAI(settings, systemPrompt, userMessage) {
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
        { role: 'user', content: userMessage },
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

async function callAnthropic(settings, systemPrompt, userMessage) {
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
      messages: [
        { role: 'user', content: userMessage },
      ],
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

async function callGoogle(settings, systemPrompt, userMessage) {
  const model = settings.model || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
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

async function callCustom(settings, systemPrompt, userMessage) {
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
        { role: 'user', content: userMessage },
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

async function callViaProxy(settings, systemPrompt, userMessage) {
  if (!PROXY_URL) throw new Error('月幣模式尚未啟用（代理伺服器未設定）');

  const res = await fetch(`${PROXY_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: settings.provider,
      model: settings.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      mode: 'coin',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Proxy ${res.status}: ${err.error || res.statusText}`);
  }

  const json = await res.json();
  return json.content;
}

// ===== Coin System =====

/**
 * Estimate token count from text (rough heuristic).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  // CJK characters ≈ 0.6 tokens each, English words ≈ 1.3 tokens each
  const cjk = (text.match(/[一-鿿぀-ゟ゠-ヿ]/g) || []).length;
  const nonCjk = text.length - cjk;
  return Math.ceil(cjk * 0.6 + nonCjk * 0.25);
}

/**
 * Calculate coin cost by token tier.
 */
export function coinCost(tokens) {
  if (tokens <= 500) return 1;
  if (tokens <= 2000) return 3;
  return 5;
}

/**
 * Deduct coins and log usage. Returns remaining balance.
 */
export function deductCoins(amount, description) {
  let data;
  try { data = JSON.parse(localStorage.getItem(COIN_KEY) || '{}'); }
  catch { data = {}; }

  const balance = Math.max(0, (data.balance ?? 100) - amount);
  data.balance = balance;
  localStorage.setItem(COIN_KEY, JSON.stringify(data));

  // Log usage
  let log;
  try { log = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]'); }
  catch { log = []; }
  log.unshift({ amount, description, time: Date.now(), balance });
  localStorage.setItem(USAGE_KEY, JSON.stringify(log.slice(0, 50)));

  return balance;
}
