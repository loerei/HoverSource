# 02 — Extract CLI argument parser and stream-safe logger

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Preparatory structural refactoring (`S`) extracting CLI argument parsing into a dedicated module supporting multi-positional subcommands (`hs config get <key>`) and `--dev-port`, and updating [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) so `--json` and `--no-color` keep `stdout` clean.

- [x] 1. **Multi-positional CLI argument parser**:
  - **Files:** **[NEW]** [args.ts](file:///d:/Projects/HoverSource/packages/cli/src/args.ts)
  - Export `ParsedCliArgs = { args: Record<string, string | boolean>; subcommand?: string; positionals: string[] }` and `parseCliArgs(argv: string[]): ParsedCliArgs`.
  - Preserve 100% existing long and short option behavior (`-p`/`--port`, `-t`/`--target`, `-e`/`--exec`, `-r`/`--root`, `-d`/`--dashboard`, `-h`/`--help`, `-v`/`--vue`, `-s`/`--solid`, `-a`/`--angular`, `--debug-port`, `--proxy-port`, `--auto-resolve`).
  - Support new flags cleanly (`--dev-port`, `--json`, `--global`, `--local`, `--yes`, `-y`, `--dry-run`, `--no-color`, `--verbose`, `-q`/`--quiet`, `--merged`) and collect all non-flag arguments in `positionals` (with `subcommand = positionals[0]`).
  - Support `--` end-of-options sentinel or negative/quoted value passing for value flags when needed, without breaking `--flag=val` or `-p 7300`.
- [x] 2. **Add `stderrOnly` and `noColor` controls to stream-safe logger**:
  - **Files:** **[MODIFY]** [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts)
  - Extend `setupConsoleMonkeypatch(options?: { stderrOnly?: boolean; noColor?: boolean })`:
    - Strip ANSI color escapes when `options?.noColor` is `true` or `process.env.NO_COLOR` is set or `!process.stdout.isTTY`.
    - When `options?.stderrOnly` is `true` (used when `--json` is active), route `logger.info`, `logger.success`, and HoverSource `console.log` calls to `originalError` (`stderr`) so `stdout` carries strictly machine-readable JSON.
- [x] 3. **Delegate CLI parsing to `parseCliArgs` and configure logger flags**:
  - **Files:** **[MODIFY]** [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts)
  - Replace inline `getArgs()`/`parseLongOption`/`parseShortOption` with `parseCliArgs(process.argv.slice(2))`.
  - Pass `{ stderrOnly: Boolean(args.json), noColor: Boolean(args["no-color"] || args.json) }` into `setupConsoleMonkeypatch(...)` at startup.
- [x] 4. **Unit tests for `parseCliArgs` and stream-safe logger**:
  - **Files:** **[NEW]** [args.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/args.test.ts)
  - Test single subcommand (`start`, `restart`), multi-positional commands (`config set shortcuts.copyMetadata.key k`), short options with and without `=`, `--dev-port=5174`, `-y`/`--yes`/`--json`/`--dry-run`, and `setupConsoleMonkeypatch({ stderrOnly: true, noColor: true })` routing `console.log("[HoverSource] ...")` to `stderr` without ANSI codes.

## Acceptance Criteria
- [x] `parseCliArgs` collects `positionals` accurately while preserving 100% existing option mappings (`-p`, `-t`, `-e`, `-r`, `-d`, `-h`, `-v`, `-s`, `-a`, `--debug-port`, `--proxy-port`, `--auto-resolve`) and supporting `--dev-port`.
- [x] `setupConsoleMonkeypatch({ stderrOnly: true, noColor: true })` routes HoverSource logs to `stderr` with zero ANSI codes, leaving `stdout` untouched.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
