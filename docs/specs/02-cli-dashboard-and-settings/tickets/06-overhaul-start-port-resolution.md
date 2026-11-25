# 06 — Overhaul `hs start` port orchestration, conflict policy, and dev port sniffing

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
- `02` — Extract CLI argument parser and stream-safe logger
- `05` — Add `ports` config schema, `GET /status` endpoint, and Dashboard port UI

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Make `hs start` config-driven and zero-prompt: enforce strict port precedence (`CLI flag > project .hoversourcerc > global ~/.hoversourcerc > built-in defaults`), fix port-probe race conditions and PID parsing bugs in [port.ts](file:///d:/Projects/HoverSource/packages/cli/src/port.ts), resolve `devPort` and `debugPort` before starting `companionServer`, honor `ports.companionConflict` via `GET /status`, auto-shift blocked HoverSource ports without interactive prompts, and tee-sniff live dev server listening ports in [WebProxyLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/WebProxyLauncher.ts).

- [x] 1. **Fix low-level port probes, exact PID lookup, precedence, and `/status`-aware companion resolution in `port.ts`**:
  - **Files:** **[MODIFY]** [port.ts](file:///d:/Projects/HoverSource/packages/cli/src/port.ts)
  - Fix `probeHostPort(port, host)`: resolve `true` ONLY inside `server.close(() => resolve(true))` after bind succeeds, and resolve `false` for both `EADDRINUSE` and `EACCES` (Windows Hyper-V/WinNAT excluded port ranges).
  - Fix `getPidUsingPort(port)`: on Windows run `netstat -ano` directly (no `findstr :${port}` substring piping) and parse lines in JS with exact local `:port` `LISTENING` boundary checks (`Number(portToken) === port`); on POSIX run `lsof -nP -iTCP:${port} -sTCP:LISTEN -t` and parse numeric PIDs safely.
  - Add `resolvePortPrecedence(args, mergedConfig)`: compute `{ companionPort, debugPort, proxyPort, devPort, companionConflict, autoResolve }` using `CLI flag > mergedConfig.ports > defaults (7300 / 9222 / undefined / undefined / "shift" / false)`. Validate explicit numeric CLI flags (`--port`, `-p`, `--debug-port`, `--proxy-port`, `--dev-port`) as integers in `1..65535`, throwing a usage error (mapped to exit code `2` in CLI) on invalid inputs.
  - Add `probeCompanionStatus(port, timeoutMs?)`: query `GET /status` (`{ ok, pid, projectRoot, debugPort }`), falling back to `GET /ping` (`"pong"`) if `/status` is `404` or non-JSON.
  - Extend `resolveCompanionPort` backward-compatibly so `resolveCompanionPort(requestedPort, targetPort?)` still passes existing callers/tests while structured calls `resolveCompanionPort({ requestedPort, projectRoot, excludePorts, conflictPolicy, probeStatusFn })`:
    - Poll `isPortFree(requestedPort)` cleanly up to `3000ms` (every `100ms`) after sending `/shutdown` instead of a single `700ms` sleep.
    - Same `projectRoot` -> send `/shutdown`, poll until free, reclaim `requestedPort` (fallback to next free port only if ghost port remains stuck).
    - Different `projectRoot` (or legacy `/ping`-only responder): `"shift"` (default) finds next free port excluding `excludePorts` and logs an informational notice identifying the active project/port; `"takeover"` sends `/shutdown` + polls; `"fail"` throws an actionable error naming owner PID/project and `--port` / `ports.companionConflict`.
    - Non-HoverSource process occupying `requestedPort`: `"fail"` throws with process name/PID; `"shift"` / `"takeover"` shifts to next free port + logs notice.
  - Add `bindServerWithRetry(bindFn, opts)` (or wrap `startCompanionServer` / `startProxy` async bind retries) to step to next free port on transient `EADDRINUSE`/`EACCES` TOCTOU errors without changing `startCompanionServer`'s synchronous signature in `server.ts`.
- [x] 2. **Eliminate prompts, fix port ordering & `debugPort` sync, and add Web stdout port sniffing**:
  - **Files:** **[MODIFY]** [port.ts](file:///d:/Projects/HoverSource/packages/cli/src/port.ts), **[MODIFY]** [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts), **[MODIFY]** [ElectronCdpLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/ElectronCdpLauncher.ts), **[MODIFY]** [WebProxyLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/WebProxyLauncher.ts)
  - Zero-prompt `debugPort` resolution (`resolveDebugPort` / updated `resolveDebugPortConflicts`): remove `askQuestion` `(y/N)` prompts and tracked-file `--remote-debugging-port` source mutations from the default flow. If `debugPort` is busy: auto-kill silently when `isZombieOfProject(pid, projectRoot)` is `true`; otherwise auto-shift to next free port (`resolvedDebugPort`) excluding `[...excludePorts]` and log notice (`Debug port <old> in use by <proc>; using <new>.`). Remove unused/duplicate `checkDebugPortInUse` helper from `cli.ts`.
  - Zero-prompt `resolveDevServerPort` / Electron handling: same-project zombie -> auto-kill silently. In `"electron"` mode, if an external non-project process occupies `expectedPort`, terminate ONLY when `autoResolve === true` (`--auto-resolve` or `mergedConfig.autoResolvePortConflicts === true`); otherwise fail fast (no `(Y/n)` prompt, no blind non-TTY auto-kill) with actionable error identifying process name, PID, `--auto-resolve`, and `hs config set autoResolvePortConflicts true`.
  - Unify `cli.ts` `hs start` / `restart` / target-or-exec port pipeline:
    - Load `mergedConfig = loadMergedConfig(projectRoot)` and apply `resolvePortPrecedence(args, mergedConfig)`.
    - Resolve `expectedDevPort` (`ports.dev` override if set, else `detectDevServerPort(projectRoot, execCommand)` or URL port from `--target`) and `resolvedDebugPort` (for Electron, excluding `[expectedDevPort]`) **BEFORE** starting `startCompanionServer`, passing the final `resolvedDebugPort` to `startCompanionServer` so `server.ts` hot-reload broadcasts match CDP targets.
    - Resolve `companionPort` excluding `[expectedDevPort, resolvedDebugPort]` via updated `resolveCompanionPort`, and pass resolved `devPort` / `debugPort` / `proxyPort` into `LaunchConfig` so launchers do not re-resolve a conflicting `debugPort`.
  - `WebProxyLauncher.ts` stdout/stderr port sniffing & proxy port overrides:
    - Spawn child with `stdio: ["inherit", "pipe", "pipe"]`, forwarding chunks intact to `process.stdout` and `process.stderr` while preserving `FORCE_COLOR: "1"` when `process.stdout.isTTY` and `!NO_COLOR` / `!args["no-color"]`.
    - Parse ANSI-stripped output chunks for local listening URLs (`http(s)://(localhost|127.0.0.1|0.0.0.0|[::1]):<port>`, ignoring HoverSource's own `serverPort` / `resolvedDebugPort` / `proxyPort`) and race against `waitForServer(targetDevPort)`: if the dev server binds another live port (e.g. Vite fell back from `5173` to `5174`), update `targetDevPort` automatically.
    - Pass resolved `proxyPort` override (`ports.proxy` / `--proxy-port`) into `runProxyMode`, excluding `[serverPort, targetDevPort, resolvedDebugPort]`.
- [x] 3. **Behavioral tests for port primitives, conflict policies, zero-prompt flows, and stdout sniffing**:
  - **Files:** **[MODIFY]** [cli.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/cli.test.ts), **[NEW]** [port.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/port.test.ts)
  - Keep existing 5 tests in `cli.test.ts` passing unchanged.
  - Add unit/integration tests covering:
    - `resolvePortPrecedence` (`CLI > config > defaults`, exit/error on invalid `--port`/`--debug-port`/`--proxy-port`/`--dev-port`).
    - `probeHostPort` waiting for socket close and returning `false` on `EADDRINUSE` and mocked `EACCES`.
    - `netstat -ano` parser matching exact `:port` `LISTENING` boundary (e.g. `:730` must not match `:7300` or remote foreign address).
    - `resolveCompanionPort` against real ephemeral HTTP `/status` & `/ping` servers for `"shift"` (default, leaves other-project companion running and shifts), `"takeover"` (calls `/shutdown`), `"fail"` (throws), and same-project auto-takeover.
    - Zero-prompt `debugPort` auto-shift when occupied by another listener (no `askQuestion`), and Electron `resolveDevServerPort` failing fast when occupied externally with `autoResolve: false`.
    - Stdout dev-URL sniffer helper extracting actual listening port from ANSI-colored framework logs (`Local: http://localhost:5174/`).

## Acceptance Criteria
- [x] `hs start`, `hs restart`, `hs dashboard`, and `hs config` honor `CLI flag > project .hoversourcerc > global ~/.hoversourcerc > defaults` port precedence.
- [x] `hs start` executes zero interactive `(y/N)` port prompts, never kills another project's running companion under default `"shift"` policy, passes final resolved `debugPort` into `startCompanionServer`, and detects dynamically shifted Web dev server ports via stdout sniffing.
- [x] `probeHostPort`, `getPidUsingPort`, and `resolveCompanionPort` eliminate socket-close race conditions, Windows `EACCES` false positives, and `:port` substring PID matches.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
