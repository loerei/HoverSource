import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizeProjectPath, startCompanionServer } from "../server.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("normalizeProjectPath", () => {
  it("should normalize backslashes to forward slashes", () => {
    const result = normalizeProjectPath("C:\\Projects\\HoverSource");
    expect(result).toBe("C:/Projects/HoverSource");
  });

  it("should force Windows drive letter to uppercase", () => {
    const lowercaseResult = normalizeProjectPath("d:/Projects/HoverSource");
    const uppercaseResult = normalizeProjectPath("D:/Projects/HoverSource");
    
    expect(lowercaseResult).toBe("D:/Projects/HoverSource");
    expect(uppercaseResult).toBe("D:/Projects/HoverSource");
  });

  it("should handle mixed slashes and lowercase drive letters", () => {
    const result = normalizeProjectPath("c:\\projects/HoverSource\\subfolder");
    expect(result).toBe("C:/projects/HoverSource/subfolder");
  });
});

describe("Companion Server /resolve-html-element route", () => {
  let tempDir: string;
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-srv-test-"));
    const htmlPath = path.join(tempDir, "index.html");
    fs.writeFileSync(htmlPath, `<html><body><h1 id="test-header">Hello</h1></body></html>`, "utf-8");

    testPort = 59870 + Math.floor(Math.random() * 1000);
    server = startCompanionServer({
      port: testPort,
      projectRoot: tempDir,
      debugPort: 9222
    });

    // Wait for server to bind
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        resolve();
      });
    });
  });

  it("should return resolved static HTML location over HTTP", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/resolve-html-element?tagName=h1&id=test-header`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.fileName).toBe("index.html");
    expect(data.lineNumber).toBe(1);
    expect(data.framework).toBe("Vanilla");
  });
});

describe("Companion Server /validate-line route", () => {
  let tempDir: string;
  let server: http.Server;
  let mockViteServer: http.Server;
  let testPort: number;
  let mockVitePort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-validate-srv-"));
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "DemoButton.tsx"),
      [
        "export function DemoButton() {",
        "  const label = 'Go';",
        "  return (",
        '    <div className="btn-wrap">',
        '      <button className="demo-btn">{label}</button>',
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(srcDir, "FallbackPanel.tsx"),
      [
        "export function FallbackPanel() {",
        "  const label = 'Go';",
        "  return (",
        '    <div className="panel-wrap">',
        '      <button className="fallback-btn">{label}</button>',
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
      "utf-8"
    );

    // Line 12 col 5 -> original line 5 col 8 (0-indexed: +0 genCol +4=I, +0 src, +4 origLine=I, +7 origCol=O => IIO)
    // Wait: compiled line 12 col 5 => genCol0 = 4 (I), src = 0 (A), origLine0 = 4 (I), origCol0 = 7 (O) -> "IAIO"
    const rawMap = {
      version: 3,
      sources: ["DemoButton.tsx"],
      mappings: ";;;;;;;;;;;IAIO",
    };
    const b64 = Buffer.from(JSON.stringify(rawMap), "utf-8").toString("base64");
    const transpiled = [
      ...Array.from({ length: 11 }, (_, i) => `// compiled ${i + 1}`),
      `    return jsx("button", { className: "demo-btn" });`,
      `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}`,
    ].join("\n");

    mockViteServer = http.createServer((req, res) => {
      if (req.url?.startsWith("/src/DemoButton.tsx")) {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(transpiled);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockViteServer.listen(0, "127.0.0.1", resolve);
    });
    mockVitePort = (mockViteServer.address() as { port: number }).port;

    server = startCompanionServer({
      port: 0,
      projectRoot: tempDir,
      debugPort: 9222,
    });
    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.once("listening", resolve);
      }
    });
    testPort = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockViteServer.close(() => {
        server.close(() => {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch {}
          resolve();
        });
      });
    });
  });

  it("resolves original coordinates via inline base64 sourcemap from loopback dev server", async () => {
    const devUrl = `http://127.0.0.1:${mockVitePort}/src/DemoButton.tsx?t=170000`;
    const res = await fetch(
      `http://127.0.0.1:${testPort}/validate-line?file=${encodeURIComponent(devUrl)}&line=12&column=5&tagName=button&classList=demo-btn`
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      original: { line: 12, column: 5 },
      corrected: { line: 5, column: 8 },
      correctedFile: path.join(tempDir, "src", "DemoButton.tsx"),
    });
  });

  it("falls back to verifyAndCorrectSourceLocation when dev URL returns 404", async () => {
    const fallbackFile = path.join(tempDir, "src", "FallbackPanel.tsx");
    const fsPath = fallbackFile.replaceAll("\\", "/");
    const fsParam = `/@fs/${fsPath.startsWith("/") ? fsPath.slice(1) : fsPath}?v=abc`;
    const expectedCol = '      <button className="fallback-btn">{label}</button>'.indexOf("fallback-btn") + 1;

    // 1. /@fs/ + ?query normalization with heuristic fallback
    const res1 = await fetch(
      `http://127.0.0.1:${testPort}/validate-line?file=${encodeURIComponent(fsParam)}&line=2&column=1&tagName=button&classList=fallback-btn`
    );
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.corrected).toEqual({ line: 5, column: expectedCol });
    expect(data1.correctedFile).toBe(fsPath);

    // 2. 404 from loopback dev URL falls back to verifyAndCorrectSourceLocation on local file
    const missingDevUrl = `http://127.0.0.1:${mockVitePort}/src/FallbackPanel.tsx?t=1`;
    const fallbackRes = await fetch(
      `http://127.0.0.1:${testPort}/validate-line?file=${encodeURIComponent(missingDevUrl)}&line=2&column=1&tagName=button&classList=fallback-btn`
    );
    expect(fallbackRes.status).toBe(200);
    const fallbackData = await fallbackRes.json();
    expect(fallbackData.corrected).toEqual({ line: 5, column: expectedCol });
    expect(fallbackData.correctedFile).toBe(fallbackFile);
  });
});

describe("Companion Server /config and /reload-config routes", () => {
  let tempDir: string;
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-cfg-srv-"));
    server = startCompanionServer({
      port: 0,
      projectRoot: tempDir,
      debugPort: 9222,
    });
    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.once("listening", resolve);
      }
    });
    testPort = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        resolve();
      });
    });
  });

  it("returns 400 JSON when POST /config receives invalid config fields or bounds", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "local",
        config: { theme: "invalid-theme", maxTraversalDepth: 5 },
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
    expect(fs.existsSync(path.join(tempDir, ".hoversourcerc"))).toBe(false);
  });

  it("persists valid local config delta via POST /config and reloads on POST /reload-config", async () => {
    const postRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "local",
        config: { theme: "light", maxTraversalDepth: 40 },
      }),
    });
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.config.theme).toBe("light");
    expect(postData.config.maxTraversalDepth).toBe(40);

    // Externally update local config on disk, then trigger POST /reload-config
    fs.writeFileSync(
      path.join(tempDir, ".hoversourcerc"),
      JSON.stringify({ theme: "system", maxTraversalDepth: 64 }),
      "utf-8"
    );

    const reloadRes = await fetch(`http://127.0.0.1:${testPort}/reload-config`, {
      method: "POST",
    });
    expect(reloadRes.status).toBe(200);
    const reloadData = await reloadRes.json();
    expect(reloadData.success).toBe(true);
    expect(reloadData.config.theme).toBe("system");
    expect(reloadData.config.maxTraversalDepth).toBe(64);
  });

  it("returns identity JSON on GET /status while GET /ping returns pong", async () => {
    const pingRes = await fetch(`http://127.0.0.1:${testPort}/ping`);
    expect(pingRes.status).toBe(200);
    expect(await pingRes.text()).toBe("pong");

    const statusRes = await fetch(`http://127.0.0.1:${testPort}/status`);
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData).toEqual({
      ok: true,
      pid: process.pid,
      port: 0,
      projectRoot: normalizeProjectPath(tempDir),
      debugPort: 9222,
    });
  });

  it("rejects out-of-range ports with 400 and clears ports.dev via null", async () => {
    const badRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "local",
        config: { ports: { companion: 70000, proxy: 0 } },
      }),
    });
    expect(badRes.status).toBe(400);
    const badData = await badRes.json();
    expect(badData.error).toBeTruthy();

    const setRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "local",
        config: { ports: { dev: 5173, companionConflict: "takeover" } },
      }),
    });
    expect(setRes.status).toBe(200);
    const setData = await setRes.json();
    expect(setData.config.ports.dev).toBe(5173);
    expect(setData.config.ports.companionConflict).toBe("takeover");

    const clearRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "local",
        config: { ports: { dev: null } },
      }),
    });
    expect(clearRes.status).toBe(200);
    const clearData = await clearRes.json();
    expect(clearData.config.ports.dev).toBeUndefined();
  });

  it("serves dashboard HTML containing all 5 port control IDs", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/dashboard`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="companion-port-input"');
    expect(html).toContain('id="debug-port-input"');
    expect(html).toContain('id="proxy-port-input"');
    expect(html).toContain('id="dev-port-input"');
    expect(html).toContain('id="companion-conflict-select"');
  });
});
