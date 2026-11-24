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
    it("excludes node_modules and .vite/deps frames and strips query noise", () => {
        function MockElement() { }
        MockElement.prototype = {
            _html: "",
            get innerHTML() {
                return this._html;
            },
            set innerHTML(val) {
                this._html = val;
                const child = Object.create(MockElement.prototype);
                child.dataset = {};
                child.tagName = "SPAN";
                this.children = [child];
            },
            dataset: {},
            children: [],
        };
        const originalDocument = globalThis.document;
        const originalElement = globalThis.Element;
        const OriginalError = globalThis.Error;
        let currentStack = "";
        class MockError extends OriginalError {
            constructor(message) {
                super(message);
                this.stack = currentStack;
            }
        }
        globalThis.Element = MockElement;
        globalThis.Error = MockError;
        globalThis.document = {
            createElement: () => {
                const el = Object.create(MockElement.prototype);
                el.dataset = {};
                el.tagName = "DIV";
                el.children = [];
                return el;
            },
        };
        try {
            setupVanillaMonkeyPatch();
            // 1. Only HoverSource + react-dom_client.js frames -> must return null (not stamp dataset.hsSource)
            currentStack = [
                "Error",
                "    at captureSourceLocation (http://localhost:7300/hoversource-overlay.js:12:4)",
                "    at document.createElement (http://localhost:7300/overlay.bundle.js:34:10)",
                "    at createInstance (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc123:901:15)",
                "    at completeWork (http://localhost:5173/.vite/deps/react-dom_client.js?v=abc123:1200:8)",
            ].join("\n");
            const runtimeOnlyEl = document.createElement("div");
            expect(runtimeOnlyEl.dataset.hsSource).toBeUndefined();
            const runtimeOnlyContainer = Object.create(MockElement.prototype);
            runtimeOnlyContainer.dataset = {};
            runtimeOnlyContainer.children = [];
            runtimeOnlyContainer.innerHTML = "<span>test</span>";
            expect(runtimeOnlyContainer.dataset.hsSource).toBeUndefined();
            expect(runtimeOnlyContainer.children[0].dataset.hsSource).toBeUndefined();
            // 2. Skips react-dom_client.js to reach app code and strips ?query/#hash
            currentStack = [
                "Error",
                "    at captureSourceLocation (http://localhost:7300/hoversource-overlay.js:12:4)",
                "    at createInstance (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc123:901:15)",
                "    at renderCard (http://localhost:5173/src/components/Card.tsx?t=170000#body:42:9)",
            ].join("\n");
            const appEl = document.createElement("div");
            expect(appEl.dataset.hsSource).toBe("/src/components/Card.tsx:42:9");
            expect(appEl.dataset.hsSource).not.toContain("react-dom_client.js");
            expect(appEl.dataset.hsSource).not.toContain("?t=");
            expect(appEl.dataset.hsSource).not.toContain("#body");
        }
        finally {
            globalThis.document = originalDocument;
            globalThis.Element = originalElement;
            globalThis.Error = OriginalError;
            delete globalThis.__HOVERSOURCE_VANILLA_PATCHED__;
        }
    });
});
