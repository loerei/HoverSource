/**
 * Wait until `document.body` exists or timeout/abort settles. Never rejects.
 */
export function waitForDomBody(timeoutMs = 10_000, signal?: AbortSignal): Promise<boolean> {
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000;

  if (typeof document === "undefined") {
    return Promise.resolve(false);
  }
  if (signal?.aborted) {
    return Promise.resolve(Boolean(document.body));
  }
  if (document.body) {
    return Promise.resolve(true);
  }
  if (typeof document.addEventListener !== "function") {
    return Promise.resolve(Boolean(document.body));
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let observer: MutationObserver | null = null;

    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (pollInterval !== undefined) {
        clearInterval(pollInterval);
        pollInterval = undefined;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      document.removeEventListener("DOMContentLoaded", onReady);
      signal?.removeEventListener("abort", onAbort);
      resolve(ready);
    };

    const onReady = () => {
      if (document.body) {
        settle(true);
      }
    };

    const onAbort = () => {
      settle(Boolean(document.body));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    document.addEventListener("DOMContentLoaded", onReady);

    timer = setTimeout(() => {
      settle(Boolean(document.body));
    }, effectiveTimeoutMs);

    if (document.readyState !== "loading") {
      const observeRoot = document.documentElement ?? document;
      let observing = false;
      if (typeof MutationObserver !== "undefined" && observeRoot) {
        try {
          observer = new MutationObserver(() => {
            if (document.body) {
              settle(true);
            }
          });
          observer.observe(observeRoot, { childList: true });
          observing = true;
        } catch {
          observer?.disconnect();
          observer = null;
        }
      }
      if (!observing) {
        pollInterval = setInterval(() => {
          if (document.body) {
            settle(true);
          }
        }, 16);
      }
    }
  });
}
