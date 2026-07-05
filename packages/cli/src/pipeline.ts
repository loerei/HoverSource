import zlib from "node:zlib";

export interface ProxyPipelineOptions {
  overlayScriptUrl: string;
}

export class ProxyResponsePipeline {
  /**
   * Checks if the response content type needs to be transformed (i.e. is HTML).
   */
  public shouldTransform(contentType: string): boolean {
    return contentType.toLowerCase().includes("text/html");
  }

  /**
   * Decompresses the response body based on contentEncoding, injects the overlay script,
   * and returns the transformed uncompressed Buffer.
   */
  public transform(
    body: Buffer,
    contentEncoding: string,
    options: ProxyPipelineOptions
  ): Buffer {
    if (body.length === 0) {
      return body;
    }

    let buffer = body;
    const encoding = (contentEncoding || "").toLowerCase().trim();

    try {
      if (encoding.includes("gzip")) {
        buffer = zlib.gunzipSync(buffer);
      } else if (encoding.includes("deflate")) {
        buffer = zlib.inflateSync(buffer);
      } else if (encoding.includes("br")) {
        buffer = zlib.brotliDecompressSync(buffer);
      }
    } catch (err: any) {
      console.error(`[HoverSource Proxy] Failed to decompress body:`, err.message);
    }

    let html = buffer.toString("utf-8");
    
    // Strip integrity attributes to avoid SRI mismatches when injecting or modifying scripts/styles
    html = html.replace(/\sintegrity\s*=\s*(?:"[^"]*"|'[^']*'|[^'"\s>]+)/gi, "");

    const injection = `<script src="${options.overlayScriptUrl}"></script>`;

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${injection}\n</body>`);
    } else {
      html += `\n${injection}`;
    }

    return Buffer.from(html, "utf-8");
  }
}
