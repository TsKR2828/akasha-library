/**
 * Akasha Library — Sync Layer
 *
 * Handles bidirectional sync between IndexedDB (local) and Google Drive (cloud).
 * Strategy: local-first, sync in background.
 *
 * Sync flow:
 * 1. On file save → write to IndexedDB immediately → queue for upload
 * 2. On app load (if signed in) → compare local index with Drive index → resolve
 * 3. Conflicts → newer wins (by timestamp)
 */

import { getFileEntries, saveFileEntry, getFileBlob, saveFileBlob, exportIndex, importIndex } from './storage.js';
import { uploadFile, downloadFile, listFiles } from './drive.js';
import { isSignedIn } from './auth.js';

const INDEX_FILENAME = 'akasha-index.json';
let syncInProgress = false;
let onSyncStatusChange = null;
let offlineQueue = [];

/**
 * Set callback for sync status updates
 */
export function setSyncCallback(callback) {
  onSyncStatusChange = callback;
}

function emitStatus(status, detail = '') {
  if (onSyncStatusChange) onSyncStatusChange({ status, detail });
}

/**
 * Full sync: compare local and remote, upload/download as needed
 */
export async function fullSync() {
  if (!isSignedIn()) return;
  if (syncInProgress) return;

  syncInProgress = true;
  emitStatus('syncing', '正在同步...');

  try {
    // 1. Get remote file list
    const remoteFiles = await listFiles();
    const remoteIndex = remoteFiles.find(f => f.name === INDEX_FILENAME);

    // 2. Get local entries
    const localEntries = await getFileEntries();

    // 3. If remote index exists, download and merge
    if (remoteIndex) {
      const blob = await downloadFile(remoteIndex.id);
      const text = await blob.text();
      const remoteEntries = JSON.parse(text);

      // Merge: for each remote entry not in local (or newer), pull it
      for (const remote of remoteEntries) {
        const local = localEntries.find(l => l.id === remote.id);
        const remoteTime = remote.updatedAt || remote.lastOpened || 0;
        const localTime = local ? (local.updatedAt || local.lastOpened || 0) : 0;
        if (!local || remoteTime > localTime) {
          await saveFileEntry(remote);
          // If remote has a driveId and we don't have the blob locally, download it
          if (remote.driveId) {
            const remoteFile = remoteFiles.find(f => f.id === remote.driveId);
            if (remoteFile) {
              const fileBlob = await downloadFile(remote.driveId);
              const arrayBuffer = await fileBlob.arrayBuffer();
              await saveFileBlob(remote.id, new Uint8Array(arrayBuffer));
            }
          }
        }
      }
    }

    // 4. Upload local files that aren't synced
    const updatedEntries = await getFileEntries();
    for (const entry of updatedEntries) {
      if (entry.syncStatus === 'local' || entry.syncStatus === 'pending') {
        const blob = await getFileBlob(entry.id);
        if (blob) {
          const mimeType = getMimeType(entry.type);
          const result = await uploadFile(entry.name, blob, mimeType, entry.driveId || null);
          entry.driveId = result.id;
          entry.syncStatus = 'synced';
          await saveFileEntry(entry);
        }
      }
    }

    // 5. Upload updated index
    const indexJson = await exportIndex();
    await uploadFile(INDEX_FILENAME, indexJson, 'application/json',
      remoteIndex ? remoteIndex.id : null);

    emitStatus('synced', '同步完成');
  } catch (err) {
    console.error('Sync failed:', err);
    emitStatus('error', '同步失敗: ' + err.message);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Upload a single file to Drive
 */
export async function syncFile(fileId) {
  if (!isSignedIn()) return;

  const entries = await getFileEntries();
  const entry = entries.find(e => e.id === fileId);
  if (!entry) return;

  const blob = await getFileBlob(fileId);
  if (!blob) return;

  emitStatus('syncing', `上傳 ${entry.name}...`);

  try {
    const mimeType = getMimeType(entry.type);
    const result = await uploadFile(entry.name, blob, mimeType, entry.driveId || null);
    entry.driveId = result.id;
    entry.syncStatus = 'synced';
    await saveFileEntry(entry);
    emitStatus('synced');
  } catch (err) {
    entry.syncStatus = 'pending';
    await saveFileEntry(entry);
    emitStatus('error', '上傳失敗');
  }
}

/**
 * Queue a file for sync when offline, auto-sync when back online
 */
export function queueForSync(fileId) {
  if (!offlineQueue.includes(fileId)) {
    offlineQueue.push(fileId);
  }

  if (navigator.onLine && isSignedIn()) {
    flushOfflineQueue();
  }
}

async function flushOfflineQueue() {
  if (offlineQueue.length === 0) return;

  emitStatus('syncing', `同步 ${offlineQueue.length} 個待處理檔案...`);
  const queue = [...offlineQueue];
  offlineQueue = [];

  for (const fileId of queue) {
    await syncFile(fileId);
  }

  emitStatus('synced', '離線佇列已同步');
}

/**
 * Initialize offline/online listeners
 */
export function initOfflineSync() {
  window.addEventListener('online', () => {
    emitStatus('syncing', '網路恢復，開始同步...');
    if (isSignedIn()) {
      flushOfflineQueue().then(() => fullSync());
    }
  });

  window.addEventListener('offline', () => {
    emitStatus('offline', '離線模式 — 資料保存在本地');
  });
}

function getMimeType(type) {
  const map = {
    md: 'text/markdown',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    book: 'application/json',
  };
  return map[type] || 'application/octet-stream';
}
