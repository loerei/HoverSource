# PRD: CLI Dashboard Command, Config Store, and Settings Management

- **Change Mode:** `BROWNFIELD`
- **Operational Continuity:** `NON_CONTINUOUS_OPERATION` (`!NC`)
- **Reviewed-At-Commit:** `ec5b5b609cc1b3becf31ead6dc80ea0b768e9b68`

## Problem Statement

1. **Dashboard cannot be launched standalone via a dedicated CLI command**:
   - In [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts), `hs -d` without a subcommand falls into `showHelp()` and exits. `hs start -d` launches the target application if `package.json` defines a `start` script instead of opening only the HoverSource dashboard, and lacks a subcommand to open the dashboard against an already-running companion server.
2. **No CLI path to inspect or update `.hoversourcerc` settings**:
   - All config reading, merging, validation, and saving (`~/.hoversourcerc` and `<project>/.hoversourcerc`) lives privately inside [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) without schema bounds, atomic writes, or unit tests.
   - `getArgs()` in [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) captures only one `subcommand` and discards additional positional arguments, while [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) writes HoverSource logs to `stdout` (incompatible with machine-readable `--json` output).

## Solution

1. **Extract `configStore` seam in `@hoversource/companion-server` (`S`)**:
   - Move config persistence, merging, recent-project tracking, and schema validation out of [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) into `configStore.ts` with injected `globalConfigPath` test seams, strict boundary parsing (`Parse, Don't Validate`), corrupt-file quarantine, and atomic sibling file writes (`tmp -> fsync -> rename`).
   - Add `POST /reload-config` to [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) so external writers (such as the CLI) can trigger live hot-reload broadcasts to connected browser/Electron targets.
2. **Extract multi-positional CLI parser & stream-safe logging (`S`)**:
   - Extract `args.ts` from [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) returning `positionals: string[]` alongside existing short/long flags, and extend [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) to support `stderr`-only routing and `NO_COLOR` / `--no-color` for `--json` commands.
3. **Add `hs dashboard` and `hs config` commands (`B`)**:
   - `hs dashboard` (and standalone `hs -d` / `hs --dashboard`) opens the dashboard on an already-running companion server if present on `--port`, or starts a companion server and opens `/dashboard` if none is running.
   - `hs config <list|show|get|set|reset|delete>` inspects and updates global or project `.hoversourcerc` settings with dot-path keys, `--json`, `--dry-run`, `--yes` / non-TTY fail-fast (`exit 2`), and automatic `POST /reload-config` notification when a companion server is active.

## User Stories

1. As a developer, I want to run `hs dashboard` or `hs -d` directly to open the configuration UI without starting a full app proxy or Electron session.
2. As a developer or AI agent, I want to inspect (`hs config list --json`, `hs config get <key>`) and update (`hs config set <key> <value>`, `hs config reset`, `hs config delete`) HoverSource settings from the terminal with immediate validation and live hot-reload when a companion server is running.

## Implementation Decisions

- **Single source of truth for config**: `packages/companion-server/src/configStore.ts` owns `DEFAULT_CONFIG`, schema validation, dot-path resolution/mutation, atomic disk writes, and corrupt JSON quarantine. Both HTTP `/config` routes and CLI `hs config` consume `configStore` directly.
- **Hot-reload bridge**: After `hs config set|reset|delete` commits on disk, the CLI checks `GET http://127.0.0.1:<port>/ping`; if `"pong"`, it sends `POST http://127.0.0.1:<port>/reload-config` so `server.ts` re-reads merged config for its active `projectRoot` and calls `broadcastToTargets`.
- **Stream & POSIX exit-code contract**: Under `--json` or `--no-color`, diagnostics go strictly to `stderr` (`logger.ts` `stderrOnly` mode) and `stdout` emits only valid JSON. Usage/validation/non-TTY prompt failures exit with code `2`; I/O/runtime errors exit with code `1`; success exits with `0`.
- **Subcommand precedence**: `dashboard` and `config` are built-in CLI commands alongside `restart`. Projects with an npm script named `dashboard` or `config` can still run it via `hs -e "npm run <script>"`.

## Intentional Deltas

> **Default Preserve (`BROWNFIELD`):** All existing CLI subcommands (`start`, `restart`, npm script execution, `-t`, `-e`, `-r`, `-p`, `--debug-port`, `--proxy-port`, `--auto-resolve`), dashboard HTTP routes, and `.hoversourcerc` file formats default to **PRESERVE**; only deltas explicitly listed below may change.

- **`INTENTIONALLY_CHANGED`**:
  - Running `hs -d` / `hs --dashboard` without `-t`, `-e`, or a subcommand opens the dashboard instead of printing help and exiting.
  - `dashboard` and `config` are reserved built-in CLI subcommands (overriding implicit `package.json` script lookup of the same name).
  - Config writes in `companion-server` validate inputs at ingress (`400` JSON on invalid fields/bounds) and use atomic sibling replacement + corrupt-file backup rather than in-place `fs.writeFileSync`.

## Testing Decisions

- **Unit seams**: Direct tests on `configStore.ts` (temp dir + injected `globalConfigPath`, validation bounds, atomic write/corrupt quarantine, dot-path get/set), `args.ts` (multi-positional + backward-compatible flag parity), `dashboard.ts` (reusing running `/ping` server vs starting new server), and `config.ts` (`--json` stdout purity, non-TTY exit `2`, `--dry-run`, invalid key/value exit `2`, `/reload-config` integration) via Vitest (`pnpm test`).

## Out of Scope

- Migrating existing `.hoversourcerc` files to a new `schemaVersion` envelope (preserve flat `.hoversourcerc` JSON compatibility with `dashboard.html` and existing user files).
- Rewriting `dashboard.html` UI or adding new config fields to `DEFAULT_CONFIG`.

## Tickets

- `01` — Extract `configStore` module with schema validation, atomic writes, and reload route (`tickets/01-extract-config-store-and-reload-route.md`)
- `02` — Extract CLI argument parser and stream-safe logger (`tickets/02-extract-cli-args-and-stream-logger.md`)
- `03` — Add `hs dashboard` command and standalone `-d` handling (`tickets/03-add-cli-dashboard-command.md`)
- `04` — Add `hs config` inspect, update, reset, and delete commands (`tickets/04-add-cli-config-commands.md`)
