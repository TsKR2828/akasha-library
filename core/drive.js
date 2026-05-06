/**
 * Akasha Library — Google Drive API Layer
 *
 * CRUD operations for files on user's Google Drive.
 * Only accesses files created by this app (drive.file scope).
 */

import { getToken } from './auth.js';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Akasha Library';

let appFolderId = null;

async function driveJson(res) {
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `Drive API ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function driveBlob(res) {
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  return await res.blob();
}

/**
 * Get or create the app's root folder on Drive
 */
export async function getAppFolder() {
  if (appFolderId) return appFolderId;

  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(`${API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await driveJson(res);
  if (data.files && data.files.length > 0) {
    appFolderId = data.files[0].id;
    return appFolderId;
  }

  const createRes = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  const folder = await driveJson(createRes);
  appFolderId = folder.id;
  return appFolderId;
}

/**
 * List files in the app folder
 */
export async function listFiles() {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const folderId = await getAppFolder();
  const query = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,size,modifiedTime,createdTime)';

  const res = await fetch(`${API_BASE}/files?q=${encodeURIComponent(query)}&fields=${fields}&orderBy=modifiedTime desc`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await driveJson(res);
  return data.files || [];
}

/**
 * Upload a file to the app folder
 * @param {string} name - File name
 * @param {Blob|Uint8Array|string} content - File content
 * @param {string} mimeType - MIME type
 * @param {string|null} existingId - If provided, updates existing file
 */
export async function uploadFile(name, content, mimeType, existingId = null) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const folderId = await getAppFolder();

  const metadata = {
    name,
    mimeType,
  };

  if (!existingId) {
    metadata.parents = [folderId];
  }

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = existingId
    ? `${UPLOAD_BASE}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD_BASE}/files?uploadType=multipart`;

  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  return await driveJson(res);
}

/**
 * Download a file's content
 * @param {string} fileId - Drive file ID
 * @returns {Blob}
 */
export async function downloadFile(fileId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await driveBlob(res);
}

/**
 * Delete a file
 * @param {string} fileId - Drive file ID
 */
export async function deleteFile(fileId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Drive API delete failed: ${res.status}`);
  }
}

/**
 * Get file metadata
 * @param {string} fileId - Drive file ID
 */
export async function getFileMeta(fileId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,createdTime`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await driveJson(res);
}
