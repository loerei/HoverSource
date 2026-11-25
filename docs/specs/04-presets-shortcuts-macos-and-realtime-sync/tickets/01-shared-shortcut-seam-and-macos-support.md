# 01 — Extract Shared Shortcut Seam, Add `toggleFilterPanel`, `metaKey`, and Tooltip Sync in `overlay-core`

## Epic
PRD: Named Presets, Complete Realtime Shortcut Sync, and macOS Keyboard Support

## Status
planned

## Blocked by
- None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI (Shadow DOM isolation, zero `innerHTML`, existing default keybindings) and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

- [x] 1. **Create shared `shortcuts.ts` seam in `@hoversource/overlay-core`**:
  - **Files:** **[NEW]** [`packages/overlay-core/src/shortcuts.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/shortcuts.ts)
  - Define `ShortcutBinding` (`{ key: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey?: boolean }`), `ScrollModifierConfig` (`{ altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey?: boolean }`), and `DEFAULT_SHORTCUTS` covering all 8 keybindings (`toggleUI`, `toggleMinimal`, `toggleFreeze`, `copyMetadata`, `copyAllLayers`, `openDashboard`, `toggleMode`, `toggleFilterPanel` `{ key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false }`) plus `DEFAULT_LAYER_SCROLL_MODIFIERS` (`{ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }`).
  - Export `isMacPlatform()` (checking `navigator.platform` / `userAgentData?.platform`), `formatShortcutLabel(shortcut, isMac?)`, `formatModifierLabel(mods, isMac?)`, `matchShortcut(e, shortcut)`, and `matchScrollModifiers(e, mods)`.
  - Ensure `matchShortcut` enforces exact `altKey`, `ctrlKey`, `shiftKey`, and `!!metaKey` equality, and matches `e.key.toLowerCase() === targetKey` OR `e.code.toLowerCase()` (`targetKey` / `key${targetKey}` / `digit${targetKey}`) so macOS `Option` dead-key characters (`ç`, `π`, `µ`, `≈`, `˙`) resolve reliably.
  - Format macOS labels using `⌃`, `⌥`, `⇧`, `⌘` (or `Option+`/`Cmd+` consistently as tested) and Windows/Linux labels using `Ctrl+`, `Alt+`, `Shift+`, `Win+`.

- [x] 2. **Wire `shortcuts.ts` into `OverlayEngine`, `InspectorAdapter`, and `DesignAdapter`**:
  - **Files:** **[MODIFY]** [`packages/overlay-core/src/overlay.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts), **[MODIFY]** [`packages/overlay-core/src/modes/InspectorAdapter.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts), **[MODIFY]** [`packages/overlay-core/src/modes/DesignAdapter.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts)
  - In `overlay.ts`: replace `loadConfig()`'s hardcoded `shortcuts` fallback with `DEFAULT_SHORTCUTS` + `DEFAULT_LAYER_SCROLL_MODIFIERS`; route `toggleFilterPanel` through `matchShortcut(e, shortcuts.toggleFilterPanel ?? DEFAULT_SHORTCUTS.toggleFilterPanel)` instead of hardcoded `e.altKey && e.ctrlKey && e.key.toLowerCase() === "d"`; remove duplicate private `matchShortcut`.
  - In `InspectorAdapter.ts`: replace private `getShortcutLabel`, modifier-matching logic, and inaccurate `[F]`/`[Alt+D]` fallbacks with `formatShortcutLabel`, `formatModifierLabel`, `matchScrollModifiers`, and `DEFAULT_SHORTCUTS`. Update `renderDetailedTooltip` and `renderMinimalTooltip` (if applicable) footer hints to include `toggleUI`, `toggleFilterPanel`, and `layerPickerScroll` alongside `copyMetadata`, `copyAllLayers`, `toggleFreeze`, `toggleMinimal`, `openDashboard`, and `toggleMode`.
  - In `DesignAdapter.ts`: replace hardcoded `Alt+...` label interpolation with `formatShortcutLabel(..., isMac)` and include `toggleUI` and `toggleFilterPanel` in the footer hint.
  - Ensure `InspectorAdapter.onConfigUpdate` and `DesignAdapter.onConfigUpdate` re-render the active tooltip immediately when a target element is currently highlighted or frozen, and rebuild `packages/overlay-core/dist/` via `pnpm build`.

- [x] 3. **Add unit & integration tests for `shortcuts.ts`, macOS `Option`/`Cmd`, and tooltip footer sync**:
  - **Files:** **[NEW]** [`packages/overlay-core/src/__tests__/shortcuts.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/shortcuts.test.ts), **[MODIFY]** [`packages/overlay-core/src/modes/InspectorAdapter.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.test.ts), **[MODIFY]** [`packages/overlay-core/src/__tests__/overlay.isolation.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/overlay.isolation.test.ts)
  - Test `matchShortcut` for `metaKey` (`Cmd`), macOS `Option+C` (`e.key: "ç"`, `e.code: "KeyC"`), `toggleFilterPanel` custom binding, and OS-specific `formatShortcutLabel` output.
  - Test Inspector & Design tooltip footers render all shortcuts accurately from `config.shortcuts` and re-render immediately upon `HOVERSOURCE_CONFIG_CHANGED`.

## Acceptance Criteria
- [x] `packages/overlay-core/src/shortcuts.ts` is the single source of truth for `DEFAULT_SHORTCUTS`, `matchShortcut`, and `formatShortcutLabel` across `overlay.ts`, `InspectorAdapter.ts`, and `DesignAdapter.ts`.
- [x] `matchShortcut` supports `metaKey` (`Cmd`) and resolves macOS `Option` Unicode `e.key` values via `e.code` for all shortcuts including `toggleFilterPanel`.
- [x] Both Inspector Mode and Design Mode tooltip footers display `toggleUI`, `toggleFilterPanel`, and `layerPickerScroll` (Inspector) with live configured modifiers/keys, and update immediately on `HOVERSOURCE_CONFIG_CHANGED`.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
