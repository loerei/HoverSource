# PRD: Cross-Codebase CSP Immunity and Strict DOM Hardening

- **Change Mode:** `BROWNFIELD`
- **Operational Continuity:** `NON_CONTINUOUS_OPERATION` (`!NC`)
- **Reviewed-At-Commit:** `a655c75ac12663be3294a9064970763ecf4f4cc7`
- **Upstream Prerequisite:** `docs/specs/02-cli-dashboard-and-settings`

## Problem Statement

1. **Overlay initialization crashes when injected before `<body>` exists (`document.body === null`)**:
   - In [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts), HoverSource injects via `Page.addScriptToEvaluateOnNewDocument` and `Runtime.evaluate`. When `OverlayEngine.launch()` ([overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts)) runs before HTML parsing creates `<body>`, a fast `fetch` rejection (e.g. CSP rejection) resumes `OverlayEngine.init()` straight into `this.createUI()` -> `document.body.appendChild(this.container)` while `document.body === null`, throwing `Uncaught (in promise) TypeError: Cannot read properties of null (reading 'appendChild')` and aborting style, shortcut, and pointer listener setup.
   - [inspector.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/inspector.ts) skips registering its cache-invalidation `MutationObserver` when loaded while `document.body` is `null`.
2. **Strict CSP (`connect-src 'self' | 'none'`) breaks Electron / CDP companion requests**:
   - Electron targets enforcing `connect-src 'self'` via `session.defaultSession.webRequest.onHeadersReceived` or `<meta http-equiv="Content-Security-Policy">` block cross-origin `fetch("http://127.0.0.1:<port>/...")` from `overlay.ts` and `InspectorAdapter.ts` (even more so when companion shifts to `7301+` per Epic `02`).
   - [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts) calls `Page.setBypassCSP({ enabled: true })` and immediately calls `ws.close()` on `Runtime.evaluate` completion; in CDP, closing the WebSocket client revokes session-scoped `setBypassCSP`.
   - `getCompanionBaseUrl()` is duplicated across [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts), [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts), and [DesignAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts), and `/static-context` aggregation is duplicated inside `InspectorAdapter.ts`.
3. **Web Reverse Proxy misses inline `<meta>` CSP policies**:
   - [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts) strips `content-security-policy` HTTP response headers across duplicated header blocks, while [pipeline.ts](file:///d:/Projects/HoverSource/packages/cli/src/pipeline.ts) leaves `<meta http-equiv="Content-Security-Policy">` and `<meta http-equiv="Content-Security-Policy-Report-Only">` tags intact inside proxied HTML documents.
4. **Light-DOM injection, inline `onclick` tooltip handlers, and `innerHTML` sinks break under strict app CSS resets and Trusted Types**:
   - [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts) mounts UI directly in `document.body` / `<style>` in `document.head`, exposing HoverSource tooltips and filter panels to target app CSS resets and global style conflicts.
   - Multiple `innerHTML` assignments in [overlay.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts) and [DesignAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/DesignAdapter.ts), plus inline `onclick="globalThis.__HoverSourceOpen__(...)"` tooltip links in [InspectorAdapter.ts](file:///d:/Projects/HoverSource/packages/overlay-core/src/modes/InspectorAdapter.ts), fail in high-security apps enforcing `require-trusted-types-for 'script'` and `script-src-attr 'none'`.

## Solution

1. **Extract HTTP `companionTransport` seam & `/static-context` helper (`01.1`, `S`)**:
   - Consolidate `getCompanionBaseUrl()` and HTTP `companionRequestJson()` (with `timeoutMs` clamping, `AbortSignal` composition, status checking, and late-rejection suppression) into `companionTransport.ts` inside `@hoversource/overlay-core`, deduplicate companion `fetch` helpers across `overlay.ts`, `InspectorAdapter.ts`, and `DesignAdapter.ts`, and unify `/static-context` fetching into `fetchStaticContextForElement` in `InspectorAdapter.ts`.
2. **Add CDP bridge transport & acyclic DOM readiness gates (`01.2`, `B`)**:
   - Layer the CSPRNG-nonced `__hoversourceBridgeCall` / `__hoversourceBridgeResolve` / `__hoversourceBridgeReject` RPC bridge onto `companionTransport.ts`, extract `waitForDomBody` into leaf module `domReady.ts` (avoiding `overlay.ts` <-> `inspector.ts` circularity), harden `OverlayEngine.launch()` / `destroyActive()` / `destroy()` + non-fatal `loadConfig()`, guard `vanillaPatch.ts` DOM mocks, and defer `inspector.ts` `MutationObserver` registration cleanly with epoch/abort teardown (`disconnectInspectorMutationObserver()`).
3. **Keep CDP CSP-bypass session alive & add validated `Runtime.addBinding` companion RPC bridge (`02`, `S -> B`)**:
   - Consolidate `getInjectableTargets` (`S`) and `ElectronCdpLauncher` cleanup (`createElectronCdpCleanup`, `S`), maintain per-target persistent CDP WebSocket sessions in [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts) (so `Page.setBypassCSP` stays active until target disconnect), strictly validate `Runtime.bindingCalled` payloads via `parseBridgeCallPayload` (control-char checks, 6-route GET allowlist, POST `/config`-only, non-2xx/overflow/timeout parity, session-scoped `inFlightRequests`), reuse active sessions / deterministically await `"close"` on ephemeral sockets in `broadcastToTargets`, and add overlap/abort-safe CLI polling (`startCdpInjectionWatch`).
4. **Strip HTML `<meta>` CSP tags and extract proxy header sanitizers (`03`, `B -> S`)**:
   - Strip `<meta http-equiv="Content-Security-Policy"...>` and `<meta http-equiv="Content-Security-Policy-Report-Only"...>` tags inside [pipeline.ts](file:///d:/Projects/HoverSource/packages/cli/src/pipeline.ts) `ProxyResponsePipeline.transform()` using a single-pass $O(N)$ quote-aware `stripMetaCspTags` scanner while preserving non-CSP meta tags, and extract `stripCspHeaders` + response-header sanitization helpers in [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts).
5. **Shadow DOM isolation & Trusted-Types-safe DOM rendering (`04`, `S -> B`)**:
   - Replace theme border ternaries in `initStyles()` with explicit `colors` tokens (`S`), render HoverSource UI and `:host { all: initial; ... }` styles inside `#hoversource-host` `open` `ShadowRoot` attached cleanly to `document.body`, migrate `.hoversource-link` inline `onclick` attributes to escaped `data-hs-open-*` attributes + delegated click handling on `this.tooltipBox`, exclude `shadowHost` across pointer/boundary checks (`overlay.ts`, `InspectorAdapter.ts`, `DesignAdapter.updateTargetAtPosition()` + `getSnapCandidates()`), and replace all `innerHTML` sinks with canonicalized `safeDom.ts` builders (`createSafeFragmentFromHtml` / `setElementContentSafely` / `el`).
6. **Build bundle cutover & headless Chromium runtime CSP smoke verification (`05`, `B`)**:
   - Rebuild tracked `packages/overlay-core/dist/overlay.bundle.js` (`pnpm build`), verify `pnpm test`, and run standalone real-browser headless Chromium smoke suite (`scripts/verify-csp-smoke.mjs`) covering strict non-bypassed Trusted Types + `connect-src 'none'`, full `client-injector` pre-`<body>` CDP lifecycle, and Web Proxy `<meta>` CSP stripping.

## User Stories

1. As a developer running HoverSource on an Electron + Vite app with strict `connect-src 'self'` CSP (such as YumeShelf), I want the overlay to mount reliably without modifying my app's CSP configuration and have config load, IDE navigation, and line validation work over CDP.
2. As a developer working on enterprise or security-hardened web apps (`<meta>` CSP, `require-trusted-types-for 'script'`, `script-src-attr 'none'`, aggressive CSS resets), I want HoverSource's proxy and overlay UI to run without Trusted Types errors, broken links, or style leakage.

## Implementation Decisions

- **Zero target-repo mutation**: HoverSource handles CSP and DOM isolation strictly inside its own proxy, CDP injector, and overlay runtime. Target repositories do not need dev-only CSP relaxations.
- **Dual transport & cross-package RPC wire contract**:
  - `BridgeCallPayload`: `{ id: string; method: "GET" | "POST"; path: string; body?: string }` where `id = "${bridgeInstanceNonce}:${++seq}"` using CSPRNG `bridgeInstanceNonce` (immune to cross-navigation ID collisions).
  - Page -> Node: `globalThis.__hoversourceBridgeCall(JSON.stringify(payload))`; Node -> Page (2xx): `globalThis.__hoversourceBridgeResolve?.(idJsonLiteral, rawBodyJsonLiteral)`; Node -> Page (error / non-2xx / timeout): `globalThis.__hoversourceBridgeReject?.(idJsonLiteral, errMsgJsonLiteral)`.
  - Prefer CDP binding transport when `typeof globalThis.__hoversourceBridgeCall === "function"`, falling back cleanly to HTTP `fetch` (`"/hoversource..."` in proxy mode or `http://127.0.0.1:<port>...` otherwise) with uniform `timeoutMs`, `AbortSignal`, status checking (`!res.ok`), and late-rejection suppression.
  - Decouple companion network errors from UI/listener registration so local inspection and clipboard metadata copy continue functioning even offline.
- **Persistent CDP session registry & ingress allowlist**:
  - `injector.ts` tracks active `WebSocket` sessions keyed deterministically via `getSessionKey(port, target)`, enforces `sessionEpoch` + `inFlightSessions` race guards, keeps `Page.setBypassCSP({ enabled: true })` alive until target disconnection (`close`/`error`), tracks per-session `executionContexts` (`Runtime.executionContextCreated` / `Destroyed` / `Cleared`) and `trustedOrigin` (`target.url`, unconditionally re-derived on top-level `Page.frameNavigated` so navigating to `about:blank`/`data:` clears stale origins, with `Runtime.executionContextCreated` fallback gated on known `mainFrameId`) to fail closed on `Runtime.bindingCalled` invocations whenever `executionContexts` is empty, `trustedOrigin` is empty, or the context is unknown / cross-origin / `null`-origin, validates all `Runtime.bindingCalled` ingress through `parseBridgeCallPayload` (control-char check, `GET` allowlist of 6 routes, `POST` restricted to `/config` with `target === "local"` and no `customPath`, `GET /config` empty query, `GET /open-in-ide` non-empty `file` with bounded fixed-point percent-decoding rejecting shell metacharacters and `%VAR%` expansion on the decoded path and `editor` in `vscode`/`code`/`cursor`, response size limit, per-session `inFlightRequests`), reuses existing active sessions / awaits `"close"` settlement on ephemeral sockets in `broadcastToTargets`, and tears down cleanly via `closeAllCdpSessions()` + `createElectronCdpCleanup`.
- **Shadow DOM boundary, CSS isolation, & freeze contract**:
  - Mount a single host element (`#hoversource-host`) in `document.body` owning an `open` `ShadowRoot` containing `#hoversource-styles` (including `:host { all: initial; ... }` and explicit theme tokens), `.hoversource-container`, outline, tooltip, filter panel, and Design Mode SVG/badges.
  - Keep page-level freeze blocker rules (`* { pointer-events: auto !important; }`, `#hoversource-host { pointer-events: none !important; }`) in `document.head` (using `textContent`) paired with internal shadow rules keeping `.hoversource-tooltip`, `.hoversource-config-panel`, and `.hoversource-parent-badge` (and descendants) interactive (`pointer-events: auto !important`).
  - Ignore `this.shadowHost` in pointer handlers (`composedPath()`), `InspectorAdapter.ts`, `DesignAdapter.updateTargetAtPosition()`, and `DesignAdapter.getSnapCandidates()`.
- **Zero `innerHTML` & delegated event contract (`Trusted Types`)**:
  - Preserve `OverlayController.drawTooltip(html, pointerEvent)` public signature while translating sanitized HoverSource tooltip/panel HTML into real DOM nodes via `safeDom.ts` (`createElement` / `createElementNS` / `createTextNode`), HTML-escape all dynamic tooltip inputs, replace `.hoversource-link` inline `onclick` with `data-hs-open-*` + delegated `tooltipBox` click handling, and eliminate every `innerHTML` assignment across `@hoversource/overlay-core`.

## Intentional Deltas

> **Default Preserve (`BROWNFIELD`):** Existing `vanillaPatch.ts` runtime interception behavior, Inspector/Design keyboard shortcuts, `OverlayController` adapter interface signatures, `globalThis.__HoverSourceOpen__` compatibility, and companion server HTTP routes remain **PRESERVE**; only deltas explicitly listed below may change.

- **`INTENTIONALLY_CHANGED`**:
  - `OverlayEngine` awaits `domReady.waitForDomBody` before mounting UI/styles, exports `OverlayEngine` with epoch-serialized `launch()` / `destroyActive()` / `destroy()`, and renders its container/styles inside `#hoversource-host` `ShadowRoot` instead of directly inside `document.body` / `document.head`.
  - `overlay-core` routes companion requests through `companionTransport.ts` (using CDP `Runtime.addBinding` when injected via CDP, HTTP `fetch` otherwise), eliminates `innerHTML` string sinks via `safeDom.ts`, and replaces `.hoversource-link` inline `onclick` handlers with `data-hs-open-*` + delegated `tooltipBox` click dispatch.
  - `client-injector` maintains persistent CDP WebSocket connections for active injected targets instead of closing `ws` immediately after `Runtime.evaluate`, and enforces `Runtime.bindingCalled` ingress route validation.
  - `ProxyResponsePipeline.transform()` strips `<meta http-equiv="Content-Security-Policy"...>` and `<meta http-equiv="Content-Security-Policy-Report-Only"...>` tags from proxied HTML.

## Testing Decisions

- **Unit & integration seams**:
  - `companionTransport.test.ts`, `InspectorAdapter.test.ts`, & `overlay.lifecycle.test.ts` (HTTP routing, `/static-context` helper parity, CDP bridge round-trip/nonce isolation/abort cleanup, simulated pre-`<body>` `DOMContentLoaded` + sync `loadConfig` failure, bodyless timeouts, concurrent `OverlayEngine.launch()` / `destroyActive()` cancellation, `initInspectorMutationObserver` + `disconnectInspectorMutationObserver()`).
  - `injector.test.ts`, `cli.test.ts`, & `ElectronCdpLauncher.test.ts` (persistent `Page.setBypassCSP` WS lifecycle, `Runtime.bindingCalled` `executionContextId` origin isolation across `Runtime.executionContextCreated`/`Destroyed`/`Cleared` and `Page.frameNavigated`, route/parameter/body allowlists, rejection/timeout/payload escaping, reconnect & `sessionEpoch` race safety, `broadcastToTargets` open-session reuse and deterministic `WebSocket.CLOSED` ephemeral settlement, `startCdpInjectionWatch` overlap/clamp/abort tests, idempotent `createElectronCdpCleanup`).
  - `pipeline.test.ts` & `proxy.integration.test.ts` (quote-aware ReDoS-free `<meta>` CSP stripping across variants/gzip + live proxy CSP header/meta stripping).
  - `overlay.isolation.test.ts` (`happy-dom` environment with `Element.prototype.innerHTML` setter spy, `safeDom.ts` XSS/entity/SVG verification, adversarial `InspectorAdapter` + `DesignAdapter` tooltip escaping and delegated `data-hs-open-*` click dispatch, `:host` + `ShadowRoot` theme token isolation, idempotent freeze styles, re-entrant/cancelled clipboard copy, and public-API `DesignAdapter` `shadowHost` exclusion).
- **Terminal `!NC` real-browser smoke verification (Ticket `05`)**:
  - Standalone `node scripts/verify-csp-smoke.mjs` launching headless Chromium across non-bypassed Trusted Types + `connect-src 'none'` + Shadow DOM computed styles, `client-injector` pre-`<body>` CDP lifecycle, and Web Proxy `<meta>` CSP stripping.

## Out of Scope

- Bypassing OS-level enterprise kernel proxies or non-Chromium desktop webviews without CDP / reverse proxy support.
- Automatically trusting self-signed certificates on remote/LAN non-localhost devices beyond existing `cert.ts` Root CA flow.

## Tickets

- **Critical Path:** `01.1 -> 01.2 -> 04 -> 05` / `01.1 -> 01.2 -> 02 -> 05` (with `03 -> 05` executing in parallel).

- `01.1` — Extract HTTP `companionTransport` seam in `overlay-core` (`tickets/01.1-extract-companion-transport-seam.md`)
- `01.2` — Add CDP bridge transport and DOM readiness gates (`tickets/01.2-cdp-bridge-transport-and-dom-readiness.md`)
- `02` — Maintain persistent CDP CSP-bypass sessions and add `Runtime.addBinding` bridge in `client-injector` (`tickets/02-persistent-cdp-session-and-binding-bridge.md`)
- `03` — Strip HTML `<meta>` CSP tags in Web Proxy `ProxyResponsePipeline` (`tickets/03-strip-html-meta-csp-in-proxy-pipeline.md`)
- `04` — Isolate overlay UI in Shadow DOM and replace `innerHTML` sinks for Trusted Types (`tickets/04-shadow-dom-and-trusted-types-hardening.md`)
- `05` — Build bundle cutover and headless Chromium CSP / Trusted Types / Shadow DOM smoke verification (`tickets/05-build-and-runtime-csp-smoke-verification.md`)
