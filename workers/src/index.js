/**
 * Akasha AI Proxy — Cloudflare Worker (Phase 16-D + auth hardening)
 *
 * Routes:
 *   POST /v1/auth/token     — Exchange Google ID token for session token
 *   POST /v1/chat           — LLM proxy (BYOK + Coin mode)
 *   POST /v1/sync           — Sync queue push/pull
 *   POST /v1/rag            — RAG retrieval (stub)
 *   POST /v1/coin/balance   — Coin balance query
 *   POST /v1/coin/deduct    — Coin deduction
 *   GET  /health            — Health check
 *
 * Secrets (set via `wrangler secret put`):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
 *   COIN_SECRET — HMAC key for session token signing/verification
 *
 * Environment Variables:
 *   GOOGLE_CLIENT_ID — expected audience for Google ID tokens
 *   ALLOWED_ORIGINS  — comma-separated allowed CORS origins (omit or '*' for dev)
 *
 * KV Bindings (set in wrangler.toml):
 *   COIN_KV   — per-user coin balances
 *   SYNC_KV   — sync queue items
 */

/* ══════════════════════════════════════════
   CORS (configurable via ALLOWED_ORIGINS)
   ══════════════════════════════════════════ */

function buildCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').trim();

  if (allowed === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    };
  }

  const list = allowed.split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    'Vary': 'Origin',
  };
}

/* ══════════════════════════════════════════
   Authentication (HMAC-SHA256 session tokens)

   Token format: base64url(userId).timestamp.signature
   Server issues tokens via /v1/auth/token after verifying a
   Google ID token. Requires COIN_SECRET to be set.
   Without COIN_SECRET, falls back to X-User-Id header (dev only).
   ══════════════════════════════════════════ */

const TOKEN_TTL = 86400; // 24 hours

function arrayToBase64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToArray(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function importHmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, usage,
  );
}

async function createSessionToken(secret, userId) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${userId}:${ts}`;
  const key = await importHmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const uidB64 = arrayToBase64url(new TextEncoder().encode(userId));
  return `${uidB64}.${ts}.${arrayToBase64url(sig)}`;
}

async function verifySessionToken(secret, token) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [uidB64, tsStr, sigB64] = parts;
  let userId;
  try { userId = new TextDecoder().decode(base64urlToArray(uidB64)); }
  catch { return null; }

  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return null;
  if (Math.floor(Date.now() / 1000) - ts > TOKEN_TTL) return null;

  const payload = `${userId}:${ts}`;
  const key = await importHmacKey(secret, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC', key, base64urlToArray(sigB64), new TextEncoder().encode(payload),
  );
  return valid ? userId : null;
}

async function requireAuth(request, env) {
  if (!env.COIN_SECRET) {
    const userId = request.headers.get('X-User-Id');
    if (!userId) return { error: 'X-User-Id header required (auth not configured)', status: 401 };
    return { userId, _devMode: true };
  }

  const hdr = request.headers.get('Authorization');
  if (!hdr || !hdr.startsWith('Bearer ')) {
    return { error: 'Authorization: Bearer <token> required', status: 401 };
  }

  const userId = await verifySessionToken(env.COIN_SECRET, hdr.slice(7));
  if (!userId) return { error: 'Invalid or expired token', status: 401 };
  return { userId };
}

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
    const cors = buildCors(request, env);
    const respond = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limit all POST endpoints
    if (request.method === 'POST' && !checkRateLimit(ip)) {
      return respond({ error: '請求過於頻繁，請稍後再試。' }, 429);
    }

    try {
      switch (url.pathname) {
        case '/v1/auth/token':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleAuthToken(request, env, respond);

        case '/v1/chat':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleChat(request, env, respond);

        case '/v1/sync':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleSync(request, env, respond);

        case '/v1/rag':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleRag(request, env, respond);

        case '/v1/coin/balance':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleCoinBalance(request, env, respond);

        case '/v1/coin/deduct':
          if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
          return handleCoinDeduct(request, env, respond);

        case '/health':
          return respond({
            status: 'ok',
            time: new Date().toISOString(),
            features: {
              chat: true,
              sync: !!env.SYNC_KV,
              rag: false,        // stub only
              coin: !!env.COIN_KV,
              auth: !!env.COIN_SECRET,
            },
          });

        default:
          return respond({ error: 'Not found' }, 404);
      }
    } catch (err) {
      return respond({ error: 'Internal error', message: err.message }, 500);
    }
  },
};


/* ══════════════════════════════════════════
   /v1/auth/token — Google ID → session token
   ══════════════════════════════════════════ */

async function handleAuthToken(request, env, respond) {
  if (!env.COIN_SECRET) {
    return respond({ error: 'Auth not configured (COIN_SECRET not set)' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON' }, 400); }

  const { idToken, accessToken } = body;
  let userId, email;

  if (idToken) {
    const gRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!gRes.ok) return respond({ error: 'Invalid Google ID token' }, 401);
    const info = await gRes.json();
    if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) {
      return respond({ error: 'Token audience mismatch' }, 401);
    }
    if (!info.sub) return respond({ error: 'Token missing subject' }, 401);
    userId = info.sub;
    email = info.email || null;
  } else if (accessToken) {
    const gRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!gRes.ok) return respond({ error: 'Invalid Google access token' }, 401);
    const info = await gRes.json();
    if (!info.id) return respond({ error: 'Token missing user ID' }, 401);
    userId = info.id;
    email = info.email || null;
  } else {
    return respond({ error: 'idToken or accessToken field required' }, 400);
  }

  const token = await createSessionToken(env.COIN_SECRET, userId);
  return respond({
    ok: true,
    token,
    userId,
    email,
    expiresIn: TOKEN_TTL,
  });
}


/* ══════════════════════════════════════════
   /v1/chat — LLM Proxy (BYOK + Coin)
   ══════════════════════════════════════════ */

async function handleChat(request, env, respond) {
  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { provider, model, system, messages, mode, apiKey } = body;

  if (!provider || !model || !messages || !Array.isArray(messages)) {
    return respond({ error: 'Missing required fields: provider, model, messages' }, 400);
  }

  let key;
  let userId;

  if (mode === 'byok') {
    // BYOK: pass through user's API key — no server auth needed
    if (!apiKey) {
      return respond({ error: 'BYOK mode requires apiKey field' }, 400);
    }
    key = apiKey;

  } else if (mode === 'coin') {
    // Coin mode: requires authentication
    const auth = await requireAuth(request, env);
    if (auth.error) return respond({ error: auth.error }, auth.status);
    userId = auth.userId;

    // Check coin balance
    const balance = await getCoinBalance(env, userId);
    const cost = estimateCoinCost(model, messages);
    if (balance < cost) {
      return respond({
        error: '月幣不足',
        balance,
        required: cost,
      }, 402);
    }

    // Select server key
    key = getServerKey(env, provider);
    if (!key) {
      return respond({ error: `Server key not configured for provider: ${provider}` }, 503);
    }

    // Deduct coins before calling to prevent race conditions
    await deductCoins(env, userId, cost, `chat:${provider}:${model}`);

  } else {
    return respond({ error: 'Invalid mode. Use "byok" or "coin".' }, 400);
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
        return respond({ error: `Unsupported provider: ${provider}` }, 400);
    }
    return respond({ content, provider, model });
  } catch (err) {
    // If coin mode failed, refund (best-effort)
    if (mode === 'coin' && userId) {
      const cost = estimateCoinCost(model, messages);
      await refundCoins(env, userId, cost, `refund:${err.message.slice(0, 50)}`);
    }
    return respond({ error: err.message }, 502);
  }
}


/* ══════════════════════════════════════════
   /v1/sync — Sync Queue (Phase 16-D)
   ══════════════════════════════════════════ */

async function handleSync(request, env, respond) {
  if (!env.SYNC_KV) {
    return respond({ error: 'Sync service not configured (SYNC_KV binding missing)' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const auth = await requireAuth(request, env);
  if (auth.error) return respond({ error: auth.error }, auth.status);
  const { userId } = auth;

  const { action } = body;

  switch (action) {
    case 'push': {
      // Push items to sync queue
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return respond({ error: 'items array required' }, 400);
      }
      if (items.length > 50) {
        return respond({ error: 'Maximum 50 items per push' }, 400);
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

      return respond({ ok: true, queued: stamped.length, total: merged.length });
    }

    case 'pull': {
      // Pull pending items
      const queueKey = `sync:${userId}`;
      const items = await env.SYNC_KV.get(queueKey, 'json') || [];
      return respond({ ok: true, items });
    }

    case 'ack': {
      // Acknowledge processed items (remove from queue)
      const { ids } = body;
      if (!Array.isArray(ids)) {
        return respond({ error: 'ids array required' }, 400);
      }

      const queueKey = `sync:${userId}`;
      const existing = await env.SYNC_KV.get(queueKey, 'json') || [];
      const remaining = existing.filter(item => !ids.includes(item._id));

      await env.SYNC_KV.put(queueKey, JSON.stringify(remaining), {
        expirationTtl: 86400 * 30,
      });

      return respond({ ok: true, removed: existing.length - remaining.length, remaining: remaining.length });
    }

    default:
      return respond({ error: 'Unknown sync action. Use: push, pull, ack' }, 400);
  }
}


/* ══════════════════════════════════════════
   /v1/rag — RAG Retrieval (Stub)
   ══════════════════════════════════════════ */

async function handleRag(request, env, respond) {
  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { query, collection, topK } = body;

  if (!query) {
    return respond({ error: 'query field required' }, 400);
  }

  // Stub — returns empty results with metadata
  return respond({
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

async function handleCoinBalance(request, env, respond) {
  if (!env.COIN_KV) {
    return respond({ error: 'Coin service not configured (COIN_KV binding missing)' }, 503);
  }

  const auth = await requireAuth(request, env);
  if (auth.error) return respond({ error: auth.error }, auth.status);
  const { userId } = auth;

  const balance = await getCoinBalance(env, userId);
  const history = await getCoinHistory(env, userId);

  return respond({ ok: true, userId, balance, recentHistory: history.slice(-20) });
}

async function handleCoinDeduct(request, env, respond) {
  if (!env.COIN_KV) {
    return respond({ error: 'Coin service not configured (COIN_KV binding missing)' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const auth = await requireAuth(request, env);
  if (auth.error) return respond({ error: auth.error }, auth.status);
  const { userId } = auth;

  const { amount, reason } = body;
  if (typeof amount !== 'number' || amount <= 0) {
    return respond({ error: 'amount must be a positive number' }, 400);
  }

  const balance = await getCoinBalance(env, userId);
  if (balance < amount) {
    return respond({ error: '月幣不足', balance, required: amount }, 402);
  }

  await deductCoins(env, userId, amount, reason || 'manual');
  const newBalance = await getCoinBalance(env, userId);

  return respond({ ok: true, deducted: amount, balance: newBalance });
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
