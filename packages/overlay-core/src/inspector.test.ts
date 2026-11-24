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

  it("emits zero scroll keys in layoutConstraints for non-scrolling, non-overflowing elements", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 300,
      clientHeight: 200,
      scrollWidth: 300,
      scrollHeight: 200,
      offsetWidth: 300,
      offsetHeight: 200,
      _mockComputedStyle: {
        display: "block",
        position: "static",
        overflowX: "visible",
        overflowY: "visible",
        scrollbarGutter: "auto"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints).toEqual({});
  });

  it("emits conditional scroll, gutter, size, and scrollbar-width metrics for a scrollable container", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 747,
      clientHeight: 579,
      scrollWidth: 747,
      scrollHeight: 2400,
      offsetWidth: 757,
      offsetHeight: 579,
      _mockComputedStyle: {
        display: "block",
        overflowX: "visible",
        overflowY: "auto",
        scrollbarGutter: "stable"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints).toEqual({
      "overflow-y": "auto",
      "scrollbar-gutter": "stable",
      "client-size": "747x579",
      "scroll-size": "747x2400",
      "scrollbar-width": "10px"
    });
  });

  it("subtracts element borders so a 1px border without a scrollbar does not emit scrollbar-width", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 200,
      clientHeight: 150,
      scrollWidth: 200,
      scrollHeight: 400,
      offsetWidth: 202,
      offsetHeight: 152,
      _mockComputedStyle: {
        overflowX: "visible",
        overflowY: "auto",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
        borderTopWidth: "1px",
        borderBottomWidth: "1px"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints["overflow-y"]).toBe("auto");
    expect(context.layoutConstraints["client-size"]).toBe("200x150");
    expect(context.layoutConstraints["scroll-size"]).toBe("200x400");
    expect(context.layoutConstraints["scrollbar-width"]).toBeUndefined();
  });

  it("emits both vertical and horizontal scrollbar widths when both tracks are non-zero", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 300,
      clientHeight: 200,
      scrollWidth: 600,
      scrollHeight: 500,
      offsetWidth: 312,
      offsetHeight: 210,
      _mockComputedStyle: {
        overflowX: "scroll",
        overflowY: "auto",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
        borderTopWidth: "1px",
        borderBottomWidth: "1px"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints["overflow-x"]).toBe("scroll");
    expect(context.layoutConstraints["overflow-y"]).toBe("auto");
    expect(context.layoutConstraints["scrollbar-width"]).toBe("10px x 8px");
  });

  it("skips scroll geometry gracefully when DOM size fields are undefined", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      _mockComputedStyle: {
        overflowY: "auto",
        scrollbarGutter: "stable"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints).toEqual({
      "overflow-y": "auto",
      "scrollbar-gutter": "stable"
    });
    expect(context.layoutConstraints["client-size"]).toBeUndefined();
    expect(context.layoutConstraints["scroll-size"]).toBeUndefined();
    expect(context.layoutConstraints["scrollbar-width"]).toBeUndefined();
  });

  it("reports overflow-x/y and size metrics when content overflows even with overflow visible", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 200,
      clientHeight: 100,
      scrollWidth: 200,
      scrollHeight: 250,
      offsetWidth: 200,
      offsetHeight: 100,
      _mockComputedStyle: {
        overflowX: "visible",
        overflowY: "visible"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints).toEqual({
      "overflow-y": "visible",
      "client-size": "200x100",
      "scroll-size": "200x250"
    });
  });

  it("emits overflow-x/y for hidden/clip without client-size/scroll-size when not overflowing", () => {
    const targetEl = {
      tagName: "DIV",
      classList: [],
      parentElement: null,
      clientWidth: 200,
      clientHeight: 100,
      scrollWidth: 200,
      scrollHeight: 100,
      offsetWidth: 200,
      offsetHeight: 100,
      _mockComputedStyle: {
        overflowX: "hidden",
        overflowY: "clip"
      }
    } as any;

    const context = inspectVisualContext(targetEl);
    expect(context.layoutConstraints).toEqual({
      "overflow-x": "hidden",
      "overflow-y": "clip"
    });
  });
});
