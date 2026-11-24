# 02 — Extract CLI argument parser and stream-safe logger

## Epic
PRD: CLI Dashboard Command, Config Store, and Settings Management

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Preparatory structural refactoring (`S`) extracting CLI argument parsing into a dedicated module supporting multi-positional subcommands (`hs config get <key>`) and updating [logger.ts](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) so `--json` and `--no-color` keep `stdout` clean.

- [ ] 1. **[NEW]** [`args.ts`](file:///d:/Projects/HoverSource/packages/cli/src/args.ts) — Multi-positional CLI argument parser
  - Export `ParsedCliArgs = { args: Record<string, string | boolean>; subcommand?: string; positionals: string[] }` and `parseCliArgs(argv: string[]): ParsedCliArgs`.
  - Preserve 100% existing long and short option behavior (`-p`/`--port`, `-t`/`--target`, `-e`/`--exec`, `-r`/`--root`, `-d`/`--dashboard`, `-h`/`--help`, `-v`/`--vue`, `-s`/`--solid`, `-a`/`--angular`, `--debug-port`, `--proxy-port`, `--auto-resolve`).
  - Support new flags cleanly (`--json`, `--global`, `--local`, `--yes`, `-y`, `--dry-run`, `--no-color`, `--verbose`, `-q`/`--quiet`, `--merged`) and collect all non-flag arguments in `positionals` (with `subcommand = positionals[0]`).
  - Support `--` end-of-options sentinel or negative/quoted value passing for value flags when needed, without breaking `--flag=val` or `-p 7300`.
- [ ] 2. **[MODIFY]** [`logger.ts`](file:///d:/Projects/HoverSource/packages/cli/src/utils/logger.ts) — Add `stderrOnly` and `noColor` controls
  - Extend `setupConsoleMonkeypatch(options?: { stderrOnly?: boolean; noColor?: boolean })`:
    - Strip ANSI color escapes when `options?.noColor` is `true` or `process.env.NO_COLOR` is set or `!process.stdout.isTTY`.
    - When `options?.stderrOnly` is `true` (used when `--json` is active), route `logger.info`, `logger.success`, and HoverSource `console.log` calls to `originalError` (`stderr`) so `stdout` carries strictly machine-readable JSON.
- [ ] 3. **[MODIFY]** [`cli.ts`](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts) — Delegate parsing to `parseCliArgs` and configure logger flags
  - Replace inline `getArgs()`/`parseLongOption`/`parseShortOption` with `parseCliArgs(process.argv.slice(2))`.
  - Pass `{ stderrOnly: Boolean(args.json), noColor: Boolean(args["no-color"] || args.json) }` into `setupConsoleMonkeypatch(...)` at startup.
- [ ] 4. **[NEW]** [`args.test.ts`](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/args.test.ts) — Unit tests for `parseCliArgs` and stream-safe logger
  - Test single subcommand (`start`, `restart`), multi-positional commands (`config set shortcuts.copyMetadata.key k`), short options with and without `=`, `-y`/`--yes`/`--json`/`--dry-run`, and `setupConsoleMonkeypatch({ stderrOnly: true, noColor: true })` routing `console.log("[HoverSource] ...")` to `stderr` without ANSI codes.

## Acceptance Criteria
- [ ] `parseCliArgs` collects `positionals` accurately while preserving 100% existing option mappings (`-p`, `-t`, `-e`, `-r`, `-d`, `-h`, `-v`, `-s`, `-a`).
- [ ] `setupConsoleMonkeypatch({ stderrOnly: true, noColor: true })` routes HoverSource logs to `stderr` with zero ANSI codes, leaving `stdout` untouched.
- [ ] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
