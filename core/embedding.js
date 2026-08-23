/**
 * Akasha Library — Embedding & Retrieval Module
 *
 * Two-tier retrieval for RAG:
 *   Tier 1: BM25 keyword scoring (always available, no API needed)
 *   Tier 2: Dense vector embedding via API (BYOK direct or Coin via Worker proxy)
 *
 * Flow: indexPDF() on open → queryRelevant() on user question
 */

import { extractPageText, getProxyUrl, getSessionToken } from './ai.js';
import { saveEmbeddings, getEmbeddings } from './storage.js';

// ===== Text Chunking =====

/**
 * Split text into overlapping chunks for indexing.
 */
export function chunkText(text, chunkSize = 300, overlap = 60) {
  if (!text || text.length <= chunkSize) return [text].filter(Boolean);

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

// ===== BM25 Scoring (Tier 1) =====

/**
 * Tokenize text for BM25. Handles CJK + Latin.
 * CJK: each character is a token. Latin: split by whitespace/punctuation.
 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // Match CJK chars individually, or runs of Latin word chars
  const re = /[一-鿿㐀-䶿豈-﫿]|[a-zA-Z0-9À-ɏ]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[0].toLowerCase());
  }
  return tokens;
}

/**
 * Build BM25 index from chunks.
 */
function buildBM25Index(chunks) {
  const N = chunks.length;
  const avgDL = chunks.reduce((s, c) => s + tokenize(c.text).length, 0) / (N || 1);

  // Document frequency for each term
  const df = {};
  const docTokens = chunks.map(c => {
    const tokens = tokenize(c.text);
    const unique = new Set(tokens);
    for (const t of unique) {
      df[t] = (df[t] || 0) + 1;
    }
    return tokens;
  });

  return { N, avgDL, df, docTokens, chunks };
}

/**
 * BM25 scoring: rank chunks by relevance to query.
 */
function bm25Query(index, queryText, topK = 5) {
  const { N, avgDL, df, docTokens, chunks } = index;
  const queryTokens = tokenize(queryText);
  const k1 = 1.5, b = 0.75;

  const scores = chunks.map((chunk, i) => {
    const dl = docTokens[i].length;
    const tf = {};
    for (const t of docTokens[i]) {
      tf[t] = (tf[t] || 0) + 1;
    }

    let score = 0;
    for (const qt of queryTokens) {
      if (!tf[qt]) continue;
      const idf = Math.log((N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5) + 1);
      const tfNorm = (tf[qt] * (k1 + 1)) / (tf[qt] + k1 * (1 - b + b * dl / avgDL));
      score += idf * tfNorm;
    }

    return { ...chunk, score };
  });

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ===== Dense Embedding (Tier 2) =====

/**
 * Call OpenAI embedding API (batch).
 */
async function embedOpenAI(texts, apiKey, model = 'text-embedding-3-small') {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Embedding API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.data.map(d => new Float32Array(d.embedding));
}

/**
 * Call Google embedding API.
 */
async function embedGoogle(texts, apiKey, model = 'text-embedding-005') {
  // Google's batch embedding endpoint
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map(text => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Embedding ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json.embeddings.map(e => new Float32Array(e.values));
}

/**
 * Call Worker /v1/rag embed proxy (for coin-mode users without BYOK key).
 */
async function embedViaProxy(texts, settings) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return null;

  // Determine provider: coin-mode may use anthropic for chat but needs openai/google for embeddings
  const embProvider = (settings.provider === 'openai' || settings.provider === 'google')
    ? settings.provider : 'openai'; // default to openai for embedding

  const headers = { 'Content-Type': 'application/json' };
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const allEmbeddings = [];
  const BATCH = 100;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch(`${proxyUrl}/v1/rag`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'embed',
        texts: batch,
        provider: embProvider,
        mode: 'coin',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Embed proxy ${res.status}: ${err.error || res.statusText}`);
    }

    const json = await res.json();
    // Convert arrays back to Float32Array for local cosine similarity
    allEmbeddings.push(...json.embeddings.map(e => new Float32Array(e)));
  }

  return allEmbeddings;
}

/**
 * Generate embeddings via the user's configured provider.
 * Falls back to Worker proxy for coin-mode users.
 * Returns null if provider doesn't support embeddings and proxy is unavailable.
 */
async function generateEmbeddings(texts, settings) {
  // BYOK: direct API call
  if (settings.apiKey) {
    const batchSize = 100;
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      let embeddings;

      switch (settings.provider) {
        case 'openai':
          embeddings = await embedOpenAI(batch, settings.apiKey);
          break;
        case 'google':
          embeddings = await embedGoogle(batch, settings.apiKey);
          break;
        default:
          // Anthropic and custom don't have standard embedding APIs via BYOK
          return null;
      }
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  // Coin mode: proxy through Worker
  if (settings.mode === 'coin') {
    return embedViaProxy(texts, settings);
  }

  return null;
}

// ===== 降級可見化 =====

/**
 * dense embedding 失敗、靜默降級為 BM25 時，透過事件通知外層 UI（例如顯示提示 badge）。
 * 降級行為本身不變——RAG 仍會用 BM25 繼續運作，這裡只是讓呼叫端有機會讓使用者知道。
 */
function emitDegraded(reason) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('akasha-rag-degraded', { detail: { reason } }));
  } catch { /* CustomEvent 不可用時安靜略過，不影響降級主流程 */ }
}

// ===== Cosine Similarity =====

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ===== Main API =====

/**
 * Index a PDF: extract text, chunk, optionally embed.
 * Runs in background — returns a promise.
 *
 * @param {Object} pdfDoc - pdf.js document
 * @param {string} fileId - unique file identifier for IndexedDB
 * @param {Object} settings - from getAISettings()
 * @param {Function} onProgress - (pagesIndexed, totalPages) callback
 * @returns {{ chunkCount, hasEmbeddings }}
 */
export async function indexPDF(pdfDoc, fileId, settings, onProgress) {
  const totalPages = pdfDoc.numPages;
  const allChunks = [];

  // 1. Extract & chunk all pages
  for (let p = 1; p <= totalPages; p++) {
    const text = await extractPageText(pdfDoc, p);
    if (!text.trim()) {
      if (onProgress) onProgress(p, totalPages);
      continue;
    }

    const chunks = chunkText(text);
    for (let ci = 0; ci < chunks.length; ci++) {
      allChunks.push({
        pageNum: p,
        chunkIdx: ci,
        text: chunks[ci],
        embedding: null,
      });
    }
    if (onProgress) onProgress(p, totalPages);
  }

  if (allChunks.length === 0) return { chunkCount: 0, hasEmbeddings: false };

  // 2. Generate dense embeddings (BYOK direct or coin-mode via proxy)
  let hasEmbeddings = false;
  const canEmbed = settings?.apiKey
    ? (settings.provider === 'openai' || settings.provider === 'google')
    : settings?.mode === 'coin';
  if (canEmbed) {
    try {
      const texts = allChunks.map(c => c.text);
      const embeddings = await generateEmbeddings(texts, settings);
      if (embeddings && embeddings.length === allChunks.length) {
        for (let i = 0; i < allChunks.length; i++) {
          // Store as regular array for IndexedDB serialization
          allChunks[i].embedding = Array.from(embeddings[i]);
        }
        hasEmbeddings = true;
      }
    } catch (err) {
      console.warn('Embedding generation failed, using BM25 only:', err.message);
      emitDegraded(err.message);
    }
  }

  // 3. Store in IndexedDB
  await saveEmbeddings(fileId, allChunks);

  return { chunkCount: allChunks.length, hasEmbeddings };
}

/**
 * Query the index: find most relevant chunks for a question.
 * Uses dense embedding similarity when available, BM25 as fallback.
 *
 * @param {string} fileId - file to search
 * @param {string} query - user's question
 * @param {Object} settings - from getAISettings()
 * @param {number} topK - number of results
 * @returns {Array<{pageNum, text, score}>}
 */
export async function queryRelevant(fileId, query, settings, topK = 5) {
  const chunks = await getEmbeddings(fileId);
  if (!chunks || chunks.length === 0) return [];

  // Check if we have dense embeddings
  const hasDense = chunks[0]?.embedding && chunks[0].embedding.length > 0;

  const canQueryDense = settings?.apiKey
    ? (settings.provider === 'openai' || settings.provider === 'google')
    : settings?.mode === 'coin';
  if (hasDense && canQueryDense) {
    // Tier 2: Dense vector search
    try {
      const [queryVec] = await generateEmbeddings([query], settings);
      if (queryVec) {
        const scored = chunks.map(c => ({
          pageNum: c.pageNum,
          text: c.text,
          score: cosineSim(new Float32Array(c.embedding), queryVec),
        }));
        return scored.sort((a, b) => b.score - a.score).slice(0, topK);
      }
    } catch (err) {
      console.warn('Dense retrieval failed, falling back to BM25:', err.message);
      emitDegraded(err.message);
    }
  } else {
    // 沒有進入 dense 檢索分支：可能是未設定 embedding 設定（沒有 BYOK key 或非 coin 模式），
    // 也可能是索引階段沒有產生向量。這種情況原本會靜默走 BM25，呼叫端完全無從得知——
    // 這裡一併視為降級並通知外層 UI，維持「降級行為不變、只是變得可見」的原則。
    emitDegraded(hasDense
      ? 'dense query unavailable: no embedding provider configured'
      : 'no dense embeddings indexed, using BM25');
  }

  // Tier 1: BM25 keyword search (always works)
  const bm25Index = buildBM25Index(chunks);
  return bm25Query(bm25Index, query, topK);
}

/**
 * Check if a file has been indexed.
 */
export async function isIndexed(fileId) {
  const chunks = await getEmbeddings(fileId);
  return chunks && chunks.length > 0;
}

/**
 * Format retrieval results as context for the LLM.
 */
export function formatRetrievalContext(results, currentPageContext) {
  if (!results || results.length === 0) return currentPageContext;

  const retrievedPages = new Set(results.map(r => r.pageNum));
  const ragSection = results
    .map(r => `【第 ${r.pageNum} 頁 · 相關段落】\n${r.text}`)
    .join('\n\n');

  return `${currentPageContext}\n\n── 以下為全書中與問題相關的段落 ──\n\n${ragSection}`;
}
