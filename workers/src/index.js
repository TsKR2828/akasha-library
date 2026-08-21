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
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    };
  }

  if (allowed === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    };
  }

  const list = allowed.split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
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
   Idempotency nonce

   Prefers the client-supplied X-Idempotency-Key header. Falls back to a
   stable hash of the request's own content — deliberately NOT including any
   timestamp, so that retrying the exact same request produces the exact
   same nonce and checkAndDeductCoins' nonce cache actually catches the
   duplicate instead of charging twice.

   The content hash is always computed and returned alongside the nonce
   (even when a header key is present), because the header is fully
   client-controlled: without also checking the content hash on a cache
   hit, a user could send the same X-Idempotency-Key on every request and
   ride the nonce cache to get unlimited free chat completions after the
   first paid one. checkAndDeductCoins uses the content hash to tell "true
   retry of the same request" apart from "same header key, different
   request" — see the comment there.
   ══════════════════════════════════════════ */

async function computeIdempotencyNonce(request, parts) {
  const material = parts.join(String.fromCharCode(31));
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const contentHash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const headerKey = request.headers.get('X-Idempotency-Key');
  return { nonce: headerKey || contentHash, contentHash };
}

/* ══════════════════════════════════════════
   Rate Limiting (in-memory, resets on restart)
   ══════════════════════════════════════════ */

const rateLimits = new Map();
const RATE_LIMIT = 12;      // requests per minute
const RATE_WINDOW = 60_000;
const RATE_LIMIT_MAX_ENTRIES = 5000; // hard cap so a flood of distinct IPs can't grow this without bound

// NOTE: this Map lives in isolate memory only and resets whenever the
// isolate does. Cloudflare Workers routinely run several isolates at once
// (different edge colos, or the same colo under load) — this is a
// best-effort per-isolate limiter, not a true global rate limit across all
// of a user's requests. A real global limit needs Durable Objects or KV.
function checkRateLimit(ip) {
  const now = Date.now();

  if (rateLimits.size > RATE_LIMIT_MAX_ENTRIES) {
    // Sweep expired entries first — most of the time this alone gets us
    // back under the cap.
    for (const [key, entry] of rateLimits) {
      if (now > entry.resetAt) rateLimits.delete(key);
    }
    // Still over the cap (all still-active windows) — drop the oldest
    // entries to make room rather than growing forever.
    if (rateLimits.size > RATE_LIMIT_MAX_ENTRIES) {
      const excess = rateLimits.size - RATE_LIMIT_MAX_ENTRIES;
      let i = 0;
      for (const key of rateLimits.keys()) {
        if (i++ >= excess) break;
        rateLimits.delete(key);
      }
    }
  }

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

  // Fail-closed: GOOGLE_CLIENT_ID must be configured to verify token audience.
  // Without it, any valid Google token would be accepted regardless of origin.
  if (!env.GOOGLE_CLIENT_ID) {
    return respond({ error: 'Server misconfigured: GOOGLE_CLIENT_ID required' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid JSON' }, 400); }

  const { idToken, token } = body;
  let userId, email;

  if (idToken) {
    const gRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!gRes.ok) return respond({ error: 'Invalid Google ID token' }, 401);
    const info = await gRes.json();
    if (info.aud !== env.GOOGLE_CLIENT_ID) {
      return respond({ error: 'Token audience mismatch' }, 401);
    }
    if (!info.sub) return respond({ error: 'Token missing subject' }, 401);
    userId = info.sub;
    email = info.email || null;
  } else if (token) {
    // Validate access token via Google tokeninfo endpoint
    const gRes = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token)
    );
    if (!gRes.ok) return respond({ error: 'Invalid token' }, 401);
    const info = await gRes.json();
    // Verify audience matches our client ID (prevents token substitution)
    if (info.aud !== env.GOOGLE_CLIENT_ID) {
      return respond({ error: 'Token audience mismatch' }, 401);
    }
    if (!info.sub) return respond({ error: 'Token missing subject' }, 401);
    userId = info.sub;
    email = info.email || null;
  } else {
    return respond({ error: 'Token required' }, 400);
  }

  const sessionToken = await createSessionToken(env.COIN_SECRET, userId);
  return respond({
    ok: true,
    token: sessionToken,
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
  let chargedAmount = null; // actual amount deducted — refund uses this, not a re-estimate
  let deductionNonce = null;

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

    // Check + deduct with nonce-based idempotency guard
    const cost = estimateCoinCost(model, system, messages);
    const deductionIdem = await computeIdempotencyNonce(request, [userId, model, JSON.stringify(messages)]);
    deductionNonce = deductionIdem.nonce;
    const deduction = await checkAndDeductCoins(env, userId, cost, `chat:${provider}:${model}`, deductionNonce, deductionIdem.contentHash);
    if (!deduction.ok) {
      return respond({
        error: deduction.error,
        balance: deduction.balance,
        required: deduction.required,
      }, 402);
    }
    chargedAmount = cost;

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
    const result = { content, provider, model };
    if (mode === 'coin' && userId) {
      result.balance = await getCoinBalance(env, userId);
    }
    return respond(result);
  } catch (err) {
    if (mode === 'coin' && userId && chargedAmount != null) {
      await refundCoins(env, userId, 'refund:' + deductionNonce, chargedAmount, `refund:${err.message.slice(0, 50)}`);
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
  let embedNonce = null;

  if (mode === 'byok') {
    if (!apiKey) return respond({ error: 'BYOK mode requires apiKey' }, 400);
    key = apiKey;
  } else if (mode === 'coin') {
    const auth = await requireAuth(request, env);
    if (auth.error) return respond({ error: auth.error }, auth.status);
    userId = auth.userId;

    key = getServerKey(env, provider);
    if (!key) return respond({ error: `Server key not configured for: ${provider}` }, 503);

    const embedIdem = await computeIdempotencyNonce(request, [userId, 'embed', provider, model || '', JSON.stringify(texts)]);
    embedNonce = embedIdem.nonce;
    const deduction = await checkAndDeductCoins(env, userId, cost, `embed:${provider}:${texts.length}texts`, embedNonce, embedIdem.contentHash);
    if (!deduction.ok) {
      return respond({ error: deduction.error, balance: deduction.balance, required: deduction.required }, 402);
    }
  } else {
    return respond({ error: 'Invalid mode. Use "byok" or "coin".' }, 400);
  }

  try {
    const embModel = model || (provider === 'google' ? 'text-embedding-005' : 'text-embedding-3-small');
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

    const embedResult = { ok: true, embeddings, model: embModel, count: embeddings.length };
    if (mode === 'coin' && userId) {
      embedResult.balance = await getCoinBalance(env, userId);
    }
    return respond(embedResult);
  } catch (err) {
    // Refund on failure
    if (mode === 'coin' && userId) {
      await refundCoins(env, userId, 'refund:' + embedNonce, cost, `refund:embed:${err.message.slice(0, 50)}`);
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
  if (typeof query !== 'string' || query.length > 2000) {
    return respond({ error: 'query must be a string under 2000 characters' }, 400);
  }
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return respond({ error: 'chunks array required' }, 400);
  }
  if (chunks.length > 5000) {
    return respond({ error: 'Maximum 5000 chunks per query' }, 400);
  }

  // Limit total input size (10MB max) and per-chunk size (50KB max)
  const MAX_TOTAL = 10 * 1024 * 1024;
  const MAX_CHUNK = 50 * 1024;
  let totalBytes = 0;
  for (const c of chunks) {
    const text = typeof c === 'string' ? c : (c && c.text) || '';
    const len = new TextEncoder().encode(text).length;
    if (len > MAX_CHUNK) {
      return respond({ error: 'Individual chunk exceeds 50KB limit' }, 400);
    }
    totalBytes += len;
    if (totalBytes > MAX_TOTAL) {
      return respond({ error: 'Total input exceeds 10MB limit' }, 413);
    }
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

  const deductIdem = await computeIdempotencyNonce(request, [userId, 'deduct', String(amount), reason || 'manual']);
  const deduction = await checkAndDeductCoins(env, userId, amount, reason || 'manual', deductIdem.nonce, deductIdem.contentHash);
  if (!deduction.ok) {
    return respond({ error: deduction.error, balance: deduction.balance, required: deduction.required }, 402);
  }

  return respond({ ok: true, deducted: amount, balance: deduction.balance });
}


/* ══════════════════════════════════════════
   Coin Helpers
   ══════════════════════════════════════════ */

const DEFAULT_BALANCE = 100; // New users start with 100 coins
// Also the amount granted at each calendar month's lazy reset (see
// getCoinBalanceRecord / checkAndDeductCoins / getCoinBalance below). Keep
// this in sync with FREE_MONTHLY in core/billing.js — same real-world free
// monthly allowance, defined separately on server and client. Changing one
// without the other makes the two sides' numbers lie.
const FREE_MONTHLY = DEFAULT_BALANCE;

// Workers run in UTC. core/billing.js's currentMonth() uses the browser's
// local time zone instead, so the exact reset moment can differ by up to
// ~24h between client and server near a month boundary — that's a known,
// unfixed skew, not a balance bug.
function currentWorkerMonth() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/**
 * Read the versioned balance record for a user.
 * Backward compat: if the stored value is a plain number string (pre-versioning),
 * treat it as { balance: n, version: 0 }. Records written before the monthly
 * reset feature existed won't have a `month` field — callers treat a missing
 * month the same as a stale one, which only ever raises the balance, never
 * lowers it, so this is safe for old records.
 */
async function getCoinBalanceRecord(env, userId) {
  if (!env.COIN_KV) return { balance: 0, version: 0 };
  const raw = await env.COIN_KV.get(`coin:${userId}:balance`);
  if (raw === null) return { balance: DEFAULT_BALANCE, version: 0, month: currentWorkerMonth() };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'balance' in parsed && 'version' in parsed) {
      return parsed;
    }
  } catch { /* not JSON — fall through to legacy parse */ }
  // Legacy plain number format
  const num = parseFloat(raw);
  return { balance: isNaN(num) ? DEFAULT_BALANCE : num, version: 0, month: currentWorkerMonth() };
}

/**
 * Read the balance for display (/v1/coin/balance, post-request balance
 * fields). Applies the same lazy monthly reset as checkAndDeductCoins so a
 * user who only ever checks their balance (never spends) still sees it
 * refill — and persists the bump so it isn't recomputed on every read.
 */
async function getCoinBalance(env, userId) {
  const record = await getCoinBalanceRecord(env, userId);
  const nowMonth = currentWorkerMonth();
  if (record.month !== nowMonth && env.COIN_KV) {
    const balance = Math.max(record.balance, FREE_MONTHLY);
    await env.COIN_KV.put(`coin:${userId}:balance`, JSON.stringify({
      balance, version: record.version + 1, month: nowMonth,
    }));
    return balance;
  }
  return record.balance;
}

async function getCoinHistory(env, userId) {
  if (!env.COIN_KV) return [];
  const val = await env.COIN_KV.get(`coin:${userId}:history`, 'json');
  return val || [];
}

// NOTE: KV is eventually consistent, not transactional — there is a real
// double-write window between step 1 (read) and step 2 (write) below where
// two concurrent requests can both read the same starting balance and both
// "win". The version field lets step 3 detect that after the fact, but
// detecting it after the write has already landed is the best this CAS
// (compare-and-swap) loop can do with plain KV. The real fix is Cloudflare
// Durable Objects (not implemented here) — this is a mitigation, not a fix.
const DEDUCT_MAX_RETRIES = 2;

async function checkAndDeductCoins(env, userId, amount, reason, requestNonce, contentHash) {
  if (!env.COIN_KV) return { ok: false, error: 'COIN_KV not configured' };

  // Idempotency guard: if this request was already processed, return cached
  // result. The cache key is namespaced by userId — requestNonce may come
  // straight from the client-controlled X-Idempotency-Key header, so
  // without the userId prefix two different users sending the same header
  // value would read/overwrite each other's cached deduction result (one
  // user's coins get skipped, or one user's balance leaks to another).
  // The cached entry also carries the content hash of the request that
  // created it; a hit is only honored when contentHash matches, so reusing
  // the same header key for genuinely different requests (different
  // model/messages) does NOT skip payment — it's treated as a new charge.
  // This is what makes the header-first nonce in computeIdempotencyNonce
  // safe: real retries (same key + same content) are free, but a client
  // that just resends one fixed key forever pays every time.
  const nonceKey = requestNonce ? `nonce:${userId}:${requestNonce}` : null;
  if (nonceKey) {
    const cached = await env.COIN_KV.get(nonceKey, 'json');
    if (cached && (contentHash == null || cached.contentHash === contentHash)) {
      return cached.result;
    }
  }

  const balanceKey = `coin:${userId}:balance`;

  for (let attempt = 0; attempt <= DEDUCT_MAX_RETRIES; attempt++) {
    // 1. Read current balance + version
    const record = await getCoinBalanceRecord(env, userId);
    let { balance, version, month } = record;

    // Lazy monthly reset, folded into this same read-modify-write so it
    // doesn't cost an extra KV round trip: if the stored month is stale,
    // bump the balance up to the free allowance (never down) before
    // checking/deducting.
    const nowMonth = currentWorkerMonth();
    if (month !== nowMonth) {
      balance = Math.max(balance, FREE_MONTHLY);
      month = nowMonth;
    }

    if (balance < amount) {
      return { ok: false, error: '月幣不足', balance, required: amount };
    }

    const newBalance = Math.max(0, balance - amount);
    const newVersion = version + 1;

    // 2. Write new balance with incremented version
    await env.COIN_KV.put(balanceKey, JSON.stringify({ balance: newBalance, version: newVersion, month }));

    // 3. Re-read to verify no concurrent write changed the version
    const verification = await getCoinBalanceRecord(env, userId);
    if (verification.version !== newVersion) {
      // Concurrent write detected — retry
      if (attempt < DEDUCT_MAX_RETRIES) continue;

      // Retries exhausted. The write in step 2 already landed in KV, but
      // we're about to tell the caller the deduction failed — without a
      // rollback that's "already charged, but told it was an error" (money
      // taken, response says otherwise). Best-effort rollback: write the
      // pre-deduction balance back. This can itself race with a concurrent
      // writer (KV still isn't atomic) — it reduces the window, it doesn't
      // close it. Real fix is Durable Objects (not implemented).
      try {
        await env.COIN_KV.put(balanceKey, JSON.stringify({ balance, version: newVersion + 1, month }));
      } catch { /* best-effort only */ }
      return { ok: false, error: '扣款處理中，請稍後重試' };
    }

    // 4. Success — record result
    const result = { ok: true, balance: newBalance };

    // Cache the result by (userId, nonce) so retries/duplicates get the
    // same answer, along with the content hash needed to detect header-key
    // reuse across genuinely different requests (see the guard above).
    if (nonceKey) {
      await env.COIN_KV.put(nonceKey, JSON.stringify({ result, contentHash }), {
        expirationTtl: 300, // 5 minute TTL
      });
    }

    const history = await getCoinHistory(env, userId);
    history.push({ type: 'deduct', amount, reason, balance: newBalance, at: Date.now() });
    const trimmed = history.slice(-100);
    await env.COIN_KV.put('coin:' + userId + ':history', JSON.stringify(trimmed), {
      expirationTtl: 86400 * 90,
    });

    return result;
  }

  return { ok: false, error: '扣款處理中，請稍後重試' };
}

/**
 * Refund `amount` coins to `userId`. `nonce` should be derived from the
 * original charge's own idempotency nonce (callers pass 'refund:' + that
 * nonce) so that a retried failure — e.g. the client times out and retries
 * a request whose provider call already failed once — refunds once, not
 * once per retry.
 *
 * The cache key is namespaced by userId for the same reason as in
 * checkAndDeductCoins: the underlying nonce can trace back to a
 * client-controlled X-Idempotency-Key header, so without the userId
 * prefix two different users could collide on the same key and one
 * user's refund result would leak to, or be skipped for, another.
 */
async function refundCoins(env, userId, nonce, amount, reason) {
  if (!env.COIN_KV) return;

  const nonceKey = nonce ? `nonce:${userId}:${nonce}` : null;
  if (nonceKey) {
    const existing = await env.COIN_KV.get(nonceKey, 'json');
    if (existing) return existing;
  }

  const record = await getCoinBalanceRecord(env, userId);
  const newBalance = record.balance + amount;
  const newVersion = record.version + 1;
  const month = record.month || currentWorkerMonth();
  await env.COIN_KV.put(`coin:${userId}:balance`, JSON.stringify({ balance: newBalance, version: newVersion, month }));

  const result = { ok: true, balance: newBalance };
  if (nonceKey) {
    await env.COIN_KV.put(nonceKey, JSON.stringify(result), { expirationTtl: 300 });
  }

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

  return result;
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

  // Unknown model: keep the conservative default rather than guessing a
  // price, but log it so a real cost tier can be added deliberately later
  // instead of the model silently being under/over-charged forever.
  let perK = COST_MAP[model];
  if (perK === undefined) {
    console.log(`estimateCoinCost: unknown model "${model}" — using conservative default (2 coins/1K tokens)`);
    perK = 2;
  }
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
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const reqBody = {
    contents,
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
