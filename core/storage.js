/**
 * Akasha Library — IndexedDB Storage Layer
 *
 * Stores file metadata index and file blobs locally.
 * Each module can save/load files through this unified API.
 */

const DB_NAME = 'akasha-library';
const DB_VERSION = 1;

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
    type: entry.type, // 'md' | 'pdf' | 'xlsx' | 'book'
    size: entry.size || 0,
    pages: entry.pages || null,
    lastOpened: entry.lastOpened || now,
    updatedAt: entry.updatedAt || now,
    createdAt: entry.createdAt || now,
    driveId: entry.driveId || null,
    syncStatus: entry.syncStatus || 'local', // 'local' | 'synced' | 'pending'
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
