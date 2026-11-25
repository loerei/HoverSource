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

export interface CompanionRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Perform an HTTP JSON request to the companion server with timeout clamping and AbortSignal cleanup.
 */
export async function companionRequestJson<T = any>(
  path: string,
  init?: CompanionRequestInit
): Promise<T> {
  const method = init?.method ?? "GET";
  if (init?.signal?.aborted) {
    throw init.signal.reason instanceof Error
      ? init.signal.reason
      : new Error(`Companion request ${method} ${path} aborted`);
  }

  const timeoutMs =
    Number.isFinite(init?.timeoutMs) && init!.timeoutMs! > 0
      ? init!.timeoutMs!
      : 5000;
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
