import { describe, it, expect, vi, beforeAll } from "vitest";
import { InspectorAdapter } from "./InspectorAdapter.js";
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
});
