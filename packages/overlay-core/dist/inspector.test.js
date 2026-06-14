import { describe, it, expect, vi, beforeAll } from "vitest";
import { inspectVisualContext, clearInspectorCache } from "./inspector.js";
beforeAll(() => {
    if (typeof globalThis.getComputedStyle === "undefined") {
        globalThis.getComputedStyle = vi.fn().mockImplementation((el) => {
            return el._mockComputedStyle || {};
        });
    }
});
describe("inspectVisualContext", () => {
    it("should cache visual context details and parent computed styles", () => {
        const parentEl = {
            tagName: "DIV",
            classList: ["parent-class"],
            parentElement: null,
            _mockComputedStyle: { position: "sticky", overflowY: "auto" }
        };
        const targetEl = {
            tagName: "BUTTON",
            classList: [],
            parentElement: parentEl,
            _mockComputedStyle: { display: "block" }
        };
        const originalGetComputedStyle = globalThis.getComputedStyle;
        const spy = vi.fn().mockImplementation((el) => {
            return el._mockComputedStyle || {};
        });
        globalThis.getComputedStyle = spy;
        try {
            // First call
            const first = inspectVisualContext(targetEl);
            expect(first.parentEffects.length).toBe(2); // position: sticky & overflow-y: auto
            expect(spy).toHaveBeenCalledTimes(2); // targetEl + parentEl
            // Second call (should be fully cached)
            const second = inspectVisualContext(targetEl);
            expect(second.parentEffects.length).toBe(2);
            expect(spy).toHaveBeenCalledTimes(2); // No new calls to getComputedStyle
            // Clear cache
            clearInspectorCache();
            // Third call (should re-evaluate)
            const third = inspectVisualContext(targetEl);
            expect(third.parentEffects.length).toBe(2);
            expect(spy).toHaveBeenCalledTimes(4); // 2 more calls
        }
        finally {
            globalThis.getComputedStyle = originalGetComputedStyle;
        }
    });
    it("should traverse up to 32 levels in inspectVisualContext", () => {
        // Build a chain of 35 elements
        let currentEl = null;
        for (let i = 0; i < 35; i++) {
            currentEl = {
                tagName: "DIV",
                classList: [],
                parentElement: currentEl,
                _mockComputedStyle: { position: "sticky" } // each parent adds 1 position effect
            };
        }
        const context = inspectVisualContext(currentEl);
        // 34 parents. Max depth is capped at 32.
        // The first parent computed starts from element.parentElement.
        // So target has 34 parents. The walk should traverse exactly 32 levels.
        expect(context.parentEffects.length).toBe(32);
    });
    it("should respect custom maxDepth in inspectVisualContext", () => {
        // Build a chain of 15 elements
        let currentEl = null;
        for (let i = 0; i < 15; i++) {
            currentEl = {
                tagName: "DIV",
                classList: [],
                parentElement: currentEl,
                _mockComputedStyle: { position: "sticky" }
            };
        }
        // Pass custom maxDepth = 10
        const context = inspectVisualContext(currentEl, 10);
        expect(context.parentEffects.length).toBe(10);
    });
    it("should capture relative, absolute, flex, grid, transform, and clip-path styles and element reference", () => {
        const parentEl = {
            tagName: "DIV",
            classList: ["container-class"],
            parentElement: null,
            _mockComputedStyle: {
                position: "relative",
                display: "flex",
                transform: "translate(10px, 20px)",
                clipPath: "circle(50%)"
            }
        };
        const targetEl = {
            tagName: "SPAN",
            classList: [],
            parentElement: parentEl,
            _mockComputedStyle: { display: "inline" }
        };
        const originalGetComputedStyle = globalThis.getComputedStyle;
        globalThis.getComputedStyle = vi.fn().mockImplementation((el) => {
            return el._mockComputedStyle || {};
        });
        try {
            const context = inspectVisualContext(targetEl);
            // It should collect: position (relative), display (flex), transform, clip-path
            const props = context.parentEffects.map(fx => fx.property);
            expect(props).toContain("position");
            expect(props).toContain("display");
            expect(props).toContain("transform");
            expect(props).toContain("clip-path");
            // Verify that element reference is stored
            context.parentEffects.forEach(fx => {
                expect(fx.element).toBe(parentEl);
            });
        }
        finally {
            globalThis.getComputedStyle = originalGetComputedStyle;
        }
    });
});
