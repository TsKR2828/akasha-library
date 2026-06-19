/**
 * core/security.js — Akasha Library Security Layer (Phase 12)
 *
 * 12-A  Data classification constants
 * 12-B  IndexedDB field encryption (passphrase → PBKDF2 → AES-GCM)
 * 12-C  BYOK encrypted-local key management
 * 12-D  Record stamping (version / checksum / updatedAt)
 * 12-E  Build-mode gating (public / private)
 */

let _hasApiKeyFn = null;
export function registerApiKeyCheck(fn) { _hasApiKeyFn = fn; }

/* ══════════════════════════════════════════
   12-A  Data Classification
   ══════════════════════════════════════════ */

/** Five-tier data sensitivity levels (spec §14.2) */
export const DATA_LEVEL = Object.freeze({
  PUBLIC:      0,   // UI, templates, demo content — safe for public repo
  PERSONAL:    1,   // Library metadata, script drafts — IDB + optional sync
  SENSITIVE:   2,   // Chat records, persona, OCR notes — IDB encrypted + user confirm
  SECRET:      3,   // API key, OAuth token — session-only or encrypted persist
  LARGE_ASSET: 4,   // PDF, voice, Live2D — external storage, index only
});

/** Human-readable labels */
export const LEVEL_LABEL = Object.freeze({
  [DATA_LEVEL.PUBLIC]:      'Public',
  [DATA_LEVEL.PERSONAL]:    'Personal',
  [DATA_LEVEL.SENSITIVE]:   'Sensitive',
  [DATA_LEVEL.SECRET]:      'Secret',
  [DATA_LEVEL.LARGE_ASSET]: 'Large Asset',
});

/**
 * Classification map — what level each data store / key belongs to.
 * Stores with mixed content default to the highest level present.
 */
export const CLASSIFICATION = Object.freeze({
  // IndexedDB stores
  'store:files':              DATA_LEVEL.PERSONAL,
  'store:blobs':              DATA_LEVEL.PERSONAL,
  'store:settings':           DATA_LEVEL.PERSONAL,
  'store:embeddings':         DATA_LEVEL.PERSONAL,
  'store:room-summaries':     DATA_LEVEL.PERSONAL,
  'store:approved-memories':  DATA_LEVEL.SENSITIVE,
  'store:sync-queue':         DATA_LEVEL.SENSITIVE,   // payloads may carry sensitive content
  'store:bookmarks':          DATA_LEVEL.PUBLIC,

  // localStorage keys
  'ls:akasha-ai-settings':    DATA_LEVEL.PERSONAL,
  'ls:akasha-persona-md':     DATA_LEVEL.SENSITIVE,
  'ls:akasha-coin-balance':   DATA_LEVEL.PERSONAL,
  'ls:akasha-coin-usage':     DATA_LEVEL.PERSONAL,

  // sessionStorage keys (volatile — not persisted)
  'ss:akasha-ai-apikey':      DATA_LEVEL.SECRET,
  'ss:akasha-notion-token':   DATA_LEVEL.SECRET,
});

/** Classify a storage key. Returns DATA_LEVEL value. */
export function classify(storageKey) {
  if (CLASSIFICATION[storageKey] !== undefined) return CLASSIFICATION[storageKey];
  // Pattern match for wildcard keys
  if (/^ls:akasha-chat-/.test(storageKey))  return DATA_LEVEL.SENSITIVE;
  if (/^ls:akasha-coin-/.test(storageKey))  return DATA_LEVEL.PERSONAL;
  return DATA_LEVEL.PERSONAL; // safe default
}

/** Check if a data level requires encryption at rest */
export function requiresEncryption(level) {
  return level >= DATA_LEVEL.SENSITIVE;
}


/* ══════════════════════════════════════════
   12-B  Crypto Primitives (Web Crypto API)
   ══════════════════════════════════════════ */

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 recommendation
const SALT_BYTES = 16;
const IV_BYTES = 12;

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/**
 * Derive an AES-256-GCM key from a passphrase.
 * @param {string} passphrase
 * @param {Uint8Array} salt  — 16 bytes; generate with randomSalt()
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt) {
  const raw = await crypto.subtle.importKey(
    'raw', _enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Generate a random salt (16 bytes) */
export function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * Encrypt plaintext string → { iv, ciphertext } as base64 bundle.
 * Output format: base64( iv‖ciphertext )
 * @param {string} plaintext
 * @param {CryptoKey} key
 * @returns {Promise<string>}  base64 encoded
 */
export async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    _enc.encode(plaintext),
  );
  // Concatenate iv + ciphertext
  const buf = new Uint8Array(IV_BYTES + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), IV_BYTES);
  return bufToBase64(buf);
}

/**
 * Decrypt base64 bundle → plaintext string.
 * @param {string} bundle  base64( iv‖ciphertext )
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function decrypt(bundle, key) {
  const buf = base64ToBuf(bundle);
  const iv = buf.slice(0, IV_BYTES);
  const ct = buf.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
  return _dec.decode(pt);
}

/**
 * Encrypt an object's sensitive fields in place.
 * Returns a shallow copy with listed fields encrypted.
 * @param {Object} record
 * @param {string[]} fields  — field names to encrypt
 * @param {CryptoKey} key
 * @returns {Promise<Object>}  new object with encrypted fields
 */
export async function encryptFields(record, fields, key) {
  const out = { ...record, _encrypted: [] };
  for (const f of fields) {
    if (record[f] !== undefined && record[f] !== null) {
      const val = typeof record[f] === 'string' ? record[f] : JSON.stringify(record[f]);
      out[f] = await encrypt(val, key);
      out._encrypted.push(f);
    }
  }
  return out;
}

/**
 * Decrypt an object's encrypted fields.
 * @param {Object} record  — must have _encrypted array
 * @param {CryptoKey} key
 * @returns {Promise<Object>}
 */
export async function decryptFields(record, key) {
  if (!record._encrypted || !record._encrypted.length) return { ...record };
  const out = { ...record };
  for (const f of record._encrypted) {
    if (out[f]) {
      try {
        const plain = await decrypt(out[f], key);
        // Try to parse as JSON, fallback to string
        try { out[f] = JSON.parse(plain); } catch { out[f] = plain; }
      } catch {
        out[f] = '[decryption failed]';
      }
    }
  }
  delete out._encrypted;
  return out;
}


/* ══════════════════════════════════════════
   12-C  BYOK Key Management
   ══════════════════════════════════════════ */

const BYOK_STORAGE_KEY = 'akasha-byok-encrypted';
const BYOK_SALT_KEY    = 'akasha-byok-salt';

/**
 * Persist an API key encrypted with a passphrase.
 * @param {string} apiKey
 * @param {string} passphrase
 */
export async function persistApiKey(apiKey, passphrase) {
  const salt = randomSalt();
  const key = await deriveKey(passphrase, salt);
  const encrypted = await encrypt(apiKey, key);
  localStorage.setItem(BYOK_STORAGE_KEY, encrypted);
  localStorage.setItem(BYOK_SALT_KEY, bufToBase64(salt));
}

/**
 * Retrieve a previously persisted API key.
 * @param {string} passphrase
 * @returns {Promise<string|null>}  the API key, or null if not found / wrong passphrase
 */
export async function retrieveApiKey(passphrase) {
  const encrypted = localStorage.getItem(BYOK_STORAGE_KEY);
  const saltB64 = localStorage.getItem(BYOK_SALT_KEY);
  if (!encrypted || !saltB64) return null;
  try {
    const salt = base64ToBuf(saltB64);
    const key = await deriveKey(passphrase, salt);
    return await decrypt(encrypted, key);
  } catch {
    return null; // wrong passphrase or corrupted data
  }
}

/** Check if a persisted encrypted API key exists */
export function hasPersistedApiKey() {
  return !!localStorage.getItem(BYOK_STORAGE_KEY);
}

/** Remove persisted encrypted API key */
export function clearPersistedApiKey() {
  localStorage.removeItem(BYOK_STORAGE_KEY);
  localStorage.removeItem(BYOK_SALT_KEY);
}

/**
 * Get current BYOK mode.
 * @returns {'none'|'session'|'encrypted-local'}
 */
export function getByokMode() {
  if (hasPersistedApiKey()) return 'encrypted-local';
  if (_hasApiKeyFn && _hasApiKeyFn()) return 'session';
  return 'none';
}


/* ══════════════════════════════════════════
   12-D  Record Stamping
   ══════════════════════════════════════════ */

/**
 * Compute SHA-256 checksum of a string.
 * @param {string} content
 * @returns {Promise<string>}  hex digest
 */
export async function sha256(content) {
  const buf = await crypto.subtle.digest('SHA-256', _enc.encode(content));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stamp a record with version metadata.
 * Mutates record in-place and returns it.
 * @param {Object} record
 * @param {string} [source='local']  — 'local' | 'notion' | 'drive'
 * @returns {Promise<Object>}
 */
export async function stampRecord(record, source = 'local') {
  const now = Date.now();
  // Content for checksum: serialize the data fields (exclude meta fields)
  const { _version, _updatedAt, _checksum, _source, _syncedTo, _encrypted, ...data } = record;
  const contentStr = JSON.stringify(data);

  record._version    = (record._version || 0) + 1;
  record._updatedAt  = now;
  record._checksum   = await sha256(contentStr);
  record._source     = source;
  if (!record._syncedTo) record._syncedTo = [];

  return record;
}

/**
 * Verify record checksum integrity.
 * @param {Object} record
 * @returns {Promise<boolean>}
 */
export async function verifyChecksum(record) {
  if (!record._checksum) return true; // no checksum = legacy record, OK
  const { _version, _updatedAt, _checksum, _source, _syncedTo, _encrypted, ...data } = record;
  const expected = await sha256(JSON.stringify(data));
  return expected === record._checksum;
}

/**
 * Mark a record as synced to a target.
 * @param {Object} record
 * @param {string} target  — 'notion' | 'drive'
 */
export function markSynced(record, target) {
  if (!record._syncedTo) record._syncedTo = [];
  const entry = record._syncedTo.find(s => s.target === target);
  if (entry) {
    entry.at = Date.now();
    entry.version = record._version;
  } else {
    record._syncedTo.push({ target, at: Date.now(), version: record._version });
  }
}


/* ══════════════════════════════════════════
   12-E  Build Mode
   ══════════════════════════════════════════ */

/**
 * Build mode — determines feature availability.
 * In production, this would be set by a build tool.
 * Default: 'private' (full features).
 */
export const BUILD_MODE = (
  typeof window !== 'undefined' && window.__AKASHA_BUILD_MODE
) || 'private';

/** Feature gates — what each build includes */
const FEATURE_GATES = Object.freeze({
  public: {
    ai_panel:        false,  // no AI
    byok:            false,  // no API key UI
    notion_sync:     false,  // no Notion connector
    voice:           false,  // no TTS / BGM
    memory_system:   false,  // no approved memories
    persona_full:    false,  // limited persona
    encryption:      false,  // no encryption UI
    reading_room:    false,  // no private reading room
    script_editor:   true,   // basic script editor OK
    pdf_reader:      true,   // reading OK
    table_forge:     true,   // table tools OK
    export_all:      true,   // export OK
    library_full:    true,   // local library OK
    drive_sync:      false,  // no Google Drive
  },
  private: {
    ai_panel:        true,
    byok:            true,
    notion_sync:     true,
    voice:           true,
    memory_system:   true,
    persona_full:    true,
    encryption:      true,
    reading_room:    true,
    script_editor:   true,
    pdf_reader:      true,
    table_forge:     true,
    export_all:      true,
    library_full:    true,
    drive_sync:      true,
  },
});

/**
 * Check if a feature is enabled in the current build.
 * @param {string} feature  — key from FEATURE_GATES
 * @returns {boolean}
 */
export function isFeatureEnabled(feature) {
  const gates = FEATURE_GATES[BUILD_MODE] || FEATURE_GATES.private;
  return gates[feature] !== false; // default to enabled if unknown
}

/**
 * Get all feature gates for current build.
 * @returns {Object}
 */
export function getFeatureGates() {
  return { ...(FEATURE_GATES[BUILD_MODE] || FEATURE_GATES.private) };
}


/* ══════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════ */

function bufToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}
