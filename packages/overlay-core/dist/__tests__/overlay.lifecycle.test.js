import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForDomBody } from "../domReady.js";
import { initInspectorMutationObserver, disconnectInspectorMutationObserver, } from "../inspector.js";
function createMockElement(tagName) {
    const listeners = new Map();
    const el = {
        tagName: tagName.toUpperCase(),
        nodeType: 1,
        id: "",
        className: "",
        style: {},
        dataset: {},
        children: [],
        childNodes: [],
        parentNode: null,
        parentElement: null,
        innerHTML: "",
        textContent: "",
        shadowRoot: null,
        attachShadow: vi.fn((init) => {
            const root = createMockElement("#shadow-root");
            root.mode = init.mode;
            el.shadowRoot = root;
            return root;
        }),
        appendChild(child) {
            child.parentNode = el;
            child.parentElement = el;
            el.children.push(child);
            el.childNodes.push(child);
            return child;
        },
        remove() {
            if (el.parentNode && Array.isArray(el.parentNode.children)) {
                el.parentNode.children = el.parentNode.children.filter((c) => c !== el);
                el.parentNode.childNodes = el.parentNode.childNodes.filter((c) => c !== el);
            }
            el.parentNode = null;
            el.parentElement = null;
        },
        contains(target) {
            if (target === el)
                return true;
            for (const child of el.children) {
                if (typeof child.contains === "function" && child.contains(target)) {
                    return true;
                }
            }
            return false;
        },
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        addEventListener: vi.fn((type, cb) => {
            if (!listeners.has(type))
                listeners.set(type, new Set());
            listeners.get(type).add(cb);
        }),
        removeEventListener: vi.fn((type, cb) => {
            listeners.get(type)?.delete(cb);
        }),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }),
    };
    return el;
}
function createMockDocument(initialBody = null, readyState = "loading") {
    const docListeners = new Map();
    const head = createMockElement("head");
    const documentElement = createMockElement("html");
    documentElement.appendChild(head);
    const doc = {
        readyState,
        body: initialBody,
        head,
        documentElement,
        createElement: vi.fn((tag) => createMockElement(tag)),
        createElementNS: vi.fn((_ns, tag) => createMockElement(tag)),
        getElementById: vi.fn(() => null),
        elementsFromPoint: vi.fn(() => []),
        addEventListener: vi.fn((type, cb) => {
            if (!docListeners.has(type))
                docListeners.set(type, new Set());
            docListeners.get(type).add(cb);
        }),
        removeEventListener: vi.fn((type, cb) => {
            docListeners.get(type)?.delete(cb);
        }),
        dispatchDOMContentLoaded() {
            doc.readyState = "interactive";
            for (const cb of Array.from(docListeners.get("DOMContentLoaded") ?? [])) {
                cb();
            }
        },
        listenerCount(type) {
            return docListeners.get(type)?.size ?? 0;
        },
    };
    return doc;
}
describe("overlay lifecycle & pre-<body> DOM readiness", () => {
    const originalDocument = globalThis.document;
    let activeEngine = null;
    let activeObserver = null;
    afterEach(async () => {
        disconnectInspectorMutationObserver();
        activeObserver?.disconnect();
        activeObserver = null;
        try {
            const overlayMod = await import("../overlay.js");
            await overlayMod.OverlayEngine.destroyActive();
        }
        catch {
            // ignore if overlay.js was not imported in this test
        }
        activeEngine?.destroy();
        activeEngine = null;
        delete globalThis.__HoverSourceInitialized__;
        delete globalThis.__HOVERSOURCE_VANILLA_PATCHED__;
        if (originalDocument === undefined) {
            delete globalThis.document;
        }
        else {
            globalThis.document = originalDocument;
        }
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    function setupGlobalEventStubs() {
        const listeners = new Map();
        const addSpy = vi.fn((type, cb) => {
            if (!listeners.has(type))
                listeners.set(type, new Set());
            listeners.get(type).add(cb);
        });
        const removeSpy = vi.fn((type, cb) => {
            listeners.get(type)?.delete(cb);
        });
        vi.stubGlobal("addEventListener", addSpy);
        vi.stubGlobal("removeEventListener", removeSpy);
        vi.stubGlobal("window", {
            addEventListener: addSpy,
            removeEventListener: removeSpy,
        });
        vi.stubGlobal("location", { origin: "http://localhost:3000" });
        vi.stubGlobal("MutationObserver", class {
            observe = vi.fn();
            disconnect = vi.fn();
        });
        return {
            listeners,
            totalListenerCount: () => {
                let total = 0;
                for (const set of listeners.values())
                    total += set.size;
                return total;
            },
        };
    }
    it("recovers from synchronous loadConfig rejection when document.body is initially null and mounts on DOMContentLoaded", async () => {
        vi.resetModules();
        const doc = createMockDocument(null, "loading");
        vi.stubGlobal("document", doc);
        setupGlobalEventStubs();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("CSP connect-src blocked")));
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        globalThis.__HoverSourceInitialized__ = true;
        const { OverlayEngine } = await import("../overlay.js");
        const launchPromise = OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 2000 });
        await Promise.resolve();
        await Promise.resolve();
        // Populate body and fire DOMContentLoaded
        doc.body = createMockElement("body");
        doc.dispatchDOMContentLoaded();
        activeEngine = await launchPromise;
        expect(activeEngine).not.toBeNull();
        expect(doc.body.children.length).toBe(1);
        expect(doc.body.children[0].className).toBe("hoversource-container");
    });
    it("logs warning on bodyless timeout and mounts zero containers or globalThis listeners even if DOMContentLoaded fires afterward", async () => {
        vi.useFakeTimers();
        vi.resetModules();
        const doc = createMockDocument(null, "loading");
        vi.stubGlobal("document", doc);
        const events = setupGlobalEventStubs();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        globalThis.__HoverSourceInitialized__ = true;
        const { OverlayEngine } = await import("../overlay.js");
        const launchPromise = OverlayEngine.launch({ configTimeoutMs: 100, domReadyTimeoutMs: 250 });
        await vi.advanceTimersByTimeAsync(250);
        activeEngine = await launchPromise;
        expect(warnSpy).toHaveBeenCalledWith("[HoverSource] Timed out waiting for document.body; skipping overlay UI mount.");
        expect(events.totalListenerCount()).toBe(0);
        // Fire DOMContentLoaded afterward — nothing should mount
        doc.body = createMockElement("body");
        doc.dispatchDOMContentLoaded();
        expect(doc.body.children.length).toBe(0);
        expect(events.totalListenerCount()).toBe(0);
        // destroy() is safe after timeout
        expect(() => activeEngine?.destroy()).not.toThrow();
    });
    it("waitForDomBody resolves via MutationObserver when readyState !== 'loading' and disconnects cleanly", async () => {
        vi.useFakeTimers();
        const doc = createMockDocument(null, "interactive");
        vi.stubGlobal("document", doc);
        let observerCallback = null;
        const disconnectSpy = vi.fn();
        const observeSpy = vi.fn();
        vi.stubGlobal("MutationObserver", class {
            constructor(cb) {
                observerCallback = cb;
            }
            observe = observeSpy;
            disconnect = disconnectSpy;
        });
        const waitPromise = waitForDomBody(5000);
        expect(observeSpy).toHaveBeenCalledWith(doc.documentElement, { childList: true });
        doc.body = createMockElement("body");
        observerCallback();
        await expect(waitPromise).resolves.toBe(true);
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
        expect(doc.listenerCount("DOMContentLoaded")).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("waitForDomBody falls back to setInterval when MutationObserver is unavailable or observe() throws and clears interval", async () => {
        vi.useFakeTimers();
        const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
        const doc = createMockDocument(null, "interactive");
        vi.stubGlobal("document", doc);
        vi.stubGlobal("MutationObserver", class {
            observe() {
                throw new Error("not a DOM Node");
            }
            disconnect() { }
        });
        const waitPromise = waitForDomBody(5000);
        await vi.advanceTimersByTimeAsync(16);
        doc.body = createMockElement("body");
        await vi.advanceTimersByTimeAsync(16);
        await expect(waitPromise).resolves.toBe(true);
        expect(clearIntervalSpy).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("waitForDomBody handles minimal DOM mock without document.addEventListener", async () => {
        vi.stubGlobal("document", { body: null });
        await expect(waitForDomBody(100)).resolves.toBe(false);
        vi.stubGlobal("document", { body: createMockElement("body") });
        await expect(waitForDomBody(100)).resolves.toBe(true);
    });
    it("destroyActive() waits for suspended launch() to settle and prevents mounting", async () => {
        vi.resetModules();
        const doc = createMockDocument(null, "loading");
        vi.stubGlobal("document", doc);
        const events = setupGlobalEventStubs();
        let rejectFetch;
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((_resolve, reject) => {
            rejectFetch = reject;
        })));
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        globalThis.__HoverSourceInitialized__ = true;
        const { OverlayEngine } = await import("../overlay.js");
        const launchPromise = OverlayEngine.launch({ configTimeoutMs: 5000, domReadyTimeoutMs: 5000 });
        await Promise.resolve();
        let destroySettled = false;
        const destroyPromise = OverlayEngine.destroyActive().then(() => {
            destroySettled = true;
        });
        await Promise.resolve();
        await Promise.resolve();
        // Still waiting if launchPromise hasn't settled? Actually abort rejects companionRequestJson immediately!
        // Verify after both settle, zero nodes or listeners are mounted
        rejectFetch?.(new Error("aborted"));
        await destroyPromise;
        expect(destroySettled).toBe(true);
        await expect(launchPromise).resolves.toBeNull();
        doc.body = createMockElement("body");
        doc.dispatchDOMContentLoaded();
        expect(doc.body.children.length).toBe(0);
        expect(events.totalListenerCount()).toBe(0);
    });
    it("concurrent OverlayEngine.launch() calls mount only the second instance", async () => {
        vi.resetModules();
        const doc = createMockDocument(null, "loading");
        vi.stubGlobal("document", doc);
        setupGlobalEventStubs();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: { theme: "dark" } }) }));
        vi.spyOn(console, "log").mockImplementation(() => { });
        globalThis.__HoverSourceInitialized__ = true;
        const { OverlayEngine } = await import("../overlay.js");
        const firstPromise = OverlayEngine.launch({ domReadyTimeoutMs: 5000 });
        const secondPromise = OverlayEngine.launch({ domReadyTimeoutMs: 5000 });
        doc.body = createMockElement("body");
        doc.dispatchDOMContentLoaded();
        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(first).toBeNull();
        expect(second).not.toBeNull();
        activeEngine = second;
        expect(doc.body.children.length).toBe(1);
    });
    it("attaches inspector MutationObserver on launch when body appears and disconnects cleanly on destroy", async () => {
        vi.useFakeTimers();
        vi.resetModules();
        const doc = createMockDocument(null, "loading");
        vi.stubGlobal("document", doc);
        setupGlobalEventStubs();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        const observeSpy = vi.fn();
        const disconnectSpy = vi.fn();
        vi.stubGlobal("MutationObserver", class {
            observe = observeSpy;
            disconnect = disconnectSpy;
        });
        // Direct initInspectorMutationObserver + disconnectInspectorMutationObserver cleans up pending 10_000ms timer
        const obsPromise = initInspectorMutationObserver(10_000);
        expect(vi.getTimerCount()).toBe(1);
        disconnectInspectorMutationObserver();
        await expect(obsPromise).resolves.toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        expect(doc.listenerCount("DOMContentLoaded")).toBe(0);
        // Launch attaches inspector MutationObserver once body appears, and destroy disconnects it
        globalThis.__HoverSourceInitialized__ = true;
        const { OverlayEngine } = await import("../overlay.js");
        const launchPromise = OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 5000 });
        await vi.advanceTimersByTimeAsync(0);
        doc.body = createMockElement("body");
        doc.dispatchDOMContentLoaded();
        activeEngine = await launchPromise;
        await Promise.resolve();
        expect(observeSpy).toHaveBeenCalledWith(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });
        activeEngine?.destroy();
        expect(disconnectSpy).toHaveBeenCalled();
    });
});
