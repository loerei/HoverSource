import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import net from "node:net";
import { EventEmitter } from "node:events";
import {
  CliUsageError,
  probeHostPort,
  parseNetstatListeningPid,
  resolvePortPrecedence,
  probeCompanionStatus,
  resolveCompanionPort,
  resolveDebugPort,
  resolveDevServerPort,
  bindServerWithRetry,
} from "../port.js";
import { extractListeningPortFromOutput } from "../launcher/WebProxyLauncher.js";

function listenEphemeralHttp(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
}

describe("Port Resolution & Precedence", () => {
  const serversToClose: http.Server[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    while (serversToClose.length > 0) {
      const srv = serversToClose.pop()!;
      await closeServer(srv);
    }
  });

  describe("resolvePortPrecedence", () => {
    it("applies CLI flag > mergedConfig.ports > built-in defaults", () => {
      const defaults = resolvePortPrecedence({}, {});
      expect(defaults).toEqual({
        companionPort: 7300,
        debugPort: 9222,
        proxyPort: undefined,
        devPort: undefined,
        companionConflict: "shift",
        autoResolve: false,
      });

      const fromConfig = resolvePortPrecedence(
        {},
        {
          autoResolvePortConflicts: true,
          ports: {
            companion: 7400,
            debug: 9333,
            proxy: 15173,
            dev: 5173,
            companionConflict: "takeover",
          },
        }
      );
      expect(fromConfig).toEqual({
        companionPort: 7400,
        debugPort: 9333,
        proxyPort: 15173,
        devPort: 5173,
        companionConflict: "takeover",
        autoResolve: true,
      });

      const fromCli = resolvePortPrecedence(
        {
          port: "7500",
          "debug-port": "9444",
          "proxy-port": "18080",
          "dev-port": "4173",
          "auto-resolve": false,
        },
        {
          autoResolvePortConflicts: true,
          ports: {
            companion: 7400,
            debug: 9333,
            proxy: 15173,
            dev: 5173,
            companionConflict: "fail",
          },
        }
      );
      expect(fromCli).toEqual({
        companionPort: 7500,
        debugPort: 9444,
        proxyPort: 18080,
        devPort: 4173,
        companionConflict: "fail",
        autoResolve: false,
      });
    });

    it("throws CliUsageError (exitCode 2) on invalid port flags", () => {
      const invalidCases: Array<Record<string, string | boolean>> = [
        { port: "0" },
        { p: "65536" },
        { "debug-port": "abc" },
        { "proxy-port": "-5" },
        { "dev-port": true },
      ];

      for (const args of invalidCases) {
        try {
          resolvePortPrecedence(args, {});
          expect.unreachable(`Expected CliUsageError for ${JSON.stringify(args)}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CliUsageError);
          expect((err as CliUsageError).exitCode).toBe(2);
        }
      }
    });
  });

  describe("probeHostPort", () => {
    it("waits for socket close on free port and returns false on EADDRINUSE", async () => {
      const tempServer = net.createServer();
      await new Promise<void>((resolve) => tempServer.listen(0, "127.0.0.1", () => resolve()));
      const port = (tempServer.address() as net.AddressInfo).port;

      expect(await probeHostPort(port, "127.0.0.1")).toBe(false);

      await new Promise<void>((resolve) => tempServer.close(() => resolve()));
      expect(await probeHostPort(port, "127.0.0.1")).toBe(true);
    });

    it("returns false on EACCES (Windows Hyper-V/WinNAT excluded port range)", async () => {
      const createServerSpy = vi.spyOn(net, "createServer").mockImplementation(() => {
        const fakeServer = new EventEmitter() as unknown as net.Server;
        fakeServer.unref = () => fakeServer;
        fakeServer.listen = ((..._args: unknown[]) => {
          queueMicrotask(() => {
            const err = Object.assign(new Error("Permission denied"), { code: "EACCES" });
            fakeServer.emit("error", err);
          });
          return fakeServer;
        }) as net.Server["listen"];
        fakeServer.close = ((cb?: () => void) => {
          cb?.();
          return fakeServer;
        }) as net.Server["close"];
        return fakeServer;
      });

      const result = await probeHostPort(7300, "127.0.0.1");
      expect(result).toBe(false);
      expect(createServerSpy).toHaveBeenCalledOnce();
    });
  });

  describe("parseNetstatListeningPid", () => {
    it("matches exact :port LISTENING boundary and ignores substrings or foreign addresses", () => {
      const sample = [
        "Active Connections",
        "  Proto  Local Address          Foreign Address        State           PID",
        "  TCP    0.0.0.0:730            0.0.0.0:0              LISTENING       1111",
        "  TCP    192.168.1.10:54321     10.0.0.2:7300          ESTABLISHED     2222",
        "  TCP    127.0.0.1:73000        0.0.0.0:0              LISTENING       3333",
        "  TCP    127.0.0.1:7300         0.0.0.0:0              LISTENING       4444",
      ].join("\r\n");

      expect(parseNetstatListeningPid(sample, 7300)).toBe(4444);
      expect(parseNetstatListeningPid(sample, 730)).toBe(1111);
      expect(parseNetstatListeningPid(sample, 7301)).toBeUndefined();
    });
  });

  describe("resolveCompanionPort & probeCompanionStatus", () => {
    it("shifts without killing another project's companion under default 'shift' policy", async () => {
      let shutdownCalled = false;
      const { server, port } = await listenEphemeralHttp((req, res) => {
        if (req.url === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, pid: 99999, port, projectRoot: "D:\\OtherProject", debugPort: 9222 }));
          return;
        }
        if (req.url === "/shutdown") {
          shutdownCalled = true;
          res.writeHead(200);
          res.end("ok");
          return;
        }
        res.writeHead(404);
        res.end();
      });
      serversToClose.push(server);

      const resolved = await resolveCompanionPort({
        requestedPort: port,
        projectRoot: "D:\\MyProject",
        conflictPolicy: "shift",
      });

      expect(resolved).not.toBe(port);
      expect(shutdownCalled).toBe(false);
    });

    it("calls /shutdown and reclaims port under 'takeover' policy", async () => {
      let shutdownCalled = false;
      const { server, port } = await listenEphemeralHttp((req, res) => {
        if (req.url === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, pid: 88888, port, projectRoot: "D:\\OtherProject", debugPort: 9222 }));
          return;
        }
        if (req.url === "/shutdown") {
          shutdownCalled = true;
          res.writeHead(200);
          res.end("ok");
          server.close();
          return;
        }
        res.writeHead(404);
        res.end();
      });
      serversToClose.push(server);

      const resolved = await resolveCompanionPort({
        requestedPort: port,
        projectRoot: "D:\\MyProject",
        conflictPolicy: "takeover",
      });

      expect(shutdownCalled).toBe(true);
      expect(resolved).toBe(port);
    });

    it("throws actionable error under 'fail' policy", async () => {
      const { server, port } = await listenEphemeralHttp((req, res) => {
        if (req.url === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, pid: 77777, port, projectRoot: "D:\\OtherProject", debugPort: 9222 }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      serversToClose.push(server);

      await expect(
        resolveCompanionPort({
          requestedPort: port,
          projectRoot: "D:\\MyProject",
          conflictPolicy: "fail",
        })
      ).rejects.toThrow(/77777.*--port/);
    });

    it("auto-takes-over same project even under 'shift' policy", async () => {
      let shutdownCalled = false;
      const { server, port } = await listenEphemeralHttp((req, res) => {
        if (req.url === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, pid: 66666, port, projectRoot: "D:\\SameProject", debugPort: 9222 }));
          return;
        }
        if (req.url === "/shutdown") {
          shutdownCalled = true;
          res.writeHead(200);
          res.end("ok");
          server.close();
          return;
        }
        res.writeHead(404);
        res.end();
      });
      serversToClose.push(server);

      const resolved = await resolveCompanionPort({
        requestedPort: port,
        projectRoot: "D:\\SameProject",
        conflictPolicy: "shift",
      });

      expect(shutdownCalled).toBe(true);
      expect(resolved).toBe(port);
    });

    it("falls back to GET /ping when /status returns 404", async () => {
      const { server, port } = await listenEphemeralHttp((req, res) => {
        if (req.url === "/ping") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("pong");
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      serversToClose.push(server);

      const status = await probeCompanionStatus(port);
      expect(status).toEqual({ isHoverSource: true, legacy: true });
    });
  });

  describe("bindServerWithRetry", () => {
    it("steps to next free port on transient EADDRINUSE", async () => {
      const seenPorts: number[] = [];
      const result = await bindServerWithRetry(
        async (port) => {
          seenPorts.push(port);
          if (seenPorts.length === 1) {
            throw Object.assign(new Error("In use"), { code: "EADDRINUSE" });
          }
          return `bound-${port}`;
        },
        { initialPort: 45100 }
      );

      expect(seenPorts.length).toBe(2);
      expect(result.port).toBe(seenPorts[1]);
      expect(result.result).toBe(`bound-${result.port}`);
    });
  });

  describe("Zero-prompt debugPort & Electron devPort resolution", () => {
    it("auto-shifts debugPort when occupied by another listener without prompting", async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const occupiedPort = (server.address() as net.AddressInfo).port;

      try {
        const resolved = await resolveDebugPort({
          debugPort: occupiedPort,
          projectRoot: "D:\\SomeOtherProjectRoot",
          excludePorts: [],
        });

        expect(resolved).not.toBe(occupiedPort);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("fails fast in Electron mode when devPort is occupied externally and autoResolve is false", async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const occupiedPort = (server.address() as net.AddressInfo).port;

      try {
        await expect(
          resolveDevServerPort({
            projectRoot: "D:\\NonMatchingProjectRoot",
            execCommand: "npm run dev",
            expectedPort: occupiedPort,
            mode: "electron",
            autoResolve: false,
            excludePorts: [],
          })
        ).rejects.toThrow(/--auto-resolve.*autoResolvePortConflicts/);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe("extractListeningPortFromOutput", () => {
    it("extracts listening port from ANSI-colored framework output and ignores HoverSource ports", () => {
      const viteLog = "\x1b[32m  ➜  \x1b[1mLocal:\x1b[22m   \x1b[36mhttp://localhost:\x1b[1m5174\x1b[22m/\x1b[39m\n";
      expect(extractListeningPortFromOutput(viteLog, [7300, 9222, 15173])).toBe(5174);

      const hsOwnLog = "HoverSource companion at http://127.0.0.1:7300/dashboard\n  Local: http://127.0.0.1:4173/";
      expect(extractListeningPortFromOutput(hsOwnLog, new Set([7300, 9222]))).toBe(4173);

      const noUrlLog = "\x1b[33mCompiling modules...\x1b[39m";
      expect(extractListeningPortFromOutput(noUrlLog, [7300])).toBeUndefined();
    });
  });
});
