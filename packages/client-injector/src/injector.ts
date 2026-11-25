import http from "node:http";
import WebSocket from "ws";

interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export interface InjectOverlayOptions {
  companionPort?: number;
  requestTimeoutMs?: number;
  setupTimeoutMs?: number;
}

export interface BroadcastTargetOptions {
  ephemeralCloseTimeoutMs?: number;
}

interface PendingCommand {
  method: string;
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

interface ExecutionContextInfo {
  origin: string;
  isDefault?: boolean;
  frameId?: string;
}

interface CdpSession {
  key: string;
  ws: WebSocket;
  target: CdpTarget;
  companionPort: number;
  requestTimeoutMs: number;
  nextCmdId: number;
  pendingCommands: Map<number, PendingCommand>;
  inFlightRequests: Set<http.ClientRequest>;
  executionContexts: Map<number, ExecutionContextInfo>;
  trustedOrigin: string;
  mainFrameId: string | undefined;
}

const DEFAULT_COMPANION_PORT = 7300;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_SETUP_TIMEOUT_MS = 5000;
const DEFAULT_EPHEMERAL_CLOSE_TIMEOUT_MS = 500;
const FETCH_JSON_TIMEOUT_MS = 2500;
const MAX_BRIDGE_PAYLOAD_BYTES = 1_048_576;
const MAX_BRIDGE_ID_LENGTH = 256;
const MAX_COMPANION_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOWED_BRIDGE_METHODS = new Set(["GET", "POST"]);
const ALLOWED_GET_ROUTES = new Set([
  "/config",
  "/open-dashboard",
  "/open-in-ide",
  "/validate-line",
  "/static-context",
  "/resolve-html-element",
]);
const ALLOWED_EDITORS = new Set(["vscode", "code", "cursor"]);
const SHELL_META_RE = /["`$\r\n\0]/;
const WIN_ENV_VAR_RE = /%[^%/\\]+%/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

const activeSessions = new Map<string, CdpSession>();
const inFlightSessions = new Map<string, WebSocket>();
let sessionEpoch = 0;

function clampPositiveTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function getSessionKey(port: number, target: CdpTarget): string {
  return `${port}:${target.id || target.webSocketDebuggerUrl}`;
}

function closeSocketSafely(ws: WebSocket): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws.readyState !== WebSocket.CLOSED) {
      ws.terminate();
    }
  } catch {
    // Ignore close/terminate errors during teardown
  }
}

function deriveTrustedOrigin(rawUrl?: string): string {
  if (!rawUrl) {
    return "";
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
    if (parsed.protocol === "file:") {
      return "file://";
    }
    return "";
  } catch {
    return "";
  }
}

function resolveCompanionPort(
  scriptContent: string,
  optionsOrCompanionPort?: number | InjectOverlayOptions
): number {
  const explicitPort =
    typeof optionsOrCompanionPort === "number"
      ? optionsOrCompanionPort
      : optionsOrCompanionPort?.companionPort;
  if (typeof explicitPort === "number" && Number.isInteger(explicitPort) && explicitPort > 0) {
    return explicitPort;
  }
  const match = /(?:globalThis|window)\.__HOVERSOURCE_PORT__\s*=\s*(\d+)/.exec(scriptContent);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_COMPANION_PORT;
}

function rejectPendingCommands(session: CdpSession, reason: string): void {
  for (const [, pending] of session.pendingCommands) {
    pending.reject(new Error(reason));
  }
  session.pendingCommands.clear();
}

function destroyInFlightRequests(session: CdpSession): void {
  for (const req of session.inFlightRequests) {
    try {
      req.destroy(new Error("CDP session closed"));
    } catch {
      // Ignore destroy errors
    }
  }
  session.inFlightRequests.clear();
}

function sendCommand(
  session: CdpSession,
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  if (session.ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`CDP ${method} failed: WebSocket is not open`));
  }
  const id = session.nextCmdId++;
  return new Promise((resolve, reject) => {
    session.pendingCommands.set(id, { method, resolve, reject });
    try {
      session.ws.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      session.pendingCommands.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function closeAllCdpSessions(): void {
  sessionEpoch++;
  for (const session of activeSessions.values()) {
    rejectPendingCommands(session, "CDP session closed by closeAllCdpSessions");
    destroyInFlightRequests(session);
    closeSocketSafely(session.ws);
  }
  activeSessions.clear();

  for (const ws of inFlightSessions.values()) {
    closeSocketSafely(ws);
  }
  inFlightSessions.clear();
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      fn();
    };

    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        finish(() => reject(new Error(`Failed to fetch JSON, status code: ${res.statusCode}`)));
        return;
      }
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body) as T;
          finish(() => resolve(parsed));
        } catch (e) {
          finish(() => reject(e));
        }
      });
      res.on("error", (err) => {
        finish(() => reject(err));
      });
    });

    req.on("error", (err) => {
      finish(() => reject(err));
    });

    timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new Error(`Timed out fetching JSON from ${url}`)));
    }, FETCH_JSON_TIMEOUT_MS);
    timer.unref();
  });
}

type ParsedBridgeCallResult =
  | {
      ok: true;
      id: string;
      method: "GET" | "POST";
      canonicalPath: string;
      body?: string;
    }
  | {
      ok: false;
      id?: string;
      method?: string;
      path?: string;
      error: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractValidBridgeId(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > MAX_BRIDGE_PAYLOAD_BYTES) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      return undefined;
    }
    if (
      typeof parsed.id === "string" &&
      parsed.id.length > 0 &&
      parsed.id.length <= MAX_BRIDGE_ID_LENGTH
    ) {
      return parsed.id;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseBridgeCallPayload(raw: unknown): ParsedBridgeCallResult {
  if (typeof raw !== "string" || raw.length > MAX_BRIDGE_PAYLOAD_BYTES) {
    return { ok: false, error: "Bridge payload must be a string within size limit" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Malformed JSON in bridge payload" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Bridge payload must be a JSON object" };
  }

  const id =
    typeof parsed.id === "string" &&
    parsed.id.length > 0 &&
    parsed.id.length <= MAX_BRIDGE_ID_LENGTH
      ? parsed.id
      : undefined;

  if (!id) {
    return { ok: false, error: "Invalid or missing bridge call id" };
  }

  const method = typeof parsed.method === "string" ? parsed.method : undefined;
  if (!method || !ALLOWED_BRIDGE_METHODS.has(method)) {
    return { ok: false, id, method, error: `Disallowed bridge HTTP method: ${String(parsed.method)}` };
  }

  if (parsed.body !== undefined) {
    if (typeof parsed.body !== "string" || parsed.body.length > MAX_BRIDGE_PAYLOAD_BYTES) {
      return { ok: false, id, method, error: "Invalid or oversized bridge request body" };
    }
    if (method === "GET") {
      return { ok: false, id, method, error: "GET bridge requests must not include a body" };
    }
  }

  const rawPath = parsed.path;
  if (
    typeof rawPath !== "string" ||
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    rawPath.includes("\\") ||
    CONTROL_CHAR_RE.test(rawPath)
  ) {
    return { ok: false, id, method, error: "Invalid bridge request path" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawPath, "http://127.0.0.1");
  } catch {
    return { ok: false, id, method, error: "Malformed bridge request URL" };
  }

  if (parsedUrl.origin !== "http://127.0.0.1") {
    return { ok: false, id, method, error: "Bridge request path must target local origin" };
  }

  const pathname = parsedUrl.pathname;
  if (method === "POST") {
    if (pathname !== "/config") {
      return { ok: false, id, method, path: pathname, error: `POST is not allowed on ${pathname}` };
    }
  } else if (!ALLOWED_GET_ROUTES.has(pathname)) {
    return { ok: false, id, method, path: pathname, error: `Disallowed bridge route: ${pathname}` };
  }

  if (method === "GET" && pathname === "/config" && parsedUrl.search !== "") {
    return { ok: false, id, method, path: pathname, error: "GET /config does not accept query parameters" };
  }

  if (method === "POST" && pathname === "/config") {
    if (typeof parsed.body !== "string") {
      return { ok: false, id, method, path: pathname, error: "POST /config requires a JSON string body" };
    }
    let bodyObj: unknown;
    try {
      bodyObj = JSON.parse(parsed.body);
    } catch {
      return { ok: false, id, method, path: pathname, error: "Malformed JSON in POST /config body" };
    }
    if (
      !isPlainObject(bodyObj) ||
      bodyObj.target !== "local" ||
      bodyObj.customPath !== undefined ||
      !isPlainObject(bodyObj.config)
    ) {
      return {
        ok: false,
        id,
        method,
        path: pathname,
        error: "POST /config requires target='local', no customPath, and a config object",
      };
    }
  }

  if (pathname === "/open-in-ide") {
    const fileParam = parsedUrl.searchParams.get("file");
    if (!fileParam) {
      return { ok: false, id, method, path: pathname, error: "Missing file parameter in /open-in-ide" };
    }

    let decodedFile = fileParam;
    let stabilized = false;
    for (let pass = 0; pass < 4; pass++) {
      let next: string;
      try {
        next = decodeURIComponent(decodedFile);
      } catch {
        return {
          ok: false,
          id,
          method,
          path: pathname,
          error: "Malformed percent-encoding in /open-in-ide file parameter",
        };
      }
      if (next === decodedFile) {
        stabilized = true;
        break;
      }
      decodedFile = next;
    }
    if (!stabilized) {
      return {
        ok: false,
        id,
        method,
        path: pathname,
        error: "Excessive percent-encoding depth in /open-in-ide file parameter",
      };
    }

    if (
      SHELL_META_RE.test(fileParam) ||
      SHELL_META_RE.test(decodedFile) ||
      WIN_ENV_VAR_RE.test(decodedFile)
    ) {
      return {
        ok: false,
        id,
        method,
        path: pathname,
        error: "Disallowed characters in /open-in-ide file parameter",
      };
    }

    const editorParam = parsedUrl.searchParams.get("editor");
    if (editorParam !== null && !ALLOWED_EDITORS.has(editorParam)) {
      return {
        ok: false,
        id,
        method,
        path: pathname,
        error: `Disallowed editor in /open-in-ide: ${editorParam}`,
      };
    }
  }

  return {
    ok: true,
    id,
    method: method as "GET" | "POST",
    canonicalPath: `${parsedUrl.pathname}${parsedUrl.search}`,
    body: parsed.body as string | undefined,
  };
}

async function evaluateBridgeCallback(
  session: CdpSession,
  expression: string,
  executionContextId: number | undefined,
  diagnosticLabel: string
): Promise<void> {
  if (session.ws.readyState !== WebSocket.OPEN) {
    console.debug(
      `[HoverSource] CDP WebSocket closed mid-flight before delivering ${diagnosticLabel} on ${session.target.url}`
    );
    return;
  }
  try {
    await sendCommand(session, "Runtime.evaluate", {
      expression,
      awaitPromise: false,
      ...(typeof executionContextId === "number" ? { contextId: executionContextId } : {}),
    });
  } catch (err) {
    if (session.ws.readyState !== WebSocket.OPEN) {
      console.debug(
        `[HoverSource] CDP WebSocket closed mid-flight during ${diagnosticLabel} on ${session.target.url}`
      );
    } else {
      console.warn(
        `[HoverSource] Failed to deliver ${diagnosticLabel} on ${session.target.url}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

async function resolveBridgeCall(
  session: CdpSession,
  id: string,
  payloadJson: string,
  executionContextId: number | undefined,
  label: string
): Promise<void> {
  const expr = `globalThis.__hoversourceBridgeResolve?.(${JSON.stringify(id)}, ${JSON.stringify(payloadJson)})`;
  await evaluateBridgeCallback(session, expr, executionContextId, label);
}

async function rejectBridgeCall(
  session: CdpSession,
  id: string,
  errorMessage: string,
  executionContextId: number | undefined,
  label: string
): Promise<void> {
  const expr = `globalThis.__hoversourceBridgeReject?.(${JSON.stringify(id)}, ${JSON.stringify(errorMessage)})`;
  await evaluateBridgeCallback(session, expr, executionContextId, label);
}

function forwardBridgeHttpRequest(
  session: CdpSession,
  method: "GET" | "POST",
  canonicalPath: string,
  body?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req: http.ClientRequest;

    const settleResolve = (value: string) => {
      if (settled) return;
      settled = true;
      session.inFlightRequests.delete(req);
      resolve(value);
    };

    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      session.inFlightRequests.delete(req);
      reject(err);
    };

    const headers: Record<string, string | number> = {};
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body, "utf8");
    }

    req = http.request(
      {
        hostname: "127.0.0.1",
        port: session.companionPort,
        path: canonicalPath,
        method,
        headers,
      },
      (companionRes) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        companionRes.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
          totalBytes += buf.length;
          if (totalBytes > MAX_COMPANION_RESPONSE_BYTES) {
            const overflowErr = new Error(
              `Companion response exceeded ${MAX_COMPANION_RESPONSE_BYTES} bytes (${method} ${canonicalPath})`
            );
            req.destroy(overflowErr);
            companionRes.destroy(overflowErr);
            settleReject(overflowErr);
            return;
          }
          chunks.push(buf);
        });

        companionRes.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf8");
          const statusCode = companionRes.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            let detail = "";
            try {
              const parsedErr = JSON.parse(responseText) as { error?: unknown };
              if (typeof parsedErr?.error === "string" && parsedErr.error) {
                detail = `: ${parsedErr.error}`;
              }
            } catch {
              // Ignore non-JSON error bodies
            }
            settleReject(
              new Error(
                `Companion request ${method} ${canonicalPath} failed with status ${statusCode}${detail}`
              )
            );
            return;
          }
          settleResolve(responseText);
        });

        companionRes.on("error", (err) => {
          settleReject(err instanceof Error ? err : new Error(String(err)));
        });

        companionRes.on("close", () => {
          if (!settled) {
            settleReject(
              new Error(`Companion response stream closed prematurely (${method} ${canonicalPath})`)
            );
          }
        });
      }
    );

    session.inFlightRequests.add(req);

    req.setTimeout(session.requestTimeoutMs, () => {
      const timeoutErr = new Error(
        `Companion request timed out after ${session.requestTimeoutMs}ms (${method} ${canonicalPath})`
      );
      req.destroy(timeoutErr);
      settleReject(timeoutErr);
    });

    req.on("error", (err) => {
      settleReject(err instanceof Error ? err : new Error(String(err)));
    });

    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

async function handleBindingCalled(
  session: CdpSession,
  params: { name?: unknown; payload?: unknown; executionContextId?: unknown } | undefined
): Promise<void> {
  if (!params || params.name !== "__hoversourceBridgeCall") {
    return;
  }

  const executionContextId =
    typeof params.executionContextId === "number" ? params.executionContextId : undefined;
  const ctx =
    executionContextId !== undefined ? session.executionContexts.get(executionContextId) : undefined;
  const isAllowedOrigin =
    ctx !== undefined &&
    ctx.origin !== "null" &&
    session.trustedOrigin !== "" &&
    ctx.origin === session.trustedOrigin;

  if (!isAllowedOrigin) {
    console.warn(
      `[HoverSource] Rejected CDP bridge call from untrusted execution context (executionContextId=${String(params.executionContextId ?? "unknown")}, origin=${ctx?.origin ?? "unknown"}) on ${session.target.url}`
    );
    const validId = extractValidBridgeId(params.payload);
    if (validId) {
      await rejectBridgeCall(
        session,
        validId,
        "Rejected CDP bridge call from untrusted execution context",
        executionContextId,
        "untrusted-context rejection"
      );
    }
    return;
  }

  const parsed = parseBridgeCallPayload(params.payload);
  if (!parsed.ok) {
    console.warn(
      `[HoverSource] Rejected invalid CDP bridge payload (${parsed.method ?? "unknown"} ${parsed.path ?? "unknown"}) on ${session.target.url}: ${parsed.error}`
    );
    if (parsed.id) {
      await rejectBridgeCall(
        session,
        parsed.id,
        parsed.error,
        executionContextId,
        `validation rejection (${parsed.method ?? "unknown"} ${parsed.path ?? "unknown"})`
      );
    }
    return;
  }

  try {
    const responseText = await forwardBridgeHttpRequest(
      session,
      parsed.method,
      parsed.canonicalPath,
      parsed.body
    );
    await resolveBridgeCall(
      session,
      parsed.id,
      responseText,
      executionContextId,
      `${parsed.method} ${parsed.canonicalPath}`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(
      `[HoverSource] Companion bridge request failed (${parsed.method} ${parsed.canonicalPath}) on ${session.target.url}: ${errorMessage}`
    );
    await rejectBridgeCall(
      session,
      parsed.id,
      errorMessage,
      executionContextId,
      `error rejection (${parsed.method} ${parsed.canonicalPath})`
    );
  }
}

function handleSessionMessage(session: CdpSession, data: WebSocket.RawData): void {
  let msg: any;
  try {
    const dataStr = typeof data === "string" ? data : (data as Buffer).toString("utf8");
    msg = JSON.parse(dataStr);
  } catch {
    return;
  }

  if (typeof msg.id === "number") {
    const pending = session.pendingCommands.get(msg.id);
    if (pending) {
      session.pendingCommands.delete(msg.id);
      if (msg.error) {
        pending.reject(
          new Error(`CDP ${pending.method} failed (id=${msg.id}): ${JSON.stringify(msg.error)}`)
        );
      } else {
        pending.resolve(msg.result);
      }
    }
    return;
  }

  if (msg.method === "Page.frameNavigated") {
    const frame = msg.params?.frame;
    if (!frame?.parentId) {
      session.mainFrameId = frame?.id ?? session.mainFrameId;
      session.trustedOrigin = deriveTrustedOrigin(frame?.url);
    }
    return;
  }

  if (msg.method === "Runtime.executionContextCreated") {
    const ctx = msg.params?.context;
    if (ctx && typeof ctx.id === "number") {
      session.executionContexts.set(ctx.id, {
        origin: typeof ctx.origin === "string" ? ctx.origin : "",
        isDefault: ctx.auxData?.isDefault,
        frameId: ctx.auxData?.frameId,
      });
      if (
        !session.trustedOrigin &&
        session.mainFrameId !== undefined &&
        ctx.auxData?.isDefault === true &&
        ctx.auxData?.frameId === session.mainFrameId &&
        ctx.origin &&
        ctx.origin !== "null"
      ) {
        session.trustedOrigin = ctx.origin;
      }
    }
    return;
  }

  if (msg.method === "Runtime.executionContextDestroyed") {
    const id = msg.params?.executionContextId;
    if (typeof id === "number") {
      session.executionContexts.delete(id);
    }
    return;
  }

  if (msg.method === "Runtime.executionContextsCleared") {
    session.executionContexts.clear();
    return;
  }

  if (msg.method === "Runtime.bindingCalled") {
    void handleBindingCalled(session, msg.params).catch((err) => {
      console.warn(
        `[HoverSource] Unexpected error in CDP bridge handler on ${session.target.url}: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }
}

async function injectIntoTarget(
  key: string,
  target: CdpTarget,
  scriptContent: string,
  options: {
    startEpoch: number;
    skipEvaluate: boolean;
    companionPort: number;
    requestTimeoutMs: number;
    setupTimeoutMs: number;
  }
): Promise<boolean> {
  if (sessionEpoch !== options.startEpoch) {
    return false;
  }

  const existing = activeSessions.get(key);
  if (existing) {
    if (existing.ws.readyState === WebSocket.OPEN) {
      return false;
    }
    activeSessions.delete(key);
  }
  if (inFlightSessions.has(key)) {
    return false;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  inFlightSessions.set(key, ws);

  const session: CdpSession = {
    key,
    ws,
    target,
    companionPort: options.companionPort,
    requestTimeoutMs: options.requestTimeoutMs,
    nextCmdId: 1,
    pendingCommands: new Map(),
    inFlightRequests: new Set(),
    executionContexts: new Map(),
    trustedOrigin: deriveTrustedOrigin(target.url),
    mainFrameId: undefined,
  };

  let setupTimer: NodeJS.Timeout | undefined;
  let cleanupPreOpen: (() => void) | undefined;

  const cleanupSession = (reason: string) => {
    rejectPendingCommands(session, reason);
    destroyInFlightRequests(session);
    if (activeSessions.get(key) === session) {
      activeSessions.delete(key);
    }
    if (inFlightSessions.get(key) === ws) {
      inFlightSessions.delete(key);
    }
  };

  ws.on("message", (data) => {
    handleSessionMessage(session, data);
  });

  ws.on("close", () => {
    cleanupSession("CDP WebSocket closed");
  });

  ws.on("error", (err) => {
    cleanupSession(`CDP WebSocket error: ${err.message}`);
  });

  try {
    const setupTimeoutPromise = new Promise<never>((_, reject) => {
      setupTimer = setTimeout(() => {
        closeSocketSafely(ws);
        reject(new Error(`CDP setup timed out after ${options.setupTimeoutMs}ms for ${target.url}`));
      }, options.setupTimeoutMs);
      setupTimer.unref();
    });

    const openPromise = new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanupPreOpen?.();
        resolve();
      };
      const onError = (err: Error) => {
        cleanupPreOpen?.();
        reject(err);
      };
      const onClose = () => {
        cleanupPreOpen?.();
        reject(new Error("CDP WebSocket closed before open"));
      };
      cleanupPreOpen = () => {
        ws.off("open", onOpen);
        ws.off("error", onError);
        ws.off("close", onClose);
      };
      ws.once("open", onOpen);
      ws.once("error", onError);
      ws.once("close", onClose);
    });

    await Promise.race([openPromise, setupTimeoutPromise]);

    if (sessionEpoch !== options.startEpoch) {
      closeSocketSafely(ws);
      return false;
    }

    const setupWork = (async () => {
      await sendCommand(session, "Page.enable", {});
      await sendCommand(session, "Page.setBypassCSP", { enabled: true });
      await sendCommand(session, "Runtime.enable", {});
      await sendCommand(session, "Runtime.addBinding", { name: "__hoversourceBridgeCall" });
      await sendCommand(session, "Page.addScriptToEvaluateOnNewDocument", { source: scriptContent });
      if (!options.skipEvaluate) {
        await sendCommand(session, "Runtime.evaluate", {
          expression: scriptContent,
          userGesture: true,
          awaitPromise: false,
        });
      }
    })();

    await Promise.race([setupWork, setupTimeoutPromise]);

    if (sessionEpoch !== options.startEpoch || ws.readyState !== WebSocket.OPEN) {
      closeSocketSafely(ws);
      return false;
    }

    activeSessions.set(key, session);
    if (inFlightSessions.get(key) === ws) {
      inFlightSessions.delete(key);
    }
    return true;
  } catch (err) {
    cleanupPreOpen?.();
    closeSocketSafely(ws);
    cleanupSession(err instanceof Error ? err.message : String(err));
    if (sessionEpoch !== options.startEpoch) {
      return false;
    }
    throw err;
  } finally {
    if (setupTimer) {
      clearTimeout(setupTimer);
      setupTimer = undefined;
    }
    if (inFlightSessions.get(key) === ws) {
      inFlightSessions.delete(key);
    }
  }
}

function isAlreadyInjected(wsUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let resolved = false;
    let timeout: NodeJS.Timeout | undefined;

    const settle = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      resolve(value);
    };

    timeout = setTimeout(() => {
      settle(false);
      closeSocketSafely(ws);
    }, 1500);
    timeout.unref();

    ws.on("open", () => {
      if (ws.readyState !== WebSocket.OPEN) {
        settle(false);
        return;
      }
      try {
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: "!!(globalThis.__HOVERSOURCE_PORT__ || window.__HOVERSOURCE_PORT__)",
              awaitPromise: false,
            },
          })
        );
      } catch {
        settle(false);
        closeSocketSafely(ws);
      }
    });

    ws.on("message", (data) => {
      try {
        const dataStr = typeof data === "string" ? data : (data as Buffer).toString("utf8");
        const msg = JSON.parse(dataStr);
        if (msg.id === 1) {
          const isInjected = !!msg.result?.result?.value;
          settle(isInjected);
          closeSocketSafely(ws);
        }
      } catch (e) {
        console.debug("[HoverSource] Ignored evaluation error during injection check:", e);
        settle(false);
        closeSocketSafely(ws);
      }
    });

    ws.on("close", () => {
      settle(false);
    });

    ws.on("error", () => {
      settle(false);
      closeSocketSafely(ws);
    });
  });
}

function isInjectableTarget(target: CdpTarget): boolean {
  return (
    target.type === "page" ||
    target.type === "webview" ||
    target.type === "background_page" ||
    target.url.startsWith("http") ||
    target.url.startsWith("file")
  );
}

async function getInjectableTargets(port: number): Promise<CdpTarget[]> {
  const listUrl = `http://127.0.0.1:${port}/json`;
  const targets = await fetchJson<CdpTarget[]>(listUrl);
  return targets.filter(isInjectableTarget);
}

export async function injectOverlayScript(
  port: number,
  scriptContent: string,
  optionsOrCompanionPort?: number | InjectOverlayOptions
): Promise<number> {
  const startEpoch = sessionEpoch;
  const options = typeof optionsOrCompanionPort === "object" && optionsOrCompanionPort !== null
    ? optionsOrCompanionPort
    : undefined;
  const companionPort = resolveCompanionPort(scriptContent, optionsOrCompanionPort);
  const requestTimeoutMs = clampPositiveTimeout(options?.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const setupTimeoutMs = clampPositiveTimeout(options?.setupTimeoutMs, DEFAULT_SETUP_TIMEOUT_MS);

  const listUrl = `http://127.0.0.1:${port}/json`;
  const validTargets = await getInjectableTargets(port);

  if (validTargets.length === 0) {
    throw new Error(`No injectable targets found at ${listUrl}`);
  }

  let injectionCount = 0;
  for (const target of validTargets) {
    if (sessionEpoch !== startEpoch) {
      return injectionCount;
    }
    if (!target.webSocketDebuggerUrl) {
      continue;
    }

    const key = getSessionKey(port, target);
    const existing = activeSessions.get(key);
    if (existing) {
      if (existing.ws.readyState === WebSocket.OPEN) {
        continue;
      }
      activeSessions.delete(key);
    }
    if (inFlightSessions.has(key)) {
      continue;
    }

    try {
      const already = await isAlreadyInjected(target.webSocketDebuggerUrl);
      if (sessionEpoch !== startEpoch) {
        return injectionCount;
      }
      const postCheckExisting = activeSessions.get(key);
      if (postCheckExisting) {
        if (postCheckExisting.ws.readyState === WebSocket.OPEN) {
          continue;
        }
        activeSessions.delete(key);
      }
      if (inFlightSessions.has(key)) {
        continue;
      }

      const inserted = await injectIntoTarget(key, target, scriptContent, {
        startEpoch,
        skipEvaluate: already,
        companionPort,
        requestTimeoutMs,
        setupTimeoutMs,
      });
      if (inserted) {
        console.log(`[HoverSource] Injected overlay successfully into: ${target.title} (${target.url})`);
        injectionCount++;
      }
    } catch (err) {
      console.error(`[HoverSource] Failed to inject into target ${target.title}:`, err);
    }
  }

  return injectionCount;
}

function broadcastEphemeralTarget(
  wsUrl: string,
  scriptContent: string,
  ephemeralCloseTimeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer: NodeJS.Timeout | undefined;
    let ws: WebSocket;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
      resolve();
    };

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.debug("[HoverSource] Ignored connection exception:", e);
      settle();
      return;
    }

    fallbackTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.CLOSED) {
        settle();
        return;
      }
      try {
        ws.terminate();
      } catch {
        // Ignore terminate errors; trailing close event settles
      }
    }, ephemeralCloseTimeoutMs);
    fallbackTimer.unref();

    ws.once("close", () => {
      settle();
    });

    ws.on("error", (err) => {
      console.debug("[HoverSource] Ignored connection error:", err);
      if (ws.readyState === WebSocket.CLOSED) {
        settle();
        return;
      }
      if (ws.readyState !== WebSocket.CLOSING) {
        try {
          ws.terminate();
        } catch {
          // Ignore terminate errors
        }
      }
    });

    ws.on("open", () => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: scriptContent,
              userGesture: false,
              awaitPromise: false,
            },
          })
        );
      } catch (err) {
        console.debug("[HoverSource] Ignored broadcast send error:", err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    });

    ws.on("message", (data) => {
      try {
        const dataStr = typeof data === "string" ? data : (data as Buffer).toString("utf8");
        const msg = JSON.parse(dataStr);
        if (msg.id === 1 && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      } catch {
        // Ignore malformed messages on ephemeral broadcast socket
      }
    });

    if (ws.readyState === WebSocket.CLOSED) {
      settle();
    }
  });
}

export async function broadcastToTargets(
  port: number,
  scriptContent: string,
  options?: BroadcastTargetOptions
): Promise<void> {
  try {
    const ephemeralCloseTimeoutMs = clampPositiveTimeout(
      options?.ephemeralCloseTimeoutMs,
      DEFAULT_EPHEMERAL_CLOSE_TIMEOUT_MS
    );
    const validTargets = await getInjectableTargets(port);
    const tasks: Promise<unknown>[] = [];

    for (const target of validTargets) {
      if (!target.webSocketDebuggerUrl) {
        continue;
      }
      const key = getSessionKey(port, target);
      const session = activeSessions.get(key);
      if (session && session.ws.readyState === WebSocket.OPEN) {
        tasks.push(
          sendCommand(session, "Runtime.evaluate", {
            expression: scriptContent,
            userGesture: false,
            awaitPromise: false,
          }).catch((err) => {
            console.debug("[HoverSource] Ignored broadcast error on active session:", err);
          })
        );
      } else {
        tasks.push(
          broadcastEphemeralTarget(target.webSocketDebuggerUrl, scriptContent, ephemeralCloseTimeoutMs)
        );
      }
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.debug("[HoverSource] Ignored target query exception:", err);
  }
}
