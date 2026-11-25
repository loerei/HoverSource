import { describe, it, expect, afterEach, vi } from "vitest";
import { DEFAULT_SHORTCUTS, DEFAULT_LAYER_SCROLL_MODIFIERS, isMacPlatform, formatModifierLabel, formatShortcutLabel, matchShortcut, matchScrollModifiers, } from "../shortcuts.js";
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
describe("shortcuts seam", () => {
    it("defines all 8 default shortcuts and default layer scroll modifiers", () => {
        expect(Object.keys(DEFAULT_SHORTCUTS)).toEqual([
            "toggleUI",
            "toggleMinimal",
            "toggleFreeze",
            "copyMetadata",
            "copyAllLayers",
            "openDashboard",
            "toggleMode",
            "toggleFilterPanel",
        ]);
        expect(DEFAULT_SHORTCUTS.toggleFilterPanel).toEqual({
            key: "d",
            altKey: true,
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
        });
        expect(DEFAULT_LAYER_SCROLL_MODIFIERS).toEqual({
            altKey: true,
            shiftKey: true,
            ctrlKey: false,
            metaKey: false,
        });
    });
    it("detects macOS platform from userAgentData.platform or navigator.platform", () => {
        vi.stubGlobal("navigator", {
            platform: "Win32",
            userAgentData: { platform: "macOS" },
        });
        expect(isMacPlatform()).toBe(true);
        vi.stubGlobal("navigator", {
            platform: "MacIntel",
        });
        expect(isMacPlatform()).toBe(true);
        vi.stubGlobal("navigator", {
            platform: "Win32",
            userAgentData: { platform: "Windows" },
        });
        expect(isMacPlatform()).toBe(false);
    });
    it("matches metaKey (Cmd) strictly and resolves macOS Option dead-key Unicode via e.code", () => {
        const cmdCopy = { key: "c", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true };
        expect(matchShortcut({ key: "c", code: "KeyC", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true }, cmdCopy)).toBe(true);
        expect(matchShortcut({ key: "c", code: "KeyC", altKey: false, ctrlKey: false, shiftKey: false, metaKey: false }, cmdCopy)).toBe(false);
        // Default Alt+C must reject Cmd+Alt+C
        expect(matchShortcut({ key: "c", code: "KeyC", altKey: true, ctrlKey: false, shiftKey: false, metaKey: true }, DEFAULT_SHORTCUTS.copyMetadata)).toBe(false);
        // macOS Option+C emits e.key = "ç"
        expect(matchShortcut({ key: "ç", code: "KeyC", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.copyMetadata)).toBe(true);
        // macOS Option+P emits "π", Option+M emits "µ", Option+X emits "≈", Option+H emits "˙"
        expect(matchShortcut({ key: "π", code: "KeyP", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.toggleFreeze)).toBe(true);
        expect(matchShortcut({ key: "µ", code: "KeyM", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.toggleMinimal)).toBe(true);
        expect(matchShortcut({ key: "≈", code: "KeyX", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.toggleMode)).toBe(true);
        expect(matchShortcut({ key: "˙", code: "KeyH", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_SHORTCUTS.toggleUI)).toBe(true);
        // Digit key code matching
        expect(matchShortcut({ key: "¡", code: "Digit1", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, { key: "1", altKey: true, ctrlKey: false, shiftKey: false, metaKey: false })).toBe(true);
        // toggleFilterPanel custom binding
        const customFilter = { key: "f", altKey: false, ctrlKey: false, shiftKey: true, metaKey: true };
        expect(matchShortcut({ key: "F", code: "KeyF", altKey: false, ctrlKey: false, shiftKey: true, metaKey: true }, customFilter)).toBe(true);
    });
    it("matches scroll modifiers with exact metaKey equality", () => {
        expect(matchScrollModifiers({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }, DEFAULT_LAYER_SCROLL_MODIFIERS)).toBe(true);
        expect(matchScrollModifiers({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: true }, DEFAULT_LAYER_SCROLL_MODIFIERS)).toBe(false);
        expect(matchScrollModifiers({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: true }, { altKey: false, shiftKey: false, ctrlKey: false, metaKey: true })).toBe(true);
    });
    it("formats OS-specific shortcut and modifier labels", () => {
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.copyMetadata, false)).toBe("Alt+C");
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.toggleFilterPanel, false)).toBe("Ctrl+Alt+D");
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.copyAllLayers, false)).toBe("Alt+Shift+C");
        expect(formatShortcutLabel({ key: "k", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true }, false)).toBe("Win+K");
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.copyMetadata, true)).toBe("⌥C");
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.toggleFilterPanel, true)).toBe("⌃⌥D");
        expect(formatShortcutLabel(DEFAULT_SHORTCUTS.copyAllLayers, true)).toBe("⌥⇧C");
        expect(formatShortcutLabel({ key: "k", altKey: false, ctrlKey: false, shiftKey: false, metaKey: true }, true)).toBe("⌘K");
        expect(formatModifierLabel(DEFAULT_LAYER_SCROLL_MODIFIERS, false)).toBe("Alt+Shift");
        expect(formatModifierLabel(DEFAULT_LAYER_SCROLL_MODIFIERS, true)).toBe("⌥⇧");
        expect(formatShortcutLabel(null, false)).toBe("");
        expect(formatModifierLabel(undefined, true)).toBe("");
    });
});
