import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blocksToPlainScript,
  diffMergeBlocks,
  parsePlainScript,
} from '../modules/script-editor/src/lib/parser.js';
import {
  findLibraryItem,
  hashFileBytes,
  removeLibraryItem,
  upsertLibraryItem,
} from '../modules/pdf-reader/library-store.js';
import {
  parseDelimitedText,
  toNumericValue,
} from '../modules/spreadsheet/src/lib/spreadsheet-utils.js';
import { parseMarkdownTable } from '../modules/table-forge/parsers.js';

test('script rewrite preserves dialogue metadata', () => {
  const old = [{
    id: 'dialogue-1',
    lineId: 'line-1',
    type: 'dialogue',
    speaker: 'Hero',
    text: 'Old opening sentence',
    zh: 'Old opening sentence',
    original: 'Original source',
    tags: ['important'],
    avg: { sprite: 'hero', position: 'left', bg: 'hall', bgm: '', sfx: '' },
  }];
  const parsed = parsePlainScript('Hero: Entirely new sentence');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'dialogue-1');
  assert.equal(merged.lineId, 'line-1');
  assert.equal(merged.zh, 'Entirely new sentence');
  assert.equal(merged.original, 'Original source');
  assert.deepEqual(merged.tags, ['important']);
  assert.equal(merged.avg.sprite, 'hero');
});

test('script rewrite preserves choice routes when labels change', () => {
  const old = [{
    id: 'choice-1',
    type: 'choice',
    prompt: 'Pick a route',
    options: [
      { text: 'Left', nextBlockId: 'left-scene' },
      { text: 'Right', nextBlockId: 'right-scene' },
    ],
  }];
  const parsed = parsePlainScript('#choice: Forward / Back');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'choice-1');
  assert.equal(merged.prompt, 'Pick a route');
  assert.deepEqual(
    merged.options.map(option => [option.text, option.nextBlockId]),
    [['Forward', 'left-scene'], ['Back', 'right-scene']]
  );
});

test('unchanged scene round-trip preserves subtitle and extra metadata', () => {
  const old = [{
    id: 'scene-1',
    type: 'scene',
    act: 'Act 1',
    subtitle: 'The Trial',
    stage: 'dark',
  }];
  const parsed = parsePlainScript(blocksToPlainScript(old));
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.id, 'scene-1');
  assert.equal(merged.act, 'Act 1');
  assert.equal(merged.subtitle, 'The Trial');
  assert.equal(merged.stage, 'dark');
});

test('scene subtitle edits keep act and subtitle fields separate', () => {
  const old = [{
    id: 'scene-1',
    type: 'scene',
    act: 'Act 1',
    subtitle: 'The Trial',
  }];
  const parsed = parsePlainScript('#scene: Act 1 The Verdict');
  const [merged] = diffMergeBlocks(old, parsed);

  assert.equal(merged.act, 'Act 1');
  assert.equal(merged.subtitle, 'The Verdict');
});

test('PDF library identity is content-based, not filename-based', async () => {
  const firstHash = await hashFileBytes(new Uint8Array([1, 2, 3]));
  const secondHash = await hashFileBytes(new Uint8Array([4, 5, 6]));
  let library = upsertLibraryItem([], {
    id: 'pdf-1',
    name: 'report.pdf',
    contentHash: firstHash,
  });

  assert.equal(findLibraryItem(library, null, secondHash), null);
  library = upsertLibraryItem(library, {
    id: 'pdf-2',
    name: 'report.pdf',
    contentHash: secondHash,
  });
  assert.equal(library.length, 2);
  assert.deepEqual(removeLibraryItem(library, 'pdf-1').map(item => item.id), ['pdf-2']);
});

test('numeric conversion preserves zero and rejects blanks', () => {
  assert.equal(toNumericValue(0), 0);
  assert.equal(toNumericValue('0'), 0);
  assert.equal(toNumericValue('-5'), -5);
  assert.equal(toNumericValue(''), null);
  assert.equal(toNumericValue('not-a-number'), null);
});

test('CSV parser supports quoted newlines and escaped quotes', () => {
  assert.deepEqual(
    parseDelimitedText('name,note\nAlice,"line 1\nline 2"\nBob,"say ""hi"""'),
    [
      ['name', 'note'],
      ['Alice', 'line 1\nline 2'],
      ['Bob', 'say "hi"'],
    ]
  );
});

test('Markdown table parser preserves escaped pipes', () => {
  const doc = parseMarkdownTable('| A | B |\n|---|---|\n| x\\|y | z |');
  assert.equal(doc.error, undefined);
  const sheet = doc.sheets[0];
  assert.equal(sheet.rows[0].cells[sheet.columns[0].id], 'x|y');
  assert.equal(sheet.rows[0].cells[sheet.columns[1].id], 'z');
});
