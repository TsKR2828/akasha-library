/**
 * Akasha AI Proxy — Cloudflare Worker (Phase 16-D)
 *
 * Routes:
 *   POST /v1/chat         — LLM proxy (BYOK + Coin mode)
 *   POST /v1/sync         — Sync queue push/pull
 *   POST /v1/rag          — RAG retrieval (stub)
 *   POST /v1/coin/balance  — Coin balance query
 *   POST /v1/coin/deduct   — Coin deduction
 *   GET  /health           — Health check
 *
 * Secrets (set via `wrangler secret put`):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
 *   COIN_SECRET — HMAC key for coin deduction verification
 *
 * KV Bindings (set in wrangler.toml):
 *   COIN_KV   — per-user coin balances
 *   SYNC_KV   — sync queue items
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Coin-Token',
};

/* ══════════════════════════════════════════
   Rate Limiting (in-memory, resets on restart)
   ══════════════════════════════════════════ */

const rateLimits = new Map();
const RATE_LIMIT = 12;      // requests per minute
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

/* ══════════════════════════════════════════
   Router
   ══════════════════════════════════════════ */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limit all POST endpoints
    if (request.method === 'POST' && !checkRateLimit(ip)) {
      return json({ error: '請求過於頻繁，請稍後再試。' }, 429);
    }

    try {
      switch (url.pathname) {
        case '/v1/chat':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return handleChat(request, env);

        case '/v1/sync':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return handleSync(request, env);

        case '/v1/rag':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return handleRag(request, env);

        case '/v1/coin/balance':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return handleCoinBalance(request, env);

        case '/v1/coin/deduct':
          if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
          return handleCoinDeduct(request, env);

        case '/health':
          return json({
            status: 'ok',
            time: new Date().toISOString(),
            features: {
              chat: true,
              sync: !!env.SYNC_KV,
              rag: false,        // stub only
              coin: !!env.COIN_KV,
            },
          });

        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (err) {
      return json({ error: 'Internal error', message: err.message }, 500);
    }
  },
};


/* ══════════════════════════════════════════
   /v1/chat — LLM Proxy (BYOK + Coin)
   ══════════════════════════════════════════ */

async function handleChat(request, env) {
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

  let key;

  if (mode === 'byok') {
    // BYOK: pass through user's API key
    if (!apiKey) {
      return json({ error: 'BYOK mode requires apiKey field' }, 400);
    }
    key = apiKey;

  } else if (mode === 'coin') {
    // Coin mode: use server-stored key, deduct coins
    const userId = request.headers.get('X-User-Id');
    if (!userId) {
      return json({ error: 'Coin mode requires X-User-Id header' }, 400);
    }

    // Check coin balance
    const balance = await getCoinBalance(env, userId);
    const cost = estimateCoinCost(model, messages);
    if (balance < cost) {
      return json({
        error: '月幣不足',
        balance,
        required: cost,
      }, 402);
    }

    // Select server key
    key = getServerKey(env, provider);
    if (!key) {
      return json({ error: `Server key not configured for provider: ${provider}` }, 503);
    }

    // Deduct coins after successful response (optimistic)
    // We deduct before calling to prevent race conditions
    await deductCoins(env, userId, cost, `chat:${provider}:${model}`);

  } else {
    return json({ error: 'Invalid mode. Use "byok" or "coin".' }, 400);
  }

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
    // If coin mode failed, refund (best-effort)
    if (mode === 'coin') {
      const userId = request.headers.get('X-User-Id');
      const cost = estimateCoinCost(model, messages);
      await refundCoins(env, userId, cost, `refund:${err.message.slice(0, 50)}`);
    }
    return json({ error: err.message }, 502);
  }
}


/* ══════════════════════════════════════════
   /v1/sync — Sync Queue (Phase 16-D)
   ══════════════════════════════════════════ */

async function handleSync(request, env) {
  if (!env.SYNC_KV) {
    return json({ error: 'Sync service not configured (SYNC_KV binding missing)' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return json({ error: 'X-User-Id header required' }, 400);
  }

  const { action } = body;

  switch (action) {
    case 'push': {
      // Push items to sync queue
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return json({ error: 'items array required' }, 400);
      }
      if (items.length > 50) {
        return json({ error: 'Maximum 50 items per push' }, 400);
      }

      const queueKey = `sync:${userId}`;
      const existing = await env.SYNC_KV.get(queueKey, 'json') || [];
      const stamped = items.map(item => ({
        ...item,
        _pushedAt: Date.now(),
        _id: crypto.randomUUID(),
      }));
      const merged = [...existing, ...stamped].slice(-200); // cap at 200

      await env.SYNC_KV.put(queueKey, JSON.stringify(merged), {
        expirationTtl: 86400 * 30, // 30 days
      });

      return json({ ok: true, queued: stamped.length, total: merged.length });
    }

    case 'pull': {
      // Pull pending items
      const queueKey = `sync:${userId}`;
      const items = await env.SYNC_KV.get(queueKey, 'json') || [];
      return json({ ok: true, items });
    }

    case 'ack': {
      // Acknowledge processed items (remove from queue)
      const { ids } = body;
      if (!Array.isArray(ids)) {
        return json({ error: 'ids array required' }, 400);
      }

      const queueKey = `sync:${userId}`;
      const existing = await env.SYNC_KV.get(queueKey, 'json') || [];
      const remaining = existing.filter(item => !ids.includes(item._id));

      await env.SYNC_KV.put(queueKey, JSON.stringify(remaining), {
        expirationTtl: 86400 * 30,
      });

      return json({ ok: true, removed: existing.length - remaining.length, remaining: remaining.length });
    }

    default:
      return json({ error: 'Unknown sync action. Use: push, pull, ack' }, 400);
  }
}


/* ══════════════════════════════════════════
   /v1/rag — RAG Retrieval (Stub)
   ══════════════════════════════════════════ */

async function handleRag(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { query, collection, topK } = body;

  if (!query) {
    return json({ error: 'query field required' }, 400);
  }

  // Stub — returns empty results with metadata
  // Future: integrate with Vectorize / Pinecone / Weaviate
  return json({
    ok: true,
    query,
    collection: collection || 'default',
    topK: topK || 5,
    results: [],
    _stub: true,
    _message: 'RAG retrieval is not yet implemented. Results will be empty.',
  });
}


/* ══════════════════════════════════════════
   /v1/coin — Coin System (Phase 16-D)
   ══════════════════════════════════════════ */

async function handleCoinBalance(request, env) {
  if (!env.COIN_KV) {
    return json({ error: 'Coin service not configured (COIN_KV binding missing)' }, 503);
  }

  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return json({ error: 'X-User-Id header required' }, 400);
  }

  const balance = await getCoinBalance(env, userId);
  const history = await getCoinHistory(env, userId);

  return json({ ok: true, userId, balance, recentHistory: history.slice(-20) });
}

async function handleCoinDeduct(request, env) {
  if (!env.COIN_KV) {
    return json({ error: 'Coin service not configured (COIN_KV binding missing)' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return json({ error: 'X-User-Id header required' }, 400);
  }

  const { amount, reason } = body;
  if (typeof amount !== 'number' || amount <= 0) {
    return json({ error: 'amount must be a positive number' }, 400);
  }

  const balance = await getCoinBalance(env, userId);
  if (balance < amount) {
    return json({ error: '月幣不足', balance, required: amount }, 402);
  }

  await deductCoins(env, userId, amount, reason || 'manual');
  const newBalance = await getCoinBalance(env, userId);

  return json({ ok: true, deducted: amount, balance: newBalance });
}


/* ══════════════════════════════════════════
   Coin Helpers
   ══════════════════════════════════════════ */

const DEFAULT_BALANCE = 100; // New users start with 100 coins

async function getCoinBalance(env, userId) {
  if (!env.COIN_KV) return 0;
  const val = await env.COIN_KV.get(`coin:${userId}:balance`);
  return val !== null ? parseFloat(val) : DEFAULT_BALANCE;
}

async function getCoinHistory(env, userId) {
  if (!env.COIN_KV) return [];
  const val = await env.COIN_KV.get(`coin:${userId}:history`, 'json');
  return val || [];
}

async function deductCoins(env, userId, amount, reason) {
  if (!env.COIN_KV) return;

  const balance = await getCoinBalance(env, userId);
  const newBalance = Math.max(0, balance - amount);
  await env.COIN_KV.put(`coin:${userId}:balance`, String(newBalance));

  // Append to history
  const history = await getCoinHistory(env, userId);
  history.push({
    type: 'deduct',
    amount,
    reason,
    balance: newBalance,
    at: Date.now(),
  });
  // Keep last 100 entries
  const trimmed = history.slice(-100);
  await env.COIN_KV.put(`coin:${userId}:history`, JSON.stringify(trimmed), {
    expirationTtl: 86400 * 90, // 90 days
  });
}

async function refundCoins(env, userId, amount, reason) {
  if (!env.COIN_KV) return;

  const balance = await getCoinBalance(env, userId);
  const newBalance = balance + amount;
  await env.COIN_KV.put(`coin:${userId}:balance`, String(newBalance));

  const history = await getCoinHistory(env, userId);
  history.push({
    type: 'refund',
    amount,
    reason,
    balance: newBalance,
    at: Date.now(),
  });
  const trimmed = history.slice(-100);
  await env.COIN_KV.put(`coin:${userId}:history`, JSON.stringify(trimmed), {
    expirationTtl: 86400 * 90,
  });
}

/** Estimate coin cost based on model and message length */
function estimateCoinCost(model, messages) {
  const charCount = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const tokenEstimate = Math.ceil(charCount / 3); // rough: ~3 chars per token

  // Cost tiers (coins per 1K tokens)
  const COST_MAP = {
    'gpt-4o':             2,
    'gpt-4o-mini':        0.5,
    'gpt-4-turbo':        3,
    'gpt-3.5-turbo':      0.3,
    'claude-sonnet-4-20250514':    2,
    'claude-3-5-haiku-20241022': 0.5,
    'claude-3-opus-20240229':  5,
    'gemini-1.5-pro':     1.5,
    'gemini-1.5-flash':   0.3,
  };

  const perK = COST_MAP[model] || 2; // default: 2 coins/1K tokens
  return Math.max(1, Math.ceil((tokenEstimate / 1000) * perK));
}

/** Get server-stored API key for a provider */
function getServerKey(env, provider) {
  switch (provider) {
    case 'openai':    return env.OPENAI_API_KEY;
    case 'anthropic': return env.ANTHROPIC_API_KEY;
    case 'google':    return env.GOOGLE_API_KEY;
    default:          return null;
  }
}


/* ══════════════════════════════════════════
   LLM Provider Proxies
   ══════════════════════════════════════════ */

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

  const data = await res.json();
  return data.choices[0].message.content;
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

  const data = await res.json();
  return data.content[0].text;
}

async function proxyGoogle(apiKey, model, system, messages) {
  const userText = messages.map(m => m.content).join('\n');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const reqBody = {
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
  };
  if (system) {
    reqBody.system_instruction = { parts: [{ text: system }] };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google AI ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}


/* ══════════════════════════════════════════
   Utility
   ══════════════════════════════════════════ */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
