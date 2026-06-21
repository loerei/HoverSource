import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import { startProxy } from "../proxy.js";

describe("Proxy Server Integration", () => {
  let targetServer: http.Server;
  let targetPort: number;
  let companionServer: http.Server;
  let companionPort: number;
  let proxyPort: number;
  const overlayScriptUrl = "/hoversource/hoversource-overlay.js";

  beforeAll(async () => {
    // 1. Start a mock target (upstream) server returning CSP headers
    targetServer = http.createServer((req, res) => {
      if (req.url === "/html") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'",
          "Content-Security-Policy-Report-Only": "default-src 'none'",
        });
        res.end("<html><body><h1>Target HTML</h1></body></html>");
      } else if (req.url === "/text") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Security-Policy": "default-src 'self'",
        });
        res.end("Target Plain Text");
      } else if (req.url === "/cookies") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Set-Cookie": [
            "session=123; Domain=example.com; Secure; HttpOnly",
            "theme=dark; domain=another.org",
          ],
        });
        res.end("Cookies set");
      } else if (req.url === "/sri") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end('<html><body><script src="app.js" integrity="sha384-abc" crossorigin="anonymous"></script></body></html>');
      } else if (req.url === "/compressed") {
        const acceptEncoding = req.headers["accept-encoding"] || "";
        const body = '<html><body><script src="app.js" integrity="sha384-xyz"></script></body></html>';
        
        // Return compressed if client/proxy accepted gzip, and record the headers sent by the proxy
        if (acceptEncoding.includes("gzip")) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Encoding": "gzip",
            "X-Received-Accept-Encoding": String(acceptEncoding),
          });
          res.end(zlib.gzipSync(Buffer.from(body, "utf-8")));
        } else {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "X-Received-Accept-Encoding": String(acceptEncoding),
          });
          res.end(body);
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      targetServer.listen(0, "127.0.0.1", () => resolve());
    });
    targetPort = (targetServer.address() as any).port;

    // 2. Start a mock companion server
    companionServer = http.createServer((req, res) => {
      if (req.url === "/hoversource-overlay.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("console.log('mock overlay');");
      } else if (req.url === "/config") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ config: "mock config" }));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      companionServer.listen(0, "127.0.0.1", () => resolve());
    });
    companionPort = (companionServer.address() as any).port;

    // 3. Start the proxy server targeting the mock server and mock companion
    const tempProxyServer = http.createServer();
    await new Promise<void>((resolve) => {
      tempProxyServer.listen(0, "127.0.0.1", () => resolve());
    });
    proxyPort = (tempProxyServer.address() as any).port;
    await new Promise<void>((resolve) => tempProxyServer.close(() => resolve()));

    await startProxy({
      targetUrl: `http://127.0.0.1:${targetPort}`,
      proxyPort,
      companionPort,
      overlayScriptUrl,
      useHttps: false,
    });
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((resolve) => targetServer.close(() => resolve())),
      new Promise<void>((resolve) => companionServer.close(() => resolve())),
    ]);
  });

  const getUrl = (path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> => {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${proxyPort}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: data,
          });
        });
      }).on("error", reject);
    });
  };

  it("should inject script tag and strip CSP headers from HTML responses", async () => {
    const res = await getUrl("/html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["content-security-policy-report-only"]).toBeUndefined();
    expect(res.body).toContain(`<script src="${overlayScriptUrl}"></script>`);
    expect(res.body).toContain("Target HTML");
  });

  it("should stream non-HTML responses and strip CSP headers unchanged without script injection", async () => {
    const res = await getUrl("/text");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain");
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.body).not.toContain("<script");
    expect(res.body).toBe("Target Plain Text");
  });

  it("should route /hoversource/* requests to companion server and inject proxy flag into overlay script", async () => {
    const resScript = await getUrl("/hoversource/hoversource-overlay.js");
    expect(resScript.status).toBe(200);
    expect(resScript.headers["content-type"]).toBe("application/javascript");
    expect(resScript.body).toContain("globalThis.__HOVERSOURCE_PROXY__ = true;");
    expect(resScript.body).toContain("console.log('mock overlay');");

    const resConfig = await getUrl("/hoversource/config");
    expect(resConfig.status).toBe(200);
    expect(resConfig.headers["content-type"]).toBe("application/json");
    expect(resConfig.body).toContain("mock config");
  });

  it("should rewrite Set-Cookie headers in proxy responses", async () => {
    const res = await getUrl("/cookies");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toEqual([
      "session=123; HttpOnly",
      "theme=dark",
    ]);
  });

  it("should strip integrity attributes from HTML response", async () => {
    const res = await getUrl("/sri");
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("integrity=");
    expect(res.body).toContain(`<script src="${overlayScriptUrl}"></script>`);
  });

  it("should decompress gzip response from target, modify it, and strip integrity", async () => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: proxyPort,
      path: "/compressed",
      headers: {
        "accept-encoding": "gzip, deflate, br, zstd",
      },
    };

    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      http.get(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: data,
          });
        });
      }).on("error", reject);
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["x-received-accept-encoding"]).toBe("gzip, deflate, br");
    expect(res.body).not.toContain("integrity=");
    expect(res.body).toContain(`<script src="${overlayScriptUrl}"></script>`);
  });
});
