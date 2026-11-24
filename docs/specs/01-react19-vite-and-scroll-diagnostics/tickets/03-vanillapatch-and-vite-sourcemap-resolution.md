# 03 — Harden `vanillaPatch` frame filtering and `companion-server` Vite URL/sourcemap resolution

## Epic
PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

## Status
ready-for-agent

## Blocked by
- `01` — Extract stack-frame parser and companion source-location module

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Prevent [vanillaPatch.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/vanillaPatch.ts) from misattributing framework/bundler runtime internals (`react-dom_client.js`) and upgrade `@hoversource/companion-server` to normalize Vite `/@fs/` + `?query` paths and decode loopback dev-server inline/same-origin SourceMap v3 mappings for exact `.tsx`/`.jsx` line/column numbers.

- [x] 1. **[MODIFY]** [`vanillaPatch.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/vanillaPatch.ts) — Filter `node_modules/` and `.vite/deps/` frames and strip query noise
  - Update `captureSourceLocation()` to skip any stack frame matching `isBundlerOrRuntimeFrame(line)` from `@hoversource/source-resolver` (in addition to `isOverlayFrame(line)`).
  - Clean `?query`/`#hash` via `stripQueryAndHash` before stamping `dataset.hsSource`.
  - If all non-overlay stack frames are inside `node_modules/` or `.vite/deps/` (e.g., React creating DOM nodes inside `react-dom_client.js`), return `null` instead of stamping a library path onto `el.dataset.hsSource`.
- [x] 2. **[MODIFY]** [`vanillaPatch.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/vanillaPatch.test.ts) — Verify bundler/runtime frame exclusion
  - Keep existing `document.createElement` and `innerHTML` assertions intact.
  - Add unit test verifying that when `Error.stack` contains only HoverSource + `node_modules/.vite/deps/react-dom_client.js` frames (or skips `react-dom_client.js` to reach app code), `react-dom_client.js` is never stamped onto `dataset.hsSource`.
- [x] 3. **[NEW]** [`sourceMap.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/sourceMap.ts) — Zero-dependency SourceMap v3 VLQ decoder and loopback dev-URL fetcher
  - Implement Base64 VLQ decoding for SourceMap v3 `mappings` to map 1-indexed `(compiledLine, compiledColumn)` (matching both exact and closest preceding segment on `compiledLine`) back to 1-indexed original `{ source, line, column }`.
  - Implement `resolveSourceMapFromDevUrl(rawFileUrl: string, compiledLine: number, compiledColumn: number, options?: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch }): Promise<{ source?: string; line: number; column: number } | null>`:
    - **SSRF Guard**: Parse `rawFileUrl` with `new URL()`. Reject (return `null`) unless `protocol === "http:"` and `hostname` is strictly loopback (`"localhost"`, `"127.0.0.1"`, or `"::1"`).
    - Enforce `AbortSignal.timeout(options?.timeoutMs ?? 1500)` and bounded response size (`options?.maxBytes ?? 5 * 1024 * 1024`).
    - Extract trailing `//# sourceMappingURL=...`:
      - If `data:application/json;...base64,...`, decode inline JSON sourcemap.
      - If relative or same-origin loopback `.map` URL, fetch from the same origin (re-checking loopback guard) and parse JSON.
    - Return mapped `{ source, line, column }` (1-indexed; fallback column `1` if `0`), or `null` on non-200, missing sourcemap, or unmapped line.
- [x] 4. **[MODIFY]** [`sourceLocation.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/sourceLocation.ts) — Normalize `/@fs/` + `?query` and add async sourcemap-first validation
  - Update `resolveFilePath(fileParam, projectRoot)`:
    - Strip `?query` and `#hash` before path resolution.
    - Handle Vite `/@fs/` prefix (`http://localhost:5173/@fs/D:/...` or `/@fs/D:/...`) so `/@fs/D:/Projects/...` resolves to `D:/Projects/...` (`path.isAbsolute` check after stripping `/@fs/` and leading `/` before Windows drive letter).
  - Export `async function validateSourceLocation(fileParam: string, projectRoot: string, line: number, col: number, tagName?: string, classes?: string[], options?: { timeoutMs?: number; fetchImpl?: typeof fetch })`:
    - Resolve `absolutePath = resolveFilePath(fileParam, projectRoot)`.
    - If `fileParam` is an `http:` loopback URL, attempt `resolveSourceMapFromDevUrl(fileParam, line, col, options)` first. If a valid mapped `line >= 1` is returned (and if `source` maps cleanly or matches file basename), validate/return `{ line, column, correctedFile: absolutePath }`.
    - Otherwise fall back cleanly to `verifyAndCorrectSourceLocation(absolutePath, line, col, tagName, classes)`.
- [x] 5. **[MODIFY]** [`server.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) — Wire async `validateSourceLocation` into `/validate-line`
  - Update `handleValidateLine` to call `await validateSourceLocation(...)` and handle async errors cleanly in `routeRequest` (returning 500 JSON rather than unhandled promise rejection).
- [x] 6. **[NEW]** [`sourceMap.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/sourceMap.test.ts) and **[MODIFY]** [`sourceLocation.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/sourceLocation.test.ts), [`server.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/server.test.ts) — Verify VLQ decoding, SSRF guards, `/@fs/` paths, and `/validate-line`
  - Test programmatic SourceMap v3 VLQ mapping (e.g. transpiled line 12 -> original line 5 col 8), non-loopback URL rejection (`https://example.com/...` or `http://169.254.169.254/...`), timeout/404 fallback, `/@fs/D:/...` + `?t=...` normalization, and an end-to-end HTTP test hitting `/validate-line` against a local mock dev server returning transpiled JS with an inline base64 sourcemap.

## Acceptance Criteria
- [x] `vanillaPatch.ts` never stamps `node_modules/` or `.vite/deps/` paths into `data-hs-source`.
- [x] `resolveFilePath` resolves `/@fs/D:/...` and strips `?v=...`/`?t=...`/`#...` accurately on Windows and POSIX paths.
- [x] `sourceMap.ts` rejects all non-loopback URLs before making any network request and decodes inline base64 SourceMap v3 mappings to original 1-indexed line and column.
- [x] `/validate-line` uses sourcemap coordinates when available and falls back cleanly to `verifyAndCorrectSourceLocation` when unreachable or unmapped.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
