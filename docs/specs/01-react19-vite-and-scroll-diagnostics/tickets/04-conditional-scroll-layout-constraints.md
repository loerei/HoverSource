# 04 — Add conditional scroll and gutter metrics under `layoutConstraints`

## Epic
PRD: React 19 / Vite Source Resolution and Conditional Scroll Diagnostics

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Collect concise own-element scroll and gutter diagnostics inside `inspectLayoutConstraints` in [inspector.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.ts) so [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts) surfaces them automatically in both tooltip `Layout:` and copied `Layout Constraints` without adding new config keys or noisy clipping heuristics.

- [ ] 1. **[MODIFY]** [`inspector.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.ts) — Populate conditional scroll/gutter entries in `inspectLayoutConstraints`
  - Keep all existing constraint keys (`position`, `flex-grow`, `align-self`, `grid-column`, `display`) untouched.
  - Read `computed.overflowX`, `computed.overflowY`, and `computed.scrollbarGutter`, plus safe finite numeric reads of `element.clientWidth`, `element.clientHeight`, `element.scrollWidth`, `element.scrollHeight`, `element.offsetWidth`, and `element.offsetHeight` (skipping scroll geometry gracefully when DOM size fields are undefined, as in lightweight unit-test mocks).
  - Detect scroll relevance using exact guard conditions:
    - `isScrollOverflow = (x) => x === "auto" || x === "scroll" || x === "hidden" || x === "clip"`
    - `hasVerticalOverflow = hasGeometry && scrollHeight > clientHeight + 1`
    - `hasHorizontalOverflow = hasGeometry && scrollWidth > clientWidth + 1`
  - Only when relevant, populate `layoutConstraints`:
    - `overflow-x`: when `computed.overflowX` is `auto`, `scroll`, `hidden`, or `clip` (or `hasHorizontalOverflow`).
    - `overflow-y`: when `computed.overflowY` is `auto`, `scroll`, `hidden`, or `clip` (or `hasVerticalOverflow`).
    - `scrollbar-gutter`: when `computed.scrollbarGutter` is present and `!== "auto"`.
    - `client-size` and `scroll-size` (formatted `${w}x${h}`): ONLY when `hasGeometry` AND (`overflowX` is `auto`/`scroll` OR `overflowY` is `auto`/`scroll` OR `hasVerticalOverflow` OR `hasHorizontalOverflow`).
    - `scrollbar-width` (formatted `${vTrack}px` or `${vTrack}px x ${hTrack}px` when non-zero): ONLY when `hasGeometry` AND `overflowY`/`overflowX` allows scrollbars (`auto`/`scroll`) and `Math.max(0, offsetWidth - clientWidth)` or `Math.max(0, offsetHeight - clientHeight)` > `0` (accounting for border width if needed via `borderLeftWidth`/`borderRightWidth` or reporting raw track delta `offsetWidth - clientWidth - borderX` when positive; keep simple and safe: subtract parsed `borderLeftWidth + borderRightWidth` / `borderTopWidth + borderBottomWidth` so a `1px` border is never mistaken for a `2px` scrollbar).
- [ ] 2. **[MODIFY]** [`inspector.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.test.ts) and [`InspectorAdapter.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.test.ts) — Verify scroll/gutter metrics and zero-noise default
  - Keep all existing tests intact.
  - Add tests verifying:
    - Standard non-scrolling elements (`overflow-x: visible`, `overflow-y: visible`, `scrollbar-gutter: auto`, `scrollHeight === clientHeight`) produce zero scroll keys in `layoutConstraints`.
    - A scrollable container (`overflowY: "auto"`, `scrollbarGutter: "stable"`, `clientWidth: 747`, `offsetWidth: 757`, `clientHeight: 579`, `scrollHeight: 2400`) emits `overflow-y: auto`, `scrollbar-gutter: stable`, `client-size: 747x579`, `scroll-size: 747x2400`, and `scrollbar-width: 10px` (and accounts for borders so a `1px` border with no scrollbar does NOT emit `scrollbar-width: 2px`).
    - `InspectorAdapter.formatElementMetadata` renders these entries under `* **Layout Constraints**:` when `layoutConstraints` filter is enabled and hides them when `layoutConstraints: false`.

## Acceptance Criteria
- [ ] Non-scrolling, non-overflowing elements emit zero new entries in `layoutConstraints`.
- [ ] Elements with `overflow` (`auto`/`scroll`/`hidden`/`clip`), non-`auto` `scrollbar-gutter`, or `scrollSize > clientSize + 1` surface concise metrics inside `layoutConstraints`.
- [ ] Element borders (`borderLeftWidth` + `borderRightWidth`) do not cause false-positive `scrollbar-width` entries.
- [ ] Mock elements lacking `clientWidth`/`scrollWidth` (existing unit test mocks) do not throw or emit `NaNxNaN`.
- [ ] Execute automated verification command: `pnpm --filter @hoversource/overlay-core build && pnpm test`.

## Verification Command
```bash
pnpm --filter @hoversource/overlay-core build && pnpm test
```
