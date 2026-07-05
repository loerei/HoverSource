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
  });
});
