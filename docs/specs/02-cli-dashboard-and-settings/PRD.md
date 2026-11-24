# PRD: CLI Dashboard Command, Config Store, and Settings Management

- **Change Mode:** `BROWNFIELD`
- **Operational Continuity:** `NON_CONTINUOUS_OPERATION` (`!NC`)
- **Reviewed-At-Commit:** `3e39f91260186fab188f171dbda9f0ac32d0fa0c`

## Problem Statement

1. **Dashboard cannot be launched standalone via a dedicated CLI command**:
   - In [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts), `hs -d` without a subcommand falls into `showHelp()` and exits. `hs start -d` launches the target application if `package.json` defines a `start` script instead of opening only the HoverSource dashboard, and lacks a subcommand to open the dashboard against an already-running companion server.
2. **No CLI path to inspect or update `.hoversourcerc` settings**:
   - Previously, all config reading, merging, validation, and saving (`~/.hoversourcerc` and `<project>/.hoversourcerc`) lived privately inside [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) without schema bounds, atomic writes, or unit tests (resolved via Ticket `01`).
   - `getArgs()` in [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) captures only one `subcommand` and discards additional positional arguments, while [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) writes HoverSource logs to `stdout` (incompatible with machine-readable `--json` output).
3. **Port preferences are not configurable and `hs start` port resolution interrupts UX**:
   - Users cannot persist `companion`, `debug`, `proxy`, or `dev` port preferences or multi-project companion conflict policies in `.hoversourcerc` or [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html), forcing repeated flags like `--debug-port=9223`.
   - In [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) and [port.ts](file:///d:/Projects/HoverSource/packages/cli/src/port.ts), `hs start` binds `companionServer` before resolving `devPort`/`debugPort` (leaving `server.ts` with a stale `debugPort` on Electron shifts and making `resolveAllPorts` dead code), kills other projects' running companion instances on `7300` without checking project identity, pauses for blocking `(y/N)` prompts on `debugPort`/Electron conflicts, uses substring `netstat | findstr` matching and racy `isPortFree()` probes that ignore `EACCES`, and misses auto-incremented dev server ports in [WebProxyLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/WebProxyLauncher.ts).

## Solution

1. **Extract `configStore` seam in `@hoversource/companion-server` (`S`, Completed in `01`)**:
   - Move config persistence, merging, recent-project tracking, and schema validation out of [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) into [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts) with injected `globalConfigPath` test seams, strict boundary parsing (`Parse, Don't Validate`), corrupt-file quarantine, and atomic sibling file writes.
   - Add `POST /reload-config` to [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) for live hot-reload broadcasts.
2. **Add `ports` config schema, `GET /status`, and Dashboard Port UI (`S`/`B`)**:
   - Extend [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts) with optional `ports` (`companion`, `debug`, `proxy`, `dev`, `companionConflict: "shift" | "takeover" | "fail"`), supporting explicit `null` / `"auto"` clearing of `proxy`/`dev` overrides.
   - Expose `GET /status` (`{ ok, pid, port, projectRoot, debugPort }`) in [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) while keeping `GET /ping` returning `"pong"`.
   - Expose all `ports` fields and `companionConflict` policy controls on [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html).
3. **Extract multi-positional CLI parser & stream-safe logging (`S`)**:
   - Extract `args.ts` from [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) returning `positionals: string[]` alongside existing short/long flags (including `--dev-port`), and extend [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) with `stderrOnly` and `noColor` for `--json` commands.
4. **Add `hs dashboard` and `hs config` commands (`B`)**:
   - `hs dashboard` (and standalone `hs -d` / `hs --dashboard`) reads configured companion port defaults, opens the dashboard on an active companion server, or starts one cleanly.
   - `hs config <list|show|get|set|reset|delete>` inspects and updates global or project `.hoversourcerc` settings (including `ports.*`) with dot-path keys, `--json`, `--dry-run`, `--yes` / non-TTY fail-fast (`exit 2`), and automatic `POST /reload-config` notification on the resolved companion port.
5. **Overhaul `hs start` port orchestration to be prompt-free and config-driven (`B`)**:
   - Apply strict port precedence (`CLI flag > project .hoversourcerc > global ~/.hoversourcerc > defaults`), resolve `devPort` and `debugPort` before binding `companionServer`, replace `probeHostPort` race / `EACCES` / `findstr` substring bugs, auto-shift HoverSource-owned ports (`companion`, `proxy`, `debug`) without prompts (honoring `ports.companionConflict`, defaulting to `"shift"` with log notice), tee-sniff live dev server URLs in [WebProxyLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/WebProxyLauncher.ts), and fail fast on non-project Electron `devPort` blockers unless `autoResolvePortConflicts` / `--auto-resolve` is enabled.

## User Stories

1. As a developer, I want to run `hs dashboard` or `hs -d` directly to open the configuration UI without starting a full app proxy or Electron session.
2. As a developer or AI agent, I want to inspect (`hs config list --json`, `hs config get <key>`) and update (`hs config set <key> <value>`, `hs config reset`, `hs config delete`) HoverSource settings from the terminal with immediate validation and live hot-reload when a companion server is running.
3. As a developer, I want to configure preferred companion, debug, proxy, and dev ports as well as multi-project conflict policy in `.hoversourcerc` or Dashboard UI, and run `hs start` smoothly without interactive port prompts or cross-project kills.

## Implementation Decisions

- **Single source of truth for config**: [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/configStore.ts) owns `DEFAULT_CONFIG`, schema validation, dot-path resolution/mutation, atomic disk writes, and corrupt JSON quarantine. Both HTTP `/config`, Dashboard UI, and CLI consume `configStore` directly.
- **Port schema & precedence**:
  - `DEFAULT_CONFIG.ports = { companion: 7300, debug: 9222, companionConflict: "shift" }`, with optional `proxy?: number` and `dev?: number` omitted when auto. Setting `proxy` or `dev` to `null` (via Dashboard clear, HTTP delta, or `hs config set ports.dev auto`) deletes that key from the target `.hoversourcerc`.
  - Precedence everywhere (`hs start`, `hs restart`, `hs dashboard`, `hs config`): `CLI flag (--port, --debug-port, --proxy-port, --dev-port) > project .hoversourcerc > global ~/.hoversourcerc > built-in defaults`. Invalid CLI port flags fail with exit code `2`.
- **Companion identity & conflict policy (`GET /status`)**:
  - `GET /status` returns `{ ok: true, pid, port, projectRoot, debugPort }` (while `GET /ping` continues returning `"pong"`).
  - When `requestedPort` runs another HoverSource companion: same `projectRoot` replaces seamlessly (`/shutdown` + poll loop); different `projectRoot` (or legacy `/ping`-only responder) honors `ports.companionConflict`: `"shift"` (default, auto-shift to next free port + log notice), `"takeover"` (`/shutdown` + reclaim), or `"fail"` (exit `1` with owner details).
- **Zero-prompt `hs start` pipeline**:
  - Resolve `devPort` -> `debugPort` (same-project zombies killed silently; external processes trigger auto-shift + notice rather than prompting or editing user files) -> bind `companionPort` (passing final `resolvedDebugPort` to `startCompanionServer`) -> launch target -> [WebProxyLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/WebProxyLauncher.ts) tees ANSI-preserved `stdout`/`stderr` to catch real dev URLs alongside `waitForServer` -> bind `proxyPort`.
  - Electron external `devPort` blockers kill only when `--auto-resolve` or `autoResolvePortConflicts === true`; otherwise fail fast (`exit 1`) reporting exact PID and process name.
- **Stream & POSIX exit-code contract**: Under `--json` or `--no-color`, diagnostics go strictly to `stderr` (`logger.ts` `stderrOnly` mode) and `stdout` emits only valid JSON. Usage/validation/non-TTY prompt failures exit with code `2`; I/O/runtime errors exit with code `1`; success exits with `0`.
- **Subcommand precedence**: `dashboard` and `config` are built-in CLI commands alongside `restart`. Projects with an npm script named `dashboard` or `config` can still run it via `hs -e "npm run <script>"`.

## Intentional Deltas

> **Default Preserve (`BROWNFIELD`):** All existing CLI subcommands (`start`, `restart`, npm script execution, `-t`, `-e`, `-r`, `-p`, `--debug-port`, `--proxy-port`, `--auto-resolve`), existing `startCompanionServer(...)` sync return contract, dashboard HTTP routes, and flat `.hoversourcerc` file compatibility default to **PRESERVE**; only deltas explicitly listed below may change.

- **`INTENTIONALLY_CHANGED`**:
  - Running `hs -d` / `hs --dashboard` without `-t`, `-e`, or a subcommand opens the dashboard instead of printing help and exiting.
  - `dashboard` and `config` are reserved built-in CLI subcommands (overriding implicit `package.json` script lookup of the same name).
  - Config writes in `companion-server` validate inputs at ingress (`400` JSON on invalid fields/bounds) and use atomic sibling replacement + corrupt-file backup rather than in-place `fs.writeFileSync`.
  - `HoverSourceConfig` adds `ports` (`companion`, `debug`, `proxy`, `dev`, `companionConflict`), and [dashboard.html](file:///d:/Projects/HoverSource/packages/companion-server/src/dashboard.html) adds corresponding form controls inside `General Preferences`.
  - `hs start` removes interactive `(y/N)` port conflict prompts and non-TTY blind Electron auto-kills: HoverSource-owned ports (`companion`, `proxy`, `debug`) auto-shift + log when held externally (other-project companions follow `ports.companionConflict`, defaulting to `"shift"`), while un-shiftable Electron `devPort` external blockers fail fast unless `autoResolvePortConflicts: true` / `--auto-resolve`.

## Testing Decisions

- **Unit seams**: Direct tests on [configStore.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/configStore.test.ts) (`ports` bounds, `"auto"`/`null` override clearing), `server.test.ts` (`GET /status`, `POST /config` port validation, `POST /reload-config`), `args.test.ts` (multi-positional + `--dev-port` + stream logger), `dashboard.test.ts`, `config.test.ts`, and `port.test.ts` / `cli.test.ts` (`probeHostPort` close/EACCES, exact `netstat` PID regex, `/status` policy matrix, zero-prompt `debugPort`/`devPort` behavior, stdout port sniffer) via Vitest (`pnpm test`).

## Out of Scope

- Migrating existing `.hoversourcerc` files to a new `schemaVersion` envelope (preserve flat `.hoversourcerc` JSON compatibility when `ports` is omitted).

## Tickets

- `01` — Extract `configStore` module with schema validation, atomic writes, and reload route (`tickets/01-extract-config-store-and-reload-route.md`)
- `02` — Extract CLI argument parser and stream-safe logger (`tickets/02-extract-cli-args-and-stream-logger.md`)
- `03` — Add `hs dashboard` command and standalone `-d` handling (`tickets/03-add-cli-dashboard-command.md`)
- `04` — Add `hs config` inspect, update, reset, and delete commands (`tickets/04-add-cli-config-commands.md`)
- `05` — Add `ports` config schema, `GET /status` endpoint, and Dashboard port UI (`tickets/05-add-port-config-status-and-dashboard-ui.md`)
- `06` — Overhaul `hs start` port orchestration, conflict policy, and dev port sniffing (`tickets/06-overhaul-start-port-resolution.md`)
