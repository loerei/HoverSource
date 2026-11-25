# 02 — Add `metaKey`, `toggleFilterPanel`, Named Presets, and Repo Binding in `configStore` and `hs config`

## Epic
PRD: Named Presets, Complete Realtime Shortcut Sync, and macOS Keyboard Support

## Status
planned

## Blocked by
- None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve existing `hs config <inspect|set|reset|delete>` and `ports` schema contracts. Do NOT alter, restyle, or remove anything unasked.

- [x] 1. **Extend `configStore.ts` with `metaKey`, `toggleFilterPanel`, Named Presets, and Optional Repo Binding**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/configStore.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts)
  - Add `metaKey?: boolean` (default `false`) to `ShortcutConfig` and `ScrollModifiersConfig`, add `"metaKey"` to `VALID_SHORTCUT_FIELDS` / `VALID_SCROLL_FIELDS`, and add `toggleFilterPanel: { key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false }` to `DEFAULT_CONFIG.shortcuts`.
  - Define `PresetConfig` covering preset-scoped fields (`shortcuts`, `layerPickerScroll`, `theme`, `metadataFilter`, `minimalModeByDefault`, `snappingThreshold`, `desnappingThreshold`, `maxTraversalDepth`). Exclude machine/port fields (`ports`, `autoResolvePortConflicts`, `recentProjects`) from presets.
  - Support `presets?: Record<string, PresetConfig>` and `activePreset?: string` in global config, and `preset?: string` in local `.hoversourcerc` (rejecting unsafe keys `__proto__`, `constructor`, `prototype` and empty/whitespace-only preset names).
  - Update `loadMergedConfig(projectRoot, globalConfigPath)` resolution order: `DEFAULT_CONFIG` -> global base -> resolved preset (`local.preset ?? global.activePreset` from `global.presets`, ignoring unknown preset names gracefully) -> explicit local overrides.
  - Export `listPresets`, `savePreset`, `usePreset`, `deletePreset`, and `bindRepoPreset` helpers with atomic writes.

- [x] 2. **Add `hs config preset` CLI subcommands**:
  - **Files:** **[MODIFY]** [`packages/cli/src/commands/config.ts`](file:///d:/Projects/HoverSource/packages/cli/src/commands/config.ts)
  - Support `hs config preset list`, `hs config preset save <name>`, `hs config preset use <name>`, `hs config preset delete <name>`, and `hs config preset bind <name|--clear>`, honoring `--json` and `--dry-run`, and calling `notifyCompanionReload` on live mutations.

- [x] 3. **Add unit tests for `metaKey`, `toggleFilterPanel`, presets, and CLI subcommands**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/__tests__/configStore.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/configStore.test.ts), **[MODIFY]** [`packages/cli/src/__tests__/config.test.ts`](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/config.test.ts)
  - Test `metaKey` & `toggleFilterPanel` validation/round-trip, preset CRUD, `DEFAULT -> global -> preset -> local` precedence, port-setting isolation across preset switches, unsafe preset name rejection, and `hs config preset` CLI commands.

## Acceptance Criteria
- [x] `ShortcutConfig` and `ScrollModifiersConfig` validate and persist `metaKey?: boolean` and `shortcuts.toggleFilterPanel` without breaking existing `.hoversourcerc` files.
- [x] Global `presets` + `activePreset` and local `preset` binding resolve deterministically without overwriting `ports`, `autoResolvePortConflicts`, or `recentProjects`.
- [x] `hs config preset <list|save|use|delete|bind>` works with `--json`, `--dry-run`, and companion live reload.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
