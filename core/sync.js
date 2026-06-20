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

import { getFileEntries, saveFileEntry, getFileBlob, saveFileBlob, exportIndex, importIndex, getSetting, setSetting } from './storage.js';
import { uploadFile, downloadFile, listFiles } from './drive.js';
import { isSignedIn } from './auth.js';

const INDEX_FILENAME = 'akasha-index.json';
const QUEUE_KEY = 'offlineQueue';
let syncInProgress = false;
let onSyncStatusChange = null;
let offlineQueue = [];

async function loadQueue() {
  const saved = await getSetting(QUEUE_KEY, []);
  offlineQueue = Array.isArray(saved) ? saved : [];
}

async function persistQueue() {
  await setSetting(QUEUE_KEY, offlineQueue);
}

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
 * Merge two index arrays: union by id, newer timestamp wins for same id.
 * Used by the optimistic-concurrency guard in fullSync to reconcile
 * concurrent updates from multiple devices.
 */
function mergeIndices(localEntries, remoteEntries) {
  const merged = new Map();
  for (const entry of localEntries) {
    merged.set(entry.id, entry);
  }
  for (const entry of remoteEntries) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
    } else {
      const existingTime = existing.updatedAt || existing.lastOpened || 0;
      const entryTime = entry.updatedAt || entry.lastOpened || 0;
      if (entryTime > existingTime) {
        merged.set(entry.id, entry);
      }
    }
  }
  return Array.from(merged.values());
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

    // Store the remote index revision for optimistic-concurrency check later.
    // This is NOT a true transaction — it is an optimistic-concurrency guard
    // that detects (but cannot fully prevent) lost updates from concurrent devices.
    let remoteIndexRevision = remoteIndex ? remoteIndex.modifiedTime : null;

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
          // S0-2 FIX: Download blob BEFORE committing metadata.
          // If blob download fails, we skip the metadata update so the next
          // sync will retry this entry instead of silently treating it as current.
          if (remote.driveId) {
            const remoteFile = remoteFiles.find(f => f.id === remote.driveId);
            if (remoteFile) {
              try {
                const fileBlob = await downloadFile(remote.driveId);
                const arrayBuffer = await fileBlob.arrayBuffer();
                await saveFileBlob(remote.id, new Uint8Array(arrayBuffer));
                await saveFileEntry(remote); // only after blob succeeds
              } catch (err) {
                // blob download failed — skip this entry, will retry next sync
                console.warn('Sync: blob download failed for', remote.name, err);
                continue;
              }
            }
          } else {
            await saveFileEntry(remote); // no blob needed, metadata-only update is safe
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

    // 5. Upload updated index with optimistic-concurrency guard.
    // Re-check the remote index revision before uploading; if another device
    // updated the index since we read it, re-download, merge, and retry
    // (up to 3 attempts). This is NOT a true transaction — a narrow race
    // window still exists between the re-check and the upload.
    const MAX_INDEX_UPLOAD_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_INDEX_UPLOAD_RETRIES; attempt++) {
      // Re-fetch remote file list to get current modifiedTime
      const currentRemoteFiles = await listFiles();
      const currentRemoteIndex = currentRemoteFiles.find(f => f.name === INDEX_FILENAME);
      const currentRevision = currentRemoteIndex ? currentRemoteIndex.modifiedTime : null;

      if (remoteIndexRevision && currentRevision && currentRevision !== remoteIndexRevision) {
        // Remote index was updated by another device — re-download and merge
        console.warn(`Sync: index conflict detected (attempt ${attempt + 1}/${MAX_INDEX_UPLOAD_RETRIES}), re-merging...`);
        const conflictBlob = await downloadFile(currentRemoteIndex.id);
        const conflictText = await conflictBlob.text();
        const conflictEntries = JSON.parse(conflictText);
        const freshLocal = await getFileEntries();
        const merged = mergeIndices(freshLocal, conflictEntries);
        await importIndex(JSON.stringify(merged));
        // Update revision to the one we just read so the next iteration
        // can detect if yet another change happened
        remoteIndexRevision = currentRevision;
        continue;
      }

      // No conflict (or first upload with no prior remote index) — upload
      const indexJson = await exportIndex();
      await uploadFile(INDEX_FILENAME, indexJson, 'application/json',
        currentRemoteIndex ? currentRemoteIndex.id : null);
      break;
    }

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
  if (!isSignedIn()) return false;

  const entries = await getFileEntries();
  const entry = entries.find(e => e.id === fileId);
  if (!entry) return false;

  const blob = await getFileBlob(fileId);
  if (!blob) return false;

  emitStatus('syncing', `上傳 ${entry.name}...`);

  try {
    const mimeType = getMimeType(entry.type);
    const result = await uploadFile(entry.name, blob, mimeType, entry.driveId || null);
    entry.driveId = result.id;
    entry.syncStatus = 'synced';
    await saveFileEntry(entry);
    emitStatus('synced');
    return true;
  } catch (err) {
    entry.syncStatus = 'pending';
    await saveFileEntry(entry);
    emitStatus('error', '上傳失敗');
    return false;
  }
}

/**
 * Queue a file for sync when offline, auto-sync when back online
 */
export async function queueForSync(fileId) {
  if (!offlineQueue.includes(fileId)) {
    offlineQueue.push(fileId);
    await persistQueue();
  }

  if (navigator.onLine && isSignedIn()) {
    await flushOfflineQueue();
    // S1-5 FIX: After uploading file blobs, also update the Drive index
    // so other devices can discover the new/changed file immediately.
    // Without this, the index only updates on fullSync (auth change or
    // coming back online), leaving other devices blind to the change.
    await updateDriveIndex();
  }
}

async function flushOfflineQueue() {
  if (offlineQueue.length === 0) return;

  emitStatus('syncing', `同步 ${offlineQueue.length} 個待處理檔案...`);

  const queue = [...offlineQueue];
  let failCount = 0;
  for (const fileId of queue) {
    const ok = await syncFile(fileId);
    if (ok) {
      offlineQueue = offlineQueue.filter(id => id !== fileId);
      await persistQueue();
    } else {
      failCount++;
    }
  }

  if (failCount > 0) {
    emitStatus('error', failCount + ' 個檔案同步失敗，將在下次連線時重試');
  } else {
    emitStatus('synced', '離線佇列已同步');
  }
}

/**
 * Upload the local index to Drive so other devices can see changes.
 * Uses the same INDEX_FILENAME and exportIndex() mechanism as fullSync step 5,
 * but without the optimistic-concurrency retry loop (single-file save doesn't
 * warrant the complexity; the next fullSync will reconcile if needed).
 * Non-fatal: errors are logged but don't break the save flow.
 */
async function updateDriveIndex() {
  try {
    const remoteFiles = await listFiles();
    const remoteIndex = remoteFiles.find(f => f.name === INDEX_FILENAME);
    const indexJson = await exportIndex();
    await uploadFile(INDEX_FILENAME, indexJson, 'application/json',
      remoteIndex ? remoteIndex.id : null);
  } catch (err) {
    console.warn('Failed to update Drive index:', err);
    // Non-fatal — index will be reconciled on next fullSync
  }
}

/**
 * Initialize offline/online listeners
 */
export async function initOfflineSync() {
  await loadQueue();
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
