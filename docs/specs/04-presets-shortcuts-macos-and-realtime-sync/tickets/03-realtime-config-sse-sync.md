# 03 — Add Realtime SSE Config Sync Across `companion-server`, `proxy`, and `overlay-core`

## Epic
PRD: Named Presets, Complete Realtime Shortcut Sync, and macOS Keyboard Support

## Status
planned

## Blocked by
- `01` — Extract shared shortcut seam, add `toggleFilterPanel`, `metaKey`, and tooltip sync in `overlay-core`
- `02` — Add `metaKey`, `toggleFilterPanel`, Named Presets, and Repo Binding in `configStore` and `hs config`

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve CDP `broadcastToTargets` for Electron and strict CSP / Trusted Types compliance. Do NOT alter, restyle, or remove anything unasked.

- [x] 1. **Add `GET /events` SSE endpoint to `@hoversource/companion-server`**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/server.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/server.ts)
  - Maintain a `Set<http.ServerResponse>` of active SSE clients on `GET /events` (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, CORS headers).
  - Broadcast `event: config\ndata: ${JSON.stringify(mergedConfig)}\n\n` to all connected SSE clients on `POST /config`, `DELETE /config`, `POST /reload-config`, and preset changes, alongside existing `broadcastToTargets(config.debugPort, ...)` for Electron CDP targets.
  - Remove clients on `req.on("close")` and close all SSE responses cleanly when the companion HTTP server closes.

- [x] 2. **Stream `/hoversource/events` in `proxy.ts` and subscribe via `EventSource` in `overlay.ts`**:
  - **Files:** **[MODIFY]** [`packages/cli/src/proxy.ts`](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts), **[MODIFY]** [`packages/overlay-core/src/companionTransport.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/companionTransport.ts), **[MODIFY]** [`packages/overlay-core/src/overlay.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/overlay.ts)
  - Ensure `/hoversource/events` in `proxy.ts` pipes SSE chunks directly without buffering (`sanitizeUpstreamResponseHeaders` preserves `text/event-stream` and strips CSP headers).
  - In `overlay.ts`, when `typeof EventSource === "function"` and not running exclusively under a strict CDP bridge (`typeof globalThis.__hoversourceBridgeCall !== "function"`), subscribe to `<companionBaseUrl>/events`, parse `event: "config"` payloads safely, invoke `this.handleConfigUpdate(parsed)`, and close the `EventSource` inside `OverlayEngine.destroy()`.
  - Rebuild `packages/overlay-core/dist/` via `pnpm build`.

- [x] 3. **Add SSE server, proxy streaming, and `EventSource` lifecycle tests**:
  - **Files:** **[MODIFY]** [`packages/companion-server/src/__tests__/server.test.ts`](file:///d:/Projects/HoverSource/packages/companion-server/src/__tests__/server.test.ts), **[MODIFY]** [`packages/cli/src/__tests__/proxy.integration.test.ts`](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/proxy.integration.test.ts), **[MODIFY]** [`packages/overlay-core/src/__tests__/overlay.lifecycle.test.ts`](file:///d:/Projects/HoverSource/packages/overlay-core/src/__tests__/overlay.lifecycle.test.ts)
  - Test `GET /events` emits `event: config` on `POST /config` and `POST /reload-config`, `/hoversource/events` streams live through `proxy.ts`, and `OverlayEngine` updates config on SSE `"config"` events and closes `EventSource` on `destroy()`.

## Acceptance Criteria
- [x] `GET /events` on Companion Server streams `event: config` JSON updates on `POST /config`, `DELETE /config`, and `POST /reload-config`.
- [x] Web Proxy `/hoversource/events` streams SSE frames without buffering.
- [x] `OverlayEngine` subscribes to SSE in HTTP/proxy mode, calls `handleConfigUpdate` on updates, and closes `EventSource` on `destroy()`.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
