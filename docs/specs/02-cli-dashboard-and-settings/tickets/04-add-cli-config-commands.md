# 04 — Add `hs config` inspect, update, reset, and delete commands

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
- `01` — Extract `configStore` module with schema validation, atomic writes, and reload route
- `02` — Extract CLI argument parser and stream-safe logger
- `05` — Add `ports` config schema, `GET /status` endpoint, and Dashboard port UI

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Add `hs config` CLI subcommands (`list`, `show`, `get`, `set`, `reset`, `delete`) backed by `@hoversource/companion-server/config`, supporting `ports.*` settings, POSIX exit codes, `--json`, `--dry-run`, `--yes` non-TTY safety, and automatic `POST /reload-config` broadcast on the resolved companion port when running.

- [ ] 1. **CLI config inspection and mutation command handler**:
  - **Files:** **[NEW]** [config.ts](file:///d:/Projects/HoverSource/packages/cli/src/commands/config.ts)
  - Export `runConfigCommand(opts: ConfigCommandOptions): Promise<number>`:
    - Determine scope from flags (`--global`, `--local`, `--merged`):
      - Reject conflicting scope flags (`--global` + `--local`) with exit code `2` and actionable error on `stderr`.
      - For read actions (`list`, `show`, `get`), default to `merged`; for mutating actions (`set`, `reset`, `delete`), default to `local`.
    - Support actions (`positionals[1]`, defaulting to `"list"` when omitted):
      - `list` / `show`: Read via `loadMergedConfig` (for `merged`) or `getConfigForTarget` (for `global`/`local`). Under `--json`, print `{ target, path, exists, config }` to `stdout`; otherwise print formatted config path and JSON/key-value summary. Return `0`.
      - `get <keyPath>`: Require `keyPath` (exit `2` if missing). Resolve via `getConfigValueByPath`; exit `2` if key path is unknown. Under `--json`, print `{ key, value, target }` to `stdout`; otherwise print the value. Return `0`.
      - `set <keyPath> <value>`: Require `keyPath` and `value` (exit `2` if missing). Validate & build delta via `buildDeltaFromKeyValue(keyPath, value)` (supports scalar/shortcut/filter fields and `ports.companion`, `ports.debug`, `ports.proxy`, `ports.dev` including `auto`/`null` clearing, and `ports.companionConflict`; exit `2` on invalid key, type, or out-of-range value). If `--dry-run`, preview delta without writing disk and return `0`. Otherwise write atomically via `saveConfigDelta` and trigger `notifyCompanionReload(requestedPort)` (`GET /ping` -> if `"pong"`, `POST /reload-config`).
      - `reset`: Reset `--local` or `--global` config via `resetConfigTarget` (respecting `--dry-run`). Require `--yes` when `!stdinIsTTY || process.env.CI === "true"` (exit `2` with `--yes` remediation message); in interactive TTY, prompt `(y/N)`. Trigger `notifyCompanionReload`.
      - `delete`: Delete `<project>/.hoversourcerc` via `deleteConfigTarget` (reject `--global` with exit `2`; enforce `--yes` / TTY prompt and `--dry-run`). Trigger `notifyCompanionReload`.
      - Unknown sub-action: print usage hint to `stderr` and return `2`.
- [ ] 2. **Wire `hs config` and config-backed reload port in `cli.ts`**:
  - **Files:** **[MODIFY]** [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts)
  - Route `subcommand === "config"` to `runConfigCommand(...)` (defaulting `requestedPort` to `CLI flag > loadMergedConfig(projectRoot).ports?.companion ?? 7300`) and set `process.exitCode = code` (avoiding dangling open handles).
  - Update `showHelp()` with `hs config <list|get|set|reset|delete>` usage and flags (`--global`, `--local`, `--merged`, `--json`, `--dry-run`, `--yes`).
- [ ] 3. **Unit & integration tests for `hs config`**:
  - **Files:** **[NEW]** [config.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/config.test.ts)
  - Use isolated `os.tmpdir()` `globalConfigPath` + `projectRoot` cleaned up in `afterEach`:
    - Test `list` / `show` (`--merged`, `--global`, `--local`) and `--json` stdout purity.
    - Test `get` valid dot-paths (`shortcuts.copyMetadata.key`, `ports.debug`) and unknown key exit code `2`.
    - Test `set` valid updates (`theme`, `maxTraversalDepth`, boolean flags, dot-path shortcuts, `ports.debug 9223`, `ports.dev auto`, `ports.companionConflict takeover`), invalid value exit code `2` (`maxTraversalDepth: 999`, `ports.debug: 70000`, `ports.companionConflict: invalid`), conflicting `--global --local` exit code `2`, and `--dry-run` leaving files unmodified.
    - Test `delete` refusing `--global` (`exit 2`), failing fast with `exit 2` when `!stdinIsTTY` without `--yes`, and succeeding with `--yes`.
    - Test live `notifyCompanionReload`: spin up an HTTP companion server on an ephemeral port and assert `hs config set` triggers `POST /reload-config`.

## Acceptance Criteria
- [ ] `hs config list|get|set|reset|delete` accurately reads, validates, and atomically writes global or local `.hoversourcerc` files including `ports.*`.
- [ ] Invalid keys, out-of-range values, `--global` deletion, and non-TTY destructive calls without `--yes` deterministically return exit code `2` with actionable error text on `stderr`.
- [ ] `--json` outputs strictly valid JSON to `stdout` with zero log contamination.
- [ ] When a companion server responds `"pong"` on `--port` (or configured `ports.companion`), `hs config set|reset|delete` calls `POST /reload-config`.
- [ ] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
