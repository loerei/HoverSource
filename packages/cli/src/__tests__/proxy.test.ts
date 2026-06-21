import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { rewriteCookieHeaders } from "../proxy.js";
import { ProxyResponsePipeline } from "../pipeline.js";

describe("rewriteCookieHeaders", () => {
  it("should strip Domain attribute from Set-Cookie header", () => {
    const headers = {
      "set-cookie": [
        "session=123; Domain=example.com; Path=/; HttpOnly",
        "theme=dark; domain=sub.domain.org; Secure",
      ],
    };
    rewriteCookieHeaders(headers, true);
    expect(headers["set-cookie"]).toEqual([
      "session=123; Path=/; HttpOnly",
      "theme=dark; Secure",
    ]);
  });

  it("should strip Secure attribute when useHttps is false", () => {
    const headers = {
      "set-cookie": [
        "session=123; Secure; HttpOnly",
        "theme=dark; domain=example.com; Secure; SameSite=None",
      ],
    };
    rewriteCookieHeaders(headers, false);
    expect(headers["set-cookie"]).toEqual([
      "session=123; HttpOnly",
      "theme=dark; SameSite=None",
    ]);
  });

  it("should preserve Secure attribute when useHttps is true", () => {
    const headers = {
      "set-cookie": [
        "session=123; Secure; HttpOnly",
      ],
    };
    rewriteCookieHeaders(headers, true);
    expect(headers["set-cookie"]).toEqual([
      "session=123; Secure; HttpOnly",
    ]);
  });
});

describe("ProxyResponsePipeline SRI and Decompression", () => {
  const pipeline = new ProxyResponsePipeline();
  const options = { overlayScriptUrl: "/hoversource/overlay.js" };

  it("should strip integrity attributes from HTML", () => {
    const html = `
      <html>
        <head>
          <link rel="stylesheet" href="style.css" integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC" crossorigin="anonymous">
          <script src="app.js" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous"></script>
          <script src="unquoted.js" integrity=sha384-something crossorigin="anonymous"></script>
        </head>
        <body>
          <h1>Hello</h1>
        </body>
      </html>
    `;
    const transformed = pipeline.transform(Buffer.from(html, "utf-8"), "", options).toString("utf-8");

    expect(transformed).not.toContain("integrity");
    expect(transformed).toContain("/hoversource/overlay.js");
  });

  it("should decompress gzip content and strip integrity", () => {
    const html = `<html><body><script src="a.js" integrity="sha384-abc"></script></body></html>`;
    const compressed = zlib.gzipSync(Buffer.from(html, "utf-8"));
    const transformed = pipeline.transform(compressed, "gzip", options).toString("utf-8");

    expect(transformed).not.toContain("integrity");
    expect(transformed).toContain("/hoversource/overlay.js");
  });

  it("should decompress deflate content", () => {
    const html = `<html><body>test</body></html>`;
    const compressed = zlib.deflateSync(Buffer.from(html, "utf-8"));
    const transformed = pipeline.transform(compressed, "deflate", options).toString("utf-8");

    expect(transformed).toContain("test");
    expect(transformed).toContain("/hoversource/overlay.js");
  });

  it("should decompress brotli content", () => {
    const html = `<html><body>test</body></html>`;
    const compressed = zlib.brotliCompressSync(Buffer.from(html, "utf-8"));
    const transformed = pipeline.transform(compressed, "br", options).toString("utf-8");

    expect(transformed).toContain("test");
    expect(transformed).toContain("/hoversource/overlay.js");
  });
});
