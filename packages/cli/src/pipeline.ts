import zlib from "node:zlib";

export interface ProxyPipelineOptions {
  overlayScriptUrl: string;
}

/**
 * Strips `<meta http-equiv="Content-Security-Policy"...>` and
 * `<meta http-equiv="Content-Security-Policy-Report-Only"...>` tags from HTML
 * using a single-pass O(N) quote-aware scanner.
 */
export function stripMetaCspTags(html: string): string {
  const metaRegex = /<meta(?=[\s/>])/gi;
  const chunks: string[] = [];
  let cursor = 0;

  while (true) {
    const match = metaRegex.exec(html);
    if (!match) {
      break;
    }

    const tagStart = match.index;
    let pos = tagStart + 5;
    let quote: '"' | "'" | null = null;

    while (pos < html.length) {
      const ch = html[pos];
      if (quote) {
        if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      pos++;
    }

    if (pos >= html.length) {
      break;
    }

    const tagEnd = pos + 1;
    const tagSlice = html.slice(tagStart, tagEnd);
    const httpEquivMatch = tagSlice.match(
      /(?:^|[\s/])http-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i
    );
    const httpEquivValue = (
      httpEquivMatch?.[1] ??
      httpEquivMatch?.[2] ??
      httpEquivMatch?.[3] ??
      ""
    ).trim();

    if (/^content-security-policy(?:-report-only)?$/i.test(httpEquivValue)) {
      chunks.push(html.slice(cursor, tagStart));
      cursor = tagEnd;
    }

    metaRegex.lastIndex = tagEnd;
  }

  if (chunks.length === 0) {
    return html;
  }

  chunks.push(html.slice(cursor));
  return chunks.join("");
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
    // Strip HTML <meta> CSP policies before injecting the overlay script
    html = stripMetaCspTags(html);

    const injection = `<script src="${options.overlayScriptUrl}"></script>`;

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${injection}\n</body>`);
    } else {
      html += `\n${injection}`;
    }

    return Buffer.from(html, "utf-8");
  }
}
