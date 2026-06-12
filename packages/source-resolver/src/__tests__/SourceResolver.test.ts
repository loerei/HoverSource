import { describe, it, expect, vi, beforeAll } from "vitest";
import { SourceResolver } from "../index.js";
import { ReactFiberAdapter } from "../adapters/ReactFiberAdapter.js";
import { VueAdapter } from "../adapters/VueAdapter.js";
import { SvelteAdapter } from "../adapters/SvelteAdapter.js";

// Mock global getComputedStyle for Node environment test execution
beforeAll(() => {
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = vi.fn().mockImplementation((el: any) => {
      return el._mockComputedStyle || {
        display: "block",
        position: "static"
      };
    }) as any;
  }
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {
      documentElement: {}
    } as any;
  }
});

describe("ReactFiberAdapter", () => {
  it("should resolve React component metadata from fiber", () => {
    const adapter = new ReactFiberAdapter();
    const mockElement = {
      tagName: "DIV",
      classList: {
        value: "btn btn-primary",
        [Symbol.iterator]: function* () {
          yield "btn";
          yield "btn-primary";
        }
      },
      __reactFiber$: {
        _debugSource: {
          fileName: "/src/components/Button.tsx",
          lineNumber: 42,
          columnNumber: 5
        },
        _debugOwner: {
          type: (() => {
            function Button() {}
            return Button;
          })()
        }
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/Button.tsx");
    expect(result?.lineNumber).toBe(42);
    expect(result?.columnNumber).toBe(5);
    expect(result?.componentName).toBe("Button");
    expect(result?.framework).toBe("React");
  });
});

describe("VueAdapter", () => {
  it("should resolve Vue component metadata", () => {
    const adapter = new VueAdapter();
    const mockElement = {
      tagName: "BUTTON",
      classList: {
        [Symbol.iterator]: function* () {}
      },
      hasAttribute: () => false,
      __vueParentComponent: {
        type: {
          __file: "/src/components/VueButton.vue",
          __name: "VueButton"
        }
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/VueButton.vue");
    expect(result?.componentName).toBe("VueButton");
    expect(result?.framework).toBe("Vue");
  });

  it("should resolve Vue component metadata from data-v-inspector attribute in invasive mode", () => {
    const adapter = new VueAdapter();
    const mockElement = {
      tagName: "BUTTON",
      classList: {
        [Symbol.iterator]: function* () {}
      },
      hasAttribute: (name: string) => name === "data-v-inspector",
      getAttribute: (name: string) => name === "data-v-inspector" ? "/src/components/MyButton.vue:24:8" : null
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/MyButton.vue");
    expect(result?.lineNumber).toBe(24);
    expect(result?.columnNumber).toBe(8);
    expect(result?.componentName).toBe("MyButton");
    expect(result?.framework).toBe("Vue");
  });
});

describe("SvelteAdapter", () => {
  it("should resolve Svelte component metadata and infer component name", () => {
    const adapter = new SvelteAdapter();
    const mockElement = {
      tagName: "SPAN",
      classList: {
        [Symbol.iterator]: function* () {}
      },
      __svelte_meta: {
        loc: {
          file: "/src/components/SvelteBadge.svelte",
          line: 9, // 0-indexed in Svelte loc
          column: 2
        }
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/SvelteBadge.svelte");
    expect(result?.lineNumber).toBe(10); // 1-indexed
    expect(result?.columnNumber).toBe(3); // 1-indexed
    expect(result?.componentName).toBe("SvelteBadge");
    expect(result?.framework).toBe("Svelte");
  });
});

describe("SourceResolver", () => {
  it("should route resolution to the correct adapter", () => {
    const resolver = new SourceResolver();
    const mockReact = {
      tagName: "DIV",
      classList: { [Symbol.iterator]: function* () {} },
      __reactFiber$: {
        _debugSource: { fileName: "ReactFile.tsx", lineNumber: 10 }
      }
    } as any;
    const mockVue = {
      tagName: "DIV",
      classList: { [Symbol.iterator]: function* () {} },
      __vueParentComponent: {
        type: { __file: "VueFile.vue", __name: "VueComp" }
      }
    } as any;

    const reactResult = resolver.resolve(mockReact);
    expect(reactResult?.framework).toBe("React");
    expect(reactResult?.fileName).toBe("ReactFile.tsx");

    const vueResult = resolver.resolve(mockVue);
    expect(vueResult?.framework).toBe("Vue");
    expect(vueResult?.fileName).toBe("VueFile.vue");
  });

  it("should resolve ancestors layout and framework metadata", () => {
    const resolver = new SourceResolver();
    
    // Create ancestor tree
    const rootEl = {
      tagName: "DIV",
      id: "root",
      classList: { [Symbol.iterator]: function* () {} },
      parentElement: null,
      _mockComputedStyle: { display: "block", position: "relative" },
      __reactFiber$: {
        _debugSource: { fileName: "RootFile.tsx", lineNumber: 5 },
        _debugOwner: {
          type: (() => {
            function RootComponent() {}
            return RootComponent;
          })()
        }
      }
    } as any;

    const parentEl = {
      tagName: "SECTION",
      classList: {
        [Symbol.iterator]: function* () { yield "flex-container"; }
      },
      parentElement: rootEl,
      _mockComputedStyle: {
        display: "flex",
        position: "static",
        flexDirection: "row",
        justifyContent: "space-between"
      },
      __vueParentComponent: {
        type: { __file: "ParentVue.vue", __name: "ParentVue" }
      }
    } as any;

    const childEl = {
      tagName: "BUTTON",
      classList: { [Symbol.iterator]: function* () {} },
      parentElement: parentEl
    } as any;

    const ancestors = resolver.resolveAncestors(childEl, 5);
    expect(ancestors.length).toBe(2);

    // Closest ancestor (parentEl)
    expect(ancestors[0].selector).toBe("section.flex-container");
    expect(ancestors[0].display).toBe("flex");
    expect(ancestors[0].position).toBe("static");
    expect(ancestors[0].layoutProps).toEqual({
      "flex-direction": "row",
      "justify-content": "space-between",
      "align-items": undefined,
      "gap": undefined,
      "flex-wrap": undefined
    });
    expect(ancestors[0].componentName).toBe("ParentVue");
    expect(ancestors[0].fileName).toBe("ParentVue.vue");

    // Next ancestor (rootEl)
    expect(ancestors[1].selector).toBe("div#root");
    expect(ancestors[1].display).toBe("block");
    expect(ancestors[1].position).toBe("relative");
    expect(ancestors[1].componentName).toBe("RootComponent");
    expect(ancestors[1].fileName).toBe("RootFile.tsx");
  });
});
