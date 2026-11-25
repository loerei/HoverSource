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

  it("serves dashboard HTML containing all 5 port control IDs and upgraded preset/shortcut controls", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/dashboard`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="companion-port-input"');
    expect(html).toContain('id="debug-port-input"');
    expect(html).toContain('id="proxy-port-input"');
    expect(html).toContain('id="dev-port-input"');
    expect(html).toContain('id="companion-conflict-select"');

    // Preset bar replaces Target Config selector
    expect(html).toContain('id="preset-select"');
    expect(html).toContain('id="save-preset-btn"');
    expect(html).toContain('id="delete-preset-btn"');
    expect(html).toContain('id="bind-repo-checkbox"');
    expect(html).not.toContain('Target Config:');
    expect(html).not.toContain('id="custom-path-input"');

    // toggleFilterPanel, metaKey toggle, macOS labels, and e.code recorder
    expect(html).toContain('shortcut-toggleFilterPanel');
    expect(html).toContain('id="shortcut-toggleFilterPanel-key"');
    expect(html).toContain('data-modifier="meta"');
    expect(html).toContain('⌘');
    expect(html).toContain('⌥');
    expect(html).toContain('/^Key([A-Z])$/');
    expect(html).toContain('/^Digit([0-9])$/');
  });
});

describe("Companion Server GET /events SSE stream", () => {
  let tempDir: string;
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-sse-srv-"));
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

  function openSseClient(port: number) {
    return new Promise<{
      req: http.ClientRequest;
      res: http.IncomingMessage;
      nextEvent: (timeoutMs?: number) => Promise<{ event: string; data: any }>;
      closed: Promise<void>;
    }>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
        let buffer = "";
        const queue: Array<{ event: string; data: any }> = [];
        const waiters: Array<(ev: { event: string; data: any }) => void> = [];

        const closed = new Promise<void>((resolveClose) => {
          res.on("end", resolveClose);
          res.on("close", resolveClose);
        });

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf-8");
          let sepIdx = buffer.indexOf("\n\n");
          while (sepIdx !== -1) {
            const rawFrame = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of rawFrame.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length > 0) {
              const parsed = {
                event: eventName,
                data: JSON.parse(dataLines.join("\n")),
              };
              const waiter = waiters.shift();
              if (waiter) {
                waiter(parsed);
              } else {
                queue.push(parsed);
              }
            }
            sepIdx = buffer.indexOf("\n\n");
          }
        });

        const nextEvent = (timeoutMs = 2000) => {
          const queued = queue.shift();
          if (queued) return Promise.resolve(queued);
          return new Promise<{ event: string; data: any }>((resWait, rejWait) => {
            const timer = setTimeout(() => {
              const idx = waiters.indexOf(onEvent);
              if (idx !== -1) waiters.splice(idx, 1);
              rejWait(new Error("Timed out waiting for SSE event"));
            }, timeoutMs);
            const onEvent = (ev: { event: string; data: any }) => {
              clearTimeout(timer);
              resWait(ev);
            };
            waiters.push(onEvent);
          });
        };

        resolve({ req, res, nextEvent, closed });
      });
      req.on("error", reject);
    });
  }

  it("streams event: config updates on POST /config, POST /reload-config, and DELETE /config", async () => {
    const client = await openSseClient(testPort);
    expect(client.res.statusCode).toBe(200);
    expect(client.res.headers["content-type"]).toBe("text/event-stream");
    expect(client.res.headers["cache-control"]).toBe("no-cache");
    expect(client.res.headers["access-control-allow-origin"]).toBe("*");

    const postRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "local", config: { theme: "light" } }),
    });
    expect(postRes.status).toBe(200);
    const postEvent = await client.nextEvent();
    expect(postEvent.event).toBe("config");
    expect(postEvent.data.theme).toBe("light");

    fs.writeFileSync(
      path.join(tempDir, ".hoversourcerc"),
      JSON.stringify({ theme: "system", maxTraversalDepth: 48 }),
      "utf-8"
    );
    const reloadRes = await fetch(`http://127.0.0.1:${testPort}/reload-config`, {
      method: "POST",
    });
    expect(reloadRes.status).toBe(200);
    const reloadEvent = await client.nextEvent();
    expect(reloadEvent.event).toBe("config");
    expect(reloadEvent.data.theme).toBe("system");
    expect(reloadEvent.data.maxTraversalDepth).toBe(48);

    const deleteRes = await fetch(`http://127.0.0.1:${testPort}/config?target=local`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const deleteEvent = await client.nextEvent();
    expect(deleteEvent.event).toBe("config");
    expect(deleteEvent.data.theme).toBe("dark");

    client.req.destroy();
    await client.closed;
  });

  it("removes closed clients and closes active SSE responses cleanly on server.close()", async () => {
    const clientA = await openSseClient(testPort);
    const clientB = await openSseClient(testPort);

    clientA.req.on("error", () => {});
    clientA.req.destroy();
    await clientA.closed;

    const postRes = await fetch(`http://127.0.0.1:${testPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "local", config: { theme: "light" } }),
    });
    expect(postRes.status).toBe(200);
    const eventB = await clientB.nextEvent();
    expect(eventB.event).toBe("config");
    expect(eventB.data.theme).toBe("light");

    // Closing the server while clientB is still open must close SSE cleanly without hanging
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await clientB.closed;
  });
});

describe("Companion Server /presets* routes", () => {
  let tempDir: string;
  let globalConfigPath: string;
  let server: http.Server;
  let testPort: number;

  function openSseClient(port: number) {
    return new Promise<{
      req: http.ClientRequest;
      nextEvent: (timeoutMs?: number) => Promise<{ event: string; data: any }>;
      closed: Promise<void>;
    }>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
        let buffer = "";
        const queue: Array<{ event: string; data: any }> = [];
        const waiters: Array<(ev: { event: string; data: any }) => void> = [];

        const closed = new Promise<void>((resolveClose) => {
          res.on("end", resolveClose);
          res.on("close", resolveClose);
        });

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf-8");
          let sepIdx = buffer.indexOf("\n\n");
          while (sepIdx !== -1) {
            const rawFrame = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of rawFrame.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length > 0) {
              const parsed = {
                event: eventName,
                data: JSON.parse(dataLines.join("\n")),
              };
              const waiter = waiters.shift();
              if (waiter) {
                waiter(parsed);
              } else {
                queue.push(parsed);
              }
            }
            sepIdx = buffer.indexOf("\n\n");
          }
        });

        const nextEvent = (timeoutMs = 2000) => {
          const queued = queue.shift();
          if (queued) return Promise.resolve(queued);
          return new Promise<{ event: string; data: any }>((resWait, rejWait) => {
            const timer = setTimeout(() => {
              const idx = waiters.indexOf(onEvent);
              if (idx !== -1) waiters.splice(idx, 1);
              rejWait(new Error("Timed out waiting for SSE event"));
            }, timeoutMs);
            const onEvent = (ev: { event: string; data: any }) => {
              clearTimeout(timer);
              resWait(ev);
            };
            waiters.push(onEvent);
          });
        };

        resolve({ req, nextEvent, closed });
      });
      req.on("error", reject);
    });
  }

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-presets-srv-"));
    globalConfigPath = path.join(tempDir, "global.hoversourcerc");
    server = startCompanionServer({
      port: 0,
      projectRoot: tempDir,
      debugPort: 9222,
      globalConfigPath,
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

  it("supports GET /presets, POST /presets, POST /presets/use, POST /presets/bind, and DELETE /presets with SSE broadcasts", async () => {
    const client = await openSseClient(testPort);

    // 1. Initial GET /presets
    const initRes = await fetch(`http://127.0.0.1:${testPort}/presets`);
    expect(initRes.status).toBe(200);
    expect(await initRes.json()).toEqual({
      presets: {},
      activePreset: null,
      repoBinding: null,
      effectivePreset: null,
    });

    // 2. POST /presets with supplied config (ports must be stripped by preset scope)
    const saveRes = await fetch(`http://127.0.0.1:${testPort}/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "figma",
        config: {
          theme: "light",
          minimalModeByDefault: true,
          ports: { companion: 9999 },
          shortcuts: {
            toggleFilterPanel: { key: "k", altKey: false, ctrlKey: false, shiftKey: true, metaKey: true },
          },
        },
      }),
    });
    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json();
    expect(saveData.success).toBe(true);
    expect(saveData.name).toBe("figma");
    expect(saveData.preset.theme).toBe("light");
    expect(saveData.preset.ports).toBeUndefined();
    const saveEvent = await client.nextEvent();
    expect(saveEvent.event).toBe("config");

    // 3. POST /presets/use activates "figma" and broadcasts merged config
    const useRes = await fetch(`http://127.0.0.1:${testPort}/presets/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "figma" }),
    });
    expect(useRes.status).toBe(200);
    const useData = await useRes.json();
    expect(useData.success).toBe(true);
    expect(useData.activePreset).toBe("figma");
    expect(useData.config.theme).toBe("light");
    expect(useData.config.minimalModeByDefault).toBe(true);
    expect(useData.config.ports.companion).toBe(7300);
    expect(useData.config.shortcuts.toggleFilterPanel).toEqual({
      key: "k",
      altKey: false,
      ctrlKey: false,
      shiftKey: true,
      metaKey: true,
    });
    const useEvent = await client.nextEvent();
    expect(useEvent.event).toBe("config");
    expect(useEvent.data.theme).toBe("light");
    expect(useEvent.data.shortcuts.toggleFilterPanel.metaKey).toBe(true);

    // 4. Snapshot current merged config into "mac-snap" via POST /presets without config payload
    const snapRes = await fetch(`http://127.0.0.1:${testPort}/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mac-snap" }),
    });
    expect(snapRes.status).toBe(200);
    const snapData = await snapRes.json();
    expect(snapData.preset.theme).toBe("light");
    expect(snapData.preset.ports).toBeUndefined();
    await client.nextEvent();

    // 5. POST /presets/bind binds current repo to "mac-snap", then GET /presets reflects repoBinding
    const bindRes = await fetch(`http://127.0.0.1:${testPort}/presets/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mac-snap" }),
    });
    expect(bindRes.status).toBe(200);
    const bindData = await bindRes.json();
    expect(bindData.success).toBe(true);
    expect(bindData.boundPreset).toBe("mac-snap");
    await client.nextEvent();

    const listAfterBind = await fetch(`http://127.0.0.1:${testPort}/presets`);
    expect(listAfterBind.status).toBe(200);
    const listed = await listAfterBind.json();
    expect(Object.keys(listed.presets).sort()).toEqual(["figma", "mac-snap"]);
    expect(listed.activePreset).toBe("figma");
    expect(listed.repoBinding).toBe("mac-snap");
    expect(listed.effectivePreset).toBe("mac-snap");

    // 6. Clear repo binding via POST /presets/bind { name: null }
    const unbindRes = await fetch(`http://127.0.0.1:${testPort}/presets/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: null }),
    });
    expect(unbindRes.status).toBe(200);
    expect((await unbindRes.json()).boundPreset).toBeNull();
    await client.nextEvent();

    // 7. DELETE /presets deletes active preset "figma" and broadcasts fallback to dark theme
    const delRes = await fetch(`http://127.0.0.1:${testPort}/presets?name=figma`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
    expect(delData.deleted).toBe(true);
    expect(delData.clearedActive).toBe(true);
    expect(delData.config.theme).toBe("dark");
    const delEvent = await client.nextEvent();
    expect(delEvent.event).toBe("config");
    expect(delEvent.data.theme).toBe("dark");

    // 8. DELETE /presets via JSON body also works
    const delBodyRes = await fetch(`http://127.0.0.1:${testPort}/presets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mac-snap" }),
    });
    expect(delBodyRes.status).toBe(200);
    expect((await delBodyRes.json()).deleted).toBe(true);
    await client.nextEvent();

    client.req.destroy();
    await client.closed;
  });

  it("rejects invalid preset names, unknown preset activation, and invalid preset fields with 400", async () => {
    for (const badName of ["", "   ", "__proto__", "constructor", "prototype"]) {
      const saveBad = await fetch(`http://127.0.0.1:${testPort}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badName, config: { theme: "light" } }),
      });
      expect(saveBad.status).toBe(400);

      const useBad = await fetch(`http://127.0.0.1:${testPort}/presets/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badName }),
      });
      expect(useBad.status).toBe(400);

      const bindBad = await fetch(`http://127.0.0.1:${testPort}/presets/bind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badName }),
      });
      expect(bindBad.status).toBe(400);

      const delBad = await fetch(`http://127.0.0.1:${testPort}/presets?name=${encodeURIComponent(badName)}`, {
        method: "DELETE",
      });
      expect(delBad.status).toBe(400);
    }

    const unknownUse = await fetch(`http://127.0.0.1:${testPort}/presets/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "non-existent-preset" }),
    });
    expect(unknownUse.status).toBe(400);
    expect((await unknownUse.json()).error).toContain("Unknown preset");

    const invalidConfig = await fetch(`http://127.0.0.1:${testPort}/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "broken", config: { theme: "neon-pink" } }),
    });
    expect(invalidConfig.status).toBe(400);
  });
});

describe("Companion Server static resolution with .hoversourcerc include/ignore", () => {
  let tempDir: string;
  let globalConfigPath: string;
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hoversource-srv-scope-"));
    globalConfigPath = path.join(tempDir, "global.hoversourcerc");
    fs.writeFileSync(
      path.join(tempDir, ".hoversourcerc"),
      JSON.stringify({ include: ["src"] }),
      "utf-8"
    );

    const srcDir = path.join(tempDir, "src");
    const extraDir = path.join(tempDir, "fixtures");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(extraDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, "Button.tsx"),
      'export function Button() { return <button className="btn-primary">Go</button>; }\n',
      "utf-8"
    );
    fs.writeFileSync(
      path.join(srcDir, "button.css"),
      ".btn-primary { color: blue; }\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(extraDir, "button.css"),
      ".fixture-only { color: red; }\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(extraDir, "index.html"),
      '<html><body><div id="fixture-root"></div></body></html>',
      "utf-8"
    );

    testPort = 59870 + Math.floor(Math.random() * 1000);
    server = startCompanionServer({
      port: testPort,
      projectRoot: tempDir,
      debugPort: 9222,
      globalConfigPath,
    });
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

  it("applies merged .hoversourcerc include/ignore across /static-context and /resolve-html-element", async () => {
    const fileParam = encodeURIComponent(path.join(tempDir, "src", "Button.tsx"));
    const staticRes = await fetch(
      `http://127.0.0.1:${testPort}/static-context?file=${fileParam}&line=1&column=35&tagName=button&classList=btn-primary,fixture-only`
    );
    expect(staticRes.status).toBe(200);
    const staticData = await staticRes.json();
    expect(staticData.classOrigins["btn-primary"]).toBeDefined();
    expect(staticData.classOrigins["fixture-only"]).toBeUndefined();

    const htmlRes = await fetch(
      `http://127.0.0.1:${testPort}/resolve-html-element?tagName=div&id=fixture-root`
    );
    expect(htmlRes.status).toBe(404);
  });
});
