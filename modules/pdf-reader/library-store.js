export async function hashFileBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function findLibraryItem(library, preferredId, contentHash) {
  if (preferredId) {
    const byId = library.find(item => item.id === preferredId);
    if (byId) return byId;
  }
  if (contentHash) {
    return library.find(item => item.contentHash === contentHash) || null;
  }
  return null;
}

export function upsertLibraryItem(library, item, limit = 50) {
  const remaining = library.filter(existing =>
    item.id ? existing.id !== item.id : existing !== item
  );
  return [item, ...remaining].slice(0, limit);
}

export function removeLibraryItem(library, id, legacyName) {
  if (id) return library.filter(item => item.id !== id);
  return library.filter(item => item.name !== legacyName);
}
