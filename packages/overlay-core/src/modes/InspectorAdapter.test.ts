import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { InspectorAdapter } from "./InspectorAdapter.js";
import { inspectVisualContext } from "../inspector.js";

afterEach(() => {
  delete (globalThis as any).__hoversourceBridgeCall;
  delete (globalThis as any).__hoversourceBridgeResolve;
  delete (globalThis as any).__hoversourceBridgeReject;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeAll(() => {
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = vi.fn().mockImplementation((el: any) => {
      return el._mockComputedStyle || {};
    }) as any;
  }
  if (typeof globalThis.fetch === "undefined") {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.reject("fetch mock not configured"));
  }
  if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
  }
});

describe("InspectorAdapter - Two-Phase Debounced Hover", () => {
  it("should draw highlight immediately but debounce visual context and tooltip rendering", () => {
    vi.useFakeTimers();

    const mockParentItem = {
      dataset: { index: "0" },
      addEventListener: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      }
    };
    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([mockParentItem])
    };
    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox
    } as any;

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    // Mock document.elementsFromPoint
    const mockTarget = {
      tagName: "BUTTON",
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {}
      },
      className: "",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }),
    } as any;
    globalThis.document = {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [mockTarget],
    } as any;

    // Trigger onPointerOver (Hover)
    const event = { clientX: 10, clientY: 10 } as any;
    adapter.onPointerOver(event, mockTarget);

    // Phase A: Highlight should be drawn immediately
    expect(mockController.drawHighlight).toHaveBeenCalledWith(mockTarget, false);

    // Tooltip rendering / source resolution / visual context should NOT have run yet
    expect(adapter["currentSourceInfo"]).toBeNull();

    // Fast-forward time by 30ms (less than 50ms debounce)
    vi.advanceTimersByTime(30);
    expect(adapter["currentSourceInfo"]).toBeNull();

    // Fast-forward remaining 20ms to fire the debounce timer
    vi.advanceTimersByTime(20);

    // Phase B: Now it should have run the full resolution
    expect(adapter["currentSourceInfo"]).not.toBeNull();
    expect(adapter["currentSourceInfo"].tagName).toBe("button");

    // Verify event listeners were registered for parent hover highlights
    expect(mockTooltipBox.querySelectorAll).toHaveBeenCalledWith(".hoversource-parent-item");
    expect(mockParentItem.addEventListener).toHaveBeenCalledWith("mouseenter", expect.any(Function));
    expect(mockParentItem.addEventListener).toHaveBeenCalledWith("mouseleave", expect.any(Function));

    vi.useRealTimers();
  });
});

describe("InspectorAdapter - Metadata Filtering", () => {
  it("should filter out metadata fields based on config settings", () => {
    const mockController = {
      getConfig: () => ({
        metadataFilter: {
          filters: {
            component: {
              componentName: true,
              elementSelector: false, // disabled
              filePath: true,
              framework: false, // disabled
              dimensions: true,
              keyStyles: false, // disabled
              parentStyles: true,
              layoutConstraints: true,
              sourceComments: true,
              sourceAttributes: true
            }
          }
        }
      }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
    } as any;

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    const mockElement = {
      tagName: "DIV",
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {}
      },
      className: "",
      parentElement: null,
      offsetWidth: 120,
      offsetHeight: 40,
    } as any;

    const mockInfo = {
      componentName: "UserProfileCard",
      tagName: "div",
      framework: "React",
      fileName: "src/components/UserProfileCard.tsx",
      lineNumber: 45,
      columnNumber: 8,
      classList: [],
      visualContext: null,
      staticMetadata: null
    };

    const formatted = adapter["formatElementMetadata"](mockElement, mockInfo);

    // Checked fields should be present
    expect(formatted).toContain("Component: UserProfileCard");
    expect(formatted).toContain("File: src/components/UserProfileCard.tsx:45:8");
    expect(formatted).toContain("Size: 120x40");

    // Unchecked fields should NOT be present
    expect(formatted).not.toContain("Element:");
    expect(formatted).not.toContain("(React)");
    expect(formatted).not.toContain("Framework:");
    expect(formatted).not.toContain("Styles:");
  });

  it("renders scroll/gutter layoutConstraints when enabled and hides them when layoutConstraints is false", () => {
    const createMockController = (layoutConstraintsEnabled: boolean) => ({
      getConfig: () => ({
        metadataFilter: {
          filters: {
            component: {
              layoutConstraints: layoutConstraintsEnabled
            }
          }
        }
      }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
    } as any);

    const mockElement = {
      tagName: "DIV",
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {}
      },
      className: "",
      parentElement: null,
      clientWidth: 747,
      clientHeight: 579,
      scrollWidth: 747,
      scrollHeight: 2400,
      offsetWidth: 757,
      offsetHeight: 579,
      _mockComputedStyle: {
        overflowX: "visible",
        overflowY: "auto",
        scrollbarGutter: "stable"
      }
    } as any;

    const visualContext = inspectVisualContext(mockElement);
    const mockInfo = {
      componentName: "ScrollPanel",
      tagName: "div",
      framework: "React",
      fileName: "src/ScrollPanel.tsx",
      lineNumber: 12,
      columnNumber: 4,
      classList: [],
      visualContext,
      staticMetadata: null
    };

    const enabledAdapter = new InspectorAdapter();
    enabledAdapter.activate(createMockController(true));
    const enabledFormatted = enabledAdapter["formatElementMetadata"](mockElement, mockInfo);

    expect(enabledFormatted).toContain("Size: 757x579 (client: 747x579, scroll: 747x2400)");
    expect(enabledFormatted).toContain(
      "Layout: overflow-y: auto; scrollbar-gutter: stable; scrollbar-width: 10px"
    );

    const disabledAdapter = new InspectorAdapter();
    disabledAdapter.activate(createMockController(false));
    const disabledFormatted = disabledAdapter["formatElementMetadata"](mockElement, mockInfo);

    expect(disabledFormatted).toContain("Size: 757x579");
    expect(disabledFormatted).not.toContain("Layout:");
    expect(disabledFormatted).not.toContain("overflow-y: auto");
    expect(disabledFormatted).not.toContain("scrollbar-gutter: stable");
  });

  it("strips matching projectRoot with single Root header, groups parent styles, and collapses overflow-x/y", () => {
    const adapter = new InspectorAdapter();
    adapter.activate({
      getConfig: () => ({}),
      getProjectRoot: () => "D:/Projects/YumeShelf",
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
    } as any);

    const mockElement = {
      tagName: "DIV",
      classList: ["save-folder-path"],
      parentElement: null,
      offsetWidth: 196,
      offsetHeight: 15,
      _mockComputedStyle: {
        color: "rgb(255, 255, 255)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        boxShadow: "none",
        margin: "0px",
        padding: "0px",
        display: "block",
        flexDirection: "row",
      },
    } as any;

    const mockInfo = {
      componentName: "SaveFolderBar",
      tagName: "div",
      framework: "React",
      fileName: "D:\\Projects\\YumeShelf\\src\\renderer\\SaveFolderBar.tsx",
      lineNumber: 74,
      columnNumber: 7,
      classList: ["save-folder-path"],
      visualContext: {
        parentEffects: [
          { tagName: "aside", classList: ["save-editor-sidebar"], property: "display", value: "flex" },
          { tagName: "aside", classList: ["save-editor-sidebar"], property: "overflow-x", value: "hidden" },
          { tagName: "aside", classList: ["save-editor-sidebar"], property: "overflow-y", value: "hidden" },
        ],
        layoutConstraints: {
          "overflow-x": "hidden",
          "overflow-y": "hidden",
          "client-size": "196x15",
          "scroll-size": "868x15",
        },
      },
      staticMetadata: {
        classOrigins: {
          "save-folder-path": {
            file: "D:/Projects/YumeShelf/src/styles/save-editor.css",
            line: 289,
            column: 1,
          },
          "save-editor-sidebar": {
            file: "D:/Projects/YumeShelf/src/styles/save-editor.css",
            line: 161,
            column: 1,
          },
        },
      },
    };

    const formatted = adapter["formatElementMetadata"](mockElement, mockInfo);
    expect(formatted).toContain("Root: D:/Projects/YumeShelf\n");
    expect(formatted).toContain("Component: SaveFolderBar (React)");
    expect(formatted).toContain("File: src/renderer/SaveFolderBar.tsx:74:7");
    expect(formatted).toContain("Element: div.save-folder-path [src/styles/save-editor.css:289:1]");
    expect(formatted).toContain("Size: 196x15 (scroll: 868x15)");
    expect(formatted).toContain("Layout: overflow: hidden");
    expect(formatted).toContain(
      "- aside.save-editor-sidebar [src/styles/save-editor.css:161:1]: display: flex; overflow: hidden"
    );
    expect(formatted.match(/aside\.save-editor-sidebar/g)).toHaveLength(1);
  });

  it("compacts Alt+Shift+C copyAllLayers with single Root header and deduplicated parent chains", () => {
    const copyToClipboard = vi.fn().mockResolvedValue(undefined);
    const adapter = new InspectorAdapter();
    adapter.activate({
      getConfig: () => ({}),
      getProjectRoot: () => "D:/Projects/Demo",
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      copyToClipboard,
    } as any);

    const parentEl = {
      tagName: "SECTION",
      classList: ["panel"],
      className: "panel",
      parentElement: null,
      children: [],
      childNodes: [],
      offsetWidth: 400,
      offsetHeight: 300,
      cloneNode: () => parentEl,
      querySelectorAll: () => [],
      getAttribute: () => null,
      _mockComputedStyle: { display: "flex", flexDirection: "column" },
    } as any;
    const leafEl = {
      tagName: "BUTTON",
      classList: ["btn"],
      className: "btn",
      parentElement: parentEl,
      children: [],
      childNodes: [],
      offsetWidth: 80,
      offsetHeight: 32,
      cloneNode: () => leafEl,
      querySelectorAll: () => [],
      getAttribute: () => null,
      _mockComputedStyle: { display: "inline-flex", flexDirection: "row" },
    } as any;
    parentEl.children = [leafEl];

    const sharedParents = [
      { tagName: "main", classList: ["shell"], property: "display", value: "grid" },
    ];
    vi.spyOn(adapter["resolver"], "resolve").mockImplementation((el: any) =>
      el === leafEl
        ? {
            componentName: "ActionBtn",
            tagName: "button",
            framework: "React",
            fileName: "D:/Projects/Demo/src/ActionBtn.tsx",
            lineNumber: 12,
            columnNumber: 5,
            classList: ["btn"],
            visualContext: { parentEffects: sharedParents, layoutConstraints: {} },
            staticMetadata: undefined,
          }
        : {
            componentName: "PanelCard",
            tagName: "section",
            framework: "React",
            fileName: "D:/Projects/Demo/src/PanelCard.tsx",
            lineNumber: 8,
            columnNumber: 3,
            classList: ["panel"],
            visualContext: { parentEffects: sharedParents, layoutConstraints: {} },
            staticMetadata: undefined,
          }
    );
    adapter["layerStack"] = [leafEl, parentEl];
    adapter["activeLayerIndex"] = 0;
    adapter["currentElement"] = leafEl;
    adapter["currentSourceInfo"] = adapter["resolver"].resolve(leafEl);

    adapter["copyAllLayers"]();
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    const out = copyToClipboard.mock.calls[0][0] as string;
    expect(out.startsWith("Root: D:/Projects/Demo\nLayers (2, leaf->root):")).toBe(true);
    expect(out).toContain("## Layer 1/2: ActionBtn (button)");
    expect(out).toContain("## Layer 2/2: PanelCard (section)");
    expect(out).toContain("File: src/PanelCard.tsx:8:3");
    // Shared parent chain only emitted once across layers
    expect(out.match(/- main\.shell: display: grid/g)).toHaveLength(1);
    expect(out).toContain("HTML (Layer 1):");
  });
});

async function flushMicrotasks(rounds = 30) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe("InspectorAdapter - Companion Transport & /static-context Parity", () => {
  it("routes fetchBackgroundValidation (/validate-line -> /static-context) through companionRequestJson and updates tooltip metadata", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/validate-line")) {
        return {
          ok: true,
          json: async () => ({
            corrected: { line: 24, column: 6 },
            correctedFile: "src/components/ButtonCorrected.tsx",
          }),
        };
      }
      if (url.includes("/static-context")) {
        return {
          ok: true,
          json: async () => ({
            comments: ["Primary action button"],
            attributes: { type: "submit" },
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    };
    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox,
    } as any;

    const target: any = {
      tagName: "BUTTON",
      dataset: { hsSource: "src/components/Button.tsx:12:4" },
      closest: (sel: string) => (sel === "[data-hs-source]" ? target : null),
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {
          yield "btn-primary";
        },
      },
      className: "btn-primary",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    };

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [target],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    adapter.onPointerOver({ clientX: 10, clientY: 10 } as any, target);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "http://127.0.0.1:7300/validate-line?file=src%2Fcomponents%2FButton.tsx&line=12&column=4&tagName=button&classList=btn-primary"
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://127.0.0.1:7300/static-context?file=src%2Fcomponents%2FButtonCorrected.tsx&line=24&column=6&tagName=button&classList=btn-primary"
    );
    expect(adapter["currentSourceInfo"].staticMetadata).toEqual({
      comments: ["Primary action button"],
      attributes: { type: "submit" },
    });
    expect(mockController.drawTooltip).toHaveBeenCalledTimes(2);
  });

  it("routes fetchStaticHtmlResolution (/resolve-html-element -> /static-context) through companionRequestJson and updates tooltip metadata", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/resolve-html-element")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            fileName: "index.html",
            lineNumber: 18,
            columnNumber: 5,
            framework: "Vanilla",
          }),
        };
      }
      if (url.includes("/static-context")) {
        return {
          ok: true,
          json: async () => ({
            comments: ["Hero section"],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    };
    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox,
    } as any;

    const target = {
      tagName: "SECTION",
      id: "hero",
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {
          yield "hero-banner";
        },
      },
      className: "hero-banner",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 120 }),
    } as any;

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [target],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    adapter.onPointerOver({ clientX: 20, clientY: 20 } as any, target);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("http://127.0.0.1:7300/resolve-html-element?");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://127.0.0.1:7300/static-context?file=index.html&line=18&column=5&tagName=section&classList=hero-banner"
    );
    expect(adapter["currentSourceInfo"].staticMetadata).toEqual({
      comments: ["Hero section"],
    });
    expect(mockController.drawTooltip).toHaveBeenCalledTimes(3);
  });

  it("logs console.warn('[HoverSource] Static context fetch failed:', err) when /static-context rejects in fetchBackgroundValidation", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/validate-line")) {
        return {
          ok: true,
          json: async () => ({}),
        };
      }
      if (url.includes("/static-context")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    };
    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox,
    } as any;

    const target: any = {
      tagName: "BUTTON",
      dataset: { hsSource: "src/components/Button.tsx:12:4" },
      closest: (sel: string) => (sel === "[data-hs-source]" ? target : null),
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {},
      },
      className: "",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    };

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [target],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    adapter.onPointerOver({ clientX: 10, clientY: 10 } as any, target);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(warnSpy).toHaveBeenCalledWith(
      "[HoverSource] Static context fetch failed:",
      expect.any(Error)
    );
  });

  it("routes /validate-line and /static-context through __hoversourceBridgeCall when CDP bridge is active", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const bridgeCalls: Array<{ id: string; method: string; path: string }> = [];
    (globalThis as any).__hoversourceBridgeCall = vi.fn((raw: string) => {
      const payload = JSON.parse(raw);
      bridgeCalls.push(payload);
      if (payload.path.startsWith("/validate-line")) {
        queueMicrotask(() => {
          (globalThis as any).__hoversourceBridgeResolve(
            payload.id,
            JSON.stringify({ corrected: { line: 30, column: 8 } })
          );
        });
      } else if (payload.path.startsWith("/static-context")) {
        queueMicrotask(() => {
          (globalThis as any).__hoversourceBridgeResolve(
            payload.id,
            JSON.stringify({ comments: ["Bridge comment"] })
          );
        });
      }
    });

    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    };
    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox,
    } as any;

    const target: any = {
      tagName: "BUTTON",
      dataset: { hsSource: "src/components/Button.tsx:12:4" },
      closest: (sel: string) => (sel === "[data-hs-source]" ? target : null),
      classList: {
        contains: () => false,
        [Symbol.iterator]: function* () {},
      },
      className: "",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    };

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [target],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    adapter.onPointerOver({ clientX: 10, clientY: 10 } as any, target);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bridgeCalls).toHaveLength(2);
    expect(bridgeCalls[0].path).toContain("/validate-line?");
    expect(bridgeCalls[1].path).toContain("/static-context?");
    expect(adapter["currentSourceInfo"].staticMetadata).toEqual({
      comments: ["Bridge comment"],
    });
  });
});

describe("InspectorAdapter - Shortcut Footer Sync & Scroll Modifiers", () => {
  it("renders all shortcuts including toggleUI, toggleFilterPanel, and layerPickerScroll in detailed & minimal footers and re-renders on onConfigUpdate", () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { platform: "Win32" });

    let currentConfig: any = {
      minimalModeByDefault: false,
      layerPickerScroll: { altKey: true, shiftKey: true, ctrlKey: false, metaKey: false },
      shortcuts: {
        toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        copyAllLayers: { key: "c", altKey: true, ctrlKey: false, shiftKey: true, metaKey: false },
        openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false },
        toggleFilterPanel: { key: "d", altKey: true, ctrlKey: true, shiftKey: false, metaKey: false },
      },
    };

    const mockTooltipBox = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    };
    const drawTooltipSpy = vi.fn();
    const mockController = {
      getConfig: () => currentConfig,
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: drawTooltipSpy,
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
      tooltipBox: mockTooltipBox,
    } as any;

    const childEl = {
      tagName: "SPAN",
      classList: { contains: () => false, [Symbol.iterator]: function* () {} },
      className: "",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 20 }),
    } as any;
    const parentEl = {
      tagName: "DIV",
      classList: { contains: () => false, [Symbol.iterator]: function* () {} },
      className: "",
      parentElement: null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    } as any;

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [childEl, parentEl],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);

    adapter.onPointerOver({ clientX: 10, clientY: 10 } as any, childEl);
    vi.advanceTimersByTime(50);

    const detailedHtml = String(drawTooltipSpy.mock.calls[drawTooltipSpy.mock.calls.length - 1][0]);
    expect(detailedHtml).toContain("Alt+C");
    expect(detailedHtml).toContain("Alt+Shift+C");
    expect(detailedHtml).toContain("Alt+P");
    expect(detailedHtml).toContain("Alt+M");
    expect(detailedHtml).toContain("Ctrl+Alt+D");
    expect(detailedHtml).toContain("Alt+H");
    expect(detailedHtml).toContain("Alt+Shift+Scroll");
    expect(detailedHtml).toContain("Alt+S");
    expect(detailedHtml).toContain("Alt+X");

    // Toggle to minimal mode and verify minimal footer also contains all shortcuts
    adapter.onShortcut("toggleMinimal");
    const minimalHtml = String(drawTooltipSpy.mock.calls[drawTooltipSpy.mock.calls.length - 1][0]);
    expect(minimalHtml).toContain("Ctrl+Alt+D");
    expect(minimalHtml).toContain("Alt+H");
    expect(minimalHtml).toContain("Alt+Shift+Scroll");

    // Push live config update with metaKey shortcut and Mac platform
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    currentConfig = {
      ...currentConfig,
      minimalModeByDefault: false,
      layerPickerScroll: { altKey: false, shiftKey: false, ctrlKey: false, metaKey: true },
      shortcuts: {
        ...currentConfig.shortcuts,
        toggleUI: { key: "u", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true },
        toggleFilterPanel: { key: "k", altKey: true, ctrlKey: false, shiftKey: false, metaKey: true },
      },
    };
    adapter.onConfigUpdate(currentConfig);

    const updatedHtml = String(drawTooltipSpy.mock.calls[drawTooltipSpy.mock.calls.length - 1][0]);
    expect(updatedHtml).toContain("⌘U");
    expect(updatedHtml).toContain("⌥⌘K");
    expect(updatedHtml).toContain("⌘+Scroll");
  });

  it("enforces metaKey equality in layer picker wheel scroll handling", () => {
    const wheelListeners: Array<(e: WheelEvent) => void> = [];
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, cb: any) => {
        if (type === "wheel") wheelListeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    });

    const mockController = {
      getConfig: () => ({
        layerPickerScroll: { altKey: false, shiftKey: false, ctrlKey: false, metaKey: true },
      }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlight: vi.fn(),
      clearParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
    } as any;

    const el1 = {
      tagName: "SPAN",
      classList: { contains: () => false, [Symbol.iterator]: function* () {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
    } as any;
    const el2 = {
      tagName: "DIV",
      classList: { contains: () => false, [Symbol.iterator]: function* () {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
    } as any;

    vi.stubGlobal("document", {
      body: {},
      documentElement: {},
      elementsFromPoint: () => [el1, el2],
    });

    const adapter = new InspectorAdapter();
    adapter.activate(mockController);
    adapter.onPointerOver({ clientX: 5, clientY: 5 } as any, el1);

    const wheelCb = wheelListeners[wheelListeners.length - 1];
    const nonMatchingWheel = {
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      deltaY: 100,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as any;
    wheelCb(nonMatchingWheel);
    expect(nonMatchingWheel.preventDefault).not.toHaveBeenCalled();

    const matchingWheel = {
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      deltaY: 100,
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as any;
    wheelCb(matchingWheel);
    expect(matchingWheel.preventDefault).toHaveBeenCalled();
    expect(mockController.drawHighlight).toHaveBeenLastCalledWith(el2, false);
  });
});
