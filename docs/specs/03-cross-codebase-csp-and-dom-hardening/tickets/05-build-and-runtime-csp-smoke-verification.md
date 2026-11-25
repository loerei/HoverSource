# 05 — Build bundle cutover and headless Chromium CSP / Trusted Types / Shadow DOM smoke verification

## Epic
PRD: Cross-Codebase CSP Immunity and Strict DOM Hardening

## Status
ready-for-agent

## Blocked by
- `02` — Maintain persistent CDP CSP-bypass sessions and add `Runtime.addBinding` bridge in `client-injector`
- `03` — Strip HTML `<meta>` CSP tags in Web Proxy `ProxyResponsePipeline`
- `04` — Isolate overlay UI in Shadow DOM and replace `innerHTML` sinks for Trusted Types

## What to Build
> **Scope Guard:** Execute final `!NC` cutover build of `overlay.bundle.js`, verify the full workspace suite, and run a standalone real-browser headless Chromium smoke suite against strict CSP, Trusted Types, CSS resets, CDP binding bridge, and Web Proxy meta-CSP stripping.

Under `Operational Continuity: NON_CONTINUOUS_OPERATION` (`!NC`), verify the integrated runtime stack end-to-end in an isolated headless Chromium harness cleanly separated from `pnpm test`.

- [x] 1. **Rebuild workspace packages and tracked browser bundle**:
  - **Files:** **[MODIFY]** [overlay.bundle.js](file:///d:/Projects/HoverSource/packages/overlay-core/dist/overlay.bundle.js)
  - Execute `pnpm build` so `packages/overlay-core/dist/overlay.bundle.js` and all TypeScript package builds (`overlay-core`, `client-injector`, `companion-server`, `cli`) reflect the hardened code.
- [x] 2. **Run full monorepo automated test suite**:
  - Execute `pnpm test` across all packages with zero skipped assertions.
- [x] 3. **Execute headless Chromium real-runtime CDP + Proxy CSP/Shadow DOM smoke verification**:
  - **Files:** **[NEW]** [verify-csp-smoke.mjs](file:///d:/Projects/HoverSource/scripts/verify-csp-smoke.mjs)
  - Keep [verify-csp-smoke.mjs](file:///d:/Projects/HoverSource/scripts/verify-csp-smoke.mjs) decoupled from `pnpm test` so headless Vitest suites without Chromium remain isolated. Import compiled ESM outputs under `packages/*/dist/*.js` (produced by `pnpm build`) rather than `.ts` sources when executing `node scripts/verify-csp-smoke.mjs`. Resolve the locally installed Chromium binary (`chrome` / `msedge`) cross-platform with `--headless=new --remote-debugging-port=0` (or fail explicitly if unavailable).
  - **Execution, Port, Environment & Cleanup Contract**:
    - Use `port: 0` (reading `server.address().port`) for raw `http.createServer()` test targets, and pre-resolve nonzero dynamic free ports (via ephemeral `net`/`http` `listen(0)` probe + close or `findFreePort()` from [port.ts](file:///d:/Projects/HoverSource/packages/cli/src/port.ts)) before calling `startCompanionServer({ port: companionPort, ... })` or `startProxy({ proxyPort, companionPort, ... })`; never pass `0` directly to `startProxy` (which returns `Promise<void>`) or `startCompanionServer` (whose `/hoversource-overlay.js` handler in [server.ts](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts) injects `config.port` verbatim). Explicitly pass the resolved `companionPort` / `globalThis.__HOVERSOURCE_PORT__` (never assuming `7300`).
    - Isolate `startCompanionServer` in a dedicated child process (whenever used instead of a lightweight in-test HTTP companion stub for `/hoversource-overlay.js` and `/config`) — never invoke `startCompanionServer` in-process inside [verify-csp-smoke.mjs](file:///d:/Projects/HoverSource/scripts/verify-csp-smoke.mjs), because `server.ts` calls `process.exit(...)` on TOCTOU `EADDRINUSE` and `/shutdown`. Set `HOME` and `USERPROFILE` exclusively in that child `env` to the temporary scratch/user-data directory so temporary smoke paths never reach `~/.hoversourcerc`.
    - Connect to Chromium CDP using Node's built-in `globalThis.WebSocket` (or resolve `ws` strictly within `@hoversource/client-injector`, never assuming root-hoisted `"ws"`).
    - Spawn headless Chromium, the `startCompanionServer` child process, and the isolated `startProxy` child process with `shell: false` and `windowsHide: true`, clamping any captured `stdout`/`stderr` streams with a live byte ceiling (`maxBuffer`).
    - Prohibit arbitrary fixed `setTimeout` sleeps in checks `(a)`–`(c)`; use bounded state/selector polling (`waitForCondition` with explicit poll interval and finite timeout) for every asynchronous browser/overlay transition (`#hoversource-host` + `shadowRoot` mounting, `.hoversource-tooltip` visibility after `InspectorAdapter`'s 50ms hover debounce, `.hoversource-config-panel` `display === "block"`, `"Copied successfully for AI!"` in `.hoversource-shortcut-hint`, and `#hoversource-freeze-styles` / computed `pointer-events`). Enforce explicit finite timeouts on DevTools port discovery (`DevTools listening on` / `DevToolsActivePort`), WebSocket connect, CDP RPC waits (`Page.navigate`, `Runtime.evaluate`, `Runtime.bindingCalled`), and HTTP requests; race `startCompanionServer` readiness (`GET /ping` returning `200 pong`) and `startProxy` readiness polling against child `exit`/`error` listeners so startup errors fail fast with diagnostics.
    - Wrap all temporary servers, WebSocket clients, browser child processes, `startCompanionServer`/`startProxy` child processes, per-check CDP tabs, and temporary `--user-data-dir` directories in `try/finally` plus `SIGINT`/`SIGTERM` cleanup hooks; create a dedicated tab (`Target.createTarget`) for each check `(a)`, `(b)`, and `(c)` and deterministically close its CDP WebSocket and target (`Target.closeTarget`) in `try/finally` (plus invoking `closeAllCdpSessions()` in `finally` for check `(b)`) before starting the next check so `(b)`'s `injectOverlayScript` never picks up `(a)`'s tab; terminate all child processes via two-stage cleanup (`Browser.close` over CDP / `SIGTERM`, bounded `.unref()` grace timer escalating to `SIGKILL`), await child `exit`/`close`, and delete `--user-data-dir` with bounded `EBUSY`/`EPERM` retry backoff (`maxRetries`/`retryDelay` on `fs.rmSync`).
  - **Check (a) — Strict non-bypassed Trusted Types + `connect-src 'none'` check (NO `Page.setBypassCSP`)**:
    - Serve an HTML page with `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; require-trusted-types-for 'script'`, aggressive CSS resets (`* { all: unset; }`, `div { color: red !important; }`), a visible target element annotated with `data-hs-source="<fixture-rel-path>:<line>:<col>"` matching a real fixture file under the ephemeral companion server's `projectRoot`, and same-origin `/overlay.bundle.js`.
    - Attach CDP `Runtime.addBinding` (`__hoversourceBridgeCall`) forwarding to the ephemeral `companion-server` **without** calling `Page.setBypassCSP({ enabled: true })`, navigate so `overlay.bundle.js` executes before `<body>` parses, call `Page.bringToFront` on the target page session AND `Browser.grantPermissions({ origin: "http://127.0.0.1:<port>", permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] })` on the browser CDP session (never `"clipboardWrite"` or `"clipboard-write"`), hover the `data-hs-source` target via `Input.dispatchMouseEvent` (triggering `/validate-line` via `__hoversourceBridgeCall` returning HTTP 200 and rendering `.hoversource-link`), toggle the filter panel, trigger clipboard copy (`Alt+C` via `Input.dispatchKeyEvent`), and toggle freeze mode:
      - Assert zero `TrustedHTML` / `TrustedScript` / CSP / `appendChild` / `NotAllowedError` page or console errors occur across all overlay initialization, hover tooltip, `.hoversource-link`, filter panel, clipboard hint, and freeze-mode actions strictly prior to (or excluding) the intentional negative-control `fetch` probe.
      - Assert `#hoversource-host` `shadowRoot` mounts, `/config` + `/validate-line` round-trips succeed via `__hoversourceBridgeCall`, isolated `getComputedStyle` inside `shadowRoot` resists host CSS resets, and freeze-mode `pointer-events` computes to `none` on `#hoversource-host` and `auto` on `.hoversource-tooltip`.
      - After zero-error overlay assertions, run an intentional negative-control `fetch('/config')` probe and assert browser `fetch` is genuinely blocked by `connect-src 'none'` (`TypeError`).
  - **Check (b) — Full `client-injector` pre-`<body>` CDP session lifecycle check**:
    - On a fresh tab with `Content-Security-Policy: default-src 'self'; connect-src 'none'; require-trusted-types-for 'script'`, run `injectOverlayScript` from [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts) followed by `Page.reload` / `Page.navigate` so `Page.addScriptToEvaluateOnNewDocument` runs before `<body>` parses, verifying persistent CDP session tracking, `__hoversourceBridgeCall` round-trip, and `closeAllCdpSessions()` teardown.
  - **Check (c) — Web Reverse Proxy `<meta>` CSP stripping check**:
    - Serve a target returning `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; require-trusted-types-for 'script'">` through [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts) (`startProxy` with `overlayScriptUrl: "/hoversource/hoversource-overlay.js"`, pre-resolved dynamic `proxyPort` and `companionPort`, isolated in a dedicated child process) + [pipeline.ts](file:///d:/Projects/HoverSource/packages/cli/src/pipeline.ts), asserting meta CSP removal, `overlay.bundle.js` mount without errors, and `/hoversource/config` fetch success.

## Acceptance Criteria
- [x] `packages/overlay-core/dist/overlay.bundle.js` is freshly rebuilt via `pnpm build`.
- [x] Full workspace automated test suite (`pnpm test`) passes across all packages with zero skipped assertions.
- [x] `node scripts/verify-csp-smoke.mjs` executes cleanly across all three headless Chromium checks `(a)` Trusted Types + `connect-src 'none'` + Shadow DOM computed styles + freeze `pointer-events`, `(b)` `client-injector` pre-`<body>` CDP lifecycle + `closeAllCdpSessions()`, and `(c)` Web Proxy `<meta>` CSP stripping, leaving zero lingering processes or temporary files.
- [x] Execute final cutover verification command: `pnpm build && pnpm test && node scripts/verify-csp-smoke.mjs`.

## Verification Command
```bash
pnpm build && pnpm test && node scripts/verify-csp-smoke.mjs
```
