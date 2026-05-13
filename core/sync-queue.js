/**
 * Akasha Library — Sync Queue (Phase 11-D)
 *
 * IndexedDB-backed queue for pending Notion sync operations.
 * Operations are created on local writes and processed in the background.
 */

const DB_NAME = 'akasha-library';
const DB_VERSION = 6;
const STORE = 'sync-queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Enqueue a sync operation.
 * @param {object} op - { target: 'library'|'script'|'memory'|'persona',
 *                        action: 'upsert'|'delete',
 *                        localId: string, payload: object }
 */
export async function enqueue(op) {
  const db = await openDB();
  const record = {
    target: op.target,
    action: op.action || 'upsert',
    localId: op.localId || null,
    payload: op.payload || null,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
    error: null,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(record);
    req.onsuccess = () => { record.id = req.result; resolve(record); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPending(limit = 20) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('status');
    const req = idx.getAll('pending', limit);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function markDone(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const r = req.result;
      if (!r) { resolve(); return; }
      r.status = 'done';
      r.completedAt = Date.now();
      store.put(r);
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function markFailed(id, error) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const r = req.result;
      if (!r) { resolve(); return; }
      r.retries++;
      r.error = error;
      if (r.retries >= 3) r.status = 'failed';
      store.put(r);
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearDone() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const idx = store.index('status');
    idx.openCursor('done').onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('status').count('pending');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
