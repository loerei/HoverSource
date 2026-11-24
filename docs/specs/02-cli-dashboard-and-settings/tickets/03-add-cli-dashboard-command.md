# 03 — Add `hs dashboard` command and standalone `-d` handling

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
- `02` — Extract CLI argument parser and stream-safe logger
- `05` — Add `ports` config schema, `GET /status` endpoint, and Dashboard port UI

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Add a dedicated `hs dashboard` command and fix standalone `hs -d` / `hs --dashboard` so users can open the HoverSource dashboard directly without running an app script or colliding with `package.json` `scripts.start`, honoring configured `ports.companion` and `ports.debug` defaults.

- [x] 1. **Standalone `dashboard` command handler**:
  - **Files:** **[NEW]** [dashboard.ts](file:///d:/Projects/HoverSource/packages/cli/src/commands/dashboard.ts)
  - Export `runDashboardCommand(opts: DashboardCommandOptions): Promise<{ exitCode: number; keepAlive: boolean }>`:
    - Probe `http://127.0.0.1:${opts.requestedPort}/ping` (with a short `800ms` timeout, injectable for tests).
    - If an active HoverSource companion server responds `"pong"`:
      - Request `GET http://127.0.0.1:${opts.requestedPort}/open-dashboard` (or call `openBrowser("http://127.0.0.1:${opts.requestedPort}/dashboard")` if `--no-open` is absent).
      - If `opts.json`, write `{"status":"running","port":<port>,"url":"http://127.0.0.1:<port>/dashboard"}\n` to `stdout`; otherwise log the dashboard URL. Return `{ exitCode: 0, keepAlive: false }`.
    - If no companion server is running on `opts.requestedPort`:
      - Resolve port via `resolveCompanionPort(opts.requestedPort)`, start `startCompanionServer({ port: serverPort, projectRoot: opts.projectRoot, debugPort: opts.debugPort })`, and call `openBrowser("http://127.0.0.1:${serverPort}/dashboard")` (unless `--no-open`).
      - If `opts.json`, write `{"status":"started","port":<serverPort>,"url":"http://127.0.0.1:<serverPort>/dashboard"}\n` to `stdout`.
      - Return `{ exitCode: 0, keepAlive: true }` (keeping the process alive until `SIGINT`/`SIGTERM`, shutting down cleanly).
- [x] 2. **Wire `dashboard` subcommand and config-backed port defaults in `cli.ts`**:
  - **Files:** **[MODIFY]** [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts)
  - Resolve `requestedPort` and `debugPort` via `CLI flag > loadMergedConfig(projectRoot).ports > defaults (7300 / 9222)` (returning exit code `2` on invalid non-numeric or out-of-range port flags).
  - Route `subcommand === "dashboard"` OR `(!targetArg && !execArg && Boolean(args.dashboard || args.d))` to `runDashboardCommand(...)`.
  - Keep `hs start -d` / `hs dev -d` working unchanged when launching an app script or companion-only `start`.
  - Update `showHelp()` to document `hs dashboard` and standalone `-d` / `--dashboard`.
- [x] 3. **Unit & integration tests for `runDashboardCommand`**:
  - **Files:** **[NEW]** [dashboard.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/dashboard.test.ts)
  - Test reusing an already-running companion mock server (`GET /ping` -> `"pong"`, `GET /open-dashboard`, `{ exitCode: 0, keepAlive: false }`, valid JSON on `--json`).
  - Test starting a fresh companion server on a free port when none is running, invoking injected `openBrowserFn` with `http://127.0.0.1:<port>/dashboard`, and closing the HTTP server cleanly in `afterEach`.

## Acceptance Criteria
- [x] `hs dashboard` and standalone `hs -d` open the dashboard on an active companion server without spawning a duplicate server, defaulting `--port` and `--debug-port` from `.hoversourcerc` `ports.*` when omitted on CLI.
- [x] When no companion server is active, `hs dashboard` starts one, opens `/dashboard`, and handles `SIGINT` teardown cleanly.
- [x] `--json` emits valid JSON on `stdout` without log pollution.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
