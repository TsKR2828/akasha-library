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

import { getFileEntries, saveFileEntry, deleteFileEntry, getFileBlob, saveFileBlob, exportIndex, importIndex, getSetting, setSetting } from './storage.js';
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
      const remoteData = JSON.parse(text);
      // Backwards-compatible: support both flat array (old format)
      // and {entries, tombstones} object (new format from Fix A).
      const remoteEntries = Array.isArray(remoteData) ? remoteData : (remoteData.entries || []);

      // Fix A: Process remote tombstones — delete matching local entries
      // so deletions on one device propagate to all others.
      if (remoteData.tombstones && Array.isArray(remoteData.tombstones)) {
        for (const tombstoneId of remoteData.tombstones) {
          // Record tombstone locally so we don't re-download the entry
          localStorage.setItem('akasha-tombstone:' + tombstoneId, Date.now().toString());
          // Remove from local IndexedDB if present
          const localMatch = localEntries.find(l => l.id === tombstoneId);
          if (localMatch) {
            try {
              await deleteFileEntry(tombstoneId);
            } catch (err) {
              console.warn('Sync: failed to process tombstone for', tombstoneId, err);
            }
          }
        }
      }

      // Merge: for each remote entry not in local (or newer), pull it
      for (const remote of remoteEntries) {
        // S1-5 FIX: Skip entries the user intentionally deleted (tombstone).
        // pdf-reader writes "akasha-tombstone:<id>" to localStorage on delete;
        // without this check, deleted PDFs reappear after every sync.
        var tombstone = localStorage.getItem("akasha-tombstone:" + remote.id);
        if (tombstone) continue;

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
    // S1-6B FIX: Track whether index upload succeeded. If all retry attempts
    // are exhausted by conflicts, report warning instead of false success.
    const MAX_INDEX_UPLOAD_RETRIES = 3;
    let indexUploadSucceeded = false;
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
        const conflictData = JSON.parse(conflictText);
        // Handle both old flat-array and new {entries, tombstones} format
        const conflictEntries = Array.isArray(conflictData) ? conflictData : (conflictData.entries || []);
        const freshLocal = await getFileEntries();
        const merged = mergeIndices(freshLocal, conflictEntries);
        await importIndex(JSON.stringify(merged));
        // Update revision to the one we just read so the next iteration
        // can detect if yet another change happened
        remoteIndexRevision = currentRevision;
        continue;
      }

      // No conflict (or first upload with no prior remote index) — upload
      // Include tombstones so other devices can process deletions (Fix A).
      const localEntriesForUpload = JSON.parse(await exportIndex());
      const tombstoneIds = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('akasha-tombstone:')) {
          tombstoneIds.push(key.replace('akasha-tombstone:', ''));
        }
      }
      const indexPayload = JSON.stringify({
        entries: localEntriesForUpload,
        tombstones: tombstoneIds
      });
      await uploadFile(INDEX_FILENAME, indexPayload, 'application/json',
        currentRemoteIndex ? currentRemoteIndex.id : null);
      indexUploadSucceeded = true;
      break;
    }

    if (indexUploadSucceeded) {
      emitStatus('synced', '同步完成');
    } else {
      emitStatus('error', '索引上傳衝突未解決，將在下次同步重試');
    }
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
    // Fix B: Only update the Drive index if ALL queued files uploaded
    // successfully. If some uploads failed (offlineQueue still has items),
    // skip the index update to avoid advertising entries whose blobs
    // aren't on Drive yet. The next fullSync will reconcile.
    if (offlineQueue.length === 0) {
      // S1-6A FIX: Check return value — warn user if index update failed.
      const indexOk = await updateDriveIndex();
      if (!indexOk) {
        emitStatus('error', '檔案已上傳，但索引更新失敗');
      }
    }
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

    // Fix C: Download remote index and merge instead of blind overwrite.
    // This prevents losing entries added by other devices since our last sync.
    const localEntries = JSON.parse(await exportIndex());
    let mergedEntries = localEntries;
    let mergedTombstones = [];

    if (remoteIndex) {
      const remoteBlob = await downloadFile(remoteIndex.id);
      const remoteText = await remoteBlob.text();
      const remoteData = JSON.parse(remoteText);
      const remoteEntries = Array.isArray(remoteData) ? remoteData : (remoteData.entries || []);
      mergedEntries = mergeIndices(localEntries, remoteEntries);
      // Carry forward any existing remote tombstones
      if (remoteData.tombstones && Array.isArray(remoteData.tombstones)) {
        mergedTombstones = [...remoteData.tombstones];
      }
    }

    // Fix A: Collect local tombstone IDs and include in index JSON
    // so other devices can learn about deletions.
    const localTombstoneIds = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('akasha-tombstone:')) {
        localTombstoneIds.push(key.replace('akasha-tombstone:', ''));
      }
    }
    // Merge local tombstones with remote tombstones (deduplicated)
    const tombstoneSet = new Set([...mergedTombstones, ...localTombstoneIds]);
    const allTombstones = Array.from(tombstoneSet);

    // Upload merged index with tombstones (backwards-compatible additive property)
    const indexPayload = JSON.stringify({
      entries: mergedEntries,
      tombstones: allTombstones
    });
    await uploadFile(INDEX_FILENAME, indexPayload, 'application/json',
      remoteIndex ? remoteIndex.id : null);
    return true;
  } catch (err) {
    console.warn('Failed to update Drive index:', err);
    // Non-fatal — index will be reconciled on next fullSync
    return false;
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
