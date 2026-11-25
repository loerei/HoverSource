# 01 — Extract `configStore` module with schema validation, atomic writes, and reload route

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Preparatory structural refactoring (`S`) extracting configuration persistence, schema validation, and atomic disk writes out of [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) into a reusable, testable module exported by `@hoversource/companion-server`, plus adding `POST /reload-config`.

- [x] 1. **[NEW]** [`configStore.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts) — Config schema validation, atomic persistence, and dot-path helpers
  - Extract and export `ShortcutKey`, `HoverSourceConfig`, `DEFAULT_CONFIG`, `normalizeProjectPath`, `mergeDeep`, `loadMergedConfig`, `getConfigForTarget`, `registerRecentProject`, `getRecentProjects`, `saveConfigDelta`, `resetConfigTarget`, and `deleteConfigTarget`.
  - Inject optional `globalConfigPath?: string` parameter across `loadMergedConfig`, `getConfigForTarget`, `registerRecentProject`, `getRecentProjects`, `saveConfigDelta`, `resetConfigTarget`, and `deleteConfigTarget` (defaulting to `path.join(os.homedir(), ".hoversourcerc")`) so tests never mutate the host user's home directory.
  - Implement strict boundary parsing (`parseConfigDelta(raw: unknown)`) validating allowed keys and types/bounds (`theme`: `"dark" | "light" | "system"`, `editor`: `"vscode" | "cursor" | "code"`, `snappingThreshold` & `desnappingThreshold`: integer `0..100`, `maxTraversalDepth`: integer `8..100`, `webAppDevServerTimeout`: positive integer, `layerPickerEnabled` / `minimalModeByDefault` / `autoResolvePortConflicts`: boolean, `shortcuts.*` & `layerPickerScroll`, `metadataFilter`), returning a structured validation error on invalid input.
  - Implement dot-path helpers `getConfigValueByPath(config: HoverSourceConfig, keyPath: string)` and `buildDeltaFromKeyValue(keyPath: string, rawValue: string)` (coercing `"true"`/`"false"` for booleans and integers for numeric fields, rejecting unknown keys or out-of-range values with clear error messages).
  - Implement atomic sibling file writes (`writeJsonAtomic`: write to sibling `.hoversourcerc.<pid>.<ts>.tmp` in `path.dirname(targetPath)`, `fsyncSync`, `closeSync`, `renameSync`, unlinking temp file in `catch`/`finally`), and quarantine corrupt JSON files (`SyntaxError` renames malformed file to `<file>.corrupt.<ts>` and logs a warning to `console.warn` instead of `console.log`).
- [x] 2. **[MODIFY]** [`server.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) — Delegate config routes to `configStore` and add `POST /reload-config`
  - Import and re-export `ShortcutKey`, `HoverSourceConfig`, `normalizeProjectPath`, and `loadMergedConfig` from `./configStore.js` so existing callers remain intact.
  - Wire `handleConfigGet`, `handleConfigPost`, and `handleConfigDelete` to `configStore` (`POST /config` returns `400` JSON when `parseConfigDelta` fails).
  - Add `POST /reload-config` route that loads `loadMergedConfig(config.projectRoot)` and broadcasts `HOVERSOURCE_CONFIG_CHANGED` via `broadcastToTargets(config.debugPort, ...)` returning `200` JSON `{ success: true, config }`.
- [x] 3. **[MODIFY]** [`package.json`](file:///d:/Projects/HoverSource/packages/companion-server/package.json) — Export `./config` subpath
  - Add `"./config": { "types": "./dist/configStore.d.ts", "import": "./dist/configStore.js" }` to `exports` while preserving `"."`.
- [x] 4. **[NEW]** [`configStore.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/configStore.test.ts) and **[MODIFY]** [`server.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/server.test.ts) — Verify config store and HTTP endpoints
  - Test hierarchical merge (`DEFAULT_CONFIG < global < local`), injected `globalConfigPath`, strict validation rejections (`theme`, `maxTraversalDepth: 5`), dot-path get/set coercion, atomic write leaving zero `.tmp` leftovers, corrupt JSON quarantine, and HTTP `POST /config` `400` + `POST /reload-config` `200` in isolated `os.tmpdir()` directories cleaned up in `afterEach`.

## Acceptance Criteria
- [x] `configStore.ts` handles global/local/custom targets using injected `globalConfigPath` without mutating `os.homedir()`.
- [x] Invalid config keys, wrong types, or out-of-bounds numbers (`maxTraversalDepth < 8` or `> 100`) are rejected cleanly by `parseConfigDelta`, `buildDeltaFromKeyValue`, and HTTP `POST /config` (`400`).
- [x] Atomic sibling write and corrupt JSON quarantine are verified by automated unit tests with zero leaked temp files.
- [x] `POST /reload-config` returns `200` JSON with the active merged config.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
