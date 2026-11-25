import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { ProxyResponsePipeline } from "../pipeline.js";

describe("ProxyResponsePipeline", () => {
  const pipeline = new ProxyResponsePipeline();
  const options = { overlayScriptUrl: "http://localhost:7300/hoversource-overlay.js" };

  describe("shouldTransform", () => {
    it("should return true for HTML content types", () => {
      expect(pipeline.shouldTransform("text/html")).toBe(true);
      expect(pipeline.shouldTransform("text/html; charset=utf-8")).toBe(true);
      expect(pipeline.shouldTransform("TEXT/HTML")).toBe(true);
    });

    it("should return false for non-HTML content types", () => {
      expect(pipeline.shouldTransform("text/plain")).toBe(false);
      expect(pipeline.shouldTransform("application/json")).toBe(false);
      expect(pipeline.shouldTransform("image/png")).toBe(false);
    });
  });

  describe("transform", () => {
    const rawHtml = "<html><head></head><body><h1>Hello World</h1></body></html>";
    const expectedInjection = `<script src="${options.overlayScriptUrl}"></script>`;

    it("should inject script before body close tag in uncompressed HTML", () => {
      const body = Buffer.from(rawHtml, "utf-8");
      const result = pipeline.transform(body, "", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).toContain(expectedInjection);
      expect(resultStr).toContain(`${expectedInjection}\n</body>`);
    });

    it("should append script if body close tag is missing", () => {
      const noBodyHtml = "<div>No body close tag</div>";
      const body = Buffer.from(noBodyHtml, "utf-8");
      const result = pipeline.transform(body, "", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).toContain(expectedInjection);
      expect(resultStr.endsWith(`\n${expectedInjection}`)).toBe(true);
    });

    it("should decompress gzip and inject script", () => {
      const body = zlib.gzipSync(Buffer.from(rawHtml, "utf-8"));
      const result = pipeline.transform(body, "gzip", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).toContain(expectedInjection);
    });

    it("should decompress deflate and inject script", () => {
      const body = zlib.deflateSync(Buffer.from(rawHtml, "utf-8"));
      const result = pipeline.transform(body, "deflate", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).toContain(expectedInjection);
    });

    it("should decompress brotli and inject script", () => {
      const body = zlib.brotliCompressSync(Buffer.from(rawHtml, "utf-8"));
      const result = pipeline.transform(body, "br", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).toContain(expectedInjection);
    });

    it("should strip integrity attributes", () => {
      const htmlWithIntegrity = '<html><head><script src="test.js" integrity="sha384-xyz" crossorigin="anonymous"></script></head><body><h1>Hello World</h1></body></html>';
      const body = Buffer.from(htmlWithIntegrity, "utf-8");
      const result = pipeline.transform(body, "", options);
      const resultStr = result.toString("utf-8");
      expect(resultStr).not.toContain("integrity");
      expect(resultStr).toContain('<script src="test.js" crossorigin="anonymous">');
    });

    it("should return empty buffer if body is empty", () => {
      const body = Buffer.alloc(0);
      const result = pipeline.transform(body, "", options);
      expect(result).toHaveLength(0);
    });

    it("should strip single-line, multiline, reversed, quoted, unquoted, whitespace-padded, quoted-gt, and Report-Only meta CSP tags while preserving non-CSP meta tags", () => {
      const html = [
        "<html><head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="x" data-test-http-equiv="Content-Security-Policy">',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
        "<meta\n  http-equiv=\"Content-Security-Policy-Report-Only\"\n  content=\"script-src 'self'\"\n>",
        '<meta content="default-src \'self\'" http-equiv="Content-Security-Policy">',
        "<meta http-equiv='Content-Security-Policy' content='default-src *'>",
        "<meta http-equiv=Content-Security-Policy content=default-src>",
        '<meta http-equiv=" Content-Security-Policy " content="default-src \'self\'">',
        '<meta data-expr="a>b" http-equiv="Content-Security-Policy" content="script-src \'self\' >">',
        "</head><body>ok</body></html>",
      ].join("\n");

      const result = pipeline.transform(Buffer.from(html, "utf-8"), "", options).toString("utf-8");

      expect(result).toContain('<meta charset="utf-8">');
      expect(result).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(result).toContain('<meta name="x" data-test-http-equiv="Content-Security-Policy">');
      expect(result).not.toContain("default-src");
      expect(result).not.toContain("script-src");
      expect(result).not.toContain("Content-Security-Policy-Report-Only");
      expect(result).not.toContain("data-expr");
      expect(result).toContain(`${expectedInjection}\n</body>`);
    });

    it("should strip meta CSP tags cleanly when preceding text contains UTF-16 case-expanding characters like \\u0130", () => {
      const html =
        '<html><head><title>\u0130stanbul</title><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>ok</body></html>';
      const result = pipeline.transform(Buffer.from(html, "utf-8"), "", options).toString("utf-8");

      expect(result).toBe(
        `<html><head><title>\u0130stanbul</title></head><body>ok${expectedInjection}\n</body></html>`
      );
    });

    it("should strip meta CSP tags from gzip-compressed HTML", () => {
      const html =
        '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>ok</body></html>';
      const compressed = zlib.gzipSync(Buffer.from(html, "utf-8"));
      const result = pipeline.transform(compressed, "gzip", options).toString("utf-8");

      expect(result).toContain('<meta charset="utf-8">');
      expect(result).not.toContain("Content-Security-Policy");
      expect(result).toContain(`${expectedInjection}\n</body>`);
    });

    it("should complete in linear O(N) time on adversarial unclosed <meta sequences without corrupting payload", () => {
      const payload = "<meta name='a' ".repeat(20_000);
      const body = Buffer.from(payload, "utf-8");

      const start = performance.now();
      const result = pipeline.transform(body, "", options).toString("utf-8");
      const elapsedMs = performance.now() - start;

      expect(elapsedMs).toBeLessThan(1000);
      expect(result).toBe(`${payload}\n${expectedInjection}`);
    });
  });
});
