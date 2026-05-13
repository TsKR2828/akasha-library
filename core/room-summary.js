/**
 * Akasha Library — Room Summary (Phase 10-B)
 *
 * Per-module mid-term memory stored in IndexedDB.
 * Auto-writes from session turns; can be disabled in settings.
 * Persists across sessions — gives zero-rin cross-session context.
 */

const DB_NAME = 'akasha-library';
const DB_VERSION = 6;
const STORE = 'room-summaries';
const ENABLED_KEY = 'akasha-room-summary-enabled';
const MAX_TOPICS = 8;
const MAX_FILES = 6;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== Settings =====

export function isEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false'; }
  catch { return true; }
}

export function setEnabled(on) {
  localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
}

// ===== CRUD =====

export async function getRoomSummary(module) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(module);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRoomSummary(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRoomSummary(module) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(module);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllRoomSummaries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ===== Summary Generation (local, no LLM) =====

function extractTopics(turns) {
  return turns
    .filter(t => t.role === 'user')
    .map(t => t.text.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter(Boolean);
}

/**
 * Merge current session into the persisted room summary.
 * Called on beforeunload or after a conversation threshold.
 */
export async function flushSession(module, session) {
  if (!isEnabled()) return null;
  if (!session || !session.turns || session.turns.length === 0) return null;

  const existing = await getRoomSummary(module) || {
    module,
    turnCount: 0,
    topics: [],
    files: [],
    updatedAt: 0,
  };

  const newTopics = extractTopics(session.turns);
  const merged = [...existing.topics, ...newTopics];
  const unique = [...new Set(merged)].slice(-MAX_TOPICS);

  const sessionFiles = Object.entries(session.facts || {})
    .filter(([k]) => k === '檔案')
    .map(([, v]) => v)
    .filter(Boolean);
  const mergedFiles = [...new Set([...existing.files, ...sessionFiles])].slice(-MAX_FILES);

  const record = {
    module,
    turnCount: existing.turnCount + session.turns.length,
    topics: unique,
    files: mergedFiles,
    updatedAt: Date.now(),
  };

  await saveRoomSummary(record);
  return record;
}

// ===== System Prompt Injection =====

/**
 * Build a summary block for the system prompt.
 * Returns empty string if no summary exists or feature is disabled.
 */
export async function buildSummaryBlock(module) {
  if (!isEnabled()) return '';

  const summary = await getRoomSummary(module);
  if (!summary || summary.turnCount === 0) return '';

  const parts = [];
  if (summary.topics.length > 0) {
    parts.push('使用者曾討論：' + summary.topics.join('、'));
  }
  if (summary.files.length > 0) {
    parts.push('使用過的檔案：' + summary.files.join('、'));
  }
  parts.push(`累計對話：${summary.turnCount} 輪`);

  return `\n## 過往對話摘要（本房間）\n${parts.join('\n')}`;
}
