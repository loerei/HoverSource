import http from "node:http";
import { URL } from "node:url";
import zlib from "node:zlib";

/**
 * Starts a reverse HTTP proxy that forwards requests to `targetUrl` and
 * injects `<script src="${overlayScriptUrl}"></script>` into HTML responses.
 */
export function startProxy(targetUrl: string, proxyPort: number, overlayScriptUrl: string): Promise<void> {
  const target = new URL(targetUrl);

  const server = http.createServer((req, res) => {
    const headers = { ...req.headers };
    delete headers["accept-encoding"];

    const options: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        ...headers,
        host: target.host,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";
      const isHtml = contentType.includes("text/html");

      if (!isHtml) {
        // Non-HTML: pipe through unchanged
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
        return;
      }

      // HTML: buffer and inject overlay script
      const chunks: Buffer[] = [];
      proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on("end", () => {
        let buffer = Buffer.concat(chunks);
        const contentEncoding = proxyRes.headers["content-encoding"] || "";

        try {
          if (contentEncoding.includes("gzip")) {
            buffer = zlib.gunzipSync(buffer);
          } else if (contentEncoding.includes("deflate")) {
            buffer = zlib.inflateSync(buffer);
          } else if (contentEncoding.includes("br")) {
            buffer = zlib.brotliDecompressSync(buffer);
          }
        } catch (err: any) {
          console.error(`[HoverSource Proxy] Failed to decompress body:`, err.message);
        }

        let body = buffer.toString("utf-8");
        const injection = `<script src="${overlayScriptUrl}"></script>`;

        if (body.includes("</body>")) {
          body = body.replace("</body>", `${injection}\n</body>`);
        } else {
          // No </body> tag: append at end
          body += `\n${injection}`;
        }

        const responseHeaders = { ...proxyRes.headers };
        // Recalculate content-length after injection
        delete responseHeaders["content-length"];
        delete responseHeaders["content-encoding"];
        responseHeaders["content-type"] = "text/html; charset=utf-8";

        res.writeHead(proxyRes.statusCode || 200, responseHeaders);
        res.end(body);
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
  });

  return new Promise((resolve, reject) => {
    server.listen(proxyPort, () => {
      resolve();
    });
    server.on("error", reject);
  });
}
