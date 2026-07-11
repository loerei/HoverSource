import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { ProxyResponsePipeline } from "./pipeline.js";
import { getOrCreateLocalSslCert } from "./cert.js";

export function rewriteCookieHeaders(headers: http.IncomingHttpHeaders, useHttps: boolean): void {
  const setCookie = headers["set-cookie"];
  if (setCookie) {
    headers["set-cookie"] = setCookie.map((cookie) => {
      let rewritten = cookie.replace(/;\s*domain\s*=\s*[^;]+/gi, "");
      if (!useHttps) {
        rewritten = rewritten.replace(/;\s*secure\b/gi, "");
      }
      return rewritten;
    });
  }
}

export function rewriteLocationHeader(
  headers: http.IncomingHttpHeaders,
  targetUrl: string,
  proxyPort: number,
  useHttps: boolean,
  reqHost?: string
): void {
  const location = headers["location"];
  if (!location) return;

  const target = new URL(targetUrl);
  try {
    const locUrl = new URL(location);
    if (locUrl.protocol === target.protocol && locUrl.host === target.host) {
      const proxyProtocol = useHttps ? "https:" : "http:";
      const proxyHost = reqHost || `localhost:${proxyPort}`;
      
      locUrl.protocol = proxyProtocol;
      locUrl.host = proxyHost;
      headers["location"] = locUrl.toString();
    }
  } catch {
    // Relative redirects are already correct relative to the proxy
  }
}

export interface ProxyOptions {
  targetUrl: string;
  proxyPort: number;
  companionPort: number;
  overlayScriptUrl: string;
  useHttps?: boolean;
  sslKeyPath?: string;
  sslCertPath?: string;
}

/**
 * Starts a reverse HTTP/HTTPS proxy that forwards requests to `targetUrl` and
 * injects `<script src="${overlayScriptUrl}"></script>` into HTML responses.
 */
export function startProxy(options: ProxyOptions): Promise<void> {
  const { targetUrl, proxyPort, companionPort, overlayScriptUrl, useHttps, sslKeyPath, sslCertPath } = options;
  const target = new URL(targetUrl);
  const pipeline = new ProxyResponsePipeline();

  const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    // ─── PART A: Proxy requests under /hoversource/ to Companion Server ──────
    if (req.url?.startsWith("/hoversource/")) {
      const rewrittenPath = req.url.replace(/^\/hoversource/, "") || "/";
      const isOverlayScript = rewrittenPath === "/hoversource-overlay.js";

      const companionReqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port: companionPort,
        path: rewrittenPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${companionPort}`,
        },
      };

      const companionReq = http.request(companionReqOpts, (companionRes) => {
        const responseHeaders = { ...companionRes.headers };
        // Ensure CSP is stripped from companion server responses just in case
        delete responseHeaders["content-security-policy"];
        delete responseHeaders["content-security-policy-report-only"];

        if (isOverlayScript) {
          const chunks: Buffer[] = [];
          companionRes.on("data", (chunk) => chunks.push(chunk));
          companionRes.on("end", () => {
            let body = Buffer.concat(chunks).toString("utf-8");
            body = `globalThis.__HOVERSOURCE_PROXY__ = true;\n` + body;
            const bodyBuf = Buffer.from(body, "utf-8");

            delete responseHeaders["content-length"];
            res.writeHead(companionRes.statusCode || 200, responseHeaders);
            res.end(bodyBuf);
          });
        } else {
          res.writeHead(companionRes.statusCode || 200, responseHeaders);
          companionRes.pipe(res, { end: true });
        }
      });

      companionReq.on("error", (err) => {
        console.error(`[HoverSource Proxy] Failed to proxy request to companion server:`, err.message);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end(`HoverSource proxy: companion server upstream error.`);
        }
      });

      req.pipe(companionReq, { end: true });
      return;
    }

    // ─── PART B: Proxy target application requests ─────────────────────────
    const headers = { ...req.headers };
    // Filter accept-encoding to only allow compression formats that our pipeline/zlib can handle
    if (headers["accept-encoding"]) {
      const accepted = String(headers["accept-encoding"]).toLowerCase();
      const supported: string[] = [];
      if (accepted.includes("gzip")) supported.push("gzip");
      if (accepted.includes("deflate")) supported.push("deflate");
      if (accepted.includes("br")) supported.push("br");

      if (supported.length > 0) {
        headers["accept-encoding"] = supported.join(", ");
      } else {
        delete headers["accept-encoding"];
      }
    }

    // Map upstream agent request based on target protocol
    const isTargetHttps = target.protocol === "https:";
    const agent = isTargetHttps ? https : http;

    const requestOptions: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port || (isTargetHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        ...headers,
        host: target.host,
      },
    };

    const proxyReq = agent.request(requestOptions, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";

      // Performance Optimization: Stream non-HTML responses directly
      if (!pipeline.shouldTransform(contentType)) {
        const responseHeaders = { ...proxyRes.headers };
        // Strip CSP headers to avoid iframe and asset restrictions
        delete responseHeaders["content-security-policy"];
        delete responseHeaders["content-security-policy-report-only"];
        // Rewrite cookie domains and secure flag
        rewriteCookieHeaders(responseHeaders, !!useHttps);
        rewriteLocationHeader(responseHeaders, targetUrl, proxyPort, !!useHttps, req.headers.host);

        res.writeHead(proxyRes.statusCode || 200, responseHeaders);
        proxyRes.pipe(res, { end: true });
        return;
      }

      // HTML Content: Buffer and transform
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const rawBody = Buffer.concat(chunks);
        const contentEncoding = (proxyRes.headers["content-encoding"] || "").toString();

        const transformedBody = pipeline.transform(rawBody, contentEncoding, {
          overlayScriptUrl,
        });

        const responseHeaders = { ...proxyRes.headers };
        // Recalculate content headers after modification
        delete responseHeaders["content-length"];
        delete responseHeaders["content-encoding"];
        // Strip CSP headers to ensure the browser loads the overlay script
        delete responseHeaders["content-security-policy"];
        delete responseHeaders["content-security-policy-report-only"];
        responseHeaders["content-type"] = "text/html; charset=utf-8";
        // Rewrite cookie domains and secure flag
        rewriteCookieHeaders(responseHeaders, !!useHttps);
        rewriteLocationHeader(responseHeaders, targetUrl, proxyPort, !!useHttps, req.headers.host);

        res.writeHead(proxyRes.statusCode || 200, responseHeaders);
        res.end(transformedBody);
      });
    });

    proxyReq.on("error", (err) => {
      console.error(`[HoverSource Proxy] Error forwarding request to ${targetUrl}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`HoverSource proxy: upstream error -- is your dev server running at ${targetUrl}?`);
      }
    });

    req.pipe(proxyReq, { end: true });
  };

  let server: http.Server | https.Server;

  if (useHttps) {
    const credentials = getOrCreateLocalSslCert({
      keyPath: sslKeyPath,
      certPath: sslCertPath,
      targetHost: target.hostname,
    });
    server = https.createServer(credentials, requestHandler);
  } else {
    server = http.createServer(requestHandler);
  }

  const upgradeHandler = (req: http.IncomingMessage, socket: any, head: Buffer) => {
    const isTargetHttps = target.protocol === "https:";
    const agent = isTargetHttps ? https : http;

    const requestOptions: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port || (isTargetHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    };

    const proxyReq = agent.request(requestOptions);

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      socket.on("error", (err: any) => {
        if (process.env.DEBUG) {
          console.debug("[HoverSource Proxy] Client socket error:", err.message);
        }
        proxySocket.destroy();
      });
      proxySocket.on("error", (err: any) => {
        if (process.env.DEBUG) {
          console.debug("[HoverSource Proxy] Target socket error:", err.message);
        }
        socket.destroy();
      });

      let responseHeader = `HTTP/${req.httpVersion} 101 Switching Protocols\r\n`;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (Array.isArray(value)) {
          for (const val of value) {
            responseHeader += `${key}: ${val}\r\n`;
          }
        } else if (value !== undefined) {
          responseHeader += `${key}: ${value as string}\r\n`;
        }
      }
      responseHeader += "\r\n";
      socket.write(responseHeader);

      proxySocket.write(proxyHead);
      socket.pipe(proxySocket);
      proxySocket.pipe(socket);
    });

    proxyReq.on("error", (err) => {
      console.error(`[HoverSource Proxy] WebSocket proxy error forwarding upgrade to ${targetUrl}:`, err.message);
      socket.end();
    });

    proxyReq.end();
  };

  server.on("upgrade", upgradeHandler);

  return new Promise((resolve, reject) => {
    server.listen(proxyPort, () => {
      resolve();
    });
    server.on("error", reject);
  });
}
