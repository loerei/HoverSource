import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startProxy } from "../proxy.js";

describe("Proxy Server Integration", () => {
  let targetServer: http.Server;
  let targetPort: number;
  let proxyPort: number;
  const overlayScriptUrl = "http://localhost:7300/hoversource-overlay.js";

  beforeAll(async () => {
    // 1. Start a mock target (upstream) server
    targetServer = http.createServer((req, res) => {
      if (req.url === "/html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>Target HTML</h1></body></html>");
      } else if (req.url === "/text") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Target Plain Text");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      targetServer.listen(0, "127.0.0.1", () => resolve());
    });
    targetPort = (targetServer.address() as any).port;

    // 2. Start the proxy server targeting the mock server
    // Find a free port dynamically for the proxy
    const tempProxyServer = http.createServer();
    await new Promise<void>((resolve) => {
      tempProxyServer.listen(0, "127.0.0.1", () => resolve());
    });
    proxyPort = (tempProxyServer.address() as any).port;
    await new Promise<void>((resolve) => tempProxyServer.close(() => resolve()));

    await startProxy({
      targetUrl: `http://127.0.0.1:${targetPort}`,
      proxyPort,
      overlayScriptUrl,
      useHttps: false,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
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

  it("should inject script tag into HTML responses", async () => {
    const res = await getUrl("/html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain(`<script src="${overlayScriptUrl}"></script>`);
    expect(res.body).toContain("Target HTML");
  });

  it("should stream non-HTML responses unchanged without script injection", async () => {
    const res = await getUrl("/text");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain");
    expect(res.body).not.toContain("<script");
    expect(res.body).toBe("Target Plain Text");
  });

  it("should forward upstream error statuses correctly", async () => {
    const res = await getUrl("/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not Found");
  });
});
