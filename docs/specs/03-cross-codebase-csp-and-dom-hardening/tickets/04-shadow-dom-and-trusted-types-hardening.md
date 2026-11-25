# 04 — Isolate overlay UI in Shadow DOM and replace `innerHTML` sinks for Trusted Types

## Epic
PRD: Cross-Codebase CSP Immunity and Strict DOM Hardening

## Status
ready-for-agent

## Blocked by
- `01.2` — Add CDP bridge transport and DOM readiness gates

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Render all HoverSource overlay DOM and styles inside an isolated `ShadowRoot` (`#hoversource-host`) with explicit `:host` style resets so aggressive target CSS resets and global styles cannot corrupt HoverSource tooltips/panels, eliminate all `innerHTML` string sinks and inline `onclick` tooltip handlers across `@hoversource/overlay-core` for `require-trusted-types-for 'script'` and `script-src-attr 'none'` compliance while preserving `OverlayController.drawTooltip(html, pointerEvent)` adapter compatibility, and verify all isolation invariants in `happy-dom`.

- [x] 1. **Create zero-`innerHTML` DOM helper module (`safeDom.ts`)**:
  - **Files:** **[NEW]** [safeDom.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/safeDom.ts)
  - Export lightweight, zero-`innerHTML` DOM helpers (`createSafeFragmentFromHtml(html: string): DocumentFragment`, `setElementContentSafely(el: Element, html: string): void`, `el(tag, attrs?, children?)`, `escapeHtml(value: unknown): string`) using strictly `document.createElement`, `document.createElementNS`, `document.createTextNode`, `setAttribute`, and `replaceChildren` (zero `innerHTML`, zero `outerHTML`, zero `insertAdjacentHTML`, zero `DOMParser` script sinks).
  - Enforce canonicalized attribute and tag sanitization in both `createSafeFragmentFromHtml` and `el`:
    - Decode standard HTML entities (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#39;`, `&#x27;`) as well as numeric/hex HTML entities (`&#(\d+);` and `&#[xX]([0-9a-fA-F]+);`, rejecting/replacing `0x00` and out-of-range code points) in a **single-pass** lookup replacement (or decode `&amp;` strictly last) so `&amp;lt;` cannot double-decode to `<`.
    - Strip ASCII whitespace and control characters (`[\u0000-\u0020]+`) from decoded URL attribute values (`href`, `src`, `xlink:href`, `action`, `formaction`) and match case-insensitively (`.toLowerCase()`, e.g. `/^(?:javascript|vbscript):/i` and `/^data:(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml)(?:[;,]|$)/i`) before rejecting `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, `data:application/xhtml+xml`, and `data:text/xml` schemes.
    - Ignore HTML comments (`<!--...-->`), use a quote-aware tag scanner (matching `stripMetaCspTags` so literal `>` characters inside quoted attributes do not prematurely terminate tag parsing), validate parsed tag names against `/^[a-zA-Z][a-zA-Z0-9-]*$/` before calling `document.createElement` / `document.createElementNS` (so stray `<` or invalid tag tokens cannot throw `DOMException: InvalidCharacterError`), reject `srcdoc` attributes alongside `/^on/i` attributes, and reject `<script>` (discarding `<script>...</script>` inner body content as well as the tag, and advancing to `html.length` on unclosed `<script>`), `<iframe>`, `<object>`, `<embed>`, `<foreignObject>`, `<style>` (discarding `<style>...</style>` inner body content as well as the tag, and advancing to `html.length` on unclosed `<style>`), `<base>`, and SVG SMIL animation elements (`<animate>`, `<set>`, `<animateTransform>`, `<animateMotion>`) case-insensitively. Rejected-tag filtering takes precedence over void-element emission so `<embed>` and `<base>` are discarded immediately as void/self-closing tags without pushing onto the open-element stack or scanning for closing tags.
    - Track SVG element scope to use `document.createElementNS("http://www.w3.org/2000/svg", tag)` for `<svg>` and its descendants, handle self-closing `/>` tags on SVG/void elements cleanly, and auto-close standard HTML void elements (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`, matched case-insensitively on `tagName.toLowerCase()`) even when written without a trailing `/>`.
    - Parse valueless boolean attributes (such as `checked` on `<input type="checkbox" ... checked>`) through the same `/^on/i`, `srcdoc`, and URL-attribute sanitization gate before calling `setAttribute(attrName, "")` (so malformed inputs like `<img onerror>` are still dropped and subsequent attributes are preserved), and enforce a defensive element nesting depth cap (e.g., `MAX_DEPTH = 64`) in `createSafeFragmentFromHtml`.
- [x] 2. **Install `happy-dom` and verify `safeDom` HTML/SVG construction and zero-`innerHTML` invariants**:
  - **Files:** **[MODIFY]** [package.json](file:///d:/Projects/HoverSource/packages/overlay-core/package.json), **[MODIFY]** [pnpm-lock.yaml](file:///d:/Projects/HoverSource/pnpm-lock.yaml), **[NEW]** [overlay.isolation.test.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/overlay.isolation.test.ts)
  - Install `happy-dom` strictly into `@hoversource/overlay-core` `devDependencies` (never `dependencies`, preserving `"files": ["dist", "!dist/**/__tests__", "!dist/**/*.test.*"]`) by running `pnpm add -D happy-dom --filter @hoversource/overlay-core` (pinning a version compatible with Vitest and Node `>=20`, updating `pnpm-lock.yaml`).
  - Place `// @vitest-environment happy-dom` at the top of `overlay.isolation.test.ts` (leaving existing Node-mocked tests in default `node` env), and suppress top-level `overlay.ts` auto-launch before importing `overlay.ts` by initializing `(globalThis as any).__HoverSourceInitialized__ = true` (and stubbing default `fetch` / `matchMedia` mocks) inside `vi.hoisted(() => { ... })` or dynamic `beforeEach` imports.
  - Add initial `safeDom` suite verifying:
    - Complex HoverSource tooltip markup (headers, badges, code lines, flex rows, multi-path `<svg><path ... /></svg>` in SVG namespace, `data-*` attributes) renders accurately without invoking `Element.prototype.innerHTML` or `ShadowRoot.prototype.innerHTML` setters (when defined, `vi.spyOn` assertions).
    - `createSafeFragmentFromHtml('<input type="checkbox" data-type="component" checked data-field="componentName"><span>after</span>')` and uppercase/mixed-case void elements (`<INPUT type="checkbox" checked><SPAN>after</SPAN>`, `<BR><SPAN>next</SPAN>`) auto-close without `/>`, preserve `input.getAttribute("checked") === ""` and `input.getAttribute("data-field") === "componentName"`, and place `<span>`/`<SPAN>` as a sibling rather than a descendant.
    - `safeDom.ts` drops `on*` attributes (including valueless `<img onerror>`), `srcdoc`, `<iframe>`/`<object>`/`<foreignObject>`/`<embed>`/`<style>` (discarding `<style>...</style>` inner CSS text as well as the tag)/`<base>` (discarding `<embed>` and `<base>` immediately as void tags without swallowing subsequent sibling/parent markup), `<animate>`/`<set>`/`<animateTransform>`/`<animateMotion>` SVG SMIL elements (asserting `createSafeFragmentFromHtml('<svg><animate attributeName="x" /><set attributeName="y" /><animateTransform /><animateMotion /></svg>')` strips all four SMIL elements), ignores HTML comments (`<!--...-->`), handles literal `>` inside quoted attributes (`<span title="a > b">ok</span>` preserving `title === "a > b"` and text `"ok"`) and unclosed `<script>alert(1)` / `<style>body{color:red}` (producing empty fragment / zero text), handles malformed `<` / invalid tag names without throwing `InvalidCharacterError`, whitespace-padded and mixed-case `javascript:`/`vbscript:`/`data:text/html`/`data:image/svg+xml`/`data:application/xhtml+xml`/`data:text/xml` URLs (`href="JaVaScRiPt:alert(1)"`, `href="vbscript:msgbox(1)"`, `src="DATA:text/html,<script>alert(1)</script>"`, `src="data:image/svg+xml,<svg/>"`, and `data:application/xhtml+xml`/`data:text/xml` on `href`/`src`/`action`/`formaction`), numeric/hex entity-obfuscated URLs (`&#106;avascript:alert(1)`, `&#x6a;avascript:alert(1)`, `&#X6A;avascript:alert(1)`), rejects/replaces `&#0;` / `&#x00;` and out-of-range code points (e.g. `&#99999999;`) without throwing `RangeError: Invalid code point`, strips raw `<script>alert(1)</script>` and `<SCRIPT>alert(1)</SCRIPT>` (tag + body), renders `&lt;script&gt;alert(1)&lt;/script&gt;` literally (`textContent === "<script>alert(1)</script>"` with zero `<script>` elements created), and preserves `&amp;lt;` / `&amp;#60;` without single-pass double-unescaping.
    - `el(tag, attrs?, children?)` enforces the same canonicalized tag and attribute sanitization as `createSafeFragmentFromHtml`: rejected tags (`el("script", ...)`, `el("iframe", ...)`, `el("object", ...)`, `el("style", ...)`, `el("base", ...)`, `el("animate", ...)`, `el("set", ...)`, `el("animateTransform", ...)`, `el("animateMotion", ...)`) do not return executable/unsafe elements, and `on*` / `srcdoc` / unsafe URL attributes (`el("a", { href: "vbscript:msgbox(1)", onclick: "alert(1)", srcdoc: "<b>x</b>" })`, `el("img", { src: "data:image/svg+xml,<svg/>" })`) are stripped.
  - Run `pnpm --filter @hoversource/overlay-core build && npx vitest run packages/overlay-core/src/__tests__/overlay.isolation.test.ts`.
- [x] 3. **Migrate inline `onclick` tooltip handlers to delegated `data-hs-open-*` listeners, escape dynamic HTML, and replace all `innerHTML` sinks**:
  - **Files:** **[MODIFY]** [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts), **[MODIFY]** [DesignAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts), **[MODIFY]** [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts)
  - In `InspectorAdapter.ts` (`renderMinimalTooltip`, `renderBasicStats`, `renderVisualDetails`, `renderParentEffects`, `renderStaticMetadata`, `renderDetailedTooltip`, `renderTooltip`) and `DesignAdapter.ts` (`formatAnchorStatus`, `buildTooltipHtml`):
    - Replace inline `onclick="globalThis.__HoverSourceOpen__(...)"` attributes on `.hoversource-link` with `data-*` attributes and apply `escapeHtml` imported from `../safeDom.js` to **all** dynamic/untrusted values interpolated into tooltip HTML strings (`elementSelector` in `InspectorAdapter.ts` `renderBasicStats`: `<span class="hoversource-value">${escapeHtml(elementSelector)}</span>`, `${tagLower}${idStr}${classStr}` in `DesignAdapter.ts` `buildTooltipHtml`: `<span class="hoversource-value">${escapeHtml(`${tagLower}${idStr}${classStr}`)}</span>`, `info.componentName`, `info.framework`, displayed `info.fileName` / `fileBase`, `origin.file` / `origin.line`, `color`, `bgColor`, `shadow`, `animation`, `constraints`, `fx.tagName`, `fx.classList`, `fx.property`, `fx.value`, `rawAttributes` keys and values, `comments`, `stack`, `label`, and `selectors`):
      ```html
      <span
        class="hoversource-link"
        data-hs-open-file="${escapeHtml(info.fileName)}"
        data-hs-open-line="${info.lineNumber || 1}"
        data-hs-open-col="${info.columnNumber || 1}"
        data-hs-open-tag="${escapeHtml(info.tagName || "")}"
        data-hs-open-classes="${escapeHtml((info.classList || []).join(","))}"
      >
      ```
  - In `overlay.ts`:
    - Inside `createUI()`, attach a single delegated `"click"` listener on `this.tooltipBox` that resolves `(e.target as Element | null)?.closest?.("[data-hs-open-file]")`, guards `const file = link.dataset.hsOpenFile; if (!file) return;`, reads `hsOpenLine` / `hsOpenCol` / `hsOpenTag` / `hsOpenClasses`, and invokes `openFileInIde(...)` directly (shared with `globalThis.__HoverSourceOpen__`), preserving existing `InspectorAdapter.test.ts` `mockTooltipBox` expectations.
    - Replace all `innerHTML` uses: `textContent` for `#hoversource-styles` and `#hoversource-freeze-styles`, construct `filterPanel` rows directly with `el(...)` (recommended for static/structured UI) or route through `createSafeFragmentFromHtml` backed by the void-tag and boolean-attribute rules above, `setElementContentSafely` inside `drawTooltip(html, e)`, and safe re-entrant `copyToClipboard` (`if (this.isDestroyed) return;` immediately after `await navigator.clipboard.writeText(text)`; track `private copyHintTarget: Element | null = null` and `private copyHintOriginalNodes: ChildNode[] | null = null`, clear prior `this.copyHintTimer`, capture original child nodes only when `this.copyHintTarget !== hint || !this.copyHintOriginalNodes`, restore `hint.replaceChildren(...originalNodes)` when the 1500ms timer fires only if `this.copyHintTarget === hint`, reset `copyHintTarget` / `copyHintOriginalNodes` + clear pending `copyHintTimer` strictly inside the `if (html)` branch of `drawTooltip(html, ...)` when `tooltipBox` content is actually replaced — NOT when `html === ""`, which `InspectorAdapter.onPointerMove` and `DesignAdapter.onPointerMove` call on every mouse move solely to reposition the tooltip — and keep unconditional cleanup in `destroy()`).
    - Update `OverlayEngine.renderFilterPanel(restoreFocusId?: "hoversource-prev-btn" | "hoversource-next-btn")` in `overlay.ts` so `#hoversource-prev-btn` and `#hoversource-next-btn` render with explicit `type="button"` and `aria-label="Previous metadata category"` / `aria-label="Next metadata category"`, omit `e.stopPropagation()` on their `"click"` listeners (relying on `makePanelDraggable()`'s existing `closest('button')` parent target filter), and synchronously restore focus to the newly mounted button after `this.filterPanel.replaceChildren(...)` when activated while focused:
      ```ts
      private renderFilterPanel(restoreFocusId?: "hoversource-prev-btn" | "hoversource-next-btn") {
        if (!this.filterPanel) return;
        // ... build header & table with el(...) / safeDom and replaceChildren(...) ...
        const prevBtn = this.filterPanel.querySelector("#hoversource-prev-btn") as HTMLButtonElement | null;
        const nextBtn = this.filterPanel.querySelector("#hoversource-next-btn") as HTMLButtonElement | null;
        if (prevBtn) {
          prevBtn.addEventListener("click", () => {
            const activeEl = this.shadowRoot?.activeElement ?? document.activeElement;
            const shouldRestoreFocus = activeEl === prevBtn;
            this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex - 1 + metadataTypes.length) % metadataTypes.length;
            this.renderFilterPanel(shouldRestoreFocus ? "hoversource-prev-btn" : undefined);
          });
        }
        if (nextBtn) {
          nextBtn.addEventListener("click", () => {
            const activeEl = this.shadowRoot?.activeElement ?? document.activeElement;
            const shouldRestoreFocus = activeEl === nextBtn;
            this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex + 1 + metadataTypes.length) % metadataTypes.length;
            this.renderFilterPanel(shouldRestoreFocus ? "hoversource-next-btn" : undefined);
          });
        }
        // ... row/checkbox listeners & makePanelDraggable() ...
        if (restoreFocusId) {
          (this.filterPanel.querySelector(`#${restoreFocusId}`) as HTMLElement | null)?.focus();
        }
      }
      ```
  - In `DesignAdapter.ts`: replace `innerHTML = ""` with `this.svgOverlay.replaceChildren()`.
- [x] 4. **Replace repeated theme border ternaries in `initStyles()` with explicit `colors` tokens**:
  - **Files:** **[MODIFY]** [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts)
  - Replace the 10 repeated `colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? ... : ...` checks inside `initStyles()` with explicit theme-token fields (`panelBorder`, `panelGlow`, `navBg`, `navHoverBg`, `accent`, `rowHoverBg`).
- [x] 5. **Encapsulate overlay UI and styles in `#hoversource-host` open `ShadowRoot` with `:host` reset and freeze isolation**:
  - **Files:** **[MODIFY]** [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts), **[OPTIONAL MODIFY]** [types.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/types.ts)
  - Optionally add `readonly shadowHost?: HTMLElement | null;` (and/or `isOverlayNode?(node: Node | null): boolean`) to `OverlayController` in `types.ts` while preserving all existing signatures and keeping `InspectorAdapter.test.ts` mocks valid.
  - Preserve initial intended UXUI while encapsulating rendering:
    - Mount `#hoversource-host` on `document.body` with `attachShadow({ mode: "open" })` (expose `shadowHost` while keeping `this.container` inside `shadowRoot`).
    - Prepend an explicit `:host` CSS reset rule inside `#hoversource-styles` inside `shadowRoot`:
      ```css
      :host {
        all: initial;
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483647;
      }
      ```
    - Append `#hoversource-styles` (`textContent`) inside `shadowRoot` (`handleConfigUpdate` queries `shadowRoot.getElementById?.("hoversource-styles") ?? shadowRoot.querySelector("#hoversource-styles")`), avoiding document `<head>` style pollution and shielding overlay styles from host CSS resets.
    - Keep `ensureUI()` self-healing by verifying `!document.body.contains(this.shadowHost)` and re-attaching `this.shadowHost` cleanly.
    - Implement idempotent `setFreezeMode(frozen: boolean)`: guard `if (this.isFrozen === frozen) return;`, attach `this.freezeStyle` (`* { pointer-events: auto !important; }\n#hoversource-host { pointer-events: none !important; }` via `textContent`) using `(document.head ?? document.documentElement)?.appendChild(this.freezeStyle)`, inject shadow-internal freeze rules (`this.freezeShadowStyle` via `textContent`) into `shadowRoot` covering `.hoversource-tooltip`, `.hoversource-config-panel`, and `.hoversource-parent-badge` (plus their descendants) as `pointer-events: auto !important`, and remove both `<style>` elements cleanly on `setFreezeMode(false)` and `destroy()`.
    - Update `OverlayEngine.destroy()` to detach `this.shadowHost` from the DOM (`this.shadowHost?.remove();`) and null both `this.shadowHost = null;` and `this.shadowRoot = null;` alongside `this.container`, `this.freezeStyle`, and `this.freezeShadowStyle`.
- [x] 6. **Update pointer, `composedPath()`, and `elementsFromPoint` guards for Shadow DOM boundary**:
  - **Files:** **[MODIFY]** [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts), **[MODIFY]** [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts), **[MODIFY]** [DesignAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts)
  - Update event target and `document.elementsFromPoint` guards in `overlay.ts` (`handlePointerOver`, `blockEvent` using `composedPath()`), `InspectorAdapter.ts` (including updating `InspectorAdapter.getMinifiedHTML` clone cleanup selector from `.hoversource-container, [class^="hs-"]` to `#hoversource-host, .hoversource-container, [class^="hs-"]`), and **both** `DesignAdapter.updateTargetAtPosition()` AND `DesignAdapter.getSnapCandidates()` to exclude `(this.controller as any).shadowHost` (`if (shadowHost && (el === shadowHost || shadowHost.contains(el))) continue;`) so `#hoversource-host` is never selected as a target or snap anchor.
  - In `OverlayEngine.handlePointerOver` (`overlay.ts`), return immediately **without** calling `e.stopImmediatePropagation()` or `e.preventDefault()` when the event originates on or inside `this.shadowHost` / `this.container` (checked via `target === this.shadowHost`, `this.shadowHost?.contains(target)`, `this.container?.contains(target)`, or `e.composedPath()`), matching `blockEvent`, and preserve `if (this.isFrozen) { e.stopImmediatePropagation(); e.preventDefault(); }` only for non-overlay targets (and `!target`) after the `isOverlayEvent` early return:
    ```ts
    const composedPath = typeof e.composedPath === "function" ? e.composedPath() : [];
    const isOverlayEvent = Boolean(
      (this.shadowHost && (target === this.shadowHost || this.shadowHost.contains(target as Node) || composedPath.includes(this.shadowHost))) ||
      (this.container && (target === this.container || this.container.contains(target as Node) || composedPath.includes(this.container)))
    );
    if (isOverlayEvent) return;
    if (!target) {
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return;
    }
    ```
- [x] 7. **Add `OverlayEngine` Shadow DOM isolation tests and verify workspace suite**:
  - **Files:** **[MODIFY]** [overlay.isolation.test.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/overlay.isolation.test.ts), **[IF NEEDED MODIFY]** [overlay.lifecycle.test.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/overlay.lifecycle.test.ts)
  - If `overlay.lifecycle.test.ts` simulated DOM mocks need `attachShadow`, `shadowRoot.getElementById`, or `#hoversource-host` updates, synchronize them here cleanly.
  - In `overlay.isolation.test.ts` (`happy-dom` environment):
    - Stub `globalThis.matchMedia` and `navigator.clipboard.writeText` where exercised; in `afterEach`, call `await OverlayEngine.destroyActive()`, `engine?.destroy()`, `designAdapter?.deactivate()`, `vi.useRealTimers()`, `vi.unstubAllGlobals()`, `vi.restoreAllMocks()`, and clear test-injected children via `document.body.replaceChildren()` and `document.head.replaceChildren()` (preserving `happy-dom`'s `globalThis.document` and never writing `innerHTML = ""`).
    - Verify end-to-end tooltip rendering drives real `InspectorAdapter` (`minimalMode: true` and `minimalMode: false`) and `DesignAdapter` into `OverlayEngine.drawTooltip` / `safeDom` with adversarial dynamic inputs (`<script>alert(1)</script>` and `" onclick="alert(1)` in `componentName`, `rawAttributes`, `comments`, `selectors`, adversarial DOM element `id='"><img src=https://example.invalid/x>'` and `class='<img src=https://example.invalid/y>'`, and Windows backslashes `C:\Users\dev\App.tsx` in `fileName`), asserting zero `onclick` attributes on `.hoversource-link`, zero `<img>` elements created in `#hoversource-host` `shadowRoot` with selector text rendered literally, intact `data-hs-open-file="C:\Users\dev\App.tsx"`, literal escaped text rendering, delegated click dispatch to `GET /open-in-ide?...` via `companionTransport` with exact encoded query parameters (`file`, `line`, `column`, `tagName`, `classList`) in both modes, no-op on empty `data-hs-open-file`, and direct `globalThis.__HoverSourceOpen__(...)` dispatch.
    - Verify `#hoversource-host` mounts with open `shadowRoot`, `#hoversource-styles` includes `:host { all: initial; ... }` and resolves distinct `dark`, `light`, and `system` (`matchMedia`) tokens without color-string ternaries, `setFreezeMode(true)`/`(false)` is idempotent across both head and shadow freeze styles covering `.hoversource-tooltip`, `.hoversource-config-panel`, and `.hoversource-parent-badge`, freeze-mode `composedPath()` interactivity (`setFreezeMode(true)` / `Alt+P`, dispatching bubbling/composed `click` and `pointerover` on `.hoversource-link` / `.hoversource-config-panel` inside `shadowRoot` with `{ bubbles: true, composed: true }` leaves `e.defaultPrevented === false`, whereas a `click` on a host-page element outside `#hoversource-host` has `e.defaultPrevented === true`), `InspectorAdapter.getMinifiedHTML` `#hoversource-host` clone stripping (triggering `Alt+C` / `copyMetadata` while hovering a host container containing `#hoversource-host` passes markup without `hoversource-host` to `navigator.clipboard.writeText`), re-entrant `copyToClipboard` twice within `1500ms` restores original child nodes without `innerHTML`, `drawTooltip("", pointerEvent)` hint-preservation (under `vi.useFakeTimers()`, call `await engine.copyToClipboard("...")`, call `engine.drawTooltip("", pointerEvent)` before `1500` ms elapses, advance `await vi.advanceTimersByTimeAsync(1500)`, and assert that `.hoversource-shortcut-hint` inside `#hoversource-host` `shadowRoot` restores its original child nodes / `textContent` and is not stuck on `"Copied successfully for AI!"`), `engine.destroy()` during pending `writeText` prevents post-destroy hint mutation or timer leaks, and `document.getElementById("hoversource-host") === null` after `engine.destroy()` / `await OverlayEngine.destroyActive()`.
    - Exercise `filterPanel` rendering exclusively via the public `Alt+Ctrl+D` `KeyboardEvent` seam (`window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", altKey: true, ctrlKey: true }))`) + checkbox `change` / `nav-btn` click, verifying `<input type="checkbox">` elements are properly nested inside `td.check-col`, preserve `checked` state, trigger zero `innerHTML` writes, synchronously restore `shadowRoot.activeElement` to the newly rendered `#hoversource-next-btn` (or `#hoversource-prev-btn`) when focused prior to `click()` without dropping focus to `document.body`, and allow a `{ bubbles: true, composed: true }` click on `#hoversource-next-btn` to bubble to an ancestor `shadowRoot` listener without being swallowed by `stopPropagation()`.
    - Verify `InspectorAdapter.onPointerOver` `shadowHost` exclusion (launch `OverlayEngine` in `happy-dom`, mount a target `<button data-hs-source="App.tsx:1:1">Click</button>`, stub `document.elementsFromPoint` to return `[shadowHost, targetButton]`, dispatch a `pointerover` event on `targetButton` or `inspectorAdapter.onPointerOver`, and assert `InspectorAdapter` skips `#hoversource-host` and selects/highlights/resolves `targetButton` rather than `#hoversource-host`) and `DesignAdapter` `shadowHost` exclusion via public `InteractionMode` (`designAdapter.activate(engine)` + stubbed `document.elementsFromPoint` + non-zero mock `getBoundingClientRect()` bounds on `#hoversource-host` and descendant): (1) no-target `activate(engine)` produces zero `<rect>` anchor outlines in `#hoversource-design-svg`, and (2) mounting a non-candidate target with `designAdapter.activate(engine)` + `designAdapter.onShortcut("toggleFreeze")` renders `"No Anchor"` in the tooltip (confirming `getSnapCandidates()` excluded `#hoversource-host`).
  - Run `pnpm build && pnpm test`.

## Acceptance Criteria
- [x] Zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` writes occur in `@hoversource/overlay-core` runtime code during init, hover tooltip rendering, filter panel rendering, config reload, freeze mode, or re-entrant/cancelled clipboard copy.
- [x] `safeDom.ts` safely sanitizes `on*` (including valueless attributes), `srcdoc`, `<script>` (discarding `<script>...</script>` inner body and unclosed `<script>` EOF)/`<iframe>`/`<object>`/`<embed>` (discarding `<embed>` immediately as a void tag)/`<foreignObject>`/`<style>` (discarding `<style>...</style>` inner body and unclosed `<style>` EOF)/`<base>`, HTML comments (`<!--...-->`), literal `>` inside quoted attributes, invalid tag names, obfuscated URL schemes (including `data:application/xhtml+xml` and `data:text/xml`), single-pass named and numeric/hex HTML entities, SVG namespaces, case-insensitive auto-closing HTML void elements without `/>`, and valueless boolean attributes (`setAttribute(attrName, "")`).
- [x] Tooltip `.hoversource-link` triggers `/open-in-ide` cleanly via delegated `data-hs-open-*` click handling (plus `globalThis.__HoverSourceOpen__`) with all dynamic tooltip fields HTML-escaped and zero inline `onclick` attributes.
- [x] Overlay styles (`initStyles()` explicit `colors` tokens + `:host { all: initial; ... }`) and container UI live inside `#hoversource-host` `shadowRoot` (`mode: "open"`), isolating HoverSource CSS from host page styles while preserving identical tooltip, highlight, and filter panel UXUI.
- [x] `elementsFromPoint`, `composedPath()`, `InspectorAdapter.onPointerOver`, `DesignAdapter.updateTargetAtPosition()`, and `DesignAdapter.getSnapCandidates()` accurately skip `#hoversource-host`, `InspectorAdapter.getMinifiedHTML` strips `#hoversource-host` clones, idempotent `setFreezeMode` keeps `.hoversource-tooltip`, `.hoversource-config-panel`, and `.hoversource-parent-badge` interactive inside the shadow DOM, and `OverlayEngine.destroy()` / `destroyActive()` detaches `#hoversource-host` (`document.getElementById("hoversource-host") === null`) and nulls `shadowHost` / `shadowRoot`.
- [x] Filter panel navigation buttons (`#hoversource-prev-btn`, `#hoversource-next-btn`) carry `type="button"` and `aria-label`, preserve event bubbling (`{ bubbles: true, composed: true }`) without `stopPropagation()`, and synchronously restore `shadowRoot.activeElement` when activated while focused without dropping focus to `document.body`.
- [x] Automated verification passes in `happy-dom` and full workspace suite: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
