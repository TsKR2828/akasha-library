/**
 * Akasha Library — Approved Memory / 零韻手札 (Phase 10-C)
 *
 * Long-term memory records stored in IndexedDB.
 * Every write requires explicit user confirmation.
 * Records are traceable, editable, and deletable.
 */

const DB_NAME = 'akasha-library';
const DB_VERSION = 6;
const STORE = 'approved-memories';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId() {
  const d = new Date();
  const ymd = d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0');
  const seq = Math.random().toString(36).slice(2, 6);
  return `mem_${ymd}_${seq}`;
}

// ===== CRUD =====

export async function saveMemory(record) {
  const db = await openDB();
  const now = new Date().toISOString();
  const entry = {
    id: record.id || generateId(),
    scope: record.scope || 'approved_memory',
    module: record.module || '_default',
    title: record.title || '',
    content: record.content || '',
    tags: record.tags || [],
    source: record.source || 'chat',
    userApproved: true,
    syncTarget: record.syncTarget || 'local',
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMemory(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMemory(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllMemories(module) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = module
      ? store.index('module').getAll(module)
      : store.getAll();
    req.onsuccess = () => {
      const results = (req.result || []).sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || '')
      );
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMemoryCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== Session-only (今天限定) =====

const SESSION_KEY = 'akasha-session-notes';

export function saveSessionOnly(record) {
  try {
    const list = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
    list.push({
      ...record,
      id: record.id || generateId(),
      syncTarget: 'session-only',
      createdAt: new Date().toISOString(),
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(list));
    return list[list.length - 1];
  } catch { return null; }
}

export function getSessionNotes() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); }
  catch { return []; }
}

// ===== Search (Phase 10-E) =====

const MAX_SEARCH_RESULTS = 5;
const MAX_SNIPPET_LEN = 120;

/**
 * Search approved memories by keyword.
 * Matches against title, content, and tags.
 * Returns only matching snippets, not the full records.
 */
export async function searchMemories(query, module) {
  if (!query || !query.trim()) return [];

  const all = await getAllMemories(module);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = [];
  for (const m of all) {
    const haystack = [m.title, m.content, ...(m.tags || [])].join(' ').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (haystack.includes(t)) score++;
    }
    if (score > 0) scored.push({ memory: m, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_SEARCH_RESULTS).map(({ memory }) => ({
    id: memory.id,
    title: memory.title,
    module: memory.module,
    snippet: memory.content.slice(0, MAX_SNIPPET_LEN) +
      (memory.content.length > MAX_SNIPPET_LEN ? '…' : ''),
    tags: memory.tags,
  }));
}

/**
 * Build a memory context block for system prompt injection.
 * Searches relevant memories for the user's message and returns formatted snippets.
 */
export async function buildMemoryContext(query, module) {
  const results = await searchMemories(query, module);
  if (results.length === 0) return '';

  const lines = results.map(r =>
    `- 【${r.title}】${r.snippet}`
  );
  return `\n## 相關零韻手札\n${lines.join('\n')}`;
}

// ===== Helpers =====

export function autoTitle(content) {
  const first = content.replace(/\s+/g, ' ').trim().slice(0, 50);
  return first.length < content.trim().length ? first + '…' : first;
}

export function autoTags(module, content) {
  const tags = [];
  if (module && module !== '_default') tags.push(module);
  const lower = content.toLowerCase();
  if (lower.includes('pdf') || lower.includes('閱讀')) tags.push('reading');
  if (lower.includes('表格') || lower.includes('table')) tags.push('table');
  if (lower.includes('程式') || lower.includes('code')) tags.push('code');
  if (lower.includes('劇本') || lower.includes('script')) tags.push('script');
  return tags;
}
