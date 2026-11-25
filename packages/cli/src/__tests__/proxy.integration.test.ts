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
  const companionSseClients = new Set<http.ServerResponse>();
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
        res.end(
          '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><meta http-equiv="Content-Security-Policy-Report-Only" content="script-src \'none\'"></head><body><h1>Target HTML</h1></body></html>'
        );
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
      } else if (req.url === "/redirect") {
        res.writeHead(302, {
          "Location": `http://127.0.0.1:${targetPort}/target-destination`,
        });
        res.end();
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      targetServer.listen(0, "127.0.0.1", () => resolve());
    });
    targetPort = (targetServer.address() as any).port;

    targetServer.on("upgrade", (req, socket, head) => {
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: my-custom-upgrade\r\nConnection: Upgrade\r\n\r\n");
      socket.write("upstream-hello");
      socket.on("data", (chunk) => {
        socket.write("echo:" + chunk.toString());
        if (chunk.toString().includes("ping")) {
          socket.end();
        }
      });
    });

    // 2. Start a mock companion server
    companionServer = http.createServer((req, res) => {
      if (req.url === "/hoversource-overlay.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("console.log('mock overlay');");
      } else if (req.url === "/config") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Security-Policy": "default-src 'none'",
          "Content-Security-Policy-Report-Only": "default-src 'none'",
        });
        res.end(JSON.stringify({ config: "mock config" }));
      } else if (req.url === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Content-Security-Policy": "default-src 'none'",
          "Content-Security-Policy-Report-Only": "default-src 'none'",
        });
        res.flushHeaders();
        companionSseClients.add(res);
        req.on("close", () => {
          companionSseClients.delete(res);
        });
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
    for (const client of companionSseClients) {
      try {
        client.end();
      } catch {}
    }
    companionSseClients.clear();
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

  it("should inject script tag, strip CSP headers, and strip meta CSP tags from HTML responses", async () => {
    const res = await getUrl("/html");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["content-security-policy-report-only"]).toBeUndefined();
    expect(res.body).toContain('<meta charset="utf-8">');
    expect(res.body).not.toContain("Content-Security-Policy");
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
    expect(resConfig.headers["content-security-policy"]).toBeUndefined();
    expect(resConfig.headers["content-security-policy-report-only"]).toBeUndefined();
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

  it("should rewrite absolute redirect Location headers pointing to the target server", async () => {
    const res = await getUrl("/redirect");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(`http://127.0.0.1:${proxyPort}/target-destination`);
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
  it("should tunnel protocol upgrade connections (WS/WSS support)", async () => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: proxyPort,
      path: "/ws",
      headers: {
        "Connection": "Upgrade",
        "Upgrade": "my-custom-upgrade",
      },
    };

    const req = http.request(reqOptions);

    const resPromise = new Promise<string>((resolve, reject) => {
      req.on("upgrade", (res, socket, head) => {
        let received = head.toString();
        socket.on("data", (chunk) => {
          received += chunk.toString();
          if (received.includes("echo:ping")) {
            socket.end();
            resolve(received);
          }
        });
        socket.write("ping");
      });
      req.on("error", reject);
    });

    req.end();

    const data = await resPromise;
    expect(data).toContain("upstream-hello");
    expect(data).toContain("echo:ping");
  });

  it("should stream /hoversource/events SSE frames without buffering and strip CSP headers", async () => {
    const req = http.get(`http://127.0.0.1:${proxyPort}/hoversource/events`);
    req.on("error", () => {});

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      req.once("response", resolve);
      req.once("error", reject);
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["content-security-policy-report-only"]).toBeUndefined();

    const waitForNextChunk = () =>
      new Promise<string>((resolve) => {
        res.once("data", (chunk: Buffer) => resolve(chunk.toString("utf-8")));
      });

    const firstChunkPromise = waitForNextChunk();
    const frame1 = `event: config\ndata: ${JSON.stringify({ theme: "light" })}\n\n`;
    for (const client of companionSseClients) {
      client.write(frame1);
    }
    expect(await firstChunkPromise).toBe(frame1);

    const secondChunkPromise = waitForNextChunk();
    const frame2 = `event: config\ndata: ${JSON.stringify({ theme: "dark" })}\n\n`;
    for (const client of companionSseClients) {
      client.write(frame2);
    }
    expect(await secondChunkPromise).toBe(frame2);

    req.destroy();
  });
});
