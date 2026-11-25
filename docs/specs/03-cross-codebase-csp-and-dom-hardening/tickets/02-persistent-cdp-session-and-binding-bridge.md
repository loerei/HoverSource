# 02 — Maintain persistent CDP CSP-bypass sessions and add `Runtime.addBinding` bridge in `client-injector`

## Epic
PRD: Cross-Codebase CSP Immunity and Strict DOM Hardening

## Status
ready-for-agent

## Blocked by
- `01.2` — Add CDP bridge transport and DOM readiness gates

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Keep CDP WebSocket connections alive in [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts) so `Page.setBypassCSP` stays active for the target's lifetime, expose strictly validated CDP `Runtime.addBinding` (`__hoversourceBridgeCall`) RPC forwarding to `companion-server` in Node (eliminating renderer `connect-src` blocks), tidy CDP target discovery and `ElectronCdpLauncher` cleanup seams, and wire overlap/abort-safe CLI teardown cleanly.

- [x] 1. **Extract shared CDP target discovery helper `getInjectableTargets` in `injector.ts`**:
  - **Files:** **[MODIFY]** [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts)
  - Pure structural extraction consolidating the duplicated `/json` fetch and `validTargets` predicate into `getInjectableTargets(port: number): Promise<CdpTarget[]>` prior to building persistent session tracking.
- [x] 2. **Persistent CDP session registry, CSP bypass keep-alive, and teardown**:
  - **Files:** **[MODIFY]** [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts)
  - Expose backward-compatible options seams:
    ```ts
    export interface InjectOverlayOptions {
      companionPort?: number;
      requestTimeoutMs?: number;
      setupTimeoutMs?: number;
    }
    export interface BroadcastTargetOptions {
      ephemeralCloseTimeoutMs?: number;
    }
    export async function injectOverlayScript(
      port: number,
      scriptContent: string,
      optionsOrCompanionPort?: number | InjectOverlayOptions
    ): Promise<number>
    export async function broadcastToTargets(
      port: number,
      scriptContent: string,
      options?: BroadcastTargetOptions
    ): Promise<void>
    ```
  - Clamp `requestTimeoutMs` (`Number.isFinite(v) && v > 0 ? v : 5000`), `setupTimeoutMs` (`Number.isFinite(v) && v > 0 ? v : 5000`), and `ephemeralCloseTimeoutMs` (`Number.isFinite(v) && v > 0 ? v : 500`).
  - Define a single deterministic `getSessionKey(port, target)` helper (`${port}:${target.id || target.webSocketDebuggerUrl}`) used identically by `activeSessions`, `inFlightSessions`, `injectOverlayScript`, and `broadcastToTargets`. Treat `activeSessions.get(key)` as active only when `session.ws.readyState === WebSocket.OPEN` (evicting stale non-`OPEN` entries before reconnecting).
  - Close check-await-insert and teardown races:
    - Track `sessionEpoch`, incremented inside `closeAllCdpSessions()` (closing/terminating both `activeSessions` and `inFlightSessions` sockets safely regardless of whether `readyState` is `CONNECTING` or `OPEN`, via `ws.readyState === WebSocket.OPEN ? ws.close() : ws.terminate()`).
    - Capture `const startEpoch = sessionEpoch;` at the start of `injectOverlayScript` (before `getInjectableTargets` / `isAlreadyInjected`) and pass `startEpoch` into `injectIntoTarget` (checking `if (sessionEpoch !== startEpoch) return injectionCount;` after `await isAlreadyInjected(...)`).
    - Keep `inFlightSessions` strictly typed as `Map<string, WebSocket>`, populating `inFlightSessions.set(key, ws)` synchronously when constructing `new WebSocket(wsUrl)` inside `injectIntoTarget` (after re-checking `activeSessions`, `inFlightSessions`, and `sessionEpoch !== startEpoch` synchronously after `await isAlreadyInjected(...)` and at entry of `injectIntoTarget`), and only increment `injectionCount` when `injectIntoTarget` actually inserts the new session into `activeSessions`.
    - If `sessionEpoch` changes while awaiting `open` or setup acks in `injectIntoTarget`, close/terminate the socket and return without inserting into `activeSessions`.
    - Guard registry removals inside `ws.on("close")` / `ws.on("error")` and `injectIntoTarget` `finally` cleanup with instance identity checks (`if (activeSessions.get(key) === session) activeSessions.delete(key);` and `if (inFlightSessions.get(key) === ws) inFlightSessions.delete(key);`) so delayed close events from an evicted prior socket never remove a newer session for `key`.
  - Check `activeSessions` and `inFlightSessions` **before** `isAlreadyInjected`. Do not skip targets that carry `__HOVERSOURCE_PORT__` from a closed prior session when no active persistent WS is open; only skip `Runtime.evaluate(scriptContent)` if `isAlreadyInjected` is true while still establishing the persistent session (`Page.enable`, `Page.setBypassCSP({ enabled: true })`, `Runtime.enable`, `Runtime.addBinding({ name: "__hoversourceBridgeCall" })`, `Page.addScriptToEvaluateOnNewDocument`).
  - Track active execution contexts per persistent session via `executionContexts = new Map<number, { origin: string; isDefault?: boolean; frameId?: string }>()` updated on `Runtime.executionContextCreated` (`params.context`), `Runtime.executionContextDestroyed` (`params.executionContextId`), and `Runtime.executionContextsCleared` (all emitted automatically because `Runtime.enable` is active).
  - Extract a `try/catch`-guarded helper `deriveTrustedOrigin(rawUrl?: string): string` returning `new URL(rawUrl).origin` for `http:`/`https:` schemes, `"file://"` for `file:`, and `""` for all other schemes (`about:blank`, `data:`, `devtools://`) or malformed URLs. Initialize `let trustedOrigin = deriveTrustedOrigin(target.url)` and `let mainFrameId: string | undefined`. On `Page.frameNavigated` when `!params.frame?.parentId`, capture `mainFrameId = params.frame?.id ?? mainFrameId` and unconditionally reassign `trustedOrigin = deriveTrustedOrigin(params.frame?.url);` (clearing stale origins when navigating from an `http:`/`https:` origin to `about:blank` or `data:`, while preventing child frames from overwriting it). On `Runtime.executionContextCreated`, only fall back to `ctx.auxData?.isDefault === true` when `!trustedOrigin`, `mainFrameId !== undefined`, `ctx.auxData?.frameId === mainFrameId`, and `ctx.origin` is non-empty and not `"null"` (preventing child iframe contexts from poisoning `trustedOrigin` before `Page.frameNavigated` populates `mainFrameId`):
    ```ts
    if (!params.frame?.parentId) {
      mainFrameId = params.frame?.id ?? mainFrameId;
      trustedOrigin = deriveTrustedOrigin(params.frame?.url);
    }
    ```
    ```ts
    if (
      !trustedOrigin &&
      mainFrameId !== undefined &&
      ctx.auxData?.isDefault === true &&
      ctx.auxData?.frameId === mainFrameId &&
      ctx.origin &&
      ctx.origin !== "null"
    ) {
      trustedOrigin = ctx.origin;
    }
    ```
  - Harden `isAlreadyInjected(wsUrl)`: attach `ws.on("close", ...)` to clear the `1500ms` timeout and settle `false` early, guard `ws.readyState === WebSocket.OPEN` before `ws.send(...)`, and terminate safely on timeout/cleanup using `ws.readyState === WebSocket.OPEN ? ws.close() : ws.terminate()`.
  - Route all CDP commands per session through a monotonic `nextCmdId` + `pendingCommands: Map<number, ...>` helper (`sendCommand(session, method, params)`): check `if (session.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(...));` before `ws.send(...)`, wrap `ws.send(...)` in `try/catch` to delete `cmdId` and reject cleanly on throw, resolve on `msg.result` and reject ONLY that command's promise on `msg.error` (including `method` alongside `msg.id` and `msg.error`, e.g., ``CDP ${method} failed (id=${msg.id}): ${JSON.stringify(msg.error)}``) without calling `ws.close()` (so transient `Runtime.evaluate` errors do not tear down `Page.setBypassCSP`); reject all `pendingCommands` and remove the session only on `ws` `close`/`error` or setup failure.
  - During `injectIntoTarget`'s initial `open` wait, reject on BOTH `ws.on("error", ...)` and `ws.on("close", ...)` so calling `closeAllCdpSessions()` during setup resolves/rejects cleanly without waiting for `setupTimeoutMs`, always clearing `fetchJson` (`2500ms`, calling `res.resume()` when `res.statusCode !== 200` and `req.destroy()` on timeout) and `injectIntoTarget` (`setupTimeoutMs`) timers in `finally`.
  - Export `closeAllCdpSessions(): void` for graceful CLI teardown.
- [x] 3. **CDP `Runtime.bindingCalled` strict ingress validator and HTTP forwarding bridge**:
  - **Files:** **[MODIFY]** [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts)
  - Implement fail-closed `executionContextId` origin isolation in the `Runtime.bindingCalled` handler for `"__hoversourceBridgeCall"`: always require `typeof params.executionContextId === "number"` and look up `const ctx = executionContexts.get(params.executionContextId)` (never bypassing when `executionContexts` is empty or `trustedOrigin` is empty). If `!ctx`, `ctx.origin === "null"` (sandboxed iframe), `trustedOrigin === ""` (e.g. `data:`/`about:blank` target without a resolved default context), or `ctx.origin !== trustedOrigin`, log a redacted `[HoverSource]` `console.warn` (recording `executionContextId`, `ctx?.origin`, and `target.url`, omitting `params.payload`), reject via `__hoversourceBridgeReject` if `id` is valid, and return immediately without forwarding to `companion-server`:
    ```ts
    const ctx = typeof params.executionContextId === "number"
      ? executionContexts.get(params.executionContextId)
      : undefined;
    const isAllowedOrigin =
      ctx !== undefined &&
      ctx.origin !== "null" &&
      trustedOrigin !== "" &&
      ctx.origin === trustedOrigin;
    if (!isAllowedOrigin) {
      console.warn(
        `[HoverSource] Rejected CDP bridge call from untrusted execution context (executionContextId=${String(params.executionContextId ?? "unknown")}, origin=${ctx?.origin ?? "unknown"}) on ${target.url}`
      );
      // Reject via __hoversourceBridgeReject if parsed id is valid, then return
      return;
    }
    ```
  - Implement strict ingress validation `parseBridgeCallPayload(raw: string)` for `Runtime.bindingCalled` events where `params.name === "__hoversourceBridgeCall"`:
    - Reject non-string or oversized raw payloads (`typeof raw !== "string" || raw.length > 1_048_576`).
    - Parse JSON `params.payload` into a plain object (`parsed && typeof parsed === "object" && !Array.isArray(parsed)`).
    - Validate `typeof parsed.id === "string" && parsed.id.length > 0 && parsed.id.length <= 256`; only invoke `__hoversourceBridgeReject` when `id` passes this check.
    - Validate `parsed.body === undefined || (typeof parsed.body === "string" && parsed.body.length <= 1_048_576)`, rejecting `body !== undefined` when `method === "GET"`.
    - Enforce `method` in `new Set(["GET", "POST"])`, explicitly enforce `typeof parsed.path === "string" && parsed.path.startsWith("/") && !parsed.path.startsWith("//") && !parsed.path.includes("\\")` AND reject ASCII control characters (`!/[\u0000-\u001f\u007f]/.test(path)`) BEFORE `new URL(path, "http://127.0.0.1")` inside `try/catch` (preventing WHATWG URL tab/newline stripping bypasses and rejecting full URLs consistently), assert `parsedUrl.origin === "http://127.0.0.1"`, check `parsedUrl.pathname` against allowlist `new Set(["/config", "/open-dashboard", "/open-in-ide", "/validate-line", "/static-context", "/resolve-html-element"])`, enforce `(method, pathname)` pairing (`POST` allowed ONLY for `"/config"`; `GET` allowed for all 6 allowlisted routes), enforce route-specific parameter and body schemas:
      - For `GET /config`: require `parsedUrl.search === ""` (reject `?target=custom&customPath=...`).
      - For `POST /config`: require `typeof parsed.body === "string"`, parse `parsed.body` via `JSON.parse` into `bodyObj`, and require `bodyObj !== null && typeof bodyObj === "object" && !Array.isArray(bodyObj)` with `bodyObj.target === "local"`, `bodyObj.customPath === undefined`, and `bodyObj.config !== null && typeof bodyObj.config === "object" && !Array.isArray(bodyObj.config)` (preventing renderer-originated writes to `~/.hoversourcerc` or arbitrary `customPath` directories, and cleanly rejecting `JSON.parse("null")`).
      - For `GET /open-in-ide`: require a non-empty `file` query parameter (`parsedUrl.searchParams.get("file")`), iteratively decode `fileParam` in a bounded fixed-point loop (up to 4 passes, matching and bounding the 3-decode depth across `URL.searchParams.get("file")` -> `sourceLocation.ts:126` -> `sourceLocation.ts:24`, rejecting if `decodeURIComponent` throws or does not stabilize within 4 passes), check `SHELL_META_RE` against both raw `fileParam` and `decodedFile`, check `WIN_ENV_VAR_RE` against `decodedFile` **only** (never raw `fileParam`, so legitimate multi-space `/@fs/` paths like `My%20Name%20Here` or dynamic routes like `%5Bid%5D` are not falsely rejected):
        ```ts
        let decodedFile = fileParam;
        let stabilized = false;
        for (let pass = 0; pass < 4; pass++) {
          let next: string;
          try {
            next = decodeURIComponent(decodedFile);
          } catch {
            return { ok: false, error: "Malformed percent-encoding in /open-in-ide file parameter" };
          }
          if (next === decodedFile) {
            stabilized = true;
            break;
          }
          decodedFile = next;
        }
        if (!stabilized) {
          return { ok: false, error: "Excessive percent-encoding depth in /open-in-ide file parameter" };
        }
        const SHELL_META_RE = /["`$\r\n\0]/;
        const WIN_ENV_VAR_RE = /%[^%/\\]+%/;
        if (
          SHELL_META_RE.test(fileParam) ||
          SHELL_META_RE.test(decodedFile) ||
          WIN_ENV_VAR_RE.test(decodedFile)
        ) {
          return { ok: false, error: "Disallowed characters in /open-in-ide file parameter" };
        }
        ```
        and if `editor` is present (`parsedUrl.searchParams.get("editor")`), restrict it to `new Set(["vscode", "code", "cursor"])`.
    - Forward ONLY canonicalized `parsedUrl.pathname + parsedUrl.search` to `http.request` (`http://127.0.0.1:${companionPort}${canonicalPath}`, with `Content-Type: application/json` when `body !== undefined`, resolving `companionPort` from options or parsed `__HOVERSOURCE_PORT__`, defaulting to `7300`).
  - Reject via `globalThis.__hoversourceBridgeReject?.(...)` whenever companion HTTP returns non-2xx (`statusCode < 200 || statusCode >= 300`), times out (`requestTimeoutMs`, default `5000`), exceeds `MAX_COMPANION_RESPONSE_BYTES = 5 * 1024 * 1024` (checking cumulative byte length in `companionRes.on("data", ...)` before `Buffer.concat`, destroying `req`/`companionRes` on overflow), or fails network I/O, including `method`, `path`, and `statusCode` (plus parsed companion `error` detail when present) in the error string.
  - Enforce single-settlement (`let settled = false`) across `timeout` (`req.destroy(new Error("Companion request timed out"))`), `req` `error`, `companionRes.on("error", ...)`, `companionRes.on("close", ...)` (settling via `__hoversourceBridgeReject` if the stream closes prematurely without `end`/`error` while `!settled`), and `companionRes.on("end")`; track active requests per persistent CDP session in `inFlightRequests: Set<http.ClientRequest>` (adding on creation, removing on settlement, destroying remaining entries inside the session's single `ws.on("close")` / `ws.on("error")` handler) instead of attaching per-RPC `"close"` listeners on `ws`.
  - Serialize both `id` and `payloadJson` with `JSON.stringify` when building `Runtime.evaluate` calls (`globalThis.__hoversourceBridgeResolve?.(${JSON.stringify(id)}, ${JSON.stringify(payloadJson)})` / `__hoversourceBridgeReject`), route those `Runtime.evaluate` calls through `await sendCommand(session, "Runtime.evaluate", { expression: ..., ...(typeof params.executionContextId === "number" ? { contextId: params.executionContextId } : {}) })` inside the `Runtime.bindingCalled` `try/catch` block (or attach `.catch(...)`) rather than raw `ws.send` with a hardcoded command ID so command IDs remain strictly monotonic across setup, bridge responses, and `broadcastToTargets` without risking unhandled Promise rejections on mid-flight socket closes or `msg.error` responses, guard `ws.readyState === WebSocket.OPEN` before sending `Runtime.evaluate`, wrap the entire `Runtime.bindingCalled` async dispatch in an outer `try/catch` inside `ws.on("message", ...)`, and emit bounded `[HoverSource]` diagnostics (`console.warn` for malformed/disallowed ingress payloads and companion/CDP delivery failures; `console.debug` when WS closed mid-flight) recording `method`, `path` (if parsed), `statusCode`/error message, and target URL while explicitly omitting/redacting `body` and raw `params.payload`.
- [x] 4. **Reuse active CDP sessions in `broadcastToTargets` with deterministic ephemeral close settlement**:
  - **Files:** **[MODIFY]** [injector.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/injector.ts)
  - Collect and await `Promise.allSettled(...)` across all per-target operations before resolving `Promise<void>` (catching per-target `sendCommand` rejections cleanly).
  - Send `Runtime.evaluate` through `sendCommand(session, "Runtime.evaluate", ...)` on active tracked open sessions (never hardcoded `id: 1`).
  - For untracked ephemeral WebSocket targets (replacing the blind `setTimeout(() => ws.close(), 100)`):
    - Arm the `.unref()`'d `ephemeralCloseTimeoutMs` fallback timer when creating the `WebSocket` (not only inside `ws.on("open")`). When `Runtime.evaluate` receives its command ack, initiate graceful close via `if (ws.readyState === WebSocket.OPEN) ws.close();` **without** settling the target's promise or clearing the fallback timer on the ack itself.
    - Attach `ws.on("error", (err) => { ... })` before `"open"`: log via `console.debug(...)`, and if `ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING`, call `ws.terminate()`. Do **not** settle in `"error"` unless `ws.readyState === WebSocket.CLOSED` already; let the trailing `"close"` event settle once `socket.destroy()` / `abortHandshake()` finishes.
    - In the `ephemeralCloseTimeoutMs` fallback timer callback: call `ws.terminate()` (when `ws.readyState !== WebSocket.CLOSED`), and do **not** settle the promise synchronously right after calling `ws.terminate()` (only settle directly inside the timer callback if `ws.readyState === WebSocket.CLOSED` already, leaving any `OPEN` / `CONNECTING` / `CLOSING` socket to settle via its resulting `"close"` event).
    - Settle the per-target promise and clear the `ephemeralCloseTimeoutMs` fallback timer **only** when `ws.once("close", ...)` fires (or synchronously in `catch` if `new WebSocket(wsUrl)` throws before constructing a socket, or synchronously if `ws.readyState === WebSocket.CLOSED` already), guaranteeing every ephemeral socket reaches `ws.readyState === WebSocket.CLOSED` (`3`) before `broadcastToTargets` resolves.
- [x] 5. **Tidy `ElectronCdpLauncher.ts` launch closure, cleanup seam, and error logging**:
  - **Files:** **[MODIFY]** [ElectronCdpLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/ElectronCdpLauncher.ts)
  - Remove the single-use `runWithCdp(portToUse)` wrapper closure, add debug logging instead of the empty `catch {}`, and extract exported helper seam:
    ```ts
    export function createElectronCdpCleanup(deps: {
      watchAbort?: AbortController;
      closeSessions?: () => void;
      exit?: (code?: number) => void;
      processEvents?: Pick<NodeJS.EventEmitter, "once" | "removeListener">;
      child?: Pick<NodeJS.EventEmitter, "on" | "removeListener">;
    }): () => void
    ```
    attaching/detaching `SIGINT`/`SIGTERM` (on `deps.processEvents`, defaulting to `process` only when omitted while tests pass `new EventEmitter()`) and child `exit` listeners (when `deps.child` is provided), calling `watchAbort?.abort()` and `closeSessions?.()`, and invoking `exit?.()` at most once guarded by `cleanedUp` (defaulting `exit` to `() => process.exit()`).
- [x] 6. **Wire companion port, overlap/abort-safe polling, and teardown hooks in CLI / Electron launcher**:
  - **Files:** **[MODIFY]** [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts), **[MODIFY]** [ElectronCdpLauncher.ts](file:///d:/Projects/HoverSource/packages/cli/src/launcher/ElectronCdpLauncher.ts)
  - Update `startCdpInjectionWatch(debugPort, scriptWithPort, optionsOrCompanionPort?: number | { companionPort?: number; pollIntervalMs?: number; signal?: AbortSignal; injectFn?: (port: number, scriptContent: string, options?: InjectOverlayOptions) => Promise<number> })`:
    - Default `injectFn` to `injectOverlayScript` and guard overlapping `pollAndInject()` ticks with an `isPolling` flag.
    - Clamp `pollIntervalMs`: `const intervalMs = typeof rawInterval === "number" && Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 2500;` so `0`, negative, `NaN`, or `Infinity` inputs cannot cause a `1ms` tight CPU loop.
    - Check `options?.signal?.aborted` both before and immediately after `await pollAndInject()` (`if (options?.signal?.aborted) return;`) prior to scheduling `.unref()`'d `setInterval(pollAndInject, intervalMs)`, and register the `{ once: true }` `abort` listener on `options?.signal` only after that post-`pollAndInject` check immediately before `setInterval` (clearing the interval inside `onAbort`).
  - In `ElectronCdpLauncher.ts`: create `watchAbort = new AbortController()`, pass `{ companionPort: serverPort, signal: watchAbort.signal }` to `startCdpInjectionWatch`, and pass `{ watchAbort, closeSessions: closeAllCdpSessions, processEvents: process, child }` into `createElectronCdpCleanup`.
- [x] 7. **Add mock CDP/CLI/Launcher tests and package manifest exclusions**:
  - **Files:** **[NEW]** [injector.test.ts](file:///d:/Projects/HoverSource/packages/client-injector/src/__tests__/injector.test.ts), **[MODIFY]** [package.json](file:///d:/Projects/HoverSource/packages/client-injector/package.json), **[MODIFY]** [pnpm-lock.yaml](file:///d:/Projects/HoverSource/pnpm-lock.yaml), **[MODIFY]** [cli.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/cli.test.ts), **[NEW]** [ElectronCdpLauncher.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/ElectronCdpLauncher.test.ts)
  - In `packages/client-injector/package.json`: exclude compiled test artifacts from `"files"` (`"!dist/**/__tests__"`, `"!dist/**/*.test.*"`, matching `@hoversource/overlay-core`), and install `"vitest": "^4.1.8"` (matching `@hoversource/overlay-core` and `@hoversource/cli`) into `@hoversource/client-injector` `devDependencies` via `pnpm add -D vitest@^4.1.8 --filter @hoversource/client-injector` (updating `pnpm-lock.yaml` and linking `packages/client-injector/node_modules/vitest` under pnpm strict isolation so `tsc -b` compiles `src/__tests__/injector.test.ts` cleanly).
  - In `injector.test.ts` (`@hoversource/client-injector` only — NO imports from `packages/cli` so `tsc -b` `TS6059` stays intact, calling `closeAllCdpSessions()` in `afterEach`):
    - Assert `Page.setBypassCSP({ enabled: true })` and `Runtime.addBinding({ name: "__hoversourceBridgeCall" })` precede script evaluation and WS stays open after `injectOverlayScript` resolves.
    - Assert `Runtime.bindingCalled` forwarding for all 6 allowlisted GET routes (`/config`, `/open-dashboard`, `/open-in-ide?file=a`, `/open-in-ide?file=a.ts&editor=cursor`, `/validate-line?file=a&line=1`, `/static-context?file=a`, `/resolve-html-element?tag=div`) forwarding canonicalized `pathname + search` to the mock companion HTTP server, `POST /config` with `JSON.stringify({ target: "local", config: { theme: "dark" } })`, non-2xx rejection via `__hoversourceBridgeReject`, configurable short `requestTimeoutMs` (e.g. `50`) timeout rejection, `MAX_COMPANION_RESPONSE_BYTES` (`5 * 1024 * 1024` bytes) mid-stream overflow abort before `Buffer.concat` forwarded via `__hoversourceBridgeReject`, mid-flight `ws.close()` / `closeAllCdpSessions()` destroying active `inFlightRequests` `http.ClientRequest` instances without unhandled rejections or leaked sockets, and isolated JS evaluation (`new Function` / `vm.runInNewContext`) of emitted `Runtime.evaluate` expressions with quotes, Windows backslashes `\`, and newlines `\n`.
    - Assert `executionContextId` origin isolation: require the mock CDP server to emit `Runtime.executionContextCreated` for the target origin upon `Runtime.enable` across route-forwarding tests; emit `Runtime.executionContextCreated` for both the target origin (`http://localhost:5173`, `id: 1`) and a cross-origin iframe (`https://evil.example`, `id: 2`) plus a sandboxed context (`origin: "null"`, `id: 3`); assert that `executionContextId: 1` forwards to the mock companion HTTP server while `executionContextId: 2` and `executionContextId: 3` are rejected via `__hoversourceBridgeReject` without reaching the mock companion HTTP server; verify that emitting `Runtime.executionContextDestroyed` for a previously allowed `executionContextId` causes subsequent calls from that `executionContextId` to be rejected via `__hoversourceBridgeReject`; verify that `Runtime.bindingCalled` arriving while `executionContexts.size === 0` (e.g., immediately after `Runtime.executionContextsCleared` before a new `Runtime.executionContextCreated` arrives) is rejected via `__hoversourceBridgeReject` without reaching the mock companion HTTP server; verify that emitting `Runtime.executionContextsCleared` followed by `Runtime.executionContextCreated` for another context (`id: 2`, `https://evil.example`) causes subsequent calls from the cleared `executionContextId: 1` to be rejected via `__hoversourceBridgeReject` without reaching the mock companion HTTP server; verify that a `data:text/html,<iframe src='https://evil.example'>` (or `"about:blank"` before `Page.frameNavigated` sets `mainFrameId`) target (`trustedOrigin === ""`) where `Runtime.executionContextCreated` emits a cross-origin child iframe context `{ id: 2, origin: "https://evil.example", auxData: { isDefault: true, frameId: "child-frame-1" } }` does not poison `trustedOrigin` and rejects `Runtime.bindingCalled` from `executionContextId: 2` via `__hoversourceBridgeReject` without reaching the mock companion HTTP server; verify that a `file:///app/index.html` target allows a `file://` context while rejecting `https://evil.example`; assert that when `target.url` starts as `"about:blank"`, `Page.frameNavigated` (`!params.frame.parentId`) sets `trustedOrigin` to allow the navigated origin while rejecting other origins; and assert stale-origin clearing on top-level navigation where a target initialized at `"http://localhost:5173"` (with `executionContextId: 1` allowed) receives `Page.frameNavigated` with `{ frame: { id: "main-frame", url: "about:blank" } }` (no `parentId`) and a subsequent `Runtime.executionContextCreated` with `origin: "null"`, verifying that `Runtime.bindingCalled` from both the prior (`executionContextId: 1`, `origin: "http://localhost:5173"`) and new contexts is rejected via `__hoversourceBridgeReject` without reaching the mock companion HTTP server.
    - Assert redacted `[HoverSource]` `console.warn` diagnostics using `vi.spyOn(console, "warn")` (restored in `afterEach`): (a) a failing `POST /config` companion response (e.g. HTTP `500`) with a sentinel secret in `body` (`JSON.stringify({ target: "local", config: { secret: "__REDACT_ME_BODY__" } })`) logs `[HoverSource]` with `POST`, `/config`, `500`, and target URL while **not** containing `"__REDACT_ME_BODY__"`; and (b) a malformed or disallowed `Runtime.bindingCalled` payload containing a sentinel string (e.g. `"__REDACT_ME_PAYLOAD__"`) logs `[HoverSource]` while **not** containing `"__REDACT_ME_PAYLOAD__"`.
    - Assert `parseBridgeCallPayload` rejects payload and field length/ID bounds (`raw.length > 1_048_576`, empty `id` `""`, and oversized `id` `id.length > 256` asserting `__hoversourceBridgeReject` is **not** called and redacted `[HoverSource]` `console.warn` is logged, plus oversized `body` `body.length > 1_048_576` on `POST /config` rejecting via `__hoversourceBridgeReject` without reaching the companion server), route parameter/body violations (bare `"/open-in-ide"` missing `file`, `"/open-in-ide?file=foo\"$(calc)"`, `"/open-in-ide?file=/@fs/%24(id)"`, `"/open-in-ide?file=https://localhost:5173/@fs/%2524(id)"`, `"/open-in-ide?file=https://localhost:5173/@fs/%252524(id)"`, `"/open-in-ide?file=https://localhost:5173/@fs/%22%60id%60%22"`, `"/open-in-ide?file=%25COMSPEC%25"`, `"/open-in-ide?file=%2525COMSPEC%2525"`, `"/open-in-ide?file=a.ts&editor=sh"`, `GET /config?target=custom&customPath=/tmp`, `POST /config` with `target: "global"` or `customPath`, and `POST /config` with `"null"` body) while valid multi-encoded `/@fs/` regression cases (`"/open-in-ide?file=/@fs/C:/my%20new%20app/App.tsx"`, `"/open-in-ide?file=https%3A%2F%2Flocalhost%3A5173%2F%40fs%2FC%3A%2FUsers%2FMy%2520Name%2520Here%2FApp.tsx"`, and `"/open-in-ide?file=/@fs/app/users/%5Bid%5D/page.tsx"`) succeed and forward to the mock companion HTTP server, control-character/tab-smuggled paths (`"/\t/evil.com/config"`), backslash paths (`"/\\evil.com"` and `"/config\\x"`), `"http://127.0.0.1/config"`, `GET` with `body !== undefined` (`{ id: "n:1", method: "GET", path: "/config", body: "{}" }`) via `__hoversourceBridgeReject` without issuing an HTTP request to the companion server, `POST /open-in-ide`, non-string `body`, `//evil.com`, `/shutdown`, and `DELETE /config`.
    - Assert reconnect re-establishing `Page.setBypassCSP` + `Runtime.addBinding` when `__HOVERSOURCE_PORT__` is already present, two overlapping `injectOverlayScript` calls creating only one persistent session and zero orphaned sockets, `closeAllCdpSessions()` mid-handshake rejecting cleanly without waiting for `setupTimeoutMs` and `sessionEpoch` aborting an unacknowledged handshake, `{ setupTimeoutMs: 50 }` setup-timeout socket cleanup, stale evicted session `close` not removing a newer active session for the same key, and `broadcastToTargets` command-ID safety on active sessions.
    - Assert deterministically immediately after `await broadcastToTargets(cdpPort, script, { ephemeralCloseTimeoutMs: 25 })` — with zero test-side `setTimeout` sleeps — that `readyState === WebSocket.CLOSED` (`3`) on all ephemeral sockets (normal ack-initiated close, unresponsive `OPEN` timeout, and stalled `CONNECTING` / `CLOSING` timeouts) without unhandled rejections or leaked timers/sockets across `afterEach` (avoiding mixing `vi.useFakeTimers()` with live `node:http`/`ws` sockets).
    - Assert compile-time type contracts by importing `expectTypeOf`, `injectOverlayScript`, `broadcastToTargets`, `type InjectOverlayOptions`, and `type BroadcastTargetOptions` from `"../injector.js"`, verifying `expectTypeOf(injectOverlayScript).returns.resolves.toEqualTypeOf<number>()` and `expectTypeOf(broadcastToTargets).returns.resolves.toEqualTypeOf<void>()`, and asserting `if (false)`-guarded `@ts-expect-error` rejections for invalid `optionsOrCompanionPort` (`"7300"`) and invalid `BroadcastTargetOptions` (`{ ephemeralCloseTimeoutMs: "500" }`).
  - In `cli.test.ts` (`hoversource`, NO `"ws"` import in `packages/cli`): test `startCdpInjectionWatch` with `vi.useFakeTimers()` + controlled deferred `injectFn` promises and `vi.advanceTimersByTimeAsync(...)`, verifying: (a) `isPolling` blocks overlapping interval ticks while `injectFn` is pending, (b) invalid `pollIntervalMs` (`0`, `NaN`) falls back to `2500ms` without tight-looping, (c) aborting `signal` before or during initial `pollAndInject()` prevents scheduling `setInterval`, (d) aborting `signal` after startup clears the interval, and (e) `startCdpInjectionWatch(9222, "script", { companionPort: 7456, signal: ac.signal, injectFn })` forwards `{ companionPort: 7456 }` to `injectFn(9222, "script", expect.objectContaining({ companionPort: 7456 }))` (and preserves backward-compatible forwarding when called with a numeric third argument `startCdpInjectionWatch(9222, "script", 7456)`) (restoring `vi.useRealTimers()` and calling `closeAllCdpSessions()` in `afterEach`).
  - In `ElectronCdpLauncher.test.ts`: test `createElectronCdpCleanup` with mock `EventEmitter`s and a `vi.fn()` `exit` spy asserting firing `SIGINT`, `SIGTERM`, and `child` `exit` invokes `watchAbort.abort()`, `closeSessions()`, and `exit` once and detaches listeners.
  - Run `pnpm build && pnpm test`.

## Acceptance Criteria
- [x] Active injected CDP WebSocket sessions remain open until target disconnect or `closeAllCdpSessions()`, preserving `Page.setBypassCSP`, with reconnects re-establishing session hooks even when `__HOVERSOURCE_PORT__` is already present.
- [x] `Runtime.bindingCalled` enforces fail-closed CDP `executionContextId` origin isolation (rejecting when `executionContexts` is empty, `trustedOrigin` is empty, or the context is unknown / cross-origin / `null`-origin across `Runtime.executionContextCreated` / `Destroyed` / `Cleared` and `Page.frameNavigated`, requiring known `mainFrameId` before default-context fallback so child iframes cannot poison `trustedOrigin`, and unconditionally clearing `trustedOrigin` on top-level navigation to `about:blank`/`data:`), and `parseBridgeCallPayload` strictly validates JSON shape, length/id bounds, control-character-free `/` paths, method/route allowlist (6 GET routes, POST `/config` with `target === "local"` and no `customPath`, `GET /config` empty query, `GET /open-in-ide` non-empty `file` with bounded fixed-point percent-decoding rejecting shell metacharacters and `%VAR%` expansion on the decoded path and allowlisted `editor`), non-2xx/overflow/timeout forwarding, and redacted error diagnostics.
- [x] `broadcastToTargets` reuses open persistent sessions cleanly and awaits `"close"` settlement (`ws.readyState === WebSocket.CLOSED`) on all untracked ephemeral sockets before resolving.
- [x] `startCdpInjectionWatch` forwards `companionPort` to `injectFn`, prevents overlapping `pollAndInject()` ticks via `isPolling`, clamps invalid `pollIntervalMs`, and stops cleanly via `AbortSignal` alongside idempotent `createElectronCdpCleanup` and `closeAllCdpSessions()`.
- [x] Existing callers of `injectOverlayScript(port, script)` and `broadcastToTargets(port, script)` remain backward-compatible, and compile-time `expectTypeOf` / `@ts-expect-error` type contract assertions pass under `tsc -b` and `pnpm test`.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
