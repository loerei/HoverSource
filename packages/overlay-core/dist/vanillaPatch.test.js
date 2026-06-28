import { describe, it, expect, vi } from "vitest";
import { setupVanillaMonkeyPatch } from "./vanillaPatch.js";
describe("setupVanillaMonkeyPatch", () => {
    it("should apply patches to document.createElement and Element.prototype.innerHTML", () => {
        // We need Element to be a constructor and have prototype
        function MockElement() { }
        globalThis.Element = MockElement;
        const mockElementPrototype = {
            _html: "",
            get innerHTML() {
                return this._html;
            },
            set innerHTML(val) {
                this._html = val;
                // Mock appending a child that is an instance of MockElement
                const child = Object.create(MockElement.prototype);
                child.dataset = {};
                child.tagName = "SPAN";
                this.children = [child];
            },
            dataset: {},
            children: []
        };
        MockElement.prototype = mockElementPrototype;
        // 1. Mock document
        const mockElementInstance = Object.create(MockElement.prototype);
        mockElementInstance.dataset = {};
        mockElementInstance.tagName = "DIV";
        mockElementInstance.children = [];
        const createElementSpy = vi.fn().mockReturnValue(mockElementInstance);
        const mockDocument = {
            createElement: createElementSpy
        };
        // Store original globals
        const originalDocument = globalThis.document;
        const originalElement = globalThis.Element;
        // Set mock globals
        globalThis.document = mockDocument;
        try {
            // 2. Call setupVanillaMonkeyPatch
            setupVanillaMonkeyPatch();
            // 3. Verify document.createElement is patched
            const el = document.createElement("div");
            expect(createElementSpy).toHaveBeenCalledWith("div", undefined);
            // The element should be tagged with a source location in dataset.
            expect(el.dataset.hsSource).toEqual(expect.any(String));
            // 4. Verify Element.prototype.innerHTML is patched
            const elementInstance = Object.create(MockElement.prototype);
            elementInstance.dataset = {};
            elementInstance.children = [];
            elementInstance.innerHTML = "<p>hello</p>";
            // The parent element should be tagged
            expect(elementInstance.dataset.hsSource).toEqual(expect.any(String));
            // The child element should be tagged
            expect(elementInstance.children[0].dataset.hsSource).toEqual(expect.any(String));
        }
        finally {
            // Restore original globals
            globalThis.document = originalDocument;
            globalThis.Element = originalElement;
            delete globalThis.__HOVERSOURCE_VANILLA_PATCHED__;
        }
    });
});
