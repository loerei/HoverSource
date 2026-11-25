import { describe, it, expect, expectTypeOf, vi, afterEach } from "vitest";
import { companionRequestJson, getCompanionBaseUrl } from "../companionTransport.js";
describe("companionTransport", () => {
    afterEach(() => {
        delete globalThis.__hoversourceBridgeCall;
        delete globalThis.__hoversourceBridgeResolve;
        delete globalThis.__hoversourceBridgeReject;
        delete globalThis.__HOVERSOURCE_PROXY__;
        delete globalThis.__HOVERSOURCE_PORT__;
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    it("routes to 127.0.0.1:<port> by default and /hoversource when __HOVERSOURCE_PROXY__ is true", () => {
        expect(getCompanionBaseUrl()).toBe("http://127.0.0.1:7300");
        globalThis.__HOVERSOURCE_PORT__ = 7456;
        expect(getCompanionBaseUrl()).toBe("http://127.0.0.1:7456");
        globalThis.__HOVERSOURCE_PROXY__ = true;
        expect(getCompanionBaseUrl()).toBe("/hoversource");
    });
    it("resolves JSON response and forwards method, headers, body, and signal to fetch", async () => {
        globalThis.__HOVERSOURCE_PORT__ = 7311;
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, value: 42 }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const result = await companionRequestJson("/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "local" }),
        });
        expect(result).toEqual({ success: true, value: 42 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:7311/config", expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "local" }),
            signal: expect.any(AbortSignal),
        }));
    });
    it("rejects with descriptive error on non-OK HTTP status", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({}),
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(companionRequestJson("/config", { method: "POST" })).rejects.toThrow("Companion HTTP POST /config failed with status 503");
    });
    it("rejects immediately when given a pre-aborted AbortSignal without calling fetch", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();
        controller.abort(new Error("already aborted"));
        await expect(companionRequestJson("/config", { signal: controller.signal })).rejects.toThrow("already aborted");
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it("cancels mid-flight when caller AbortSignal aborts even if fetch ignores signal, clears timer, and removes listener", async () => {
        vi.useFakeTimers();
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        const fetchMock = vi.fn().mockReturnValue(new Promise(() => { }));
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();
        const activeAbortListeners = new Set();
        const origAdd = controller.signal.addEventListener.bind(controller.signal);
        const origRemove = controller.signal.removeEventListener.bind(controller.signal);
        vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
            if (type === "abort" && listener) {
                activeAbortListeners.add(listener);
            }
            return origAdd(type, listener, options);
        });
        vi.spyOn(controller.signal, "removeEventListener").mockImplementation((type, listener, options) => {
            if (type === "abort" && listener) {
                activeAbortListeners.delete(listener);
            }
            return origRemove(type, listener, options);
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
        const activeAbortListeners = new Set();
        const origAdd = controller.signal.addEventListener.bind(controller.signal);
        const origRemove = controller.signal.removeEventListener.bind(controller.signal);
        const addSpy = vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
            if (type === "abort" && listener) {
                activeAbortListeners.add(listener);
            }
            return origAdd(type, listener, options);
        });
        const removeSpy = vi.spyOn(controller.signal, "removeEventListener").mockImplementation((type, listener, options) => {
            if (type === "abort" && listener) {
                activeAbortListeners.delete(listener);
            }
            return origRemove(type, listener, options);
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
            json: () => new Promise(() => { }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const reqPromise = companionRequestJson("/config", { timeoutMs: 250 });
        const assertion = expect(reqPromise).rejects.toThrow("timed out after 250ms");
        await vi.advanceTimersByTimeAsync(250);
        await assertion;
    });
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("clamps invalid timeoutMs (%s) to 5000ms", async (invalidTimeout) => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockReturnValue(new Promise(() => { }));
        vi.stubGlobal("fetch", fetchMock);
        let settled = false;
        const reqPromise = companionRequestJson("/config", { timeoutMs: invalidTimeout });
        const tracked = reqPromise.then(() => {
            settled = true;
        }, (err) => {
            settled = true;
            throw err;
        });
        const assertion = expect(tracked).rejects.toThrow("timed out after 5000ms");
        await vi.advanceTimersByTimeAsync(4999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await assertion;
    });
    it("enforces compile-time type contracts for companionRequestJson<T>", () => {
        if (false) {
            expectTypeOf(companionRequestJson("/ping")).resolves.toEqualTypeOf();
            expectTypeOf(companionRequestJson("/ping")).resolves.not.toBeAny();
            // @ts-expect-error timeoutMs must be a number
            companionRequestJson("/ping", { timeoutMs: "5000" });
        }
    });
    describe("CDP Runtime.addBinding bridge transport", () => {
        it("routes requests through __hoversourceBridgeCall with CSPRNG nonce id and parses string JSON payload", async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);
            let capturedPayload = null;
            globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
                capturedPayload = JSON.parse(raw);
            });
            const pending = companionRequestJson("/config", {
                method: "POST",
                body: JSON.stringify({ target: "local" }),
            });
            expect(fetchMock).not.toHaveBeenCalled();
            expect(capturedPayload).toEqual({
                id: expect.stringMatching(/^[^:]+:\d+$/),
                method: "POST",
                path: "/config",
                body: JSON.stringify({ target: "local" }),
            });
            const [nonce] = capturedPayload.id.split(":");
            expect(nonce.length).toBeGreaterThan(0);
            // Stale nonce resolve/reject must neither resolve nor reject the active request
            globalThis.__hoversourceBridgeResolve("stale-nonce:1", "{}");
            globalThis.__hoversourceBridgeReject("stale-nonce:1", "stale error");
            globalThis.__hoversourceBridgeResolve(capturedPayload.id, JSON.stringify({ ok: true }));
            await expect(pending).resolves.toEqual({ ok: true });
        });
        it("propagates __hoversourceBridgeReject error for active request, clears timer, and removes abort listener", async () => {
            vi.useFakeTimers();
            const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
            let activeId = "";
            globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
                activeId = JSON.parse(raw).id;
            });
            const controller = new AbortController();
            const activeListeners = new Set();
            const origAdd = controller.signal.addEventListener.bind(controller.signal);
            const origRemove = controller.signal.removeEventListener.bind(controller.signal);
            vi.spyOn(controller.signal, "addEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.add(l);
                return origAdd(t, l, o);
            });
            vi.spyOn(controller.signal, "removeEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.delete(l);
                return origRemove(t, l, o);
            });
            const reqPromise = companionRequestJson("/config", {
                method: "POST",
                signal: controller.signal,
            });
            expect(activeListeners.size).toBe(1);
            globalThis.__hoversourceBridgeReject(activeId, "Companion HTTP POST /config failed with status 500");
            await expect(reqPromise).rejects.toThrow("Companion HTTP POST /config failed with status 500");
            expect(clearTimeoutSpy).toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
            expect(activeListeners.size).toBe(0);
        });
        it("rejects on malformed JSON payload in __hoversourceBridgeResolve and cleans up timer and listener", async () => {
            vi.useFakeTimers();
            const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
            let activeId = "";
            globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
                activeId = JSON.parse(raw).id;
            });
            const controller = new AbortController();
            const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
            const reqPromise = companionRequestJson("/validate-line?file=a.ts", {
                signal: controller.signal,
            });
            globalThis.__hoversourceBridgeResolve(activeId, "{invalid");
            await expect(reqPromise).rejects.toThrow("Failed to parse companion bridge response for GET /validate-line?file=a.ts");
            expect(clearTimeoutSpy).toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
            expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
        });
        it("rejects immediately on pre-aborted AbortSignal without invoking __hoversourceBridgeCall or fetch", async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);
            const bridgeMock = vi.fn();
            globalThis.__hoversourceBridgeCall = bridgeMock;
            const controller = new AbortController();
            controller.abort(new Error("pre-aborted bridge"));
            await expect(companionRequestJson("/config", { signal: controller.signal })).rejects.toThrow("pre-aborted bridge");
            expect(bridgeMock).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        });
        it("cancels mid-flight on caller AbortSignal in bridge mode and ignores late __hoversourceBridgeResolve", async () => {
            let activeId = "";
            globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
                activeId = JSON.parse(raw).id;
            });
            const controller = new AbortController();
            const activeListeners = new Set();
            const origAdd = controller.signal.addEventListener.bind(controller.signal);
            const origRemove = controller.signal.removeEventListener.bind(controller.signal);
            vi.spyOn(controller.signal, "addEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.add(l);
                return origAdd(t, l, o);
            });
            vi.spyOn(controller.signal, "removeEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.delete(l);
                return origRemove(t, l, o);
            });
            const reqPromise = companionRequestJson("/config", { signal: controller.signal });
            expect(activeListeners.size).toBe(1);
            controller.abort(new Error("bridge cancelled"));
            await expect(reqPromise).rejects.toThrow("bridge cancelled");
            expect(activeListeners.size).toBe(0);
            // Late resolve for cancelled ID must be a safe no-op
            expect(() => globalThis.__hoversourceBridgeResolve(activeId, "{}")).not.toThrow();
        });
        it("removes abort listener after completed CDP bridge call with non-aborted signal", async () => {
            let activeId = "";
            globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
                activeId = JSON.parse(raw).id;
            });
            const controller = new AbortController();
            const activeListeners = new Set();
            const origAdd = controller.signal.addEventListener.bind(controller.signal);
            const origRemove = controller.signal.removeEventListener.bind(controller.signal);
            vi.spyOn(controller.signal, "addEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.add(l);
                return origAdd(t, l, o);
            });
            const removeSpy = vi.spyOn(controller.signal, "removeEventListener").mockImplementation((t, l, o) => {
                if (t === "abort" && l)
                    activeListeners.delete(l);
                return origRemove(t, l, o);
            });
            const reqPromise = companionRequestJson("/ping", { signal: controller.signal });
            globalThis.__hoversourceBridgeResolve(activeId, JSON.stringify({ ok: true }));
            await expect(reqPromise).resolves.toEqual({ ok: true });
            expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
            expect(activeListeners.size).toBe(0);
        });
        it("cleans up timer and listener when __hoversourceBridgeCall throws synchronously", async () => {
            vi.useFakeTimers();
            globalThis.__hoversourceBridgeCall = vi.fn(() => {
                throw new Error("sync binding throw");
            });
            const controller = new AbortController();
            const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
            await expect(companionRequestJson("/config", { signal: controller.signal })).rejects.toThrow("sync binding throw");
            expect(vi.getTimerCount()).toBe(0);
            expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
        });
        it("times out CDP bridge request after timeoutMs", async () => {
            vi.useFakeTimers();
            globalThis.__hoversourceBridgeCall = vi.fn();
            const reqPromise = companionRequestJson("/config", { timeoutMs: 300 });
            const assertion = expect(reqPromise).rejects.toThrow("Companion bridge request GET /config timed out after 300ms");
            await vi.advanceTimersByTimeAsync(300);
            await assertion;
        });
    });
});
