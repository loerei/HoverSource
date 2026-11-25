# 04 — Upgrade Dashboard UI for Named Presets, macOS `Cmd` Modifier, and Physical-Key Shortcut Recorder

## Epic
PRD: Named Presets, Complete Realtime Shortcut Sync, and macOS Keyboard Support

## Status
done

## Blocked by
- `02` — Add `metaKey`, `toggleFilterPanel`, Named Presets, and Repo Binding in `configStore` and `hs config`
- `03` — Add realtime SSE config sync across `companion-server`, `proxy`, and `overlay-core`

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve existing Dashboard port settings, theme/threshold controls, and layout polish. Do NOT alter, restyle, or remove anything unasked.

- [x] 1. **Add Preset HTTP endpoints to `@hoversource/companion-server`**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/server.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts)
  - Expose `GET /presets` (returns `{ presets, activePreset, repoBinding }`), `POST /presets` (save/update named preset from current or supplied preset config), `POST /presets/use` (switch `activePreset`), `DELETE /presets` (delete named preset), and `POST /presets/bind` (bind/clear current repo `preset`).
  - Trigger both SSE `broadcastSseConfig(merged)` and CDP `broadcastToTargets(config.debugPort, ...)` after every preset mutation.

- [x] 2. **Upgrade `dashboard.html` for Named Presets, `Cmd` (`metaKey`), `toggleFilterPanel`, and `e.code` capture**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/dashboard.html`](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html)
  - Replace the `Target Config` (`Local` / `Global` / `Custom Path`) selector with a **Presets** bar (`Active Preset` `<select>`, `Save As Preset`, `Delete Preset`, and `Bind to Current Repo` checkbox/button), keeping `Ports` & `Auto-Resolve` controls machine/project-scoped.
  - Add `metaKey` (`Cmd` / `⌘` on macOS, `Win` on Windows) modifier toggle alongside `Alt`/`Option`, `Ctrl`, and `Shift` for all shortcuts and `layerPickerScroll`.
  - Add `toggleFilterPanel` (`Alt+Ctrl+D`) row to the shortcuts editor.
  - Fix the shortcut key recorder to extract canonical key names from `e.code` (`KeyA`–`KeyZ` -> `a`–`z`, `Digit0`–`Digit9` -> `0`–`9`) when `e.altKey` produces non-ASCII characters (macOS `Option` dead keys), and render OS-appropriate modifier labels.

- [x] 3. **Add HTTP `/presets` tests and verify full build + smoke suite**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/__tests__/server.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/server.test.ts)
  - Test `GET /presets`, `POST /presets`, `POST /presets/use`, `DELETE /presets`, and `POST /presets/bind` including invalid preset name `400` rejection and live SSE/merged config responses.

## Acceptance Criteria
- [x] Companion Server `/presets*` endpoints persist preset CRUD/binding and broadcast live updates via SSE and CDP.
- [x] `dashboard.html` supports creating, switching, deleting, and repo-binding named presets without `Target Config` path clutter.
- [x] `dashboard.html` supports `metaKey` (`Cmd`), `toggleFilterPanel`, OS-aware modifier labels, and `e.code`-based shortcut capture immune to macOS `Option` Unicode characters.
- [x] Execute automated verification command: `pnpm build && pnpm test && node scripts/verify-csp-smoke.mjs`.

## Verification Command
```bash
pnpm build && pnpm test && node scripts/verify-csp-smoke.mjs
```
