/**
 * Resolve the base URL for companion server HTTP requests.
 */
export function getCompanionBaseUrl(): string {
  const isProxy = (globalThis as any).__HOVERSOURCE_PROXY__ === true;
  if (isProxy) {
    return "/hoversource";
  }
  const port = (globalThis as any).__HOVERSOURCE_PORT__ ?? 7300;
  return `http://127.0.0.1:${port}`;
}

/**
 * Resolve the SSE endpoint URL for realtime companion config updates.
 */
export function getCompanionEventsUrl(): string {
  return `${getCompanionBaseUrl()}/events`;
}

/**
 * Subscribe to companion SSE config updates via EventSource when available and not in strict CDP bridge mode.
 */
export function createCompanionConfigEventSource(
  onConfig: (config: any) => void
): EventSource | null {
  if (typeof (globalThis as any).__hoversourceBridgeCall === "function") {
    return null;
  }
  const EventSourceCtor = (globalThis as any).EventSource;
  if (typeof EventSourceCtor !== "function") {
    return null;
  }

  let es: EventSource;
  try {
    es = new EventSourceCtor(getCompanionEventsUrl());
  } catch {
    return null;
  }

  es.addEventListener("config", (event: Event) => {
    const rawData = (event as MessageEvent)?.data;
    if (typeof rawData !== "string" || !rawData) return;
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === "object") {
        onConfig(parsed);
      }
    } catch (err) {
      console.warn("[HoverSource] Failed to parse SSE config update:", err);
    }
  });

  es.addEventListener("error", () => {
    // Suppress unhandled SSE errors when offline or blocked by CSP connect-src.
  });

  return es;
}

export interface CompanionRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BridgeCallPayload {
  id: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
}

interface PendingBridgeRequest {
  method: string;
  path: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  cleanup: () => void;
}

const pendingBridgeRequests = new Map<string, PendingBridgeRequest>();
let bridgeSeq = 0;
let bridgeInstanceNonce: string | null = null;

function getBridgeInstanceNonce(): string {
  if (bridgeInstanceNonce) return bridgeInstanceNonce;
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    bridgeInstanceNonce = cryptoObj.randomUUID();
    return bridgeInstanceNonce;
  }
  if (typeof cryptoObj?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bridgeInstanceNonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return bridgeInstanceNonce;
  }
  throw new Error("CSPRNG unavailable for companion bridge nonce");
}

function ensureBridgeHandlers(): void {
  const g = globalThis as any;
  if (typeof g.__hoversourceBridgeResolve !== "function") {
    g.__hoversourceBridgeResolve = (id: string, payloadJson: unknown) => {
      const key = String(id);
      const entry = pendingBridgeRequests.get(key);
      if (!entry) return;
      pendingBridgeRequests.delete(key);
      entry.cleanup();
      try {
        const parsed = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson;
        entry.resolve(parsed);
      } catch (err) {
        entry.reject(
          new Error(`Failed to parse companion bridge response for ${entry.method} ${entry.path}`, {
            cause: err,
          })
        );
      }
    };
  }
  if (typeof g.__hoversourceBridgeReject !== "function") {
    g.__hoversourceBridgeReject = (id: string, errMsg: unknown) => {
      const key = String(id);
      const entry = pendingBridgeRequests.get(key);
      if (!entry) return;
      pendingBridgeRequests.delete(key);
      entry.cleanup();
      entry.reject(
        errMsg instanceof Error
          ? errMsg
          : new Error(
              typeof errMsg === "string" && errMsg
                ? errMsg
                : `Companion bridge request ${entry.method} ${entry.path} failed`
            )
      );
    };
  }
}

function companionBridgeRequestJson<T>(
  bridgeCall: (payloadJson: string) => void,
  method: string,
  path: string,
  body: string | undefined,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  ensureBridgeHandlers();
  const id = `${getBridgeInstanceNonce()}:${++bridgeSeq}`;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      pendingBridgeRequests.delete(id);
      cleanup();
      const reason = signal?.reason;
      reject(
        reason instanceof Error
          ? reason
          : new Error(`Companion bridge request ${method} ${path} aborted`)
      );
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      pendingBridgeRequests.delete(id);
      cleanup();
      reject(new Error(`Companion bridge request ${method} ${path} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingBridgeRequests.set(id, {
      method,
      path,
      resolve: (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      },
      reject: (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      },
      cleanup,
    });

    const payload: BridgeCallPayload = {
      id,
      method: method === "POST" ? "POST" : "GET",
      path,
      ...(body !== undefined ? { body } : {}),
    };

    try {
      bridgeCall(JSON.stringify(payload));
    } catch (err) {
      if (!settled) {
        settled = true;
        pendingBridgeRequests.delete(id);
        cleanup();
        reject(err);
      }
    }
  });
}

/**
 * Perform a JSON request to the companion server via CDP bridge when available, falling back to HTTP fetch.
 */
export async function companionRequestJson<T = any>(
  path: string,
  init?: CompanionRequestInit
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (init?.signal?.aborted) {
    throw init.signal.reason instanceof Error
      ? init.signal.reason
      : new Error(`Companion request ${method} ${path} aborted`);
  }

  const timeoutMs =
    Number.isFinite(init?.timeoutMs) && init!.timeoutMs! > 0
      ? init!.timeoutMs!
      : 5000;

  const bridgeCall = (globalThis as any).__hoversourceBridgeCall;
  if (typeof bridgeCall === "function") {
    return companionBridgeRequestJson<T>(
      bridgeCall,
      method,
      path,
      init?.body,
      timeoutMs,
      init?.signal
    );
  }

  const url = `${getCompanionBaseUrl()}${path}`;
  const timeoutController = new AbortController();

  const onAbort = () => {
    const reason = init?.signal?.reason;
    timeoutController.abort(
      reason instanceof Error
        ? reason
        : new Error(`Companion request ${method} ${path} aborted`)
    );
  };
  init?.signal?.addEventListener("abort", onAbort, { once: true });

  const timer = setTimeout(() => {
    const err = new Error(`Companion request ${method} ${path} timed out after ${timeoutMs}ms`);
    timeoutController.abort(err);
  }, timeoutMs);

  let onTimeoutAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onTimeoutAbort = () => {
      const reason = timeoutController.signal.reason;
      reject(
        reason instanceof Error
          ? reason
          : new Error(`Companion request ${method} ${path} aborted`, { cause: reason })
      );
    };
    timeoutController.signal.addEventListener("abort", onTimeoutAbort, { once: true });
  });

  const fetchPromise = Promise.resolve().then(async () => {
    const res = await fetch(url, {
      method,
      headers: init?.headers,
      body: init?.body,
      signal: timeoutController.signal,
    });
    if (!res.ok) {
      throw new Error(`Companion HTTP ${method} ${path} failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  });
  fetchPromise.catch(() => {});

  try {
    return await Promise.race([fetchPromise, abortPromise]);
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", onAbort);
    if (onTimeoutAbort) {
      timeoutController.signal.removeEventListener("abort", onTimeoutAbort);
    }
  }
}
