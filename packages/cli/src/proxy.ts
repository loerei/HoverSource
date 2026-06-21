import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { ProxyResponsePipeline } from "./pipeline.js";
import { getOrCreateLocalSslCert } from "./cert.js";

export interface ProxyOptions {
  targetUrl: string;
  proxyPort: number;
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
  const { targetUrl, proxyPort, overlayScriptUrl, useHttps, sslKeyPath, sslCertPath } = options;
  const target = new URL(targetUrl);
  const pipeline = new ProxyResponsePipeline();

  const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const headers = { ...req.headers };
    // Strip accept-encoding to handle decompressed buffers directly or let pipeline decompress it
    delete headers["accept-encoding"];

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
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
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
        responseHeaders["content-type"] = "text/html; charset=utf-8";

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
    });
    server = https.createServer(credentials, requestHandler);
  } else {
    server = http.createServer(requestHandler);
  }

  return new Promise((resolve, reject) => {
    server.listen(proxyPort, () => {
      resolve();
    });
    server.on("error", reject);
  });
}
