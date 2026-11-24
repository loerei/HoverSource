# 02 — Support React 19 `_debugStack` and `_debugOwner` in `ReactFiberAdapter`

## Epic
PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

## Status
ready-for-agent

## Blocked by
- `01` — Extract stack-frame parser and companion source-location module

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Extend [ReactFiberAdapter.ts](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/ReactFiberAdapter.ts) to resolve React 19 fibers (`_debugStack` and `_debugOwner`) as well as React 18 fibers (`_debugSource`), plus component-name fallback via `fiber.return` when stack frames are absent.

- [ ] 1. **[MODIFY]** [`ReactFiberAdapter.ts`](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/ReactFiberAdapter.ts) — Add React 19 `_debugStack`, `ComponentInfo` `_debugOwner`, and `fiber.return` fallback
  - Preserve existing `_debugSource` resolution path untouched for React <=18.
  - Update `findComponentNameFromFiber(fiber)`:
    - Handle React 19 `_debugOwner` when it is either a `Fiber` (`typeof owner.tag === "number"` or `owner.type` present) or a React 19 `ComponentInfo` object (`typeof owner.name === "string"`, walking `owner.owner` if needed).
    - Support `function`, `object` (`ForwardRef` via `type.render`, `Memo` via `type.type`), and string displayName/name extraction; if `_debugOwner` yields nothing, walk `fiber.return` to find the nearest non-host component fiber (`typeof f.type === "function"` or `ForwardRef`/`Memo`).
  - Add `_debugStack` extraction using `parseV8StackLine` and `isBundlerOrRuntimeFrame` from `./stackFrame.js`:
    - Inspect `fiber._debugStack?.stack` (if string) line-by-line, skipping `"Error: react-stack-top-frame"` and any frame matching `isBundlerOrRuntimeFrame` (such as `react_jsx-dev-runtime`, `react-dom`, `node_modules/.vite/deps/`).
    - For the first authoring frame:
      - If the frame location starts with `/@fs/` (e.g., `/@fs/D:/Projects/App/src/Comp.tsx?v=...`), normalize to OS path (`D:/Projects/App/src/Comp.tsx`) and strip query/hash.
      - If the frame location is an `http(s)://` dev URL (e.g., `http://localhost:5173/renderer/Comp.tsx?t=...`), preserve the origin + pathname (stripping `?query`/`#hash`) so `companion-server`'s `/validate-line` can fetch its dev sourcemap and return the resolved local `correctedFile`.
      - Prefer component name from `findComponentNameFromFiber(fiber)` or parsed stack `functionName` (when not `"Object"` / `"<anonymous>"`).
  - **Fallback when neither `_debugSource` nor usable `_debugStack` exists** (e.g., React 19 >10,000 `recentlyCreatedOwnerStacks` cap):
    - Walk `fiber.return` for any ancestor with `_debugSource` or usable `_debugStack`; if still none, return `{ fileName: "", lineNumber: 0, columnNumber: 0, componentName, framework: "React", ...getElementMetadata(element) }` whenever a React component owner is found (so React elements never fall through to `VanillaAdapter` and `react-dom_client.js`).
- [ ] 2. **[MODIFY]** [`SourceResolver.test.ts`](file:///d:/Projects/HoverSource/packages/source-resolver/src/__tests__/SourceResolver.test.ts) — Add React 19 resolution and fallback tests
  - Keep all existing React 18 `_debugSource`, Vue, Svelte, Preact, Solid, Astro, Angular, Vanilla, and `SourceResolver` tests intact.
  - Add `ReactFiberAdapter` test cases for:
    - Host fiber (`div`) with React 19 `_debugStack` pointing through `react_jsx-dev-runtime.js` to `http://localhost:5173/renderer/save-editor/components/SaveEditorContent.tsx?t=123:741:25` and Fiber `_debugOwner`.
    - Fiber with `/@fs/D:/Projects/App/src/Button.tsx?v=1:12:4` in `_debugStack` normalizing `/@fs/` and stripping `?v=1`.
    - Fiber with React 19 `ComponentInfo` `_debugOwner` (`{ name: "ServerCard", owner: null }`).
    - Fiber lacking both `_debugSource` and `_debugStack` resolving nearest component name via `fiber.return` with `framework: "React"`.

## Acceptance Criteria
- [ ] React <=18 `_debugSource` resolution passes unchanged.
- [ ] React 19 fibers with `_debugStack` skip `react_jsx-dev-runtime` / `react-dom` / `.vite/deps` frames and return `framework: "React"`, owning `componentName`, cleaned `fileName`, and parsed `lineNumber`/`columnNumber`.
- [ ] React fibers without `_debugSource` or `_debugStack` still resolve nearest owning component with `framework: "React"` instead of falling through to `VanillaAdapter`.
- [ ] Execute automated verification command: `pnpm --filter @hoversource/source-resolver build && pnpm --filter @hoversource/source-resolver test`.

## Verification Command
```bash
pnpm --filter @hoversource/source-resolver build && pnpm --filter @hoversource/source-resolver test
```
