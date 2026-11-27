import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { runConfigCommand } from "../commands/config.js";

describe("runConfigCommand", () => {
  let tmpRoot: string;
  let globalConfigPath: string;
  let projectRoot: string;
  const cleanupServers: http.Server[] = [];

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hs-config-cmd-test-"));
    globalConfigPath = path.join(tmpRoot, "global.hoversourcerc");
    projectRoot = path.join(tmpRoot, "project");
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    while (cleanupServers.length > 0) {
      const srv = cleanupServers.pop()!;
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function captureStdout(): string[] {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    return chunks;
  }

  it("supports list/show across --merged, --global, and --local with --json purity", async () => {
    fs.writeFileSync(globalConfigPath, JSON.stringify({ theme: "light", ports: { companion: 7310 } }));
    fs.writeFileSync(path.join(projectRoot, ".hoversourcerc"), JSON.stringify({ editor: "cursor" }));

    const stdout = captureStdout();
    const mergedCode = await runConfigCommand({
      positionals: ["config", "list"],
      args: { json: true, merged: true },
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(mergedCode).toBe(0);
    const mergedOut = JSON.parse(stdout.join("").trim());
    expect(mergedOut.target).toBe("merged");
    expect(mergedOut.exists).toBe(true);
    expect(mergedOut.config.theme).toBe("light");
    expect(mergedOut.config.editor).toBe("cursor");
    expect(mergedOut.config.ports.companion).toBe(7310);

    stdout.length = 0;
    const globalCode = await runConfigCommand({
      positionals: ["config", "show"],
      args: { json: true, global: true },
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(globalCode).toBe(0);
    const globalOut = JSON.parse(stdout.join("").trim());
    expect(globalOut.target).toBe("global");
    expect(globalOut.config.theme).toBe("light");
    expect(globalOut.config.editor).toBe("vscode");

    stdout.length = 0;
    const localCode = await runConfigCommand({
      positionals: ["config", "list"],
      args: { json: true, local: true },
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(localCode).toBe(0);
    const localOut = JSON.parse(stdout.join("").trim());
    expect(localOut.target).toBe("local");
    expect(localOut.config.editor).toBe("cursor");
    expect(localOut.config.theme).toBe("dark");
  });

  it("supports get for valid dot-paths and returns exit code 2 for unknown keys", async () => {
    const stdout = captureStdout();
    const code = await runConfigCommand({
      positionals: ["config", "get", "shortcuts.copyMetadata.key"],
      args: { json: true },
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.join("").trim())).toEqual({
      key: "shortcuts.copyMetadata.key",
      value: "c",
      target: "merged",
    });

    stdout.length = 0;
    const portCode = await runConfigCommand({
      positionals: ["config", "get", "ports.debug"],
      args: { json: true },
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(portCode).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).value).toBe(9222);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badCode = await runConfigCommand({
      positionals: ["config", "get", "does.not.exist"],
      args: {},
      projectRoot,
      requestedPort: 7300,
      globalConfigPath,
    });
    expect(badCode).toBe(2);
    expect(errSpy).toHaveBeenCalled();
  });

  it("validates set updates, handles ports.dev auto clearing, rejects invalid inputs, and honors --dry-run", async () => {
    const stdout = captureStdout();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Valid updates
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "theme", "light"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "maxTraversalDepth", "15"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "minimalModeByDefault", "true"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "shortcuts.copyMetadata.key", "k"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.debug", "9223"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.dev", "5174"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.dev", "auto"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.companionConflict", "takeover"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);

    const saved = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".hoversourcerc"), "utf-8")
    );
    expect(saved.theme).toBe("light");
    expect(saved.maxTraversalDepth).toBe(15);
    expect(saved.minimalModeByDefault).toBe(true);
    expect(saved.shortcuts.copyMetadata.key).toBe("k");
    expect(saved.ports.debug).toBe(9223);
    expect(saved.ports.dev).toBeUndefined();
    expect(saved.ports.companionConflict).toBe("takeover");

    // Invalid values -> exit 2
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "maxTraversalDepth", "999"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.debug", "70000"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ports.companionConflict", "invalid"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    // Conflicting --global and --local -> exit 2
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "theme", "dark"],
        args: { global: true, local: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    // --dry-run leaves disk unmodified
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "set", "theme", "system"],
        args: { "dry-run": true, json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).dryRun).toBe(true);
    const afterDryRun = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".hoversourcerc"), "utf-8")
    );
    expect(afterDryRun.theme).toBe("light");
  });

  it("enforces delete safety guards (--global rejected, non-TTY requires --yes, succeeds with --yes)", async () => {
    const localPath = path.join(projectRoot, ".hoversourcerc");
    fs.writeFileSync(localPath, JSON.stringify({ theme: "light" }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await runConfigCommand({
        positionals: ["config", "delete"],
        args: { global: true, yes: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "delete"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        stdinIsTTY: false,
      })
    ).toBe(2);
    expect(fs.existsSync(localPath)).toBe(true);

    const stdout = captureStdout();
    expect(
      await runConfigCommand({
        positionals: ["config", "delete"],
        args: { yes: true, json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
        stdinIsTTY: false,
        reloadTimeoutMs: 50,
      })
    ).toBe(0);
    expect(fs.existsSync(localPath)).toBe(false);
    expect(JSON.parse(stdout.join("").trim()).deleted).toBe(true);
  });

  it("triggers POST /reload-config when companion server responds pong", async () => {
    const calls: string[] = [];
    const srv = http.createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`);
      if (req.method === "GET" && req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
        return;
      }
      if (req.method === "POST" && req.url === "/reload-config") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    cleanupServers.push(srv);
    const port = (srv.address() as net.AddressInfo).port;

    const stdout = captureStdout();
    const code = await runConfigCommand({
      positionals: ["config", "set", "theme", "light"],
      args: { json: true },
      projectRoot,
      requestedPort: port,
      globalConfigPath,
    });

    expect(code).toBe(0);
    expect(calls).toEqual(["GET /ping", "POST /reload-config"]);
    expect(JSON.parse(stdout.join("").trim()).reloaded).toBe(true);
  });

  it("supports hs config preset list, save, use, bind (--clear), and delete with --json, --dry-run, and companion reload", async () => {
    const calls: string[] = [];
    const srv = http.createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`);
      if (req.method === "GET" && req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
        return;
      }
      if (req.method === "POST" && req.url === "/reload-config") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    cleanupServers.push(srv);
    const port = (srv.address() as net.AddressInfo).port;

    const stdout = captureStdout();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Set global port & local theme before saving preset
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ ports: { companion: 7400 }, autoResolvePortConflicts: true }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(projectRoot, ".hoversourcerc"),
      JSON.stringify({ theme: "light", snappingThreshold: 30 }),
      "utf-8"
    );

    // Dry-run save does not write or call reload
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "save", "studio"],
        args: { "dry-run": true, json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).dryRun).toBe(true);
    expect(calls).toEqual([]);

    // Live save triggers reload
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "save", "studio"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const saveOut = JSON.parse(stdout.join("").trim());
    expect(saveOut.action).toBe("save");
    expect(saveOut.name).toBe("studio");
    expect(saveOut.preset.theme).toBe("light");
    expect(saveOut.preset.ports).toBeUndefined();
    expect(saveOut.reloaded).toBe(true);
    expect(calls).toEqual(["GET /ping", "POST /reload-config"]);

    // Use preset (dry-run then live)
    calls.length = 0;
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "use", "studio"],
        args: { "dry-run": true, json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).dryRun).toBe(true);
    expect(calls).toEqual([]);

    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "use", "studio"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const useOut = JSON.parse(stdout.join("").trim());
    expect(useOut.activePreset).toBe("studio");
    expect(useOut.reloaded).toBe(true);
    expect(calls).toEqual(["GET /ping", "POST /reload-config"]);

    // Bind preset (dry-run, live, then --clear)
    calls.length = 0;
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "bind", "studio"],
        args: { "dry-run": true, json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).dryRun).toBe(true);
    expect(calls).toEqual([]);

    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "bind", "studio"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const bindOut = JSON.parse(stdout.join("").trim());
    expect(bindOut.boundPreset).toBe("studio");
    expect(bindOut.reloaded).toBe(true);

    // List presets
    calls.length = 0;
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "list"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const listOut = JSON.parse(stdout.join("").trim());
    expect(Object.keys(listOut.presets)).toEqual(["studio"]);
    expect(listOut.activePreset).toBe("studio");
    expect(listOut.boundPreset).toBe("studio");
    expect(listOut.effectivePreset).toBe("studio");
    expect(calls).toEqual([]);

    // Clear binding
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "bind"],
        args: { clear: true, json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const clearOut = JSON.parse(stdout.join("").trim());
    expect(clearOut.boundPreset).toBeNull();
    expect(clearOut.clear).toBe(true);
    expect(clearOut.reloaded).toBe(true);

    // Delete preset (dry-run then live)
    calls.length = 0;
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "delete", "studio"],
        args: { "dry-run": true, json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).dryRun).toBe(true);
    expect(calls).toEqual([]);

    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "delete", "studio"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const delOut = JSON.parse(stdout.join("").trim());
    expect(delOut.deleted).toBe(true);
    expect(delOut.clearedActive).toBe(true);
    expect(delOut.reloaded).toBe(true);
    expect(calls).toEqual(["GET /ping", "POST /reload-config"]);

    // Deleting missing preset does not trigger reload and returns deleted: false
    calls.length = 0;
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "delete", "studio"],
        args: { json: true },
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    const missingDelOut = JSON.parse(stdout.join("").trim());
    expect(missingDelOut.deleted).toBe(false);
    expect(missingDelOut.reloaded).toBe(false);
    expect(calls).toEqual([]);

    // Human-readable preset list output
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "list"],
        args: {},
        projectRoot,
        requestedPort: port,
        globalConfigPath,
      })
    ).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Presets"));
  });

  it("rejects invalid preset CLI usage, unsafe names, unknown presets, and --merged mutations", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "unknown"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "save", "__proto__"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "save", "   "],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "use", "nonexistent"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "bind", "foo"],
        args: { clear: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "bind"],
        args: {},
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "preset", "save", "valid"],
        args: { merged: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);
  });

  it("supports hs config set/get for include, ignore, and respectGitignore", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await runConfigCommand({
        positionals: ["config", "set", "include", '["src","index.html"]'],
        args: { local: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);

    expect(
      await runConfigCommand({
        positionals: ["config", "set", "ignore", "legacy, *.generated.css"],
        args: { local: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);

    expect(
      await runConfigCommand({
        positionals: ["config", "set", "respectGitignore", "false"],
        args: { local: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);

    const stdout = captureStdout();
    expect(
      await runConfigCommand({
        positionals: ["config", "get", "include"],
        args: { json: true, merged: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    expect(JSON.parse(stdout.join("").trim()).value).toEqual(["src", "index.html"]);

    expect(
      await runConfigCommand({
        positionals: ["config", "set", "include", "[broken"],
        args: { local: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);

    expect(
      await runConfigCommand({
        positionals: ["config", "set", "include", '["src"]'],
        args: { global: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(2);
  });

  it("supports hs config filter-preset list, save, use, and delete for local and global scopes", async () => {
    const stdout = captureStdout();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Save local custom filter preset
    expect(
      await runConfigCommand({
        positionals: ["config", "filter-preset", "save", "api-debug"],
        args: { local: true, json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    const savedLocal = JSON.parse(stdout.join("").trim());
    expect(savedLocal.action).toBe("save");
    expect(savedLocal.name).toBe("api-debug");
    expect(savedLocal.scope).toBe("local");

    // List includes built-in + local preset
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "filter-preset", "list"],
        args: { json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    const listed = JSON.parse(stdout.join("").trim());
    expect(listed.sources["api-debug"]).toBe("local");
    expect(listed.sources["source-locate"]).toBe("builtin");

    // Activate preset globally
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "filter-preset", "use", "layout-styles"],
        args: { global: true, json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    const usedGlobal = JSON.parse(stdout.join("").trim());
    expect(usedGlobal.activePreset).toBe("layout-styles");
    expect(usedGlobal.scope).toBe("global");

    // Delete local preset
    stdout.length = 0;
    expect(
      await runConfigCommand({
        positionals: ["config", "filter-preset", "delete", "api-debug"],
        args: { local: true, json: true },
        projectRoot,
        requestedPort: 7300,
        globalConfigPath,
      })
    ).toBe(0);
    const deleted = JSON.parse(stdout.join("").trim());
    expect(deleted.deleted).toBe(true);
  });
});
