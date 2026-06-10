# Write Multi-Mode Audit

## Current Files

- `modules/script-editor/src/components/WriteTab.jsx`
  - Main Write tab implementation.
  - Owns the textarea, toolbar, persona slots, preview tabs, stats, scene outline, H1-H4 heading outline, voice panel entry, BGM panel entry, draft persistence, slot persistence, and bidirectional sync with parent `blocks`.

- `modules/script-editor/src/App.jsx`
  - Parent shell for Script Editor tabs.
  - Loads work data, owns `blocks`, `characters`, `script`, `currentWork`, and passes `workId={currentWork}` plus `blocks`/`setBlocks` into `WriteTab`.
  - Persists rich block data in `blocks_${workId}` and writes imported script drafts into `sw_write_draft_v1_${workId}`.

- `modules/script-editor/src/lib/parser.js`
  - Provides `parsePlainScript(content, characters)`, `blocksToPlainScript(blocks, characters)`, `diffMergeBlocks(oldBlocks, newBlocks)`, `computeStats(blocks)`, and `getLineCol(text, caretIndex)`.
  - Current grammar is script-oriented: `#scene:` becomes a scene block, other `#cmd:` lines become command blocks, `旁白:`/`Narrator:` become narration, `Speaker:` becomes dialogue, and other lines fall back to narration.

- `modules/script-editor/src/hooks/useVoiceTTS.js`
  - Used by `WriteTab` for the Voice preview tab.
  - Persists global voice settings in `sw_voice_settings_v1`.

- `modules/script-editor/src/components/BgmPanel.jsx`
  - Used by `WriteTab` for the BGM preview tab.
  - Reads parsed command blocks, especially `#bgm:` and `#sfx:`.
  - Should remain untouched for write modes.

- `modules/script-editor/src/main.jsx`
  - Loads the last work from `sw_last_work`, calls `loadAllData(lastWork)`, then mounts `App`.

- `modules/script-editor/tokens.css` and `modules/script-editor/index.html`
  - Provide styling tokens and Vite entry for the Script Editor app.
  - No behavior changes should be needed for write modes.

- Optional reusable helpers outside Script Editor:
  - `core/translation-core.js` already extracts Markdown metadata, including headings.
  - `core/export/toPayload.js` has simple Markdown heading-to-payload logic.
  - `core/export-core.js` already supports markdown export formats.
  - These should be read for reference only unless a later task explicitly asks for shared helper extraction.

## Current State Flow

`App.jsx` owns the canonical work-level state:

- `currentWork` is initialized from `sw_last_work || WORKS[0]?.id || "lohengrin"`.
- `blocks` is initialized from `blocks_${workId}` or loaded server/custom script data.
- `WriteTab` receives `blocks`, `setBlocks`, `characters`, and `workId`.
- A debounced parent save stores non-empty `blocks` into `blocks_${workId}`.

`WriteTab.jsx` owns local writing state:

- `content`
  - Initialized once on mount.
  - Load order: `sw_write_draft_v1_${workId}` first, then `blocksToPlainScript(blocks, characters)`, then `SEED`.
  - Saved with a 500 ms debounce to `sw_write_draft_v1_${workId}`.

- `previewTab`
  - Defaults to `"blocks"`.
  - Current tabs are `blocks`, `stats`, `outline`, `voice`, and `bgm`.

- `parsedBlocks`
  - Computed from `parsePlainScript(content, characters)` on every content change.
  - Drives Blocks preview, Stats preview, Voice preview, BGM cue preview, scene outline, and forward sync.

- `headingOutline`
  - Already exists.
  - Parses raw `content` for Markdown headings matching `#` through `####`.
  - Skips `#command:` style lines.
  - Produces `{ level, text, line }`.

- `sceneOutline`
  - Groups `parsedBlocks` by `scene` blocks and counts dialogue/narration/command blocks.
  - Feeds the same `OutlinePanel` as `headingOutline`.

- `activeChapter`
  - Uses `#scene:` lines to show a chapter slice of `content`.
  - Edits are spliced back into the full text.

- `caret`, `line`, `col`, `globalLine`
  - Track cursor location and active outline item.

- `locks`
  - Slot assignment state.
  - Loaded from `sw_slot_locks_v1_${workId}`.
  - Saved to `sw_slot_locks_v1_${workId}`.

- `syncStatus`, `syncTokenRef`, `lastReverseRef`, `initializedRef`, `forwardTimer`
  - Coordinate bidirectional sync:
    - Forward: `content -> parsedBlocks -> diffMergeBlocks(blocks, parsedBlocks) -> setBlocks`.
    - Reverse: external `blocks` changes regenerate textarea via `blocksToPlainScript`.

Existing localStorage keys related to WriteTab and adjacent Script Editor state:

- `sw_write_draft_v1_${workId}`: Write textarea draft.
- `sw_slot_locks_v1_${workId}`: Alt/persona slot locks.
- `blocks_${workId}`: rich editor/script block state.
- `notes_${workId}`: character notes.
- `characters_${workId}`: custom characters.
- `sw_history_v1_${workId}`: block history.
- `sw_voice_settings_v1`: global voice settings.
- `sw_last_work`: current work selection.

There is no dedicated markdown preview in `WriteTab`. The current right panel is a script block/stats/outline/voice/BGM panel. Markdown support elsewhere in the repo is export and extraction oriented.

## Proposed Data Model

Keep the model small and local to `WriteTab`.

Modes:

```js
const WRITE_MODES = ["script", "novel", "notes"];
```

Current mode:

```js
sw_write_mode_v1_${workId} -> "script" | "novel" | "notes"
```

Draft content:

```js
script: sw_write_draft_v1_${workId}
novel:  sw_write_draft_v1_${workId}__novel
notes:  sw_write_draft_v1_${workId}__notes
```

This keeps the existing script draft key unchanged. It avoids a risky migration and prevents existing script drafts from moving or disappearing.

Outline headings:

```js
{
  level: 1 | 2 | 3 | 4,
  text: string,
  line: number
}
```

This is already the shape used by `headingOutline`. It should stay derived from text, not persisted.

Mode config:

```js
{
  script: {
    label: "Script",
    parseBlocks: true,
    syncBlocks: true,
    showSlots: true,
    defaultPreviewTab: "blocks"
  },
  novel: {
    label: "Novel",
    parseBlocks: false,
    syncBlocks: false,
    showSlots: false,
    defaultPreviewTab: "outline"
  },
  notes: {
    label: "Notes",
    parseBlocks: false,
    syncBlocks: false,
    showSlots: false,
    defaultPreviewTab: "outline"
  }
}
```

The key safety rule: only Script mode may forward-sync into `setBlocks`. Novel and Notes should remain plain text drafts until a later explicit feature defines conversion/export behavior.

## Proposed UI Structure

Add a small segmented control in the existing Write toolbar near the `Scriptorium · Calamus` label:

- Novel
- Script
- Notes

Recommended initial behavior:

- Default mode is Script when no mode key exists.
- Switching modes saves the current mode draft before loading the next mode draft.
- The status bar should show the active mode instead of always showing `Plain Script`.
- Script mode keeps current behavior:
  - persona slots visible
  - Blocks, Stats, Outline, Voice, BGM tabs available
  - parse and sync through `parsePlainScript`

- Novel mode:
  - text area remains the same component
  - no persona slots
  - no block forward sync
  - outline tab shows H1-H4 headings
  - stats should use raw content stats

- Notes mode:
  - text area remains the same component
  - no persona slots
  - no block forward sync
  - outline tab shows H1-H4 headings
  - stats should use raw content stats

H1-H4 outline panel:

- Reuse the existing `headingOutline` parser and `OutlinePanel`.
- Keep it in the current right-side preview pane under the existing `outline` tab.
- In Script mode, the outline can continue showing both headings and scenes.
- In Novel and Notes modes, it should show heading outline only.
- Do not create a new global sidebar and do not change Search, Editor, or Reader tabs.

## Migration Plan

Preserve existing drafts by keeping Script mode on the existing key:

- Existing key: `sw_write_draft_v1_${workId}`
- Existing value stays valid and continues to load in Script mode.
- No deletion, renaming, or copy-on-write is required.

Add only new keys:

- `sw_write_mode_v1_${workId}`
- `sw_write_draft_v1_${workId}__novel`
- `sw_write_draft_v1_${workId}__notes`

When a user first opens the new feature:

1. Load mode from `sw_write_mode_v1_${workId}`.
2. If missing or invalid, use `script`.
3. Load the draft key for that mode.
4. For Script mode only, preserve the current fallback chain:
   - script draft
   - `blocksToPlainScript(blocks, characters)`
   - `SEED`
5. For Novel and Notes, use an empty string if no draft exists.

Important cleanup follow-up:

- `deleteCurrentWork` in `App.jsx` currently removes only `sw_write_draft_v1_${currentWork}` and `sw_slot_locks_v1_${currentWork}`.
- A later implementation should remove the new mode and per-mode draft keys when deleting a custom work.
- That cleanup should be part of the per-mode persistence commit, not part of the initial data-model commit.

## Implementation Steps

Break into small commits:

1. data model only
   - Add mode constants and helper functions in `WriteTab.jsx`.
   - Add helpers for `modeKey(workId)` and `draftKey(workId, mode)`.
   - Keep `draftKey(workId, "script")` returning the existing `sw_write_draft_v1_${workId}`.
   - Add pure helpers for validating mode and choosing default mode.
   - No visible UI behavior change.

2. mode switch UI only
   - Add the Novel / Script / Notes segmented control to the existing Write toolbar.
   - Store active mode in React state only at first.
   - Update only labels/status text.
   - Do not alter parsing, persistence, or block sync yet.

3. per-mode persistence only
   - Persist active mode in `sw_write_mode_v1_${workId}`.
   - Save and load drafts by mode.
   - Preserve Script mode fallback behavior exactly.
   - Add custom-work deletion cleanup for new Write mode keys.
   - Keep Script mode behavior unchanged.

4. outline parser only
   - Extract the existing H1-H4 parser into a small local helper, or keep it inline if no reuse is needed.
   - Ensure it works for Novel, Script, and Notes.
   - Keep headings derived from raw `content`; do not persist them.
   - Do not add markdown rendering.

5. outline panel UI only
   - Reuse `OutlinePanel`.
   - In Script mode, show headings plus scene outline.
   - In Novel/Notes modes, show headings only.
   - Keep it inside the existing right preview pane.
   - Avoid changing Search, Editor, Reader, or App Shell layout.

6. polish and tests
   - Verify mode switching preserves each draft.
   - Verify existing Script draft under `sw_write_draft_v1_${workId}` still loads.
   - Verify Novel/Notes do not call `setBlocks`.
   - Verify H1-H4 outline navigation moves the caret correctly.
   - Run the smallest relevant check first, then `npm test` if source behavior changes are broader.

## Out of Scope

- Do not implement the feature in this audit.
- Do not change current WriteTab behavior in this audit.
- Do not modify `App.jsx` except in a later approved implementation step where custom-work deletion must clean new keys.
- Do not modify `dist/`.
- Do not touch TsukiSynth or `BgmPanel.jsx` behavior.
- Do not touch scene subtitle code.
- Do not generalize `GERMAN_ACT_NUMS` or `Akt/Sz` labels.
- Do not update `TODO.md` or `HANDOFF.md`.
- Do not add a rich text editor.
- Do not add markdown preview unless explicitly requested later.
- Do not add export formats or sync integration for Novel/Notes.
- Do not alter Search, Editor, or Reader tabs.
- Do not change the Script block data model.

## Risks

- Existing draft overwrite risk
  - Risk: changing `draftKey()` could make existing script drafts disappear or be overwritten.
  - Avoidance: keep Script mode on `sw_write_draft_v1_${workId}`.

- Novel/Notes corrupting script blocks
  - Risk: current forward sync parses all content into blocks and calls `setBlocks`.
  - Avoidance: gate forward sync so only Script mode can call `setBlocks`.

- Reverse sync overwriting non-script drafts
  - Risk: external `blocks` changes currently regenerate textarea content.
  - Avoidance: run reverse sync only in Script mode.

- Persona slots leaking into prose modes
  - Risk: slots are script-specific and insert `Speaker:`/`#scene:` prefixes.
  - Avoidance: hide slots and disable Alt+1-9 insertion in Novel and Notes.

- Outline overreach
  - Risk: turning the outline into a full markdown navigator or document manager.
  - Avoidance: only parse H1-H4 headings and jump the caret to line numbers.

- Markdown parser duplication
  - Risk: `WriteTab` already has simple heading parsing while `core/translation-core.js` also extracts Markdown metadata.
  - Avoidance: keep the existing local parser initially; extract only if a later commit needs shared behavior.

- Preview tab confusion
  - Risk: Blocks, Voice, and BGM tabs are script-specific.
  - Avoidance: either hide script-only preview tabs in Novel/Notes or leave them disabled with clear labels during the UI commit.

- Deleting custom works leaves new draft keys behind
  - Risk: new per-mode keys would survive custom work deletion.
  - Avoidance: add deletion cleanup for `sw_write_mode_v1_${workId}`, `sw_write_draft_v1_${workId}__novel`, and `sw_write_draft_v1_${workId}__notes` in the persistence commit.

- Accidental feature creep
  - Risk: adding AI prompts, export flows, Notion sync, markdown renderer, or editor refactors.
  - Avoidance: keep the implementation constrained to local WriteTab mode state, per-mode draft persistence, and the existing outline panel.
