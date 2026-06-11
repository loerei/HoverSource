import { describe, it, expect } from "vitest";
const mockBody = { parentElement: null };
if (typeof document === "undefined") {
    globalThis.document = {
        body: mockBody
    };
}
import { findNearestSnapPoint, shouldReleaseSnap, calculateNudge, getLayoutRules, findCommonAncestor, getSelector, getSuggestedCSS } from "./DesignAdapter.js";
describe("DesignAdapter - Snapping Logic", () => {
    it("should calculate correct offsets and snap to the nearest boundary", () => {
        const rect = {
            left: 100,
            top: 100,
            width: 200,
            height: 80,
            right: 300,
            bottom: 180
        };
        // Case 1: Cursor is near the Right-Edge (300) and Center-Axis (140)
        // Mouse at (308, 142)
        const result = findNearestSnapPoint(308, 142, rect);
        expect(result.horizontal.boundary).toBe("Right-Edge");
        expect(result.horizontal.offset).toBe(8); // 308 - 300
        expect(result.horizontal.distance).toBe(8);
        expect(result.vertical.boundary).toBe("Center-Axis");
        expect(result.vertical.offset).toBe(2); // 142 - 140
        expect(result.vertical.distance).toBe(2);
    });
});
describe("DesignAdapter - Deadzone Logic", () => {
    it("should detect when mouse movements should break the snap", () => {
        // Snap anchor mouse position was at (300, 140)
        // Deadzone is 15px.
        // Case 1: Mouse moves slightly to (305, 145) -> delta is 5px, should NOT release snap
        expect(shouldReleaseSnap(305, 145, 300, 140, 15)).toBe(false);
        // Case 2: Mouse moves to (316, 140) -> deltaX is 16px (>15), should release snap
        expect(shouldReleaseSnap(316, 140, 300, 140, 15)).toBe(true);
        // Case 3: Mouse moves to (300, 156) -> deltaY is 16px (>15), should release snap
        expect(shouldReleaseSnap(300, 156, 300, 140, 15)).toBe(true);
    });
});
describe("DesignAdapter - Keyboard Nudge Logic", () => {
    it("should calculate correct offsets when arrow keys are pressed", () => {
        // Left nudge: 1px
        expect(calculateNudge("ArrowLeft", false, 10, 20)).toEqual({ dX: 9, dY: 20 });
        // Right nudge: 8px (with Shift)
        expect(calculateNudge("ArrowRight", true, 10, 20)).toEqual({ dX: 18, dY: 20 });
        // Up nudge: 1px
        expect(calculateNudge("ArrowUp", false, 10, 20)).toEqual({ dX: 10, dY: 19 });
        // Down nudge: 8px (with Shift)
        expect(calculateNudge("ArrowDown", true, 10, 20)).toEqual({ dX: 10, dY: 28 });
        // Non-nudge key: should return unchanged
        expect(calculateNudge("KeyA", false, 10, 20)).toEqual({ dX: 10, dY: 20 });
    });
});
describe("DesignAdapter - CSS Layout Generation", () => {
    it("should generate correct CSS rules for absolute positioning", () => {
        // Right-Edge, Center-Axis with offsets
        const rules1 = getLayoutRules("Right-Edge", "Center-Axis", 16, 0);
        expect(rules1).toBe("position: absolute;\nleft: calc(100% + 16px);\ntop: 50%;\ntransform: translateY(-50%);");
        // Left-Edge, Top-Edge with offsets
        const rules2 = getLayoutRules("Left-Edge", "Top-Edge", 10, -5);
        expect(rules2).toBe("position: absolute;\nleft: 10px;\nbottom: calc(100% + 5px);");
    });
});
describe("DesignAdapter - Relational Alignment and Offset (RAO) Helpers", () => {
    it("should find the nearest common ancestor", () => {
        // Create mock elements
        const body = mockBody;
        const container = { parentElement: body };
        const el1 = { parentElement: container };
        const el2 = { parentElement: container };
        expect(findCommonAncestor(el1, el2)).toBe(container);
        expect(findCommonAncestor(el1, container)).toBe(container);
        expect(findCommonAncestor(el1, null)).toBe(body);
    });
    it("should get a clean CSS selector", () => {
        const el = {
            tagName: "BUTTON",
            id: "submit-btn",
            classList: ["btn", "btn-primary", "hs-ignore"]
        };
        expect(getSelector(el)).toBe("button#submit-btn.btn.btn-primary");
        expect(getSelector(null)).toBe("");
    });
    it("should generate suggested CSS based on anchor relation", () => {
        const anchor = {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 })
        };
        // Case 1: Same anchor (Direct Snapping)
        const rulesSame = getSuggestedCSS("Right-Edge", "Center-Axis", -25, 0, anchor, 100, 200, anchor, anchor);
        expect(rulesSame).toContain("position: absolute;");
        expect(rulesSame).toContain("right: 25px;");
        expect(rulesSame).toContain("top: 50%;");
        expect(rulesSame).toContain("transform: translateY(-50%);");
        expect(rulesSame).toContain("white-space: nowrap;");
        // Case 2: Different anchors (Percentage Positioning relative to parent)
        const parent = {
            getBoundingClientRect: () => ({
                left: 100,
                top: 100,
                width: 400,
                height: 400,
                right: 500,
                bottom: 500
            })
        };
        const otherAnchor = {};
        // Mouse is at (300, 200) -> relX = 200, relY = 100 -> pctX = 50%, pctY = 25%
        const rulesDiff = getSuggestedCSS("Left-Edge", "Top-Edge", 0, 0, parent, 300, 200, anchor, otherAnchor);
        expect(rulesDiff).toContain("position: absolute;");
        expect(rulesDiff).toContain("left: 50%;");
        expect(rulesDiff).toContain("top: 25%;");
        expect(rulesDiff).toContain("white-space: nowrap;");
    });
});
