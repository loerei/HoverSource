import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCliArgs } from "../args.js";

describe("parseCliArgs", () => {
  it("handles empty argv", () => {
    expect(parseCliArgs([])).toEqual({
      args: {},
      subcommand: undefined,
      positionals: [],
    });
  });

  it("parses single subcommands such as start and restart", () => {
    expect(parseCliArgs(["start"])).toEqual({
      args: {},
      subcommand: "start",
      positionals: ["start"],
    });

    expect(parseCliArgs(["restart", "--port=7301"])).toEqual({
      args: { port: "7301" },
      subcommand: "restart",
      positionals: ["restart"],
    });
  });

  it("collects multi-positional subcommands accurately", () => {
    const parsed = parseCliArgs([
      "config",
      "set",
      "shortcuts.copyMetadata.key",
      "k",
      "--global",
      "--json",
    ]);

    expect(parsed.subcommand).toBe("config");
    expect(parsed.positionals).toEqual([
      "config",
      "set",
      "shortcuts.copyMetadata.key",
      "k",
    ]);
    expect(parsed.args).toEqual({
      global: true,
      json: true,
    });
  });

  it("preserves short options with and without =", () => {
    const spaced = parseCliArgs([
      "-p",
      "7300",
      "-t",
      "http://localhost:3000",
      "-e",
      "npm run dev",
      "-r",
      "./app",
      "-d",
      "-h",
      "-v",
      "-s",
      "-a",
    ]);

    expect(spaced.args).toEqual({
      port: "7300",
      target: "http://localhost:3000",
      exec: "npm run dev",
      root: "./app",
      dashboard: true,
      help: true,
      vue: true,
      solid: true,
      angular: true,
    });

    const equals = parseCliArgs([
      "-p=7305",
      "-t=http://localhost:4000",
      "-e=vite",
      "-r=/tmp/proj",
    ]);

    expect(equals.args).toEqual({
      port: "7305",
      target: "http://localhost:4000",
      exec: "vite",
      root: "/tmp/proj",
    });
  });

  it("maps -V/--version to version without disturbing -v/--vue", () => {
    expect(parseCliArgs(["-V"]).args.version).toBe(true);
    expect(parseCliArgs(["--version"]).args.version).toBe(true);
    expect(parseCliArgs(["install", "-v"]).args.vue).toBe(true);
    expect(parseCliArgs(["install", "-v"]).args.version).toBeUndefined();
  });

  it("supports new and existing long/short flags including --dev-port", () => {
    const parsed = parseCliArgs([
      "start",
      "--dev-port=5174",
      "--debug-port",
      "9223",
      "--proxy-port=8080",
      "--auto-resolve",
      "-y",
      "--yes",
      "--json",
      "--dry-run",
      "--local",
      "--no-color",
      "--verbose",
      "-q",
      "--merged",
    ]);

    expect(parsed.subcommand).toBe("start");
    expect(parsed.positionals).toEqual(["start"]);
    expect(parsed.args).toEqual({
      "dev-port": "5174",
      "debug-port": "9223",
      "proxy-port": "8080",
      "auto-resolve": true,
      yes: true,
      json: true,
      "dry-run": true,
      local: true,
      "no-color": true,
      verbose: true,
      quiet: true,
      merged: true,
    });
  });

  it("supports -- end-of-options sentinel and negative numbers", () => {
    const parsed = parseCliArgs([
      "config",
      "set",
      "offset",
      "--",
      "-1",
      "--not-a-flag",
    ]);

    expect(parsed.subcommand).toBe("config");
    expect(parsed.positionals).toEqual([
      "config",
      "set",
      "offset",
      "-1",
      "--not-a-flag",
    ]);
    expect(parsed.args).toEqual({});

    const negativeDirect = parseCliArgs(["config", "set", "offset", "-42"]);
    expect(negativeDirect.positionals).toEqual(["config", "set", "offset", "-42"]);
  });

  it("does not swallow subsequent flags when a value flag has no value", () => {
    const parsed = parseCliArgs(["-p", "-d", "--dev-port", "--json"]);
    expect(parsed.args).toEqual({
      dashboard: true,
      "dev-port": true,
      json: true,
    });
  });
});

describe("setupConsoleMonkeypatch stream-safe logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("routes HoverSource console.log to stderr without ANSI codes when stderrOnly and noColor are true", async () => {
    vi.resetModules();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, setupConsoleMonkeypatch } = await import("../utils/logger.js");

    setupConsoleMonkeypatch({ stderrOnly: true, noColor: true });

    console.log("\x1b[36m[HoverSource] Starting companion server...\x1b[0m");
    console.log("[HoverSource] Server started successfully");
    logger.info("Manual info");
    logger.success("Manual success");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(4);

    const stderrOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(stderrOutput).toContain("◇ hs Starting companion server...");
    expect(stderrOutput).toContain("✔ hs Server started successfully");
    expect(stderrOutput).toContain("◇ hs Manual info");
    expect(stderrOutput).toContain("✔ hs Manual success");
    expect(stderrOutput).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it("keeps non-HoverSource console.log on stdout when stderrOnly is true", async () => {
    vi.resetModules();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { setupConsoleMonkeypatch } = await import("../utils/logger.js");

    setupConsoleMonkeypatch({ stderrOnly: true, noColor: true });

    console.log(JSON.stringify({ ok: true }));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).toBe('{"ok":true}');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("strips ANSI codes when NO_COLOR is set in environment", async () => {
    vi.resetModules();
    const prevNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { logger, setupConsoleMonkeypatch } = await import("../utils/logger.js");
      setupConsoleMonkeypatch({ stderrOnly: true });
      logger.info("[HoverSource] Env no-color check");

      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const msg = String(errorSpy.mock.calls[0][0]);
      expect(msg).toBe("◇ hs Env no-color check");
      expect(msg).not.toMatch(/\x1b\[[0-9;]*m/);
    } finally {
      if (prevNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = prevNoColor;
      }
    }
  });
});
