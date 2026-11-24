# 01 — Extract stack-frame parser and companion source-location module

## Epic
PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Preparatory structural refactoring (`S`) separating pure stack-frame/URL parsing into `@hoversource/source-resolver` and path/line validation out of [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) without changing runtime behavior yet.

- [x] 1. **[NEW]** [`stackFrame.ts`](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/stackFrame.ts) — Browser-safe stack-frame and bundler-URL parsing module
  - Export pure helpers (zero `node:*` imports):
    - `stripQueryAndHash(urlOrPath: string): string` — removes `?query` and `#hash` suffixes while preserving Windows drive letters (`D:/...`) and `http(s)://` origins.
    - `normalizeStackPath(rawTarget: string): { fileName: string; isHttpUrl: boolean; hadViteFsPrefix: boolean }` — normalizes `file://` URLs (including Windows `file:///D:/...`), extracts `url.pathname` or preserves `http(s)://` origin when requested, strips `/@fs/` to filesystem path when applicable, and cleans `?query`/`#hash`.
    - `parseV8StackLine(line: string): { functionName?: string; rawLocation: string; fileName: string; lineNumber: number; columnNumber: number } | null` — parses V8/Chromium stack frames (`at fn (url:line:col)` and `at url:line:col`) with 1-indexed positive integers.
    - `isBundlerOrRuntimeFrame(locationOrLine: string): boolean` — matches HoverSource overlay internals, `node_modules/`, `.vite/deps/`, `react-dom`, `react_jsx-dev-runtime`, `react-jsx-dev-runtime`, `react_stack_bottom_frame`, `node:internal`.
- [x] 2. **[MODIFY]** [`index.ts`](file:///d:/Projects/HoverSource/packages/source-resolver/src/index.ts) — Re-export `stackFrame.js`
  - Add `export * from "./adapters/stackFrame.js";` so `@hoversource/overlay-core` consumes it through the public package interface.
- [x] 3. **[MODIFY]** [`vanillaPatch.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/vanillaPatch.ts) — Delegate stack line parsing to `@hoversource/source-resolver`
  - Replace inline `parseStackLine` string-splitting logic with `parseV8StackLine` from `@hoversource/source-resolver`, preserving exact existing `filePath:line:col` output and existing `isOverlayFrame` behavior (frame exclusion hardening happens in Ticket `03`).
- [x] 4. **[NEW]** [`sourceLocation.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/sourceLocation.ts) — Exported path resolution and heuristic line verification module
  - Extract `escapeRegExp`, `tryDirectPath`, `trySrcPath`, `trySymlinkPath`, `checkPackageSubdir`, `tryMonorepoPath`, `resolveFilePath`, `checkCurrentLine`, `searchLineByClasses`, `searchLineByTag`, and `verifyAndCorrectSourceLocation` from [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) with unchanged behavior in this ticket.
  - Export `resolveFilePath(fileParam: string, projectRoot: string): string` and `verifyAndCorrectSourceLocation(...)`.
- [x] 5. **[MODIFY]** [`server.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) — Import path/line helpers from `./sourceLocation.js`
  - Replace the extracted private functions with imports from `./sourceLocation.js` while keeping all HTTP routes (`/validate-line`, `/static-context`, `/open-in-ide`, etc.) behaviorally identical.
- [x] 6. **[NEW]** [`stackFrame.test.ts`](file:///d:/Projects/HoverSource/packages/source-resolver/src/__tests__/stackFrame.test.ts) — Unit tests for stack-frame and URL parsing
  - Test V8 frames with function names, anonymous frames, Windows `file:///D:/...` paths, `http://localhost:5173/...?t=123:45:12`, `/@fs/D:/Projects/...?v=abc:10:2`, and `isBundlerOrRuntimeFrame`.
- [x] 7. **[NEW]** [`sourceLocation.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/sourceLocation.test.ts) — Parity tests for extracted path and line helpers
  - Test `resolveFilePath` (direct, `src/`, `[project]/`, `http://localhost:5173/`, symlinked/monorepo paths) and `verifyAndCorrectSourceLocation` (matching line, class fallback, tag fallback) inside isolated `os.tmpdir()` directories cleaned up in `afterEach`.

## Acceptance Criteria
- [x] `stackFrame.ts` contains zero `node:*` imports and builds cleanly under both `tsc -b` and `pnpm --filter @hoversource/overlay-core build`.
- [x] `vanillaPatch.ts` passes all existing assertions in `vanillaPatch.test.ts` with zero behavioral regressions.
- [x] `resolveFilePath` and `verifyAndCorrectSourceLocation` are exported from `sourceLocation.ts` and tested directly without starting an HTTP server.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
