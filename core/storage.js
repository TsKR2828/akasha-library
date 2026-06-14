/**
 * Akasha Library — IndexedDB Storage Layer
 *
 * Stores file metadata index and file blobs locally.
 * Each module can save/load files through this unified API.
 */

const DB_NAME = 'akasha-library';
const DB_VERSION = 6;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('files')) {
        const fileStore = db.createObjectStore('files', { keyPath: 'id' });
        fileStore.createIndex('type', 'type', { unique: false });
        fileStore.createIndex('lastOpened', 'lastOpened', { unique: false });
        fileStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // v2: embedding index for RAG retrieval
      if (!db.objectStoreNames.contains('embeddings')) {
        const embStore = db.createObjectStore('embeddings', { keyPath: 'id' });
        embStore.createIndex('fileId', 'fileId', { unique: false });
      }

      // v3: room summaries for Memory System (Phase 10-B)
      if (!db.objectStoreNames.contains('room-summaries')) {
        db.createObjectStore('room-summaries', { keyPath: 'module' });
      }

      // v4: approved memories / 零韻手札 (Phase 10-C)
      if (!db.objectStoreNames.contains('approved-memories')) {
        const memStore = db.createObjectStore('approved-memories', { keyPath: 'id' });
        memStore.createIndex('module', 'module', { unique: false });
        memStore.createIndex('scope', 'scope', { unique: false });
        memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // v5: sync queue for Notion Connector (Phase 11-D)
      if (!db.objectStoreNames.contains('sync-queue')) {
        const sqStore = db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
        sqStore.createIndex('status', 'status', { unique: false });
        sqStore.createIndex('target', 'target', { unique: false });
      }

      // v6: bookmarks (PDF Reader Phase 4.4 — migrate from localStorage to IndexedDB)
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
        bmStore.createIndex('fileId', 'fileId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Save file metadata to index
 */
export async function saveFileEntry(entry) {
  const db = await openDB();
  const id = entry.id || generateId();
  const now = Date.now();
  const record = {
    id,
    name: entry.name,
    type: entry.type, // 'md' | 'pdf' | 'xlsx' | 'book' | 'ocr-note'
    size: entry.size || 0,
    pages: entry.pages || null,
    lastOpened: entry.lastOpened || now,
    updatedAt: entry.updatedAt || now,
    createdAt: entry.createdAt || now,
    driveId: entry.driveId || null,
    syncStatus: entry.syncStatus || 'local', // 'local' | 'synced' | 'pending'
    copyrightProtected: entry.copyrightProtected || false,
    sourceFile: entry.sourceFile || null,
    sourcePage: entry.sourcePage || null,
    contentHash: entry.contentHash || null,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all file entries, sorted by lastOpened desc
 */
export async function getFileEntries(type = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const request = type
      ? store.index('type').getAll(type)
      : store.getAll();

    request.onsuccess = () => {
      const results = request.result.sort((a, b) => b.lastOpened - a.lastOpened);
      resolve(results);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get a single file entry by ID
 */
export async function getFileEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const request = tx.objectStore('files').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete a file entry and its blob
 */
export async function deleteFileEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    tx.objectStore('files').delete(id);
    tx.objectStore('blobs').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save file content (binary blob)
 */
export async function saveFileBlob(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put({ id, blob, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Load file content (binary blob)
 */
export async function getFileBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const request = tx.objectStore('blobs').get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get/set settings
 */
export async function getSetting(key, defaultValue = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const request = tx.objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result?.value ?? defaultValue);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ===== Embeddings Store =====

/**
 * Save embedding index for a file (replaces existing)
 */
export async function saveEmbeddings(fileId, chunks) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings', 'readwrite');
    const store = tx.objectStore('embeddings');
    // Delete existing embeddings for this file
    const idx = store.index('fileId');
    const range = IDBKeyRange.only(fileId);
    idx.openCursor(range).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    // Insert new chunks (after delete completes via same transaction)
    for (const chunk of chunks) {
      store.put({ ...chunk, fileId, id: chunk.id || generateId() });
    }
    tx.oncomplete = () => resolve(chunks.length);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all embedding chunks for a file
 */
export async function getEmbeddings(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings', 'readonly');
    const idx = tx.objectStore('embeddings').index('fileId');
    const request = idx.getAll(fileId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete all embeddings for a file
 */
export async function deleteEmbeddings(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings', 'readwrite');
    const store = tx.objectStore('embeddings');
    const idx = store.index('fileId');
    const range = IDBKeyRange.only(fileId);
    idx.openCursor(range).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ===== Copyright Boundary (Phase 6-A) =====

const PROTECTED_TYPES = new Set(['ocr-note', 'crop-screenshot']);

export function isCopyrightProtected(entry) {
  if (!entry) return false;
  return entry.copyrightProtected === true || PROTECTED_TYPES.has(entry.type);
}

export const COPYRIGHT_WARNING = '可以做筆記，為保護智慧財產權，不可以帶出館藏喔';

/**
 * Export index as JSON (for Drive sync backup)
 */
export async function exportIndex() {
  const entries = await getFileEntries();
  return JSON.stringify(entries, null, 2);
}

/**
 * Import index from JSON (for Drive sync restore)
 */
export async function importIndex(json) {
  const entries = JSON.parse(json);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    entries.forEach(entry => store.put(entry));
    tx.oncomplete = () => resolve(entries.length);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ===== Bookmarks Store (Phase 4.4) =====

/**
 * Save a single bookmark. Replaces existing if same id.
 */
export async function saveBookmark(bm) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readwrite');
    tx.objectStore('bookmarks').put(bm);
    tx.oncomplete = () => resolve(bm);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all bookmarks for a given fileId, sorted by page.
 */
export async function getBookmarksByFile(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readonly');
    const idx = tx.objectStore('bookmarks').index('fileId');
    const req = idx.getAll(fileId);
    req.onsuccess = () => {
      const results = (req.result || []).sort((a, b) => a.page - b.page);
      resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete a single bookmark by id.
 */
export async function deleteBookmark(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readwrite');
    tx.objectStore('bookmarks').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete all bookmarks for a given fileId.
 */
export async function deleteBookmarksByFile(fileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readwrite');
    const store = tx.objectStore('bookmarks');
    const idx = store.index('fileId');
    idx.openCursor(IDBKeyRange.only(fileId)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
