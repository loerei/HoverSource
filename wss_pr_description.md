# feat(cli): support WebSocket Secure (WSS) tunneling in reverse proxy

## Summary
Implements WebSocket Secure (WSS) and WebSocket (WS) tunneling in the HoverSource proxy server, and resolves several static code quality issues flagged by SonarCloud.

---

## Why
- HoverSource proxy previously did not handle protocol upgrade events (WS/WSS), which broke hot module replacement (HMR) connections when using web proxy mode over HTTP or HTTPS.
- Active Sonar issues highlighted unused imports in `cli.ts` and global `NaN` usage in `VueAdapter.ts` which have now been cleaned up.

---

## Implementation Details

### CLI
- **Upgrade Request Forwarding**: Attached an `'upgrade'` listener on the proxy's server (HTTP/HTTPS) in [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts).
- **Socket Tunneling**: Standard protocol upgrade requests (e.g. WebSocket) are forwarded to the target upstream server, and the connection sockets are piped together for full-duplex communication.
- **Unused Import Cleanup**: Removed unused imports of `injectOverlayScript` and `execFile` from [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts).

### Source Resolver
- **Vue Adapter Fix**: Replaced global `NaN` with `Number.NaN` inside template metadata parsing in [VueAdapter.ts](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/VueAdapter.ts).

### Documentation
- Updated matrix status in `README.md` to indicate `WebSocket Secure (WSS) Tunneling` is supported (`Yes`).

### Tests
- Added an integration test verifying custom upgrade protocols/WebSocket tunneling in `proxy.integration.test.ts`.

---

## Files Changed

### CLI
- [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts): Added the upgrade listener and socket tunneling logic.
- [cli.ts](file:///d:/Projects/HoverSource/packages/cli/src/cli.ts): Cleaned up unused imports.
- [proxy.integration.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/proxy.integration.test.ts): Added protocol upgrade integration test.

### Source Resolver
- [VueAdapter.ts](file:///d:/Projects/HoverSource/packages/source-resolver/src/adapters/VueAdapter.ts): Replaced `NaN` with `Number.NaN`.

### Docs
- [README.md](file:///d:/Projects/HoverSource/README.md): Updated capability support matrix.
