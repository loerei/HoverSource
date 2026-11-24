# 05 — Rebuild `overlay.bundle.js` and run workspace + live YumeShelf verification

## Epic
PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

## Status
ready-for-agent

## Blocked by
- `02` — Support React 19 `_debugStack` and `_debugOwner` in `ReactFiberAdapter`
- `03` — Harden `vanillaPatch` frame filtering and `companion-server` Vite URL/sourcemap resolution
- `04` — Add conditional scroll and gutter metrics under `layoutConstraints`

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Terminal `!NC` cutover verification: build all TypeScript workspace packages, regenerate tracked runtime artifacts ([overlay.bundle.js](file:///d:/Projects/HoverSource/packages/overlay-core/dist/overlay.bundle.js)), run the full monorepo test suite (including `source-resolver` `src` + `dist` parity), and run a headless live smoke check against `D:\Projects\YumeShelf` (`react@19.3.1` + `vite@8` + `electron`).

- [ ] 1. **[MODIFY]** [`overlay.bundle.js`](file:///d:/Projects/HoverSource/packages/overlay-core/dist/overlay.bundle.js) — Rebuild monorepo (`tsc -b` and `esbuild` browser bundle)
  - Run `pnpm build` so `packages/*/dist/` and `packages/overlay-core/dist/overlay.bundle.js` reflect tickets `01`–`04` cleanly with zero TypeScript errors.
- [ ] 2. **Verify full workspace automated suites**
  - Run `pnpm test` and `pnpm --filter @hoversource/source-resolver test` and verify 100% pass without skipped tests.
- [ ] 3. **Live Electron + Vite runtime smoke check against `D:\Projects\YumeShelf`**
  - Start YumeShelf's Vite dev server + HoverSource companion server against `D:\Projects\YumeShelf`, load `save-editor.html?gameKey=test` in Electron with `overlay.bundle.js` injected before page scripts (`Page.addScriptToEvaluateOnNewDocument` / early preload):
    - Assert `.save-editor-content` resolves via `SourceResolver` + `/validate-line` to `Framework: React`, `Component: SaveEditorContent`, and `D:\Projects\YumeShelf\src\renderer\save-editor\components\SaveEditorContent.tsx` at the exact source line (~654) rather than `Vanilla` or `react-dom_client.js`.
    - Assert `.save-editor-content` / `.save-editor-scroll-viewport` reports expected `overflow-y` and `scrollbar-gutter` under `layoutConstraints`.
    - Tear down temporary Vite/Electron/companion processes cleanly and leave zero untracked scratch artifacts in either repository.

## Acceptance Criteria
- [ ] `pnpm build` succeeds with zero TypeScript or esbuild errors and updates `packages/overlay-core/dist/overlay.bundle.js`.
- [ ] `pnpm test` and `pnpm --filter @hoversource/source-resolver test` pass all test suites.
- [ ] Live Electron + Vite smoke check on `D:\Projects\YumeShelf` confirms `SaveEditorContent` resolves to `React` + `SaveEditorContent.tsx` (exact original line) and scroll/gutter metrics appear in `layoutConstraints`.
- [ ] Execute automated verification command: `pnpm build && pnpm test && pnpm --filter @hoversource/source-resolver test`.

## Verification Command
```bash
pnpm build && pnpm test && pnpm --filter @hoversource/source-resolver test
```
