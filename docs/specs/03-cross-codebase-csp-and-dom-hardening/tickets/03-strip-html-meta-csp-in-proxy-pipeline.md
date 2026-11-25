# 03 — Strip HTML `<meta>` CSP tags in Web Proxy `ProxyResponsePipeline`

## Epic
PRD: Cross-Codebase CSP Immunity and Strict DOM Hardening

## Status
ready-for-agent

## Blocked by
None — can start immediately

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

Extend [pipeline.ts](file:///d:/Projects/HoverSource/packages/cli/src/pipeline.ts) so the dev reverse proxy strips `<meta http-equiv="Content-Security-Policy"...>` and `<meta http-equiv="Content-Security-Policy-Report-Only"...>` tags from proxied HTML pages alongside existing SRI `integrity` removal, extract shared CSP and response-header sanitization helpers in [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts), and preserve all non-CSP `<meta>` tags unchanged.

- [x] 1. **Strip `<meta>` CSP tags in `ProxyResponsePipeline.transform`**:
  - **Files:** **[MODIFY]** [pipeline.ts](file:///d:/Projects/HoverSource/packages/cli/src/pipeline.ts)
  - Replace regex-based `<meta>` tag matching with a single-pass $O(N)$ quote-aware scanner `stripMetaCspTags(html: string): string` called before injecting `overlayScriptUrl`:
    - Locate `<meta` case-insensitively at tag-name boundaries (followed by ASCII whitespace, `/`, or `>`) by indexing directly into `html` (e.g., `html.indexOf("<", i)` + 5-char ASCII case-insensitive check, or `/<meta(?=[\s/>])/gi` `exec` on `html` — never slicing `html` using offsets from `html.toLowerCase()`, which shifts UTF-16 indices on characters such as `\u0130`).
    - Scan forward from the `<meta` tag start tracking `"`/`'` quotes until `>`. If `pos >= html.length` (an unclosed `<meta` reaching EOF), immediately `break` (no closing `>` exists in the remainder, bounding total work strictly to $O(N)$).
    - Inspect the matched `<meta ...>` tag slice for `/(?:^|[\s/])http-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i`, `.trim()`ming the captured value before matching `/^content-security-policy(?:-report-only)?$/i` (so leading/trailing whitespace inside quotes is stripped and `data-*-http-equiv` attributes cannot match on a `-` word boundary), and strip the tag slice only when matched.
  - Using a single-pass quote-aware scanner guarantees $O(N)$ linear worst-case runtime even on malformed or adversarial HTML with unclosed `<meta` sequences and prevents premature truncation if an earlier attribute on a `<meta>` tag contains a quoted `>` character, while keeping non-CSP `<meta>` tags (charset, viewport, description, OpenGraph, theme-color, etc.) completely intact.
- [x] 2. **Extract shared CSP and response-header sanitizers in `proxy.ts`**:
  - **Files:** **[MODIFY]** [proxy.ts](file:///d:/Projects/HoverSource/packages/cli/src/proxy.ts)
  - Extract `stripCspHeaders(headers)` (shared across `/hoversource/` companion proxy and Part B non-HTML/HTML upstream responses) and a shared Part B response-header sanitizer (`stripCspHeaders` + `rewriteCookieHeaders` + `rewriteLocationHeader`).
- [x] 3. **Add `<meta>` CSP and header stripping tests in `pipeline.test.ts` and `proxy.integration.test.ts`**:
  - **Files:** **[MODIFY]** [pipeline.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/pipeline.test.ts), **[MODIFY]** [proxy.integration.test.ts](file:///d:/Projects/HoverSource/packages/cli/src/__tests__/proxy.integration.test.ts)
  - Test single-line, multiline, reversed-attribute (`content` before `http-equiv`), single-quoted/unquoted `http-equiv`, leading/trailing whitespace inside `http-equiv=" Content-Security-Policy "`, attributes containing quoted `>`, `Report-Only`, UTF-16 index-shift case containing `\u0130` (`"<html><head><title>\u0130stanbul</title><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\"></head><body>ok</body></html>"` asserting the `<meta>` CSP tag is stripped cleanly without leaving stray `<` characters or corrupting surrounding markup), and gzip-compressed HTML containing `<meta http-equiv="Content-Security-Policy">` while asserting non-CSP `<meta charset="utf-8">`, `<meta name="viewport">`, and `data-*-http-equiv` attributes (e.g., `<meta name="x" data-test-http-equiv="Content-Security-Policy">`) survive intact.
  - Add a linear-runtime stress test in `pipeline.test.ts` calling `pipeline.transform(Buffer.from("<meta name='a' ".repeat(20_000), "utf-8"), "", options)` directly (no internal spy/mock on `stripMetaCspTags`), asserting `elapsedMs < 1000`, and asserting that the returned HTML preserves the unclosed `<meta name='a' ` payload and appends `<script src="${options.overlayScriptUrl}"></script>`.
  - Update `proxy.integration.test.ts` mock `companionServer` to emit `Content-Security-Policy` and `Content-Security-Policy-Report-Only` headers on `/hoversource/config`, verifying via live HTTP proxy round-trip that CSP response headers (companion, non-HTML, HTML) and HTML `<meta>` CSP tags are stripped while cookie/location rewriting remains preserved.
  - Run `pnpm build && pnpm test`.

## Acceptance Criteria
- [x] `ProxyResponsePipeline.transform()` strips `<meta http-equiv="Content-Security-Policy">` and `<meta http-equiv="Content-Security-Policy-Report-Only">` cleanly via the single-pass $O(N)$ `stripMetaCspTags` scanner regardless of attribute order, quotes, newlines, quoted `>` characters, or unclosed `<meta` sequences.
- [x] Non-CSP `<meta>` tags and HTML content outside CSP/integrity attributes remain preserved.
- [x] `proxy.ts` strips CSP response headers via shared `stripCspHeaders` across companion, non-HTML, and HTML paths and preserves cookie/location rewriting verified by `proxy.integration.test.ts`.
- [x] Execute automated verification command: `pnpm build && pnpm test`.

## Verification Command
```bash
pnpm build && pnpm test
```
