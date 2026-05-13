/**
 * Akasha Library — Notion Connector (Phase 11-B/C/D)
 *
 * Sync layer between IndexedDB and Notion databases.
 * All API calls go through a configurable proxy (Notion API has no browser CORS).
 * AI never holds the token directly — only the App manages credentials.
 */

import {
  localToNotionLibrary, notionToLocalLibrary,
  localToNotionScript, notionToLocalScript,
  localToNotionMemory, notionToLocalMemory,
  personaToNotionBlocks, notionBlocksToPersona,
  LIBRARY_INDEX_SCHEMA, SCRIPT_BLOCKS_SCHEMA, MEMORY_SCHEMA,
} from './notion-mapping.js';
import { enqueue, getPending, markDone, markFailed, pendingCount } from './sync-queue.js';

const SETTINGS_KEY = 'akasha-notion-settings';

// ===== Settings =====

export function getNotionSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      enabled: s.enabled || false,
      proxyUrl: s.proxyUrl || '',
      token: sessionStorage.getItem('akasha-notion-token') || '',
      libraryDbId: s.libraryDbId || '',
      scriptDbId: s.scriptDbId || '',
      memoryDbId: s.memoryDbId || '',
      personaPageId: s.personaPageId || '',
    };
  } catch { return { enabled: false }; }
}

export function saveNotionSettings(settings) {
  const { token, ...persistent } = settings;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistent));
  if (token !== undefined) {
    sessionStorage.setItem('akasha-notion-token', token);
  }
}

export function isConfigured() {
  const s = getNotionSettings();
  return s.enabled && s.proxyUrl && s.token;
}

// ===== Notion API (via proxy) =====

async function notionAPI(method, path, body) {
  const s = getNotionSettings();
  if (!s.proxyUrl || !s.token) throw new Error('Notion 未設定');

  const url = s.proxyUrl.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Notion-Token': s.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

// ===== Database Operations =====

async function queryDatabase(dbId, filter, startCursor) {
  const body = {};
  if (filter) body.filter = filter;
  if (startCursor) body.start_cursor = startCursor;
  return notionAPI('POST', `/v1/databases/${dbId}/query`, body);
}

async function createPage(dbId, properties) {
  return notionAPI('POST', '/v1/pages', {
    parent: { database_id: dbId },
    properties,
  });
}

async function updatePage(pageId, properties) {
  return notionAPI('PATCH', `/v1/pages/${pageId}`, { properties });
}

async function deletePage(pageId) {
  return notionAPI('PATCH', `/v1/pages/${pageId}`, { archived: true });
}

async function getPageBlocks(pageId) {
  const res = await notionAPI('GET', `/v1/blocks/${pageId}/children`);
  return res.results || [];
}

async function replacePageBlocks(pageId, blocks) {
  const existing = await getPageBlocks(pageId);
  for (const b of existing) {
    await notionAPI('DELETE', `/v1/blocks/${b.id}`);
  }
  if (blocks.length > 0) {
    await notionAPI('PATCH', `/v1/blocks/${pageId}/children`, { children: blocks });
  }
}

// ===== Library Index Sync (11-B) =====

export async function pushLibraryEntry(entry) {
  const s = getNotionSettings();
  if (!s.libraryDbId) throw new Error('Library Index database 未設定');

  const props = localToNotionLibrary(entry);

  const existing = await findByLocalId(s.libraryDbId, entry.id);
  if (existing) {
    await updatePage(existing.id, props);
    return { action: 'updated', notionPageId: existing.id };
  } else {
    const page = await createPage(s.libraryDbId, props);
    return { action: 'created', notionPageId: page.id };
  }
}

export async function pullLibraryEntries() {
  const s = getNotionSettings();
  if (!s.libraryDbId) return [];

  const entries = [];
  let cursor = undefined;
  do {
    const res = await queryDatabase(s.libraryDbId, undefined, cursor);
    for (const page of res.results) {
      if (!page.archived) entries.push(notionToLocalLibrary(page));
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return entries;
}

export async function deleteLibraryEntry(localId) {
  const s = getNotionSettings();
  if (!s.libraryDbId) return;
  const existing = await findByLocalId(s.libraryDbId, localId);
  if (existing) await deletePage(existing.id);
}

// ===== Script Blocks Sync (11-C) =====

export async function pushScriptBlock(block) {
  const s = getNotionSettings();
  if (!s.scriptDbId) throw new Error('Script Blocks database 未設定');

  const props = localToNotionScript(block);

  const filter = {
    and: [
      { property: 'scriptId', rich_text: { equals: block.scriptId } },
      { property: 'blockNo', number: { equals: block.blockNo } },
    ],
  };
  const res = await queryDatabase(s.scriptDbId, filter);
  const existing = res.results.find(p => !p.archived);

  if (existing) {
    await updatePage(existing.id, props);
    return { action: 'updated', notionPageId: existing.id };
  } else {
    const page = await createPage(s.scriptDbId, props);
    return { action: 'created', notionPageId: page.id };
  }
}

export async function pullScriptBlocks(scriptId) {
  const s = getNotionSettings();
  if (!s.scriptDbId) return [];

  const filter = { property: 'scriptId', rich_text: { equals: scriptId } };
  const res = await queryDatabase(s.scriptDbId, filter);
  return res.results
    .filter(p => !p.archived)
    .map(notionToLocalScript)
    .sort((a, b) => a.blockNo - b.blockNo);
}

// ===== Memory Sync (extends 10-C for Notion target) =====

export async function pushMemory(mem) {
  const s = getNotionSettings();
  if (!s.memoryDbId) throw new Error('Memory database 未設定');

  const props = localToNotionMemory(mem);
  const existing = await findByLocalId(s.memoryDbId, mem.id);

  if (existing) {
    await updatePage(existing.id, props);
    return { action: 'updated', notionPageId: existing.id };
  } else {
    const page = await createPage(s.memoryDbId, props);
    return { action: 'created', notionPageId: page.id };
  }
}

export async function pullMemories() {
  const s = getNotionSettings();
  if (!s.memoryDbId) return [];

  const entries = [];
  let cursor = undefined;
  do {
    const res = await queryDatabase(s.memoryDbId, undefined, cursor);
    for (const page of res.results) {
      if (!page.archived) entries.push(notionToLocalMemory(page));
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return entries;
}

// ===== Persona Sync (11-C) =====

export async function pushPersona(mdText) {
  const s = getNotionSettings();
  if (!s.personaPageId) throw new Error('Persona page 未設定');
  const blocks = personaToNotionBlocks(mdText);
  await replacePageBlocks(s.personaPageId, blocks);
  return { action: 'updated' };
}

export async function pullPersona() {
  const s = getNotionSettings();
  if (!s.personaPageId) return null;
  const blocks = await getPageBlocks(s.personaPageId);
  return notionBlocksToPersona(blocks);
}

// ===== Conflict Detection =====

export function detectConflict(local, remote) {
  const localTime = typeof local.updatedAt === 'number'
    ? local.updatedAt
    : new Date(local.updatedAt).getTime();
  const remoteTime = typeof remote.updatedAt === 'number'
    ? remote.updatedAt
    : new Date(remote.updatedAt).getTime();

  const diff = Math.abs(localTime - remoteTime);
  if (diff < 2000) return 'in-sync';
  if (localTime > remoteTime) return 'local-newer';
  return 'remote-newer';
}

export function buildConflictDiff(local, remote) {
  const fields = [];
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const skip = new Set(['notionPageId', 'syncStatus', 'driveId', 'storageRef']);

  for (const k of keys) {
    if (skip.has(k)) continue;
    const lv = JSON.stringify(local[k] ?? null);
    const rv = JSON.stringify(remote[k] ?? null);
    if (lv !== rv) {
      fields.push({ field: k, local: local[k], remote: remote[k] });
    }
  }
  return fields;
}

// ===== Background Sync Processor (11-D) =====

let _syncing = false;

export async function processQueue() {
  if (_syncing || !isConfigured()) return { processed: 0 };
  _syncing = true;

  let processed = 0;
  try {
    const jobs = await getPending();
    for (const job of jobs) {
      try {
        switch (job.target) {
          case 'library':
            if (job.action === 'delete') await deleteLibraryEntry(job.localId);
            else await pushLibraryEntry(job.payload);
            break;
          case 'script':
            await pushScriptBlock(job.payload);
            break;
          case 'memory':
            await pushMemory(job.payload);
            break;
          case 'persona':
            await pushPersona(job.payload);
            break;
        }
        await markDone(job.id);
        processed++;
      } catch (err) {
        await markFailed(job.id, err.message);
      }
    }
  } finally {
    _syncing = false;
  }
  return { processed };
}

export { pendingCount, enqueue };

// ===== Helpers =====

async function findByLocalId(dbId, localId) {
  if (!localId) return null;
  const filter = { property: 'localId', rich_text: { equals: localId } };
  const res = await queryDatabase(dbId, filter);
  return res.results.find(p => !p.archived) || null;
}
