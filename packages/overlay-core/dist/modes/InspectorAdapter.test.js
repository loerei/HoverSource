import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { InspectorAdapter } from "./InspectorAdapter.js";
import { inspectVisualContext } from "../inspector.js";
afterEach(() => {
    delete globalThis.__hoversourceBridgeCall;
    delete globalThis.__hoversourceBridgeResolve;
    delete globalThis.__hoversourceBridgeReject;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
beforeAll(() => {
    if (typeof globalThis.getComputedStyle === "undefined") {
        globalThis.getComputedStyle = vi.fn().mockImplementation((el) => {
            return el._mockComputedStyle || {};
        });
    }
    if (typeof globalThis.fetch === "undefined") {
        globalThis.fetch = vi.fn().mockImplementation(() => Promise.reject("fetch mock not configured"));
    }
    if (typeof globalThis.window === "undefined") {
        globalThis.window = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
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
        };
        const adapter = new InspectorAdapter();
        adapter.activate(mockController);
        // Mock document.elementsFromPoint
        const mockTarget = {
            tagName: "BUTTON",
            classList: {
                contains: () => false,
                [Symbol.iterator]: function* () { }
            },
            className: "",
            parentElement: null,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }),
        };
        globalThis.document = {
            body: {},
            documentElement: {},
            elementsFromPoint: () => [mockTarget],
        };
        // Trigger onPointerOver (Hover)
        const event = { clientX: 10, clientY: 10 };
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
        };
        const adapter = new InspectorAdapter();
        adapter.activate(mockController);
        const mockElement = {
            tagName: "DIV",
            classList: {
                contains: () => false,
                [Symbol.iterator]: function* () { }
            },
            className: "",
            parentElement: null,
            offsetWidth: 120,
            offsetHeight: 40,
        };
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
        expect(formatted).toContain("Component");
        expect(formatted).toContain("UserProfileCard");
        expect(formatted).toContain("File Path");
        expect(formatted).toContain("src/components/UserProfileCard.tsx");
        expect(formatted).toContain("Dimensions");
        expect(formatted).toContain("120x40");
        // Unchecked fields should NOT be present
        expect(formatted).not.toContain("Element");
        expect(formatted).not.toContain("Framework");
        expect(formatted).not.toContain("Key Styles");
    });
    it("renders scroll/gutter layoutConstraints when enabled and hides them when layoutConstraints is false", () => {
        const createMockController = (layoutConstraintsEnabled) => ({
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
        });
        const mockElement = {
            tagName: "DIV",
            classList: {
                contains: () => false,
                [Symbol.iterator]: function* () { }
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
        };
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
        expect(enabledFormatted).toContain("* **Layout Constraints**:");
        expect(enabledFormatted).toContain("`overflow-y: auto`");
        expect(enabledFormatted).toContain("`scrollbar-gutter: stable`");
        expect(enabledFormatted).toContain("`client-size: 747x579`");
        expect(enabledFormatted).toContain("`scroll-size: 747x2400`");
        expect(enabledFormatted).toContain("`scrollbar-width: 10px`");
        const disabledAdapter = new InspectorAdapter();
        disabledAdapter.activate(createMockController(false));
        const disabledFormatted = disabledAdapter["formatElementMetadata"](mockElement, mockInfo);
        expect(disabledFormatted).not.toContain("* **Layout Constraints**:");
        expect(disabledFormatted).not.toContain("overflow-y: auto");
        expect(disabledFormatted).not.toContain("scrollbar-gutter: stable");
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
        const fetchMock = vi.fn().mockImplementation(async (url) => {
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
        };
        const target = {
            tagName: "BUTTON",
            dataset: { hsSource: "src/components/Button.tsx:12:4" },
            closest: (sel) => (sel === "[data-hs-source]" ? target : null),
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
        adapter.onPointerOver({ clientX: 10, clientY: 10 }, target);
        await vi.advanceTimersByTimeAsync(50);
        await flushMicrotasks();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain("http://127.0.0.1:7300/validate-line?file=src%2Fcomponents%2FButton.tsx&line=12&column=4&tagName=button&classList=btn-primary");
        expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:7300/static-context?file=src%2Fcomponents%2FButtonCorrected.tsx&line=24&column=6&tagName=button&classList=btn-primary");
        expect(adapter["currentSourceInfo"].staticMetadata).toEqual({
            comments: ["Primary action button"],
            attributes: { type: "submit" },
        });
        expect(mockController.drawTooltip).toHaveBeenCalledTimes(2);
    });
    it("routes fetchStaticHtmlResolution (/resolve-html-element -> /static-context) through companionRequestJson and updates tooltip metadata", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(async (url) => {
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
        };
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
        };
        vi.stubGlobal("document", {
            body: {},
            documentElement: {},
            elementsFromPoint: () => [target],
        });
        const adapter = new InspectorAdapter();
        adapter.activate(mockController);
        adapter.onPointerOver({ clientX: 20, clientY: 20 }, target);
        await vi.advanceTimersByTimeAsync(50);
        await flushMicrotasks();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain("http://127.0.0.1:7300/resolve-html-element?");
        expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:7300/static-context?file=index.html&line=18&column=5&tagName=section&classList=hero-banner");
        expect(adapter["currentSourceInfo"].staticMetadata).toEqual({
            comments: ["Hero section"],
        });
        expect(mockController.drawTooltip).toHaveBeenCalledTimes(3);
    });
    it("logs console.warn('[HoverSource] Static context fetch failed:', err) when /static-context rejects in fetchBackgroundValidation", async () => {
        vi.useFakeTimers();
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const fetchMock = vi.fn().mockImplementation(async (url) => {
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
        };
        const target = {
            tagName: "BUTTON",
            dataset: { hsSource: "src/components/Button.tsx:12:4" },
            closest: (sel) => (sel === "[data-hs-source]" ? target : null),
            classList: {
                contains: () => false,
                [Symbol.iterator]: function* () { },
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
        adapter.onPointerOver({ clientX: 10, clientY: 10 }, target);
        await vi.advanceTimersByTimeAsync(50);
        await flushMicrotasks();
        expect(warnSpy).toHaveBeenCalledWith("[HoverSource] Static context fetch failed:", expect.any(Error));
    });
    it("routes /validate-line and /static-context through __hoversourceBridgeCall when CDP bridge is active", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const bridgeCalls = [];
        globalThis.__hoversourceBridgeCall = vi.fn((raw) => {
            const payload = JSON.parse(raw);
            bridgeCalls.push(payload);
            if (payload.path.startsWith("/validate-line")) {
                queueMicrotask(() => {
                    globalThis.__hoversourceBridgeResolve(payload.id, JSON.stringify({ corrected: { line: 30, column: 8 } }));
                });
            }
            else if (payload.path.startsWith("/static-context")) {
                queueMicrotask(() => {
                    globalThis.__hoversourceBridgeResolve(payload.id, JSON.stringify({ comments: ["Bridge comment"] }));
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
        };
        const target = {
            tagName: "BUTTON",
            dataset: { hsSource: "src/components/Button.tsx:12:4" },
            closest: (sel) => (sel === "[data-hs-source]" ? target : null),
            classList: {
                contains: () => false,
                [Symbol.iterator]: function* () { },
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
        adapter.onPointerOver({ clientX: 10, clientY: 10 }, target);
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
        let currentConfig = {
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
        };
        const childEl = {
            tagName: "SPAN",
            classList: { contains: () => false, [Symbol.iterator]: function* () { } },
            className: "",
            parentElement: null,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 20 }),
        };
        const parentEl = {
            tagName: "DIV",
            classList: { contains: () => false, [Symbol.iterator]: function* () { } },
            className: "",
            parentElement: null,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 40 }),
        };
        vi.stubGlobal("document", {
            body: {},
            documentElement: {},
            elementsFromPoint: () => [childEl, parentEl],
        });
        const adapter = new InspectorAdapter();
        adapter.activate(mockController);
        adapter.onPointerOver({ clientX: 10, clientY: 10 }, childEl);
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
        const wheelListeners = [];
        vi.stubGlobal("window", {
            addEventListener: vi.fn((type, cb) => {
                if (type === "wheel")
                    wheelListeners.push(cb);
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
        };
        const el1 = {
            tagName: "SPAN",
            classList: { contains: () => false, [Symbol.iterator]: function* () { } },
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
        };
        const el2 = {
            tagName: "DIV",
            classList: { contains: () => false, [Symbol.iterator]: function* () { } },
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
        };
        vi.stubGlobal("document", {
            body: {},
            documentElement: {},
            elementsFromPoint: () => [el1, el2],
        });
        const adapter = new InspectorAdapter();
        adapter.activate(mockController);
        adapter.onPointerOver({ clientX: 5, clientY: 5 }, el1);
        const wheelCb = wheelListeners[wheelListeners.length - 1];
        const nonMatchingWheel = {
            altKey: false,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            deltaY: 100,
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        };
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
        };
        wheelCb(matchingWheel);
        expect(matchingWheel.preventDefault).toHaveBeenCalled();
        expect(mockController.drawHighlight).toHaveBeenLastCalledWith(el2, false);
    });
});
