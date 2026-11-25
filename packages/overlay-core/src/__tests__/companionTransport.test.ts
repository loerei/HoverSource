import { describe, it, expect, expectTypeOf, vi, afterEach } from "vitest";
import { companionRequestJson, getCompanionBaseUrl } from "../companionTransport.js";

describe("companionTransport", () => {
  afterEach(() => {
    delete (globalThis as any).__HOVERSOURCE_PROXY__;
    delete (globalThis as any).__HOVERSOURCE_PORT__;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("routes to 127.0.0.1:<port> by default and /hoversource when __HOVERSOURCE_PROXY__ is true", () => {
    expect(getCompanionBaseUrl()).toBe("http://127.0.0.1:7300");

    (globalThis as any).__HOVERSOURCE_PORT__ = 7456;
    expect(getCompanionBaseUrl()).toBe("http://127.0.0.1:7456");

    (globalThis as any).__HOVERSOURCE_PROXY__ = true;
    expect(getCompanionBaseUrl()).toBe("/hoversource");
  });

  it("resolves JSON response and forwards method, headers, body, and signal to fetch", async () => {
    (globalThis as any).__HOVERSOURCE_PORT__ = 7311;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, value: 42 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await companionRequestJson<{ success: boolean; value: number }>("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "local" }),
    });

    expect(result).toEqual({ success: true, value: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:7311/config",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "local" }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("rejects with descriptive error on non-OK HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(companionRequestJson("/config", { method: "POST" })).rejects.toThrow(
      "Companion HTTP POST /config failed with status 503"
    );
  });

  it("rejects immediately when given a pre-aborted AbortSignal without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort(new Error("already aborted"));

    await expect(
      companionRequestJson("/config", { signal: controller.signal })
    ).rejects.toThrow("already aborted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels mid-flight when caller AbortSignal aborts even if fetch ignores signal, clears timer, and removes listener", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const activeAbortListeners = new Set<EventListenerOrEventListenerObject>();
    const origAdd = controller.signal.addEventListener.bind(controller.signal);
    const origRemove = controller.signal.removeEventListener.bind(controller.signal);

    vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "abort" && listener) {
        activeAbortListeners.add(listener);
      }
      return origAdd(type, listener as any, options);
    });
    vi.spyOn(controller.signal, "removeEventListener").mockImplementation((type, listener, options) => {
      if (type === "abort" && listener) {
        activeAbortListeners.delete(listener);
      }
      return origRemove(type, listener as any, options);
    });

    const reqPromise = companionRequestJson("/config", { signal: controller.signal });
    expect(activeAbortListeners.size).toBe(1);

    controller.abort(new Error("caller cancelled"));

    await expect(reqPromise).rejects.toThrow("caller cancelled");
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(activeAbortListeners.size).toBe(0);
  });

  it("removes abort listener from caller signal after completed fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const activeAbortListeners = new Set<EventListenerOrEventListenerObject>();
    const origAdd = controller.signal.addEventListener.bind(controller.signal);
    const origRemove = controller.signal.removeEventListener.bind(controller.signal);

    const addSpy = vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "abort" && listener) {
        activeAbortListeners.add(listener);
      }
      return origAdd(type, listener as any, options);
    });
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener").mockImplementation((type, listener, options) => {
      if (type === "abort" && listener) {
        activeAbortListeners.delete(listener);
      }
      return origRemove(type, listener as any, options);
    });

    await expect(companionRequestJson("/ping", { signal: controller.signal })).resolves.toEqual({ ok: true });
    expect(addSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(activeAbortListeners.size).toBe(0);
  });

  it("times out when res.json() hangs after fetch resolves", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reqPromise = companionRequestJson("/config", { timeoutMs: 250 });
    const assertion = expect(reqPromise).rejects.toThrow("timed out after 250ms");

    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "clamps invalid timeoutMs (%s) to 5000ms",
    async (invalidTimeout) => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
      vi.stubGlobal("fetch", fetchMock);

      let settled = false;
      const reqPromise = companionRequestJson("/config", { timeoutMs: invalidTimeout });
      const tracked = reqPromise.then(
        () => {
          settled = true;
        },
        (err) => {
          settled = true;
          throw err;
        }
      );
      const assertion = expect(tracked).rejects.toThrow("timed out after 5000ms");

      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await assertion;
    }
  );

  it("enforces compile-time type contracts for companionRequestJson<T>", () => {
    if (false) {
      expectTypeOf(companionRequestJson<{ ok: boolean }>("/ping")).resolves.toEqualTypeOf<{ ok: boolean }>();
      expectTypeOf(companionRequestJson<{ ok: boolean }>("/ping")).resolves.not.toBeAny();
      // @ts-expect-error timeoutMs must be a number
      companionRequestJson("/ping", { timeoutMs: "5000" });
    }
  });
});
