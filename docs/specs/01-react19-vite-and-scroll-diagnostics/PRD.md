# PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

- **Change Mode:** `BROWNFIELD`
- **Operational Continuity:** `NON_CONTINUOUS_OPERATION` (`!NC`)
- **Reviewed-At-Commit:** `72219629e11e8644fa87dc066f836ae7762780ca`

## Problem Statement

1. **React 19 + Vite/bundler apps fall back to `Vanilla` and `node_modules/.vite/deps/react-dom_client.js`**:
   - [ReactFiberAdapter.ts](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/ReactFiberAdapter.ts) only reads `fiber._debugSource`, which React 19 removed in favor of `fiber._debugStack` (`Error("react-stack-top-frame")`) and updated `fiber._debugOwner` (`Fiber` or `ComponentInfo`).
   - When `ReactFiberAdapter.resolve()` returns `null`, [SourceResolver](file:///d:/Projects/HoverSource/packages/source-resolver/src/index.ts) falls through to [VanillaAdapter.ts](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/VanillaAdapter.ts), which reads `data-hs-source` stamped by [vanillaPatch.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/vanillaPatch.ts). Because `vanillaPatch.ts` only excludes HoverSource's own overlay frames, it stamps `react-dom_client.js` onto React-created DOM nodes.
   - Additionally, Vite dev URLs in `_debugStack` carry `http://localhost:<port>/...`, `/@fs/...`, `?v=...`/`?t=...` query strings, and transpiled line numbers (for example, `SaveEditorContent.tsx:741:25` for a 662-line `.tsx` file whose element is at line 654). [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) does not strip `/@fs/` or `?query` or decode Vite inline sourcemaps during `/validate-line`.

2. **Missing own-element scroll and gutter diagnostics**:
   - [inspector.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.ts) collects `overflow-x`/`overflow-y` on ancestor elements (`Parent Styles`), but `inspectLayoutConstraints()` does not inspect `overflow-x`, `overflow-y`, `scrollbar-gutter`, `clientWidth x clientHeight`, `scrollWidth x scrollHeight`, or scrollbar track thickness (`offset - client`) on the inspected element itself.

## Solution

1. **Preparatory Seam Extraction (`S -> B`)**:
   - Extract a pure, browser-safe stack-frame and bundler-URL utility (`stackFrame.ts`) inside `@hoversource/source-resolver` so both `ReactFiberAdapter` and `vanillaPatch` share one frame-parsing and runtime-exclusion path without `node:*` imports.
   - Extract `resolveFilePath` and `verifyAndCorrectSourceLocation` out of the 1,014-line [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) monolith into `sourceLocation.ts` in `@hoversource/companion-server` so path/line/sourcemap resolution is directly unit-testable.
2. **React 19 + Bundler Resolution**:
   - Extend `ReactFiberAdapter` to resolve React 19 `_debugStack`, `ComponentInfo`/`Fiber` `_debugOwner`, and `fiber.return` fallbacks while preserving React 18 `_debugSource`.
   - Harden `vanillaPatch.ts` to ignore `node_modules/` and `.vite/deps/` frames and avoid misattributing framework-owned elements.
   - Normalize `/@fs/` and `?query` in `companion-server` and decode inline/same-origin SourceMap v3 (`mappings` VLQ) from loopback dev URLs in `/validate-line` with fallback to `verifyAndCorrectSourceLocation`.
3. **Conditional Scroll & Gutter Metrics**:
   - Emit concise scroll and gutter entries inside `layoutConstraints` in [inspector.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.ts) only when the target element has non-`visible` overflow, non-`auto` `scrollbar-gutter`, or actual content overflow (`scrollSize > clientSize + 1`), automatically surfaced by [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts) without altering `metadataFilter` config schemas.

## User Stories

1. As a developer inspecting a React 19 + Vite + Electron app, I want HoverSource to report the authoring React component name, `.tsx`/`.jsx` path, and original source line instead of `Vanilla` and `react-dom_client.js`.
2. As a developer debugging a scroll container, I want HoverSource's `Layout Constraints` section to include the element's own `overflow`, `client` vs `scroll` size, scrollbar width, and `scrollbar-gutter` when relevant, without cluttering non-scrollable elements.

## Implementation Decisions

- **Browser-safe shared helper**: `packages/source-resolver/src/adapters/stackFrame.ts` MUST contain zero `node:*` imports so [build.js](file:///d:/Projects/HoverSource/packages/overlay-core/build.js) (`platform: "browser"`) bundles `@hoversource/overlay-core` cleanly. All relative TS imports use explicit `.js` extensions (`NodeNext`).
- **Loopback-only SSRF guard for sourcemap fetch**: `packages/companion-server/src/sourceMap.ts` MUST only fetch `http:` URLs whose hostname is `localhost`, `127.0.0.1`, or `::1`, enforce `AbortSignal.timeout(1500)` and a 5 MB body cap, and fall back to heuristic `verifyAndCorrectSourceLocation` on any fetch/parse failure.
- **Zero-dependency Base64 VLQ decoder**: `sourceMap.ts` implements SourceMap v3 VLQ decoding directly in TypeScript without adding npm dependencies to `@hoversource/companion-server`.
- **Single-source filter toggle**: Scroll/gutter metrics are emitted into `VisualContext.layoutConstraints` (`Record<string, string>`), reusing the existing `metadataFilter.filters.component.layoutConstraints` filter key across [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts), [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts), and [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts).

## Intentional Deltas

> **Default Preserve (`BROWNFIELD`):** All existing observable behavior, framework adapters, static HTML map resolution, `metadataFilter` config keys, and `initial intended UXUI` default to **PRESERVE**; only deltas explicitly listed below may change.

- **`INTENTIONALLY_CHANGED`**:
  - React 19 DOM elements with `_debugStack` / `_debugOwner` / React fiber ancestry resolve as `Framework: React` with authoring component and source location instead of falling through to `VanillaAdapter`.
  - `vanillaPatch.ts` skips `node_modules/` and `.vite/deps/` stack frames and framework-owned elements instead of stamping runtime internals into `data-hs-source`.
  - `/validate-line` becomes async and resolves loopback Vite/dev URL inline/same-origin sourcemaps to original `.tsx`/`.jsx` coordinates before falling back to heuristic line matching.
  - `inspectLayoutConstraints` includes own-element `overflow-x`/`overflow-y`, `scrollbar-gutter`, `client-size`, `scroll-size`, and `scrollbar-width` when scrollable, overflowing, or gutter-configured.

## Testing Decisions

- **Unit seams**: Direct tests on `stackFrame.ts`, `ReactFiberAdapter`, `sourceLocation.ts`, `sourceMap.ts` (with deterministic loopback HTTP mock server and programmatic VLQ sourcemap fixtures), `vanillaPatch.ts`, `inspector.ts`, and `InspectorAdapter.ts` via Vitest (`pnpm test`).
- **Workspace parity**: Verify `pnpm build` (`tsc -b` + `esbuild` bundle) and `pnpm --filter @hoversource/source-resolver test` (validating both `src/` and `dist/`).
- **Live runtime smoke check (`!NC` cutover)**: Verify compiled `packages/overlay-core/dist/overlay.bundle.js` + `companion-server` against `D:\Projects\YumeShelf` (`save-editor.html?gameKey=test` in Vite + Electron).

## Out of Scope

- **Viewport & ancestor clipping diagnostics**: Dropped (`rect.right > window.innerWidth`, `rect.bottom > window.innerHeight`, extending past `overflow: hidden` ancestors, and subpixel `0.33px` DPI deltas) due to high false-positive noise on scrollable pages, virtualized spacers, and fractional DPI rounding.
- **Separate `scrollMetrics` dashboard/filter panel checkbox**: Excluded by user decision; scroll metrics live inside `layoutConstraints`.
- **On-disk `ReactRuntimePatcher` expansion for React 19**: React 19 `jsxDEV` does not accept JSX `source` parameters; runtime detection works non-invasively via `_debugStack` and `_debugOwner`.

## Tickets

- `01` — Extract stack-frame parser and companion source-location module (`tickets/01-extract-stack-frame-and-source-location.md`)
- `02` — Support React 19 `_debugStack` and `_debugOwner` in `ReactFiberAdapter` (`tickets/02-react19-fiber-resolution.md`)
- `03` — Harden `vanillaPatch` frame filtering and `companion-server` Vite URL/sourcemap resolution (`tickets/03-vanillapatch-and-vite-sourcemap-resolution.md`)
- `04` — Add conditional scroll and gutter metrics under `layoutConstraints` (`tickets/04-conditional-scroll-layout-constraints.md`)
- `05` — Rebuild `overlay.bundle.js` and run workspace + live YumeShelf verification (`tickets/05-build-and-live-yumeshelf-verification.md`)
