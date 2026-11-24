# 05 — Add `ports` config schema, `GET /status` endpoint, and Dashboard port UI

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
- `01` — Extract `configStore` module with schema validation, atomic writes, and reload route

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Extend [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts) with configurable port settings (`ports.companion`, `ports.debug`, `ports.proxy`, `ports.dev`, `ports.companionConflict`), add `GET /status` to [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) so callers can inspect running companion project identity, and add matching Port Settings inputs to [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html) preserving the console's existing Tailwind dark UI style and change-detection flow.

- [ ] 1. **Add `ports` schema, validation bounds, and `null`/auto override clearing in `configStore.ts`**:
  - **Files:** **[MODIFY]** [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts)
  - Export `CompanionConflictPolicy = "shift" | "takeover" | "fail"`, `PortsConfig = { companion?: number; debug?: number; proxy?: number; dev?: number; companionConflict?: CompanionConflictPolicy }`, and add `ports?: PortsConfig` to `HoverSourceConfig` plus `ports?: { companion?: number; debug?: number; proxy?: number | null; dev?: number | null; companionConflict?: CompanionConflictPolicy }` to `ConfigDelta`.
  - Add `ports: { companion: 7300, debug: 9222, companionConflict: "shift" }` to `DEFAULT_CONFIG` and `"ports"` to `VALID_TOP_LEVEL_KEYS`.
  - Validate in `parseConfigDelta`:
    - `ports.companion` and `ports.debug`: integer in `1..65535`.
    - `ports.proxy` and `ports.dev`: integer in `1..65535` OR explicit `null` (meaning clear back to Auto).
    - `ports.companionConflict`: one of `"shift"`, `"takeover"`, `"fail"`.
    - Reject non-object `ports`, unknown keys under `ports`, and `__proto__`/`constructor`/`prototype`.
  - Extend `buildDeltaFromKeyValue`:
    - Support `ports.companion`, `ports.debug`, `ports.proxy`, `ports.dev`, `ports.companionConflict`.
    - Treat `"null"` or `"auto"` (case-insensitive) on `ports.proxy` and `ports.dev` as `{ ports: { [field]: null } }`.
  - Normalize `null` clears cleanly:
    - In `saveConfigDelta` and merged reads (`loadMergedConfig`, `getConfigForTarget`), strip `proxy: null` / `dev: null` keys after merging so clearing an override deletes the stale field on disk and runtime `config.ports?.proxy` / `.dev` is `number | undefined`.
- [ ] 2. **Add `GET /status` identity endpoint and export port types in `server.ts`**:
  - **Files:** **[MODIFY]** [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts)
  - Re-export `CompanionConflictPolicy`, `PortsConfig` from `./configStore.js` (and ensure `@hoversource/companion-server` entry preserves all existing exports).
  - Add `GET /status` handler returning `200` `application/json`:
    `{ ok: true, pid: process.pid, port: config.port, projectRoot: normalizeProjectPath(config.projectRoot), debugPort: config.debugPort }`.
  - Keep `GET /ping` returning `200` `text/plain` `"pong"` unchanged.
- [ ] 3. **Add Port Settings and Conflict Policy controls to `dashboard.html`**:
  - **Files:** **[MODIFY]** [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html)
  - Add a Port Settings sub-section inside `General Preferences` matching the existing `bg-slate-950/40 border border-slate-800 rounded-lg p-3` layout and input styling:
    - `#companion-port-input` (`type="number"`, `min="1"`, `max="65535"`, `placeholder="7300"`) for `ports.companion`
    - `#debug-port-input` (`type="number"`, `min="1"`, `max="65535"`, `placeholder="9222"`) for `ports.debug`
    - `#proxy-port-input` (`type="number"`, `min="1"`, `max="65535"`, `placeholder="Auto"`) for `ports.proxy`
    - `#dev-port-input` (`type="number"`, `min="1"`, `max="65535"`, `placeholder="Auto"`) for `ports.dev`
    - `#companion-conflict-select` (`<select>` with options `shift`, `takeover`, `fail`) for `ports.companionConflict`
  - Sync JS `DEFAULT_CONFIG`, `loadConfigForSelectedTarget()`, `resetBtns`, `getConfigFromUI()`, and `checkChanges()`:
    - Empty `#proxy-port-input` / `#dev-port-input` serializes to `proxy: null` / `dev: null` in `getConfigFromUI()`, while empty `#companion-port-input` / `#debug-port-input` falls back to `7300` / `9222`.
    - Normalize `checkChanges()` comparison against `loadedConfig` (including `ports` normalized with `proxy ?? null` and `dev ?? null`, without changing non-editable fields or mis-triggering the Save button on load or right after save).
    - Wire `input`/`change` listeners on all 5 controls and show explicit validation feedback when server `POST /config` returns `400` JSON `error`.
- [ ] 4. **Unit & HTTP tests for `ports` config, `GET /status`, and Dashboard HTML controls**:
  - **Files:** **[MODIFY]** [configStore.test.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/configStore.test.ts), **[MODIFY]** [server.test.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/server.test.ts)
  - Test `DEFAULT_CONFIG.ports` defaults, valid `ports` merge and dot-path `buildDeltaFromKeyValue` (`ports.debug 9223`, `ports.dev auto`, `ports.companionConflict fail`), invalid bounds (`0`, `65536`, float, unknown field, invalid conflict policy), and clearing persisted `ports.dev` / `ports.proxy` via `null` / `"auto"`.
  - Test `GET /status` JSON response (`ok: true`, `pid`, `port`, normalized `projectRoot`, `debugPort`), `POST /config` rejecting out-of-range ports with `400`, clearing `ports.dev: null`, and `GET /dashboard` containing the 5 port control IDs.

## Acceptance Criteria
- [ ] `configStore.ts` validates `ports.companion`, `ports.debug`, `ports.proxy`, `ports.dev` (`1..65535`, plus `null`/`"auto"` clearing for `proxy`/`dev`), and `ports.companionConflict` (`"shift" | "takeover" | "fail"`).
- [ ] `GET /status` returns `{ ok: true, pid, port, projectRoot, debugPort }` while `GET /ping` continues returning `"pong"`.
- [ ] [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html) renders, hydrates, resets, validates, clears (`Auto`), and saves all 5 port settings without false dirty state.
- [ ] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
