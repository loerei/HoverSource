# PRD: Named Presets, Complete Realtime Shortcut Sync, and macOS Keyboard Support

- **Change Mode:** `BROWNFIELD`
- **Review Status:** `TO_BE_REVIEWED`
- **Reviewed-At-Commit:** `16803e3419f53c09b5fb7ddae68cb93c1563dc1b`
- **Upstream Prerequisite:** `docs/specs/03-cross-codebase-csp-and-dom-hardening`

## Problem Statement

1. **Tooltip shortcut footers are incomplete, inconsistent across modes, and out of sync**:
   - In [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts#L608-L648), the tooltip footer omits `toggleUI` (`Alt+H`), `toggleFilterPanel` (`Alt+Ctrl+D`), and `layerPickerScroll` (`Alt+Shift+Scroll`), and uses inaccurate fallback labels (`[F]` for freeze, `[Alt+D]` for dashboard).
   - In [DesignAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts#L707-L709), tooltip shortcut labels hardcode `Alt+...`, ignoring `ctrlKey`, `shiftKey`, and `metaKey` overrides, and omit `toggleUI` and `toggleFilterPanel`.
   - In [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts#L187-L195), `loadConfig()`'s offline fallback omits `copyAllLayers` and `layerPickerScroll`, `Alt+Ctrl+D` is hardcoded via `e.key.toLowerCase() === "d"`, and `onConfigUpdate()` does not force an immediate tooltip re-render when frozen or hovering.
2. **Web Proxy mode lacks realtime config synchronization**:
   - [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts#L212-L273) pushes `HOVERSOURCE_CONFIG_CHANGED` only via CDP `broadcastToTargets(config.debugPort, ...)` (Electron mode). Changes made from the Dashboard or `hs config` / `POST /reload-config` do not propagate live to Web Reverse Proxy tabs without a manual page refresh.
3. **Target Config (`Local` / `Global` / `Custom Path`) is high-friction for per-app shortcut conflicts**:
   - Users primarily switch shortcut profiles to avoid collisions with host apps (e.g. VS Code, Electron apps, Figma-like tools, macOS), rather than wanting per-repo `.hoversourcerc` files scattered across team repositories.
4. **macOS keyboard layouts and `Cmd` (`metaKey`) are not properly supported**:
   - `ShortcutConfig` in [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts#L7-L188) lacks `metaKey`, `Alt+Ctrl+D` bypasses `e.code` matching (breaking on macOS `Option` dead-key Unicode output such as `ç`/`π`/`µ`), `dashboard.html` records `e.key` instead of physical `e.code` when `Option` is held, and tooltip/UI labels always show `Alt`/`Ctrl` instead of macOS symbols (`⌥`/`⌃`/`⌘`).

## Solution

1. **Extract shared shortcut seam & fix tooltip footers (`01`, `S -> B`)**:
   - Consolidate `DEFAULT_SHORTCUTS` (including `toggleFilterPanel`), `isMacPlatform()`, `formatShortcutLabel()`, `formatModifierLabel()`, and `matchShortcut()` (with `metaKey` + `e.code` fallback) into `packages/overlay-core/src/shortcuts.ts`.
   - Remove duplicate formatting/matching logic from `overlay.ts`, `InspectorAdapter.ts`, and `DesignAdapter.ts`, render all active shortcuts in both Inspector and Design tooltip footers, and re-render visible tooltips immediately on `HOVERSOURCE_CONFIG_CHANGED`.
2. **Add `metaKey`, `toggleFilterPanel`, Global Presets, and Optional Repo Binding (`02`, `B`)**:
   - Extend `ShortcutConfig` / `ScrollModifiersConfig` with `metaKey?: boolean` and `shortcuts.toggleFilterPanel` in `configStore.ts`.
   - Add `presets` and `activePreset` to global `~/.hoversourcerc` plus `preset?: string` binding to local `.hoversourcerc`, resolving `DEFAULT_CONFIG -> global base -> active/bound preset -> local overrides` while keeping `ports`, `autoResolvePortConflicts`, and `recentProjects` outside preset scope.
   - Add `hs config preset <list|save|use|delete|bind>` CLI subcommands.
3. **Add SSE `/events` realtime config broadcast for Web & HTTP modes (`03`, `B`)**:
   - Add `GET /events` (`text/event-stream`) in `companion-server` emitting `event: config` on config mutations, reload, and preset switches; stream `/hoversource/events` cleanly through `proxy.ts`; subscribe via `EventSource` in `overlay.ts` (closed cleanly on `destroy()`).
4. **Upgrade Dashboard UI for Presets, `Cmd` modifier, and physical-key recording (`04`, `B`)**:
   - Add `/presets` HTTP endpoints on `companion-server` and replace the Dashboard's `Target Config` switcher with a Named Preset bar (`Active Preset`, `Save As Preset`, `Delete`, `Bind Current Repo`), `Cmd ⌘` modifier toggle, `toggleFilterPanel` row, and `e.code`-aware shortcut capture.

## User Stories

1. As a developer on Windows, Linux, or macOS, I want HoverSource's tooltip footer to accurately show all available shortcuts (including `Alt+H`, `Alt+Ctrl+D`, and `Alt+Shift+Scroll`) and update immediately when I edit shortcuts in the Dashboard or via CLI in both Electron and Web modes.
2. As a developer working across apps with conflicting shortcuts, I want to save and switch between named global presets (and optionally bind a repo to a preset) without littering `.hoversourcerc` files across repositories.
3. As a macOS user, I want to bind `Cmd` (`metaKey`) shortcuts, record `Option` combinations reliably without Unicode character corruption, and see `⌥`/`⌃`/`⌘` labels in the overlay and Dashboard.

## Implementation Decisions

- **Preset scope boundary**: Named presets store UI/interaction preferences (`shortcuts`, `layerPickerScroll`, `theme`, `metadataFilter`, `minimalModeByDefault`, `snappingThreshold`, `desnappingThreshold`, `maxTraversalDepth`). Machine/port fields (`ports`, `autoResolvePortConflicts`, `recentProjects`) remain outside presets so switching presets never alters port bindings.
- **Global Presets + Optional Repo Binding precedence**: `DEFAULT_CONFIG` -> global config base fields -> resolved preset (`local.preset ?? global.activePreset` looked up in `global.presets`) -> explicit local overrides. Unknown preset names fall back cleanly without crashing.
- **Realtime transport parity**: Electron continues receiving `HOVERSOURCE_CONFIG_CHANGED` via CDP `broadcastToTargets`; Web Reverse Proxy receives live updates via SSE `GET /hoversource/events` -> `GET /events` (`EventSource`, suppressed gracefully if offline or in CSP `connect-src 'none'` environments).
- **Physical key capture & macOS**: `matchShortcut` checks `e.altKey`, `e.ctrlKey`, `e.shiftKey`, `e.metaKey` and matches `e.key.toLowerCase()` OR `e.code.toLowerCase()` (`key<k>` / `digit<k>`). Dashboard shortcut capture derives canonical key names from `e.code` (`KeyA`–`KeyZ`, `Digit0`–`Digit9`) when `e.altKey` produces non-ASCII characters on macOS.

## Intentional Deltas

> **Default Preserve (`BROWNFIELD`):** Existing `hs config <inspect|set|reset|delete>`, `hs start`, CDP `Runtime.addBinding` bridge, Shadow DOM `#hoversource-host` isolation, and existing `.hoversourcerc` files without `presets` or `metaKey` remain **PRESERVE**.

- **`INTENTIONALLY_CHANGED`**:
  - Tooltip shortcut footers in `InspectorAdapter.ts` and `DesignAdapter.ts` expand to show all configured shortcuts (including `toggleUI`, `toggleFilterPanel`, and `layerPickerScroll`) using OS-aware labels (`⌥`/`⌃`/`⌘` on macOS).
  - `dashboard.html` replaces the `Target Config` (`Local`/`Global`/`Custom Path`) dropdown with Named Presets management + optional current-repo binding, while keeping CLI `hs config --global` / `local` / `custom` support intact.
  - `companion-server` exposes `GET /events` (SSE) and `/presets*` routes, and `proxy.ts` forwards `/hoversource/events` without buffering.

## Testing Decisions

- `packages/overlay-core/src/__tests__/shortcuts.test.ts` (`shortcuts.ts` `metaKey`, macOS `Option` `e.code` matching, OS-aware label formatting).
- `packages/overlay-core/src/modes/InspectorAdapter.test.ts` & `overlay.isolation.test.ts` (complete footer shortcuts in Inspector & Design modes, immediate tooltip re-render on `HOVERSOURCE_CONFIG_CHANGED`).
- `packages/companion-server/src/__tests__/configStore.test.ts` & `packages/cli/src/__tests__/config.test.ts` (`metaKey`, `toggleFilterPanel`, preset CRUD, precedence with repo binding, prototype-pollution key rejection, `hs config preset`).
- `packages/companion-server/src/__tests__/server.test.ts`, `packages/cli/src/__tests__/proxy.integration.test.ts`, & `packages/overlay-core/src/__tests__/overlay.lifecycle.test.ts` (SSE `/events` stream, `/presets` routes, proxy `/hoversource/events` passthrough, `EventSource` lifecycle & `destroy()` cleanup).

## Out of Scope

- Arbitrary multi-key chord sequences (e.g. `Ctrl+K Ctrl+C`).
- Customizing non-QWERTY keymap translation tables beyond `e.key` + `e.code` matching.

## Tickets

- **Critical Path:** `01 -> 03 -> 04` and `02 -> 03 -> 04` (`01` and `02` can execute in parallel).

- `01` — Extract shared shortcut seam, add `toggleFilterPanel`, `metaKey`, and tooltip sync in `overlay-core` (`tickets/01-shared-shortcut-seam-and-macos-support.md`)
- `02` — Add `metaKey`, `toggleFilterPanel`, Named Presets, and Repo Binding in `configStore` and `hs config` (`tickets/02-presets-and-macos-config-store.md`)
- `03` — Add realtime SSE config sync across `companion-server`, `proxy`, and `overlay-core` (`tickets/03-realtime-config-sse-sync.md`)
- `04` — Upgrade Dashboard UI for Named Presets, macOS `Cmd` modifier, and physical-key shortcut recorder (`tickets/04-dashboard-presets-and-macos-recorder.md`)
