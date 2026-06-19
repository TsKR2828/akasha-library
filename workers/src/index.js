/**
 * Akasha AI Proxy — Cloudflare Worker (Phase 16-D + auth hardening)
 *
 * Routes:
 *   POST /v1/auth/token     — Exchange Google ID token for session token
 *   POST /v1/chat           — LLM proxy (BYOK + Coin mode)
 *   POST /v1/sync           — Sync queue push/pull
 *   POST /v1/rag            — RAG embed proxy + BM25 query
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
  const allowed = (env.ALLOWED_ORIGINS || '').trim();

  if (!allowed) {
    return {
      'Access-Control-Allow-Origin': '',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  if (allowed === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  const list = allowed.split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    return { error: 'Server not configured: COIN_SECRET is required', status: 503 };
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
              rag: true,         // embed + query
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

    // Select server key
    key = getServerKey(env, provider);
    if (!key) {
      return respond({ error: `Server key not configured for provider: ${provider}` }, 503);
    }

    // Check + deduct in one tight sequence to minimize race window
    const cost = estimateCoinCost(model, system, messages);
    const deduction = await checkAndDeductCoins(env, userId, cost, `chat:${provider}:${model}`);
    if (!deduction.ok) {
      return respond({
        error: deduction.error,
        balance: deduction.balance,
        required: deduction.required,
      }, 402);
    }

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
    if (mode === 'coin' && userId) {
      const refundAmount = estimateCoinCost(model, system, messages);
      await refundCoins(env, userId, refundAmount, `refund:${err.message.slice(0, 50)}`);
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
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return respond({ error: 'items array required' }, 400);
      }
      if (items.length > 50) {
        return respond({ error: 'Maximum 50 items per push' }, 400);
      }

      const stamped = [];
      for (const item of items) {
        const id = crypto.randomUUID();
        const entry = { ...item, _pushedAt: Date.now(), _id: id };
        await env.SYNC_KV.put(`sync:${userId}:item:${id}`, JSON.stringify(entry), {
          expirationTtl: 86400 * 30,
        });
        stamped.push(entry);
      }

      return respond({ ok: true, queued: stamped.length });
    }

    case 'pull': {
      const prefix = `sync:${userId}:item:`;
      const list = await env.SYNC_KV.list({ prefix, limit: 200 });
      const items = [];
      for (const key of list.keys) {
        const val = await env.SYNC_KV.get(key.name, 'json');
        if (val) items.push(val);
      }
      items.sort((a, b) => a._pushedAt - b._pushedAt);
      return respond({ ok: true, items });
    }

    case 'ack': {
      const { ids } = body;
      if (!Array.isArray(ids)) {
        return respond({ error: 'ids array required' }, 400);
      }

      let removed = 0;
      for (const id of ids) {
        const key = `sync:${userId}:item:${id}`;
        const exists = await env.SYNC_KV.get(key);
        if (exists !== null) {
          await env.SYNC_KV.delete(key);
          removed++;
        }
      }

      return respond({ ok: true, removed });
    }

    default:
      return respond({ error: 'Unknown sync action. Use: push, pull, ack' }, 400);
  }
}


/* ══════════════════════════════════════════
   /v1/rag — RAG Retrieval & Embedding Proxy
   ══════════════════════════════════════════

   Actions:
     embed — generate embeddings via provider API (BYOK or Coin)
     query — stateless BM25 search over client-supplied chunks
   ══════════════════════════════════════════ */

async function handleRag(request, env, respond) {
  let body;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { action } = body;

  switch (action) {
    case 'embed':
      return handleRagEmbed(body, request, env, respond);
    case 'query':
      return handleRagQuery(body, respond);
    default:
      return respond({ error: 'Unknown action. Use: embed, query' }, 400);
  }
}

// ── embed: proxy OpenAI / Google embedding API ──

function estimateEmbedCost(texts) {
  const charCount = texts.reduce((s, t) => s + (t?.length || 0), 0);
  const tokenEstimate = Math.ceil(charCount / 3);
  // Embedding is much cheaper than LLM: 0.2 coins per 1K tokens, min 1
  return Math.max(1, Math.ceil((tokenEstimate / 1000) * 0.2));
}

async function callEmbedOpenAI(texts, apiKey, model) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI Embedding ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const json = await res.json();
  return json.data.map(d => d.embedding);
}

async function callEmbedGoogle(texts, apiKey, model) {
  const requests = texts.map(t => ({ model: `models/${model}`, content: { parts: [{ text: t }] } }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Embedding ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const json = await res.json();
  return json.embeddings.map(e => e.values);
}

async function handleRagEmbed(body, request, env, respond) {
  const { texts, provider, model, mode, apiKey } = body;

  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return respond({ error: 'texts array required' }, 400);
  }
  if (texts.length > 200) {
    return respond({ error: 'Maximum 200 texts per request' }, 400);
  }
  if (!provider || (provider !== 'openai' && provider !== 'google')) {
    return respond({ error: 'provider required: openai or google' }, 400);
  }

  let key;
  let userId = null;
  const cost = estimateEmbedCost(texts);

  if (mode === 'byok') {
    if (!apiKey) return respond({ error: 'BYOK mode requires apiKey' }, 400);
    key = apiKey;
  } else if (mode === 'coin') {
    const auth = await requireAuth(request, env);
    if (auth.error) return respond({ error: auth.error }, auth.status);
    userId = auth.userId;

    key = getServerKey(env, provider);
    if (!key) return respond({ error: `Server key not configured for: ${provider}` }, 503);

    const deduction = await checkAndDeductCoins(env, userId, cost, `embed:${provider}:${texts.length}texts`);
    if (!deduction.ok) {
      return respond({ error: deduction.error, balance: deduction.balance, required: deduction.required }, 402);
    }
  } else {
    return respond({ error: 'Invalid mode. Use "byok" or "coin".' }, 400);
  }

  try {
    const embModel = model || (provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-small');
    let embeddings;

    // Batch in groups of 50 to stay within provider limits
    const BATCH = 50;
    embeddings = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const result = provider === 'openai'
        ? await callEmbedOpenAI(batch, key, embModel)
        : await callEmbedGoogle(batch, key, embModel);
      embeddings.push(...result);
    }

    return respond({ ok: true, embeddings, model: embModel, count: embeddings.length });
  } catch (err) {
    // Refund on failure
    if (mode === 'coin' && userId) {
      await refundCoins(env, userId, cost, `refund:embed:${err.message.slice(0, 50)}`);
    }
    return respond({ error: err.message }, 502);
  }
}

// ── query: stateless BM25 search over client-supplied chunks ──

function ragTokenize(text) {
  if (!text) return [];
  const tokens = [];
  const re = /[一-鿿㐀-䶿豈-﫿]|[a-zA-Z0-9À-ɏ]+/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}

function ragBm25(chunks, query, topK) {
  const N = chunks.length;
  const queryTokens = ragTokenize(query);
  if (queryTokens.length === 0) return [];

  // Precompute per-doc tokens and avg doc length
  const docsTokens = chunks.map(c => ragTokenize(c.text || c));
  const avgDL = docsTokens.reduce((s, t) => s + t.length, 0) / (N || 1);

  // Document frequency
  const df = {};
  for (const dt of docsTokens) {
    const seen = new Set(dt);
    for (const t of seen) df[t] = (df[t] || 0) + 1;
  }

  const k1 = 1.5, b = 0.75;
  const scored = docsTokens.map((dt, i) => {
    const dl = dt.length;
    const tf = {};
    for (const t of dt) tf[t] = (tf[t] || 0) + 1;

    let score = 0;
    for (const qt of queryTokens) {
      const n = df[qt] || 0;
      if (n === 0) continue;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const termFreq = tf[qt] || 0;
      score += idf * (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * dl / avgDL));
    }

    return { index: i, text: typeof chunks[i] === 'string' ? chunks[i] : chunks[i].text, pageNum: chunks[i].pageNum, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK).filter(r => r.score > 0);
}

async function handleRagQuery(body, respond) {
  const { query, chunks, topK = 5 } = body;

  if (!query) return respond({ error: 'query required' }, 400);
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return respond({ error: 'chunks array required (each: string or {text, pageNum?})' }, 400);
  }
  if (chunks.length > 5000) {
    return respond({ error: 'Maximum 5000 chunks per query' }, 400);
  }

  const results = ragBm25(chunks, query, topK);

  return respond({ ok: true, query, results, count: results.length, method: 'bm25' });
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

  const deduction = await checkAndDeductCoins(env, userId, amount, reason || 'manual');
  if (!deduction.ok) {
    return respond({ error: deduction.error, balance: deduction.balance, required: deduction.required }, 402);
  }

  return respond({ ok: true, deducted: amount, balance: deduction.balance });
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

async function checkAndDeductCoins(env, userId, amount, reason) {
  if (!env.COIN_KV) return { ok: false, error: 'COIN_KV not configured' };

  const balance = await getCoinBalance(env, userId);
  if (balance < amount) {
    return { ok: false, error: '月幣不足', balance, required: amount };
  }

  const newBalance = Math.max(0, balance - amount);
  await env.COIN_KV.put(`coin:${userId}:balance`, String(newBalance));

  const history = await getCoinHistory(env, userId);
  history.push({
    type: 'deduct',
    amount,
    reason,
    balance: newBalance,
    at: Date.now(),
  });
  const trimmed = history.slice(-100);
  await env.COIN_KV.put(`coin:${userId}:history`, JSON.stringify(trimmed), {
    expirationTtl: 86400 * 90, // 90 days
  });

  return { ok: true, balance: newBalance };
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

/** Estimate coin cost based on model, system prompt, and messages */
function estimateCoinCost(model, system, messages) {
  const msgChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const sysChars = (typeof system === 'string') ? system.length : 0;
  const charCount = msgChars + sysChars;
  const tokenEstimate = Math.ceil(charCount / 3);

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
