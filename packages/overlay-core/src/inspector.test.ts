import { describe, it, expect, vi, beforeAll } from "vitest";
import { inspectVisualContext, clearInspectorCache } from "./inspector.js";
import { parseMaskGradient, parseClipPathInset } from "./overlay.js";

beforeAll(() => {
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = vi.fn().mockImplementation((el: any) => {
      return el._mockComputedStyle || {};
    }) as any;
  }
});

describe("inspectVisualContext", () => {
  it("should cache visual context details and parent computed styles", () => {
    const parentEl = {
      tagName: "DIV",
      classList: ["parent-class"],
      parentElement: null,
      _mockComputedStyle: { position: "sticky", overflowY: "auto" }
    } as any;

    const targetEl = {
      tagName: "BUTTON",
      classList: [],
      parentElement: parentEl,
      _mockComputedStyle: { display: "block" }
    } as any;

    const originalGetComputedStyle = globalThis.getComputedStyle;
    const spy = vi.fn().mockImplementation((el: any) => {
      return el._mockComputedStyle || {};
    });
    globalThis.getComputedStyle = spy as any;

    try {
      // First call
      const first = inspectVisualContext(targetEl);
      expect(first.parentEffects).toHaveLength(2); // position: sticky & overflow-y: auto
      expect(spy).toHaveBeenCalledTimes(2); // targetEl + parentEl

      // Second call (should be fully cached)
      const second = inspectVisualContext(targetEl);
      expect(second.parentEffects).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(2); // No new calls to getComputedStyle

      // Clear cache
      clearInspectorCache();

      // Third call (should re-evaluate)
      const third = inspectVisualContext(targetEl);
      expect(third.parentEffects).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(4); // 2 more calls
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("should traverse up to 32 levels in inspectVisualContext", () => {
    // Build a chain of 35 elements
    let currentEl: any = null;
    for (let i = 0; i < 35; i++) {
      currentEl = {
        tagName: "DIV",
        classList: [],
        parentElement: currentEl,
        _mockComputedStyle: { position: "sticky" } // each parent adds 1 position effect
      } as any;
    }

    const context = inspectVisualContext(currentEl);
    // 34 parents. Max depth is capped at 32.
    // The first parent computed starts from element.parentElement.
    // So target has 34 parents. The walk should traverse exactly 32 levels.
    expect(context.parentEffects).toHaveLength(32);
  });

  it("should respect custom maxDepth in inspectVisualContext", () => {
    // Build a chain of 15 elements
    let currentEl: any = null;
    for (let i = 0; i < 15; i++) {
      currentEl = {
        tagName: "DIV",
        classList: [],
        parentElement: currentEl,
        _mockComputedStyle: { position: "sticky" }
      } as any;
    }

    // Pass custom maxDepth = 10
    const context = inspectVisualContext(currentEl, 10);
    expect(context.parentEffects).toHaveLength(10);
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
    } as any;

    const targetEl = {
      tagName: "SPAN",
      classList: [],
      parentElement: parentEl,
      _mockComputedStyle: { display: "inline" }
    } as any;

    const originalGetComputedStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = vi.fn().mockImplementation((el: any) => {
      return el._mockComputedStyle || {};
    }) as any;

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
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("should correctly parse mask-image linear-gradient sizes and directions", () => {
    const rect = { left: 10, top: 20, width: 100, height: 200 } as DOMRect;
    
    // Default / to bottom
    const resDefault = parseMaskGradient("linear-gradient(rgba(0, 0, 0, 0) 0%, rgb(0, 0, 0) 10px)", rect);
    expect(resDefault).toEqual({ left: 10, top: 20, width: 100, height: 10 });

    // to top
    const resTop = parseMaskGradient("linear-gradient(to top, rgba(0, 0, 0, 0) 0%, rgb(0, 0, 0) 20px)", rect);
    expect(resTop).toEqual({ left: 10, top: 200, width: 100, height: 20 });

    // to right
    const resRight = parseMaskGradient("linear-gradient(to right, transparent, black 15%)", rect);
    expect(resRight).toEqual({ left: 10, top: 20, width: 15, height: 200 });

    // to left
    const resLeft = parseMaskGradient("linear-gradient(to left, transparent, black 25%)", rect);
    expect(resLeft).toEqual({ left: 85, top: 20, width: 25, height: 200 });
  });

  it("should correctly parse clip-path inset values", () => {
    const rect = { left: 10, top: 20, width: 100, height: 200 } as DOMRect;

    // 1 value
    const res1 = parseClipPathInset("inset(10px)", rect);
    expect(res1).toEqual({ left: 20, top: 30, width: 80, height: 180 });

    // 2 values
    const res2 = parseClipPathInset("inset(10% 20px)", rect);
    expect(res2).toEqual({ left: 30, top: 40, width: 60, height: 160 });

    // 4 values
    const res4 = parseClipPathInset("inset(10px 20px 30px 40px)", rect);
    expect(res4).toEqual({ left: 50, top: 30, width: 40, height: 160 });
  });
});
