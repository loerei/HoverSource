import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import {
  decodeSourceMapLocation,
  isLoopbackHttpUrl,
  resolveSourceMapFromDevUrl,
} from "../sourceMap.js";

const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) {
      digit |= 32;
    }
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

/**
 * Helper to construct a SourceMap v3 `mappings` string from 1-indexed segments.
 */
function buildMappings(
  entries: Array<{
    genLine: number;
    genCol: number;
    srcIdx?: number;
    origLine?: number;
    origCol?: number;
  }>
): string {
  const byLine = new Map<number, typeof entries>();
  let maxLine = 0;
  for (const entry of entries) {
    maxLine = Math.max(maxLine, entry.genLine);
    const list = byLine.get(entry.genLine) ?? [];
    list.push(entry);
    byLine.set(entry.genLine, list);
  }

  let prevSrc = 0;
  let prevOrigLine = 0;
  let prevOrigCol = 0;
  const lineStrings: string[] = [];

  for (let line = 1; line <= maxLine; line++) {
    const segs = (byLine.get(line) ?? []).slice().sort((a, b) => a.genCol - b.genCol);
    let prevGenCol = 0;
    const parts: string[] = [];
    for (const seg of segs) {
      const genCol0 = seg.genCol - 1;
      let chunk = encodeVlq(genCol0 - prevGenCol);
      prevGenCol = genCol0;

      if (
        seg.srcIdx !== undefined &&
        seg.origLine !== undefined &&
        seg.origCol !== undefined
      ) {
        const origLine0 = seg.origLine - 1;
        const origCol0 = seg.origCol - 1;
        chunk += encodeVlq(seg.srcIdx - prevSrc);
        chunk += encodeVlq(origLine0 - prevOrigLine);
        chunk += encodeVlq(origCol0 - prevOrigCol);
        prevSrc = seg.srcIdx;
        prevOrigLine = origLine0;
        prevOrigCol = origCol0;
      }
      parts.push(chunk);
    }
    lineStrings.push(parts.join(","));
  }

  return lineStrings.join(";");
}

describe("isLoopbackHttpUrl", () => {
  it("allows http loopback hostnames and rejects all others", () => {
    expect(isLoopbackHttpUrl("http://localhost:5173/src/App.tsx")).toBe(true);
    expect(isLoopbackHttpUrl("http://127.0.0.1:5173/src/App.tsx")).toBe(true);
    expect(isLoopbackHttpUrl("http://[::1]:5173/src/App.tsx")).toBe(true);

    expect(isLoopbackHttpUrl("https://localhost:5173/src/App.tsx")).toBe(false);
    expect(isLoopbackHttpUrl("https://example.com/src/App.tsx")).toBe(false);
    expect(isLoopbackHttpUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isLoopbackHttpUrl("http://127.0.0.2:5173/src/App.tsx")).toBe(false);
    expect(isLoopbackHttpUrl("file:///D:/Projects/App.tsx")).toBe(false);
    expect(isLoopbackHttpUrl("not-a-url")).toBe(false);
  });
});

describe("decodeSourceMapLocation", () => {
  it("decodes exact and closest preceding VLQ segments on compiled lines", () => {
    const mappings = buildMappings([
      { genLine: 2, genCol: 1, srcIdx: 0, origLine: 1, origCol: 1 },
      { genLine: 12, genCol: 3, srcIdx: 0, origLine: 5, origCol: 3 },
      { genLine: 12, genCol: 10, srcIdx: 0, origLine: 5, origCol: 8 },
      { genLine: 12, genCol: 25, srcIdx: 0, origLine: 6, origCol: 12 },
    ]);

    const map = {
      version: 3,
      sources: ["src/SaveEditorContent.tsx"],
      mappings,
    };

    // Exact match on line 12 col 10 -> original line 5 col 8
    expect(decodeSourceMapLocation(map, 12, 10)).toEqual({
      source: "src/SaveEditorContent.tsx",
      line: 5,
      column: 8,
    });

    // Closest preceding segment (col 15 -> matches col 10)
    expect(decodeSourceMapLocation(map, 12, 15)).toEqual({
      source: "src/SaveEditorContent.tsx",
      line: 5,
      column: 8,
    });

    // Unmapped empty line (line 7) -> null
    expect(decodeSourceMapLocation(map, 7, 1)).toBeNull();
    // Beyond end of mappings -> null
    expect(decodeSourceMapLocation(map, 50, 1)).toBeNull();
  });

  it("returns null for unmapped 1-field segments and respects sourceRoot", () => {
    const mappings = buildMappings([
      { genLine: 1, genCol: 1 }, // 1-field unmapped segment
      { genLine: 1, genCol: 15, srcIdx: 0, origLine: 10, origCol: 4 },
    ]);

    const map = {
      version: 3,
      sourceRoot: "/src",
      sources: ["App.tsx"],
      mappings,
    };

    expect(decodeSourceMapLocation(map, 1, 5)).toBeNull();
    expect(decodeSourceMapLocation(map, 1, 15)).toEqual({
      source: "/src/App.tsx",
      line: 10,
      column: 4,
    });
  });
});

describe("resolveSourceMapFromDevUrl", () => {
  it("rejects non-loopback URLs before making any fetch call", async () => {
    const fetchSpy = vi.fn();

    expect(
      await resolveSourceMapFromDevUrl("https://example.com/app.js", 12, 10, {
        fetchImpl: fetchSpy as unknown as typeof fetch,
      })
    ).toBeNull();
    expect(
      await resolveSourceMapFromDevUrl("http://169.254.169.254/latest/meta-data", 1, 1, {
        fetchImpl: fetchSpy as unknown as typeof fetch,
      })
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("decodes inline base64 SourceMap v3 from a loopback dev server", async () => {
    const mappings = buildMappings([
      { genLine: 12, genCol: 5, srcIdx: 0, origLine: 5, origCol: 8 },
    ]);
    const rawMap = {
      version: 3,
      sources: ["Button.tsx"],
      mappings,
    };
    const b64 = Buffer.from(JSON.stringify(rawMap), "utf-8").toString("base64");
    const compiledJs = [
      ...Array.from({ length: 11 }, (_, i) => `// line ${i + 1}`),
      `    return jsx("button", {});`,
      `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}`,
    ].join("\n");

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(compiledJs);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const result = await resolveSourceMapFromDevUrl(
        `http://127.0.0.1:${port}/src/Button.tsx?t=123`,
        12,
        5
      );
      expect(result).toEqual({
        source: "Button.tsx",
        line: 5,
        column: 8,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("fetches relative same-origin .map URL and rejects cross-origin .map URLs", async () => {
    const mappings = buildMappings([
      { genLine: 3, genCol: 1, srcIdx: 0, origLine: 20, origCol: 2 },
    ]);
    const rawMap = {
      version: 3,
      sources: ["Widget.tsx"],
      mappings,
    };

    const server = http.createServer((req, res) => {
      if (req.url === "/src/Widget.tsx.map") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rawMap));
        return;
      }
      if (req.url === "/src/Widget.tsx") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("line1\nline2\nexport const Widget = () => null;\n//# sourceMappingURL=Widget.tsx.map");
        return;
      }
      if (req.url === "/src/Evil.tsx") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("export const Evil = 1;\n//# sourceMappingURL=http://169.254.169.254/evil.map");
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const okResult = await resolveSourceMapFromDevUrl(
        `http://127.0.0.1:${port}/src/Widget.tsx`,
        3,
        1
      );
      expect(okResult).toEqual({
        source: "Widget.tsx",
        line: 20,
        column: 2,
      });

      const evilResult = await resolveSourceMapFromDevUrl(
        `http://127.0.0.1:${port}/src/Evil.tsx`,
        1,
        1
      );
      expect(evilResult).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns null on 404, timeout, and oversized responses", async () => {
    const fetch404 = vi.fn(async () => new Response("Not Found", { status: 404 }));
    expect(
      await resolveSourceMapFromDevUrl("http://localhost:5173/missing.tsx", 1, 1, {
        fetchImpl: fetch404,
      })
    ).toBeNull();

    const oversized = vi.fn(
      async () =>
        new Response("x".repeat(200), {
          status: 200,
          headers: { "content-length": "200" },
        })
    );
    expect(
      await resolveSourceMapFromDevUrl("http://localhost:5173/big.tsx", 1, 1, {
        maxBytes: 100,
        fetchImpl: oversized,
      })
    ).toBeNull();

    const slowServer = http.createServer((_req, _res) => {
      // Intentionally never respond to trigger timeout
    });
    await new Promise<void>((resolve) => slowServer.listen(0, "127.0.0.1", resolve));
    const port = (slowServer.address() as { port: number }).port;

    try {
      const timedOut = await resolveSourceMapFromDevUrl(
        `http://127.0.0.1:${port}/slow.tsx`,
        1,
        1,
        { timeoutMs: 50 }
      );
      expect(timedOut).toBeNull();
    } finally {
      slowServer.closeAllConnections?.();
      await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    }
  });
});
