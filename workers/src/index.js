/**
 * Akasha AI Proxy — Cloudflare Worker
 *
 * Routes LLM requests to OpenAI / Anthropic / Google APIs.
 * - BYOK mode: passes through user's API key (avoids browser CORS issues)
 * - Coin mode: uses server-stored secret keys
 *
 * Secrets (set via `wrangler secret put`):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple per-IP rate limiting (in-memory, resets on worker restart)
const rateLimits = new Map();
const RATE_LIMIT = 12; // requests per minute
const RATE_WINDOW = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW;
  }
  entry.count++;
  rateLimits.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/v1/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (url.pathname === '/health') {
      return json({ status: 'ok', time: new Date().toISOString() });
    }

    return json({ error: 'Not found' }, 404);
  },
};

async function handleChat(request, env) {
  // Rate limit
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return json({ error: '請求過於頻繁，請稍後再試。' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { provider, model, system, messages, mode, apiKey } = body;

  if (!provider || !model || !messages || !Array.isArray(messages)) {
    return json({ error: 'Missing required fields: provider, model, messages' }, 400);
  }

  // Determine API key — only BYOK mode is supported; coin mode is disabled
  if (mode !== 'byok' || !apiKey) {
    return json({ error: 'Only BYOK mode is currently supported. Please provide your own API key.' }, 403);
  }
  const key = apiKey;

  try {
    let content;
    switch (provider) {
      case 'openai':
        content = await proxyOpenAI(key, model, system, messages);
        break;
      case 'anthropic':
        content = await proxyAnthropic(key, model, system, messages);
        break;
      case 'google':
        content = await proxyGoogle(key, model, system, messages);
        break;
      default:
        return json({ error: `Unsupported provider: ${provider}` }, 400);
    }
    return json({ content, provider, model });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function proxyOpenAI(apiKey, model, system, messages) {
  const allMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: allMessages,
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

async function proxyAnthropic(apiKey, model, system, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages,
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

async function proxyGoogle(apiKey, model, system, messages) {
  const userText = messages.map(m => m.content).join('\n');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
  };
  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google AI ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
