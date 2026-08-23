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
    // 防首開競態：若本連線搶先於 core/storage.js 觸發資料庫升級，
    // storage.js 的 onupgradeneeded 就不會執行，導致 approved-memories store 永遠不存在。
    // 這裡委派建立自己需要的 store（schema 與 core/storage.js 同步）。
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const memStore = db.createObjectStore(STORE, { keyPath: 'id' });
        memStore.createIndex('module', 'module', { unique: false });
        memStore.createIndex('scope', 'scope', { unique: false });
        memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
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
 * 全形/半形、大小寫正規化（NFKC 統一寬度變體，再轉小寫）。
 */
export function normalizeText(text) {
  return (text || '').normalize('NFKC').toLowerCase();
}

/**
 * 分詞（Unicode-aware，/u flag）：漢字（\p{Script_Extensions=Han}）、假名（平假名+片假名連續段
 * 視為同一段）、諺文（\p{Script_Extensions=Hangul}）各自的連續段切 bigram（單字段落保留原字，
 * 用 Script_Extensions 而非 Script 以涵蓋ー々ヶ等跨腳本共用符號）；其餘文字（\p{L}\p{N}
 * 連續段，涵蓋拉丁/西里爾/希臘/數字）整段小寫當一個 token。
 * 例：「圖書館」→ [圖書, 書館]；「ノート」→ [ノー, ート]；「hi」→ [hi]
 * （不會命中「this」這種只是子字串包含的詞）。
 */
export function tokenizeText(text) {
  if (!text) return [];
  const tokens = [];
  const re = /\p{Script_Extensions=Han}+|[\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]+|\p{Script_Extensions=Hangul}+|[\p{L}\p{N}]+/gu;
  const isCjkBigramSeg = /^[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;
  let m;
  while ((m = re.exec(text)) !== null) {
    const seg = m[0];
    if (isCjkBigramSeg.test(seg)) {
      if (seg.length === 1) {
        tokens.push(seg);
      } else {
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.push(seg.slice(i, i + 2));
        }
      }
    } else {
      tokens.push(seg.toLowerCase());
    }
  }
  return tokens;
}

/**
 * 為一組已載入的 memory 計算 query 命中分數並排序、裁切、映射成 snippet。
 * 從 searchMemories 抽出的純函式（不碰 IndexedDB），供測試直接驗證排序/加權邏輯。
 * tag 命中權重 x2，本文命中權重 x1，零分不回傳。
 */
export function rankMemoriesByQuery(query, memories) {
  const queryTokens = [...new Set(tokenizeText(normalizeText(query)))];
  if (queryTokens.length === 0) return [];

  const scored = [];
  for (const m of memories) {
    const bodyTokens = new Set(tokenizeText(normalizeText([m.title, m.content].join(' '))));
    const tagTokens = new Set(tokenizeText(normalizeText((m.tags || []).join(' '))));

    let score = 0;
    for (const t of queryTokens) {
      if (tagTokens.has(t)) score += 2;
      else if (bodyTokens.has(t)) score += 1;
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
 * Search approved memories by keyword.
 * Matches against title, content, and tags via token overlap (NFKC 正規化 +
 * CJK bigram / 拉丁 token 分詞)，取代舊版的子字串 includes（會誤命中「hi」⊂「this」）。
 * tag 命中權重 x2，本文命中權重 x1，零分不回傳。
 * 個人規模記憶量下 O(n) 全表掃描可接受，不建索引。
 * Returns only matching snippets, not the full records.
 */
export async function searchMemories(query, module) {
  if (!query || !query.trim()) return [];

  const all = await getAllMemories(module);
  return rankMemoriesByQuery(query, all);
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
