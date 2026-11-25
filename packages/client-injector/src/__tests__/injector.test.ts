import http from "node:http";
import net from "node:net";
import vm from "node:vm";
import { describe, it, expect, vi, afterEach } from "vitest";
import { expectTypeOf } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import {
  injectOverlayScript,
  broadcastToTargets,
  closeAllCdpSessions,
  type InjectOverlayOptions,
  type BroadcastTargetOptions,
} from "../injector.js";

interface RecordedCdpCommand {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MockTargetSpec {
  id: string;
  title?: string;
  type?: string;
  url: string;
  defaultContextOrigin?: string;
}

interface MockCdpServerOptions {
  targets?: MockTargetSpec[];
  alreadyInjected?: boolean;
  emitDefaultContextOnRuntimeEnable?: boolean;
  ignoreSetupMethod?: string;
  ignoreBroadcastAck?: boolean;
  ignoreCloseFrame?: boolean;
}

interface MockCdpServer {
  port: number;
  serverSockets: WebSocket[];
  commands: RecordedCdpCommand[];
  onEvaluateCallback: ((expression: string) => void) | null;
  setTargets: (targets: MockTargetSpec[]) => void;
  sendToLastSocket: (msg: unknown) => void;
  sendToSocket: (ws: WebSocket, msg: unknown) => void;
  waitForNextSocket: () => Promise<WebSocket>;
  close: () => Promise<void>;
}

async function createMockCdpServer(options: MockCdpServerOptions = {}): Promise<MockCdpServer> {
  let targets: MockTargetSpec[] = options.targets ?? [
    { id: "target-1", title: "App", type: "page", url: "http://localhost:5173/" },
  ];
  const commands: RecordedCdpCommand[] = [];
  const serverSockets: WebSocket[] = [];
  const persistentSockets: WebSocket[] = [];
  const socketWaiters: Array<(ws: WebSocket) => void> = [];
  let onEvaluateCallback: ((expression: string) => void) | null = null;

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          targets.map((t) => ({
            id: t.id,
            title: t.title ?? t.id,
            type: t.type ?? "page",
            url: t.url,
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${t.id}`,
          }))
        )
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    serverSockets.push(ws);
    const waiter = socketWaiters.shift();
    if (waiter) {
      waiter(ws);
    }

    const targetId = req.url?.split("/").pop() ?? "";
    const targetSpec = targets.find((t) => t.id === targetId);

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as RecordedCdpCommand;
      commands.push(msg);

      if (msg.method === "Page.enable") {
        persistentSockets.push(ws);
      }

      if (options.ignoreSetupMethod && msg.method === options.ignoreSetupMethod) {
        return;
      }

      if (
        msg.method === "Runtime.evaluate" &&
        typeof msg.params?.expression === "string" &&
        msg.params.expression.includes("__HOVERSOURCE_PORT__")
      ) {
        ws.send(
          JSON.stringify({
            id: msg.id,
            result: { result: { value: Boolean(options.alreadyInjected) } },
          })
        );
        return;
      }

      if (
        msg.method === "Runtime.evaluate" &&
        typeof msg.params?.expression === "string"
      ) {
        onEvaluateCallback?.(msg.params.expression);
        if (options.ignoreBroadcastAck) {
          return;
        }
        ws.send(JSON.stringify({ id: msg.id, result: { result: { value: undefined } } }));
        return;
      }

      if (msg.method === "Runtime.enable") {
        ws.send(JSON.stringify({ id: msg.id, result: {} }));
        if (options.emitDefaultContextOnRuntimeEnable !== false) {
          let origin = targetSpec?.defaultContextOrigin;
          if (!origin && targetSpec) {
            try {
              const u = new URL(targetSpec.url);
              if (u.protocol === "http:" || u.protocol === "https:") {
                origin = u.origin;
              } else if (u.protocol === "file:") {
                origin = "file://";
              }
            } catch {
              origin = undefined;
            }
          }
          if (origin) {
            ws.send(
              JSON.stringify({
                method: "Runtime.executionContextCreated",
                params: {
                  context: {
                    id: 1,
                    origin,
                    auxData: { isDefault: true, frameId: "main-frame" },
                  },
                },
              })
            );
          }
        }
        return;
      }

      ws.send(JSON.stringify({ id: msg.id, result: {} }));
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (httpServer.address() as net.AddressInfo).port;

  return {
    port,
    serverSockets: persistentSockets,
    commands,
    get onEvaluateCallback() {
      return onEvaluateCallback;
    },
    set onEvaluateCallback(cb) {
      onEvaluateCallback = cb;
    },
    setTargets(nextTargets) {
      targets = nextTargets;
    },
    sendToLastSocket(msg) {
      const ws = serverSockets[serverSockets.length - 1];
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    sendToSocket(ws, msg) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    waitForNextSocket() {
      return new Promise<WebSocket>((resolve) => {
        socketWaiters.push(resolve);
      });
    },
    async close() {
      for (const ws of serverSockets) {
        try {
          ws.terminate();
        } catch {}
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

interface RecordedCompanionRequest {
  method: string;
  url: string;
  body: string;
}

interface MockCompanionServer {
  port: number;
  requests: RecordedCompanionRequest[];
  close: () => Promise<void>;
}

async function createMockCompanionServer(
  handler?: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void
): Promise<MockCompanionServer> {
  const requests: RecordedCompanionRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        body,
      });
      if (handler) {
        handler(req, res, body);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function waitForBridgeEvaluate(
  cdpServer: MockCdpServer,
  predicate: (expr: string) => boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cdpServer.onEvaluateCallback = null;
      reject(new Error("Timed out waiting for Runtime.evaluate bridge callback"));
    }, 2000);
    timer.unref();
    cdpServer.onEvaluateCallback = (expr) => {
      if (predicate(expr)) {
        clearTimeout(timer);
        cdpServer.onEvaluateCallback = null;
        resolve(expr);
      }
    };
  });
}

function evalBridgeCallback(expr: string): {
  resolved?: { id: string; payload: string };
  rejected?: { id: string; error: string };
} {
  let resolved: { id: string; payload: string } | undefined;
  let rejected: { id: string; error: string } | undefined;
  const sandbox = {
    globalThis: {
      __hoversourceBridgeResolve: (id: string, payload: string) => {
        resolved = { id, payload };
      },
      __hoversourceBridgeReject: (id: string, error: string) => {
        rejected = { id, error };
      },
    },
  };
  vm.runInNewContext(expr, sandbox);
  return { resolved, rejected };
}

describe("client-injector persistent CDP session & Runtime.addBinding bridge", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    closeAllCdpSessions();
    vi.restoreAllMocks();
    while (cleanups.length > 0) {
      const fn = cleanups.pop()!;
      await fn();
    }
  });

  it("satisfies compile-time type contracts", () => {
    expectTypeOf(injectOverlayScript).returns.resolves.toEqualTypeOf<number>();
    expectTypeOf(broadcastToTargets).returns.resolves.toEqualTypeOf<void>();

    if (false) {
      // @ts-expect-error invalid string companionPort
      void injectOverlayScript(9222, "script", "7300");
      // @ts-expect-error invalid ephemeralCloseTimeoutMs type
      void broadcastToTargets(9222, "script", { ephemeralCloseTimeoutMs: "500" });
      const opts: InjectOverlayOptions = { companionPort: 7300, requestTimeoutMs: 1000, setupTimeoutMs: 1000 };
      const bOpts: BroadcastTargetOptions = { ephemeralCloseTimeoutMs: 250 };
      void opts;
      void bOpts;
    }
  });

  it("keeps CDP WebSocket open after injection with Page.setBypassCSP and Runtime.addBinding before evaluate", async () => {
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());

    const count = await injectOverlayScript(cdp.port, "globalThis.__TEST_OVERLAY__ = true;", 7300);
    expect(count).toBe(1);

    const methods = cdp.commands.map((c) => c.method);
    const bypassIdx = methods.indexOf("Page.setBypassCSP");
    const bindingIdx = methods.indexOf("Runtime.addBinding");
    const evalIdx = methods.lastIndexOf("Runtime.evaluate");

    expect(bypassIdx).toBeGreaterThanOrEqual(0);
    expect(bindingIdx).toBeGreaterThan(bypassIdx);
    expect(evalIdx).toBeGreaterThan(bindingIdx);
    expect(cdp.commands[bypassIdx].params).toEqual({ enabled: true });
    expect(cdp.commands[bindingIdx].params).toEqual({ name: "__hoversourceBridgeCall" });

    // Session WebSocket stays open after injectOverlayScript resolves
    const persistentWs = cdp.serverSockets[cdp.serverSockets.length - 1];
    expect(persistentWs.readyState).toBe(WebSocket.OPEN);
  });

  it("forwards all 6 allowlisted GET routes and POST /config with canonicalized paths", async () => {
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer();
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });

    const cases: Array<{ id: string; method: "GET" | "POST"; path: string; body?: string }> = [
      { id: "n:1", method: "GET", path: "/config" },
      { id: "n:2", method: "GET", path: "/open-dashboard" },
      { id: "n:3", method: "GET", path: "/open-in-ide?file=a" },
      { id: "n:4", method: "GET", path: "/open-in-ide?file=a.ts&editor=cursor" },
      { id: "n:5", method: "GET", path: "/validate-line?file=a&line=1" },
      { id: "n:6", method: "GET", path: "/static-context?file=a" },
      { id: "n:7", method: "GET", path: "/resolve-html-element?tag=div" },
      {
        id: "n:8",
        method: "POST",
        path: "/config",
        body: JSON.stringify({ target: "local", config: { theme: "dark" } }),
      },
    ];

    for (const tc of cases) {
      const evalPromise = waitForBridgeEvaluate(cdp, (expr) => expr.includes("__hoversourceBridgeResolve"));
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: {
          name: "__hoversourceBridgeCall",
          executionContextId: 1,
          payload: JSON.stringify(tc),
        },
      });
      const expr = await evalPromise;
      const result = evalBridgeCallback(expr);
      expect(result.resolved?.id).toBe(tc.id);
    }

    expect(companion.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET /config",
      "GET /open-dashboard",
      "GET /open-in-ide?file=a",
      "GET /open-in-ide?file=a.ts&editor=cursor",
      "GET /validate-line?file=a&line=1",
      "GET /static-context?file=a",
      "GET /resolve-html-element?tag=div",
      "POST /config",
    ]);
    expect(companion.requests[7].body).toBe(
      JSON.stringify({ target: "local", config: { theme: "dark" } })
    );
  });

  it("handles non-2xx responses, requestTimeoutMs timeouts, >5MB overflow, and mid-flight WS close", async () => {
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());

    let mode: "500" | "timeout" | "overflow" | "hang" = "500";
    let serverSideReqDestroyed = false;

    const companion = await createMockCompanionServer((req, res) => {
      if (mode === "500") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "boom" }));
      } else if (mode === "timeout") {
        // Never respond
      } else if (mode === "overflow") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const chunk = Buffer.alloc(1024 * 1024, "a");
        for (let i = 0; i < 6; i++) {
          res.write(chunk);
        }
        res.end();
      } else if (mode === "hang") {
        req.on("close", () => {
          serverSideReqDestroyed = true;
        });
      }
    });
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", {
      companionPort: companion.port,
      requestTimeoutMs: 50,
    });

    // 1. Non-2xx
    mode = "500";
    const err500Promise = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({ id: "e:500", method: "GET", path: "/config" }),
      },
    });
    const res500 = evalBridgeCallback(await err500Promise);
    expect(res500.rejected?.id).toBe("e:500");
    expect(res500.rejected?.error).toContain("500");
    expect(res500.rejected?.error).toContain("boom");

    // 2. Timeout
    mode = "timeout";
    const timeoutPromise = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({ id: "e:timeout", method: "GET", path: "/config" }),
      },
    });
    const resTimeout = evalBridgeCallback(await timeoutPromise);
    expect(resTimeout.rejected?.id).toBe("e:timeout");
    expect(resTimeout.rejected?.error).toContain("timed out");

    // 3. >5MB overflow
    mode = "overflow";
    const overflowPromise = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({ id: "e:overflow", method: "GET", path: "/config" }),
      },
    });
    const resOverflow = evalBridgeCallback(await overflowPromise);
    expect(resOverflow.rejected?.id).toBe("e:overflow");
    expect(resOverflow.rejected?.error).toContain("exceeded");

    // 4. Mid-flight closeAllCdpSessions destroys active inFlightRequests cleanly
    mode = "hang";
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({ id: "e:hang", method: "GET", path: "/config" }),
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    closeAllCdpSessions();
    await new Promise((r) => setTimeout(r, 20));
    expect(serverSideReqDestroyed).toBe(true);
  });

  it("safely evaluates emitted Runtime.evaluate expressions containing quotes, backslashes, and newlines", async () => {
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ path: 'C:\\Users\\Test\\"quoted"\nline2' }));
    });
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });

    const evalPromise = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeResolve"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({ id: 'id-"quote"\\slash\nnewline', method: "GET", path: "/config" }),
      },
    });
    const expr = await evalPromise;
    const result = evalBridgeCallback(expr);
    expect(result.resolved?.id).toBe('id-"quote"\\slash\nnewline');
    expect(JSON.parse(result.resolved!.payload)).toEqual({
      path: 'C:\\Users\\Test\\"quoted"\nline2',
    });
  });

  it("enforces fail-closed executionContextId origin isolation across lifecycle events and navigations", async () => {
    const cdp = await createMockCdpServer({
      targets: [{ id: "t1", url: "http://localhost:5173/" }],
    });
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer();
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });

    // Create cross-origin iframe (id: 2) and sandboxed context (id: 3)
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 2, origin: "https://evil.example", auxData: { isDefault: true, frameId: "child-1" } } },
    });
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 3, origin: "null", auxData: { isDefault: false, frameId: "sandbox-1" } } },
    });

    // Allowed context 1 forwards
    const p1 = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeResolve"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: JSON.stringify({ id: "c:1", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await p1).resolved?.id).toBe("c:1");

    // Context 2 (cross-origin) and 3 (null) rejected without reaching companion
    for (const badCtx of [2, 3]) {
      const pBad = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: { name: "__hoversourceBridgeCall", executionContextId: badCtx, payload: JSON.stringify({ id: `c:${badCtx}`, method: "GET", path: "/config" }) },
      });
      expect(evalBridgeCallback(await pBad).rejected?.id).toBe(`c:${badCtx}`);
    }
    expect(companion.requests).toHaveLength(1);

    // Destroy context 1 -> subsequent call rejected
    cdp.sendToLastSocket({ method: "Runtime.executionContextDestroyed", params: { executionContextId: 1 } });
    const pDestroyed = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: JSON.stringify({ id: "c:destroyed", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pDestroyed).rejected?.id).toBe("c:destroyed");

    // Re-create context 1, then clear all contexts -> empty executionContexts rejects
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 1, origin: "http://localhost:5173" } },
    });
    cdp.sendToLastSocket({ method: "Runtime.executionContextsCleared", params: {} });
    const pEmpty = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: JSON.stringify({ id: "c:empty", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pEmpty).rejected?.id).toBe("c:empty");

    // ExecutionContextsCleared followed by evil context (id: 2) -> cleared id: 1 still rejected
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 2, origin: "https://evil.example" } },
    });
    const pCleared1 = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: JSON.stringify({ id: "c:cleared1", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pCleared1).rejected?.id).toBe("c:cleared1");

    // Top-level navigation to about:blank clears stale trustedOrigin
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 1, origin: "http://localhost:5173" } },
    });
    cdp.sendToLastSocket({
      method: "Page.frameNavigated",
      params: { frame: { id: "main-frame", url: "about:blank" } },
    });
    cdp.sendToLastSocket({
      method: "Runtime.executionContextCreated",
      params: { context: { id: 4, origin: "null" } },
    });
    for (const ctxId of [1, 4]) {
      const pNav = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: { name: "__hoversourceBridgeCall", executionContextId: ctxId, payload: JSON.stringify({ id: `c:nav${ctxId}`, method: "GET", path: "/config" }) },
      });
      expect(evalBridgeCallback(await pNav).rejected?.id).toBe(`c:nav${ctxId}`);
    }
    expect(companion.requests).toHaveLength(1);
  });

  it("handles data:, about:blank child iframe anti-poisoning, about:blank->http navigation, and file:// targets", async () => {
    const cdp = await createMockCdpServer({
      targets: [
        { id: "t-data", url: "data:text/html,<iframe src='https://evil.example'>" },
        { id: "t-blank", url: "about:blank" },
        { id: "t-file", url: "file:///app/index.html" },
      ],
    });
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer();
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });
    const [wsData, wsBlank, wsFile] = cdp.serverSockets;

    // 1. data: target with child iframe context (id: 2, isDefault: true, frameId: child-frame-1) must NOT poison trustedOrigin
    cdp.sendToSocket(wsData, {
      method: "Runtime.executionContextCreated",
      params: { context: { id: 2, origin: "https://evil.example", auxData: { isDefault: true, frameId: "child-frame-1" } } },
    });
    const pDataReject = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToSocket(wsData, {
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 2, payload: JSON.stringify({ id: "d:1", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pDataReject).rejected?.id).toBe("d:1");

    // 2. about:blank target navigated via Page.frameNavigated allows navigated origin and rejects others
    cdp.sendToSocket(wsBlank, {
      method: "Page.frameNavigated",
      params: { frame: { id: "main-blank", url: "http://localhost:4173/app" } },
    });
    cdp.sendToSocket(wsBlank, {
      method: "Runtime.executionContextCreated",
      params: { context: { id: 10, origin: "http://localhost:4173", auxData: { isDefault: true, frameId: "main-blank" } } },
    });
    cdp.sendToSocket(wsBlank, {
      method: "Runtime.executionContextCreated",
      params: { context: { id: 11, origin: "https://evil.example" } },
    });
    const pBlankOk = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeResolve"));
    cdp.sendToSocket(wsBlank, {
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 10, payload: JSON.stringify({ id: "b:ok", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pBlankOk).resolved?.id).toBe("b:ok");

    const pBlankBad = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToSocket(wsBlank, {
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 11, payload: JSON.stringify({ id: "b:bad", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pBlankBad).rejected?.id).toBe("b:bad");

    // 3. file:// target allows file:// and rejects https://evil.example
    cdp.sendToSocket(wsFile, {
      method: "Runtime.executionContextCreated",
      params: { context: { id: 20, origin: "https://evil.example" } },
    });
    const pFileOk = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeResolve"));
    cdp.sendToSocket(wsFile, {
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: JSON.stringify({ id: "f:ok", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pFileOk).resolved?.id).toBe("f:ok");

    const pFileBad = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToSocket(wsFile, {
      method: "Runtime.bindingCalled",
      params: { name: "__hoversourceBridgeCall", executionContextId: 20, payload: JSON.stringify({ id: "f:bad", method: "GET", path: "/config" }) },
    });
    expect(evalBridgeCallback(await pFileBad).rejected?.id).toBe("f:bad");
    expect(companion.requests).toHaveLength(2);
  });

  it("emits redacted [HoverSource] console.warn diagnostics without leaking body or raw payload", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "save failed" }));
    });
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });

    // (a) Failing POST /config with sentinel secret in body
    const pFail = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: JSON.stringify({
          id: "r:1",
          method: "POST",
          path: "/config",
          body: JSON.stringify({ target: "local", config: { secret: "__REDACT_ME_BODY__" } }),
        }),
      },
    });
    await pFail;

    // (b) Malformed/disallowed payload with sentinel string
    cdp.sendToLastSocket({
      method: "Runtime.bindingCalled",
      params: {
        name: "__hoversourceBridgeCall",
        executionContextId: 1,
        payload: "{not-json __REDACT_ME_PAYLOAD__",
      },
    });
    await new Promise((r) => setTimeout(r, 30));

    const logs = warnSpy.mock.calls.map((args) => args.join(" "));
    expect(logs.some((l) => l.includes("[HoverSource]") && l.includes("POST") && l.includes("/config") && l.includes("500") && l.includes("http://localhost:5173/"))).toBe(true);
    expect(logs.some((l) => l.includes("__REDACT_ME_BODY__"))).toBe(false);
    expect(logs.some((l) => l.includes("__REDACT_ME_PAYLOAD__"))).toBe(false);
  });

  it("strictly validates parseBridgeCallPayload bounds, paths, methods, and route schemas", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cdp = await createMockCdpServer();
    cleanups.push(() => cdp.close());
    const companion = await createMockCompanionServer();
    cleanups.push(() => companion.close());

    await injectOverlayScript(cdp.port, "globalThis.__TEST__ = 1;", { companionPort: companion.port });

    let evalCount = 0;
    cdp.onEvaluateCallback = () => {
      evalCount++;
    };

    // Invalid IDs / oversized raw payload / oversized body (>1MB) must not reach companion
    for (const badRaw of [
      "x".repeat(1_048_577),
      JSON.stringify({ id: "", method: "GET", path: "/config" }),
      JSON.stringify({ id: "a".repeat(257), method: "GET", path: "/config" }),
      JSON.stringify({ id: "v:1", method: "POST", path: "/config", body: "x".repeat(1_048_577) }),
    ]) {
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: { name: "__hoversourceBridgeCall", executionContextId: 1, payload: badRaw },
      });
    }
    await new Promise((r) => setTimeout(r, 30));
    expect(evalCount).toBe(0);
    expect(warnSpy).toHaveBeenCalled();

    // Valid IDs with invalid payloads MUST invoke __hoversourceBridgeReject and never reach companion
    const invalidPayloads: Array<Record<string, unknown>> = [
      { id: "v:2", method: "GET", path: "/open-in-ide" },
      { id: "v:3", method: "GET", path: '/open-in-ide?file=foo"$(calc)' },
      { id: "v:4", method: "GET", path: "/open-in-ide?file=/@fs/%24(id)" },
      { id: "v:5", method: "GET", path: "/open-in-ide?file=https://localhost:5173/@fs/%2524(id)" },
      { id: "v:6", method: "GET", path: "/open-in-ide?file=https://localhost:5173/@fs/%252524(id)" },
      { id: "v:7", method: "GET", path: "/open-in-ide?file=https://localhost:5173/@fs/%22%60id%60%22" },
      { id: "v:8", method: "GET", path: "/open-in-ide?file=%25COMSPEC%25" },
      { id: "v:9", method: "GET", path: "/open-in-ide?file=%2525COMSPEC%2525" },
      { id: "v:10", method: "GET", path: "/open-in-ide?file=a.ts&editor=sh" },
      { id: "v:11", method: "GET", path: "/config?target=custom&customPath=/tmp" },
      { id: "v:12", method: "POST", path: "/config", body: JSON.stringify({ target: "global", config: {} }) },
      { id: "v:13", method: "POST", path: "/config", body: JSON.stringify({ target: "local", customPath: "/tmp", config: {} }) },
      { id: "v:14", method: "POST", path: "/config", body: "null" },
      { id: "v:15", method: "GET", path: "/\t/evil.com/config" },
      { id: "v:16", method: "GET", path: "/\\evil.com" },
      { id: "v:17", method: "GET", path: "/config\\x" },
      { id: "v:18", method: "GET", path: "http://127.0.0.1/config" },
      { id: "v:19", method: "GET", path: "/config", body: "{}" },
      { id: "v:20", method: "POST", path: "/open-in-ide", body: "{}" },
      { id: "v:21", method: "POST", path: "/config", body: 123 },
      { id: "v:22", method: "GET", path: "//evil.com" },
      { id: "v:23", method: "GET", path: "/shutdown" },
      { id: "v:24", method: "DELETE", path: "/config" },
    ];

    for (const payload of invalidPayloads) {
      const pRej = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeReject"));
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: {
          name: "__hoversourceBridgeCall",
          executionContextId: 1,
          payload: JSON.stringify(payload),
        },
      });
      expect(evalBridgeCallback(await pRej).rejected?.id).toBe(payload.id);
    }
    expect(companion.requests).toHaveLength(0);

    // Valid multi-encoded /@fs/ regression cases MUST succeed
    const validPaths = [
      "/open-in-ide?file=/@fs/C:/my%20new%20app/App.tsx",
      "/open-in-ide?file=https%3A%2F%2Flocalhost%3A5173%2F%40fs%2FC%3A%2FUsers%2FMy%2520Name%2520Here%2FApp.tsx",
      "/open-in-ide?file=/@fs/app/users/%5Bid%5D/page.tsx",
    ];
    for (let i = 0; i < validPaths.length; i++) {
      const pOk = waitForBridgeEvaluate(cdp, (e) => e.includes("__hoversourceBridgeResolve"));
      cdp.sendToLastSocket({
        method: "Runtime.bindingCalled",
        params: {
          name: "__hoversourceBridgeCall",
          executionContextId: 1,
          payload: JSON.stringify({ id: `ok:${i}`, method: "GET", path: validPaths[i] }),
        },
      });
      expect(evalBridgeCallback(await pOk).resolved?.id).toBe(`ok:${i}`);
    }
    expect(companion.requests).toHaveLength(3);
  });

  it("handles reconnects when already injected, overlapping calls, mid-handshake teardown, and setupTimeoutMs", async () => {
    // 1. Reconnect when __HOVERSOURCE_PORT__ is already present
    const cdp1 = await createMockCdpServer({ alreadyInjected: true });
    cleanups.push(() => cdp1.close());
    const count1 = await injectOverlayScript(cdp1.port, "globalThis.__TEST__ = 1;");
    expect(count1).toBe(1);
    expect(cdp1.commands.some((c) => c.method === "Page.setBypassCSP")).toBe(true);
    expect(cdp1.commands.some((c) => c.method === "Runtime.addBinding")).toBe(true);
    closeAllCdpSessions();

    // 2. Overlapping injectOverlayScript calls create only one persistent session
    const cdp2 = await createMockCdpServer({ alreadyInjected: false });
    cleanups.push(() => cdp2.close());
    const [rA, rB] = await Promise.all([
      injectOverlayScript(cdp2.port, "globalThis.__TEST__ = 1;"),
      injectOverlayScript(cdp2.port, "globalThis.__TEST__ = 1;"),
    ]);
    expect(rA + rB).toBe(1);
    closeAllCdpSessions();

    // 3. closeAllCdpSessions() mid-handshake rejects cleanly without waiting for setupTimeoutMs
    const cdp3 = await createMockCdpServer({ ignoreSetupMethod: "Page.setBypassCSP" });
    cleanups.push(() => cdp3.close());
    const start = Date.now();
    const pendingInject = injectOverlayScript(cdp3.port, "globalThis.__TEST__ = 1;", {
      setupTimeoutMs: 4000,
    });
    await new Promise((r) => setTimeout(r, 30));
    closeAllCdpSessions();
    const count3 = await pendingInject;
    expect(count3).toBe(0);
    expect(Date.now() - start).toBeLessThan(1500);

    // 4. setupTimeoutMs cleanup
    const cdp4 = await createMockCdpServer({ ignoreSetupMethod: "Page.setBypassCSP" });
    cleanups.push(() => cdp4.close());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const count4 = await injectOverlayScript(cdp4.port, "globalThis.__TEST__ = 1;", {
      setupTimeoutMs: 50,
    });
    expect(count4).toBe(0);
    expect(errSpy).toHaveBeenCalled();

    // 5. broadcastToTargets reuses active session cleanly without hardcoded id: 1 collision
    const cdp5 = await createMockCdpServer();
    cleanups.push(() => cdp5.close());
    await injectOverlayScript(cdp5.port, "globalThis.__TEST__ = 1;");
    const socketCountBefore = cdp5.serverSockets.length;
    await broadcastToTargets(cdp5.port, "globalThis.__PING__ = 1;");
    expect(cdp5.serverSockets.length).toBe(socketCountBefore);
    const evalCmds = cdp5.commands.filter((c) => c.method === "Runtime.evaluate");
    expect(evalCmds[evalCmds.length - 1].id).toBeGreaterThan(1);
  });

  it("settles broadcastToTargets deterministically with WebSocket.CLOSED on all ephemeral sockets", async () => {
    const clientSockets = new Set<WebSocket>();
    let activePort: number | undefined;
    const origEmit = WebSocket.prototype.emit;
    vi.spyOn(WebSocket.prototype, "emit").mockImplementation(function (
      this: WebSocket,
      event: string | symbol,
      ...args: unknown[]
    ) {
      if (activePort !== undefined && this.url?.startsWith(`ws://127.0.0.1:${activePort}/`)) {
        clientSockets.add(this);
      }
      return origEmit.call(this, event, ...args);
    });

    // 1. Normal ack-initiated close
    const cdpNormal = await createMockCdpServer();
    cleanups.push(() => cdpNormal.close());
    activePort = cdpNormal.port;
    await broadcastToTargets(cdpNormal.port, "globalThis.__PING__ = 1;", {
      ephemeralCloseTimeoutMs: 25,
    });
    expect(clientSockets.size).toBe(1);
    for (const ws of clientSockets) {
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    }
    clientSockets.clear();

    // 2. Unresponsive OPEN timeout (server never acks Runtime.evaluate)
    const cdpUnresponsive = await createMockCdpServer({ ignoreBroadcastAck: true });
    cleanups.push(() => cdpUnresponsive.close());
    activePort = cdpUnresponsive.port;
    await broadcastToTargets(cdpUnresponsive.port, "globalThis.__PING__ = 1;", {
      ephemeralCloseTimeoutMs: 25,
    });
    expect(clientSockets.size).toBe(1);
    for (const ws of clientSockets) {
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    }
    clientSockets.clear();
    activePort = undefined;

    // 3. Stalled CONNECTING timeout (raw TCP server accepts connection and never completes WS handshake)
    const stalledSockets: net.Socket[] = [];
    const stalledWsTcpServer = net.createServer((sock) => {
      stalledSockets.push(sock);
    });
    await new Promise<void>((resolve) => stalledWsTcpServer.listen(0, "127.0.0.1", () => resolve()));
    const stalledWsPort = (stalledWsTcpServer.address() as net.AddressInfo).port;
    const stalledJsonServer = http.createServer((req, res) => {
      if (req.url === "/json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "stalled",
              title: "Stalled",
              type: "page",
              url: "http://localhost:5173/",
              webSocketDebuggerUrl: `ws://127.0.0.1:${stalledWsPort}/devtools/page/stalled`,
            },
          ])
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => stalledJsonServer.listen(0, "127.0.0.1", () => resolve()));
    const stalledJsonPort = (stalledJsonServer.address() as net.AddressInfo).port;
    cleanups.push(async () => {
      for (const s of stalledSockets) s.destroy();
      await new Promise<void>((resolve) => stalledWsTcpServer.close(() => resolve()));
      await new Promise<void>((resolve) => stalledJsonServer.close(() => resolve()));
    });

    await expect(
      broadcastToTargets(stalledJsonPort, "globalThis.__PING__ = 1;", {
        ephemeralCloseTimeoutMs: 25,
      })
    ).resolves.toBeUndefined();
  });
});
