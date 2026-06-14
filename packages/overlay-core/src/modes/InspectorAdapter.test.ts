import { describe, it, expect, vi, beforeAll } from "vitest";
import { InspectorAdapter } from "./InspectorAdapter.js";

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

    const mockController = {
      getConfig: () => ({ minimalModeByDefault: false }),
      isUIVisible: () => true,
      drawHighlight: vi.fn(),
      drawParentHighlights: vi.fn(),
      drawTooltip: vi.fn(),
      clear: vi.fn(),
      setFreezeMode: vi.fn(),
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
    expect(mockController.drawParentHighlights).toHaveBeenCalledWith(expect.any(Array));

    vi.useRealTimers();
  });
});
