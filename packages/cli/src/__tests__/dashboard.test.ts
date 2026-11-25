import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import { runDashboardCommand, type DashboardCommandResult } from "../commands/dashboard.js";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(addr.port);
      });
    });
  });
}

describe("runDashboardCommand", () => {
  const cleanupFns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupFns.length > 0) {
      const fn = cleanupFns.pop()!;
      await fn();
    }
    vi.restoreAllMocks();
  });

  it("reuses an already-running companion server and emits valid JSON under --json", async () => {
    const requestedPaths: string[] = [];
    const mockServer = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? "");
      if (req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
        return;
      }
      if (req.url === "/open-dashboard") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
    const port = (mockServer.address() as net.AddressInfo).port;
    cleanupFns.push(
      () => new Promise<void>((resolve) => mockServer.close(() => resolve()))
    );

    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const openBrowserFn = vi.fn();
    const result = await runDashboardCommand({
      requestedPort: port,
      projectRoot: process.cwd(),
      debugPort: 9222,
      json: true,
      openBrowserFn,
    });

    expect(result.exitCode).toBe(0);
    expect(result.keepAlive).toBe(false);
    expect(requestedPaths).toEqual(["/ping", "/open-dashboard"]);
    expect(openBrowserFn).not.toHaveBeenCalled();

    const parsed = JSON.parse(stdoutChunks.join("").trim());
    expect(parsed).toEqual({
      status: "running",
      port,
      url: `http://127.0.0.1:${port}/dashboard`,
    });
  });

  it("starts a fresh companion server when none is running and invokes openBrowserFn", async () => {
    const port = await getFreePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hs-dashboard-test-"));
    cleanupFns.push(async () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const openBrowserFn = vi.fn();
    const stdoutChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const result: DashboardCommandResult = await runDashboardCommand({
      requestedPort: port,
      projectRoot: tempDir,
      debugPort: 9222,
      json: true,
      pingTimeoutMs: 300,
      openBrowserFn,
      resolveCompanionPortFn: async (p) => p,
    });

    if (result.close) {
      cleanupFns.push(result.close);
    }

    expect(result.exitCode).toBe(0);
    expect(result.keepAlive).toBe(true);
    expect(openBrowserFn).toHaveBeenCalledTimes(1);
    expect(openBrowserFn).toHaveBeenCalledWith(`http://127.0.0.1:${port}/dashboard`);

    const parsed = JSON.parse(stdoutChunks.join("").trim());
    expect(parsed).toEqual({
      status: "started",
      port,
      url: `http://127.0.0.1:${port}/dashboard`,
    });
  });

  it("skips opening browser when noOpen is true", async () => {
    const port = await getFreePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hs-dashboard-noopen-"));
    cleanupFns.push(async () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const openBrowserFn = vi.fn();
    const result = await runDashboardCommand({
      requestedPort: port,
      projectRoot: tempDir,
      debugPort: 9222,
      noOpen: true,
      pingTimeoutMs: 300,
      openBrowserFn,
      resolveCompanionPortFn: async (p) => p,
    });

    if (result.close) {
      cleanupFns.push(result.close);
    }

    expect(result.exitCode).toBe(0);
    expect(result.keepAlive).toBe(true);
    expect(openBrowserFn).not.toHaveBeenCalled();
  });
});
