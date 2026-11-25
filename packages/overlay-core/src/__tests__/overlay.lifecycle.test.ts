import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForDomBody } from "../domReady.js";
import {
  initInspectorMutationObserver,
  disconnectInspectorMutationObserver,
} from "../inspector.js";

function createMockElement(tagName: string) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const el: any = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    id: "",
    className: "",
    style: {},
    dataset: {},
    children: [] as any[],
    childNodes: [] as any[],
    parentNode: null as any,
    parentElement: null as any,
    innerHTML: "",
    textContent: "",
    shadowRoot: null as any,
    attachShadow: vi.fn((init: ShadowRootInit) => {
      const root = createMockElement("#shadow-root");
      root.mode = init.mode;
      el.shadowRoot = root;
      return root;
    }),
    appendChild(child: any) {
      child.parentNode = el;
      child.parentElement = el;
      el.children.push(child);
      el.childNodes.push(child);
      return child;
    },
    remove() {
      if (el.parentNode && Array.isArray(el.parentNode.children)) {
        el.parentNode.children = el.parentNode.children.filter((c: any) => c !== el);
        el.parentNode.childNodes = el.parentNode.childNodes.filter((c: any) => c !== el);
      }
      el.parentNode = null;
      el.parentElement = null;
    },
    contains(target: any): boolean {
      if (target === el) return true;
      for (const child of el.children) {
        if (typeof child.contains === "function" && child.contains(target)) {
          return true;
        }
      }
      return false;
    },
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    addEventListener: vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(cb);
    }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }),
  };
  return el;
}

function createMockDocument(initialBody: any = null, readyState: DocumentReadyState = "loading") {
  const docListeners = new Map<string, Set<() => void>>();
  const head = createMockElement("head");
  const documentElement = createMockElement("html");
  documentElement.appendChild(head);

  const doc: any = {
    readyState,
    body: initialBody,
    head,
    documentElement,
    createElement: vi.fn((tag: string) => createMockElement(tag)),
    createElementNS: vi.fn((_ns: string, tag: string) => createMockElement(tag)),
    getElementById: vi.fn(() => null),
    elementsFromPoint: vi.fn(() => []),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      docListeners.get(type)?.delete(cb);
    }),
    dispatchDOMContentLoaded() {
      doc.readyState = "interactive";
      for (const cb of Array.from(docListeners.get("DOMContentLoaded") ?? [])) {
        cb();
      }
    },
    listenerCount(type: string) {
      return docListeners.get(type)?.size ?? 0;
    },
  };
  return doc;
}

describe("overlay lifecycle & pre-<body> DOM readiness", () => {
  const originalDocument = (globalThis as any).document;
  let activeEngine: { destroy(): void } | null = null;
  let activeObserver: { disconnect(): void } | null = null;

  afterEach(async () => {
    disconnectInspectorMutationObserver();
    activeObserver?.disconnect();
    activeObserver = null;
    try {
      const overlayMod = await import("../overlay.js");
      await overlayMod.OverlayEngine.destroyActive();
    } catch {
      // ignore if overlay.js was not imported in this test
    }
    activeEngine?.destroy();
    activeEngine = null;
    delete (globalThis as any).__HoverSourceInitialized__;
    delete (globalThis as any).__HOVERSOURCE_VANILLA_PATCHED__;
    delete (globalThis as any).__HOVERSOURCE_PROXY__;
    delete (globalThis as any).__HOVERSOURCE_PORT__;
    delete (globalThis as any).__hoversourceBridgeCall;
    delete (globalThis as any).__hoversourceBridgeResolve;
    delete (globalThis as any).__hoversourceBridgeReject;
    if (originalDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setupGlobalEventStubs() {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const addSpy = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    });
    const removeSpy = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(cb);
    });
    vi.stubGlobal("addEventListener", addSpy);
    vi.stubGlobal("removeEventListener", removeSpy);
    vi.stubGlobal("window", {
      addEventListener: addSpy,
      removeEventListener: removeSpy,
    });
    vi.stubGlobal("location", { origin: "http://localhost:3000" });
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    return {
      listeners,
      totalListenerCount: () => {
        let total = 0;
        for (const set of listeners.values()) total += set.size;
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    (globalThis as any).__HoverSourceInitialized__ = true;
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
    expect(doc.body.children[0].id).toBe("hoversource-host");
    expect(doc.body.children[0].shadowRoot?.children[0]?.className).toBe("hoversource-container");
  });

  it("logs warning on bodyless timeout and mounts zero containers or globalThis listeners even if DOMContentLoaded fires afterward", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const doc = createMockDocument(null, "loading");
    vi.stubGlobal("document", doc);
    const events = setupGlobalEventStubs();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    (globalThis as any).__HoverSourceInitialized__ = true;
    const { OverlayEngine } = await import("../overlay.js");

    const launchPromise = OverlayEngine.launch({ configTimeoutMs: 100, domReadyTimeoutMs: 250 });
    await vi.advanceTimersByTimeAsync(250);
    activeEngine = await launchPromise;

    expect(warnSpy).toHaveBeenCalledWith(
      "[HoverSource] Timed out waiting for document.body; skipping overlay UI mount."
    );
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

    let observerCallback: (() => void) | null = null;
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(cb: () => void) {
          observerCallback = cb;
        }
        observe = observeSpy;
        disconnect = disconnectSpy;
      }
    );

    const waitPromise = waitForDomBody(5000);
    expect(observeSpy).toHaveBeenCalledWith(doc.documentElement, { childList: true });

    doc.body = createMockElement("body");
    observerCallback!();

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
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {
          throw new Error("not a DOM Node");
        }
        disconnect() {}
      }
    );

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

    let rejectFetch!: (err: any) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectFetch = reject;
          })
      )
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    (globalThis as any).__HoverSourceInitialized__ = true;
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
    vi.spyOn(console, "log").mockImplementation(() => {});

    (globalThis as any).__HoverSourceInitialized__ = true;
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe = observeSpy;
        disconnect = disconnectSpy;
      }
    );

    // Direct initInspectorMutationObserver + disconnectInspectorMutationObserver cleans up pending 10_000ms timer
    const obsPromise = initInspectorMutationObserver(10_000);
    expect(vi.getTimerCount()).toBe(1);
    disconnectInspectorMutationObserver();
    await expect(obsPromise).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(doc.listenerCount("DOMContentLoaded")).toBe(0);

    // Launch attaches inspector MutationObserver once body appears, and destroy disconnects it
    (globalThis as any).__HoverSourceInitialized__ = true;
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

  function createMockEventSourceHarness() {
    const instances: Array<{
      url: string;
      listeners: Map<string, Set<(ev: any) => void>>;
      close: ReturnType<typeof vi.fn>;
      emit: (type: string, data?: string) => void;
    }> = [];

    const MockEventSource = vi.fn(function (this: any, url: string) {
      const listeners = new Map<string, Set<(ev: any) => void>>();
      const close = vi.fn();
      const instance = {
        url,
        listeners,
        close,
        emit(type: string, data?: string) {
          for (const cb of listeners.get(type) ?? []) {
            cb({ type, data });
          }
        },
        addEventListener(type: string, cb: (ev: any) => void) {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(cb);
        },
        removeEventListener(type: string, cb: (ev: any) => void) {
          listeners.get(type)?.delete(cb);
        },
      };
      instances.push(instance);
      return instance;
    });

    return { MockEventSource, instances };
  }

  it("subscribes to SSE /events in HTTP and proxy modes, updates config on 'config' events, and closes EventSource on destroy", async () => {
    vi.resetModules();
    const doc = createMockDocument(createMockElement("body"), "complete");
    vi.stubGlobal("document", doc);
    setupGlobalEventStubs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ config: { theme: "dark", maxTraversalDepth: 32 } }),
      })
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { MockEventSource, instances } = createMockEventSourceHarness();
    vi.stubGlobal("EventSource", MockEventSource);
    (globalThis as any).__HOVERSOURCE_PORT__ = 7412;

    (globalThis as any).__HoverSourceInitialized__ = true;
    const { OverlayEngine } = await import("../overlay.js");

    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 500 });
    expect(activeEngine).not.toBeNull();
    expect(MockEventSource).toHaveBeenCalledTimes(1);
    expect(instances[0].url).toBe("http://127.0.0.1:7412/events");

    // Malformed payload is safely ignored
    instances[0].emit("config", "{not-json");
    expect(warnSpy).toHaveBeenCalled();
    expect((activeEngine as any).getConfig().theme).toBe("dark");

    // Valid SSE config payload updates engine config and re-renders styles
    instances[0].emit("config", JSON.stringify({ theme: "light", maxTraversalDepth: 50 }));
    expect((activeEngine as any).getConfig().theme).toBe("light");
    expect((activeEngine as any).getConfig().maxTraversalDepth).toBe(50);

    activeEngine?.destroy();
    expect(instances[0].close).toHaveBeenCalledTimes(1);

    // Proxy mode subscribes to /hoversource/events
    (globalThis as any).__HOVERSOURCE_PROXY__ = true;
    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 500 });
    expect(MockEventSource).toHaveBeenCalledTimes(2);
    expect(instances[1].url).toBe("/hoversource/events");

    instances[1].emit("config", JSON.stringify({ theme: "light", minimalModeByDefault: true }));
    expect((activeEngine as any).getConfig().minimalModeByDefault).toBe(true);

    activeEngine?.destroy();
    expect(instances[1].close).toHaveBeenCalledTimes(1);
  });

  it("skips EventSource SSE subscription when strict CDP bridge (__hoversourceBridgeCall) is active", async () => {
    vi.resetModules();
    const doc = createMockDocument(createMockElement("body"), "complete");
    vi.stubGlobal("document", doc);
    setupGlobalEventStubs();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { MockEventSource } = createMockEventSourceHarness();
    vi.stubGlobal("EventSource", MockEventSource);
    (globalThis as any).__hoversourceBridgeCall = vi.fn((raw: string) => {
      const { id } = JSON.parse(raw);
      queueMicrotask(() => {
        (globalThis as any).__hoversourceBridgeResolve(id, JSON.stringify({ config: { theme: "dark" } }));
      });
    });

    (globalThis as any).__HoverSourceInitialized__ = true;
    const { OverlayEngine } = await import("../overlay.js");

    activeEngine = await OverlayEngine.launch({ configTimeoutMs: 500, domReadyTimeoutMs: 500 });
    expect(activeEngine).not.toBeNull();
    expect(MockEventSource).not.toHaveBeenCalled();
  });
});
