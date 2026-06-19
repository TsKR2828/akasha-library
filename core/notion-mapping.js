/**
 * Akasha Library — Notion Database Mapping (Phase 11-A)
 *
 * Bidirectional schema conversion between IndexedDB records
 * and Notion database properties.
 */

// ===== Library Index mapping =====

export function localToNotionLibrary(entry) {
  return {
    'title': { title: [{ text: { content: entry.name || '' } }] },
    'itemType': { select: { name: entry.type || 'note' } },
    'tags': { multi_select: (entry.tags || []).map(t => ({ name: t })) },
    'localId': { rich_text: [{ text: { content: entry.id || '' } }] },
    'sourceUrl': entry.sourceUrl ? { url: entry.sourceUrl } : { url: null },
    'storageRef': { rich_text: [{ text: { content: entry.storageRef || 'local' } }] },
    'updatedAt': { date: { start: new Date(entry.updatedAt || Date.now()).toISOString() } },
    'checksum': { rich_text: [{ text: { content: entry.checksum || '' } }] },
  };
}

export function notionToLocalLibrary(page) {
  const p = page.properties || {};
  return {
    id: extractText(p.localId) || page.id,
    name: extractTitle(p.title),
    type: p.itemType?.select?.name || 'note',
    tags: (p.tags?.multi_select || []).map(s => s.name),
    sourceUrl: p.sourceUrl?.url || null,
    storageRef: extractText(p.storageRef) || 'local',
    updatedAt: p.updatedAt?.date?.start ? new Date(p.updatedAt.date.start).getTime() : Date.now(),
    checksum: extractText(p.checksum) || '',
    notionPageId: page.id,
    syncStatus: 'synced',
  };
}

// ===== Script Blocks mapping =====

export function localToNotionScript(block) {
  return {
    'scriptId': { rich_text: [{ text: { content: block.scriptId || '' } }] },
    'blockNo': { number: block.blockNo ?? 0 },
    'type': { select: { name: block.type || 'dialogue' } },
    'speaker': { rich_text: [{ text: { content: block.speaker || '' } }] },
    'speakerId': { rich_text: [{ text: { content: block.speakerId || '' } }] },
    'text': { rich_text: richTextChunks(block.text) },
    'emotion': block.emotion ? { select: { name: block.emotion } } : { select: null },
    'portrait': { rich_text: [{ text: { content: block.portrait || '' } }] },
    'scene': { rich_text: [{ text: { content: block.scene || '' } }] },
  };
}

export function notionToLocalScript(page) {
  const p = page.properties || {};
  return {
    scriptId: extractText(p.scriptId),
    blockNo: p.blockNo?.number ?? 0,
    type: p.type?.select?.name || 'dialogue',
    speaker: extractText(p.speaker),
    speakerId: extractText(p.speakerId),
    text: extractText(p.text),
    emotion: p.emotion?.select?.name || null,
    portrait: extractText(p.portrait),
    scene: extractText(p.scene),
    notionPageId: page.id,
  };
}

// ===== Approved Memory mapping =====

export function localToNotionMemory(mem) {
  return {
    'title': { title: [{ text: { content: mem.title || '' } }] },
    'module': { select: { name: mem.module || '_default' } },
    'content': { rich_text: richTextChunks(mem.content) },
    'tags': { multi_select: (mem.tags || []).map(t => ({ name: t })) },
    'localId': { rich_text: [{ text: { content: mem.id || '' } }] },
    'source': { select: { name: mem.source || 'chat' } },
    'updatedAt': { date: { start: mem.updatedAt || new Date().toISOString() } },
  };
}

export function notionToLocalMemory(page) {
  const p = page.properties || {};
  return {
    id: extractText(p.localId) || page.id,
    scope: 'approved_memory',
    module: p.module?.select?.name || '_default',
    title: extractTitle(p.title),
    content: extractText(p.content),
    tags: (p.tags?.multi_select || []).map(s => s.name),
    source: p.source?.select?.name || 'chat',
    userApproved: true,
    syncTarget: 'notion',
    createdAt: page.created_time || new Date().toISOString(),
    updatedAt: p.updatedAt?.date?.start || page.last_edited_time || new Date().toISOString(),
    notionPageId: page.id,
  };
}

// ===== Persona mapping (plain page, not database) =====

export function personaToNotionBlocks(mdText) {
  return mdText.split('\n').map(line => {
    if (line.startsWith('# ')) {
      return { type: 'heading_1', heading_1: { rich_text: [{ text: { content: line.slice(2) } }] } };
    }
    if (line.startsWith('## ')) {
      return { type: 'heading_2', heading_2: { rich_text: [{ text: { content: line.slice(3) } }] } };
    }
    if (line.startsWith('### ')) {
      return { type: 'heading_3', heading_3: { rich_text: [{ text: { content: line.slice(4) } }] } };
    }
    if (line.startsWith('- ')) {
      return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: line.slice(2) } }] } };
    }
    return { type: 'paragraph', paragraph: { rich_text: [{ text: { content: line } }] } };
  });
}

export function notionBlocksToPersona(blocks) {
  return blocks.map(b => {
    const rt = b[b.type]?.rich_text || [];
    const text = rt.map(r => r.plain_text || r.text?.content || '').join('');
    switch (b.type) {
      case 'heading_1': return '# ' + text;
      case 'heading_2': return '## ' + text;
      case 'heading_3': return '### ' + text;
      case 'bulleted_list_item': return '- ' + text;
      default: return text;
    }
  }).join('\n');
}

// ===== Helpers =====

const NOTION_TEXT_LIMIT = 2000;

function richTextChunks(str) {
  const s = str || '';
  if (s.length <= NOTION_TEXT_LIMIT) return [{ text: { content: s } }];
  const chunks = [];
  for (let i = 0; i < s.length; i += NOTION_TEXT_LIMIT) {
    chunks.push({ text: { content: s.slice(i, i + NOTION_TEXT_LIMIT) } });
  }
  return chunks;
}

function extractTitle(prop) {
  if (!prop?.title) return '';
  return prop.title.map(t => t.plain_text || t.text?.content || '').join('');
}

function extractText(prop) {
  if (!prop?.rich_text) return '';
  return prop.rich_text.map(t => t.plain_text || t.text?.content || '').join('');
}

// ===== Database schema definitions (for auto-creation) =====

export const LIBRARY_INDEX_SCHEMA = {
  title: 'Akasha Library Index',
  properties: {
    'title': { title: {} },
    'itemType': { select: { options: [
      { name: 'pdf' }, { name: 'md' }, { name: 'json' },
      { name: 'script' }, { name: 'table' }, { name: 'note' },
      { name: 'score' }, { name: 'ocr-note' },
    ] } },
    'tags': { multi_select: {} },
    'localId': { rich_text: {} },
    'sourceUrl': { url: {} },
    'storageRef': { rich_text: {} },
    'updatedAt': { date: {} },
    'checksum': { rich_text: {} },
  },
};

export const SCRIPT_BLOCKS_SCHEMA = {
  title: 'Akasha Script Blocks',
  properties: {
    'scriptId': { rich_text: {} },
    'blockNo': { number: {} },
    'type': { select: { options: [
      { name: 'dialogue' }, { name: 'narration' }, { name: 'command' },
    ] } },
    'speaker': { rich_text: {} },
    'speakerId': { rich_text: {} },
    'text': { rich_text: {} },
    'emotion': { select: { options: [] } },
    'portrait': { rich_text: {} },
    'scene': { rich_text: {} },
  },
};

export const MEMORY_SCHEMA = {
  title: 'Akasha Memory Records',
  properties: {
    'title': { title: {} },
    'module': { select: {} },
    'content': { rich_text: {} },
    'tags': { multi_select: {} },
    'localId': { rich_text: {} },
    'source': { select: { options: [
      { name: 'chat' }, { name: 'manual' },
    ] } },
    'updatedAt': { date: {} },
  },
};
