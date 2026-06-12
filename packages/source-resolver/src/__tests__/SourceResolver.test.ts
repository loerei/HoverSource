import { describe, it, expect, vi, beforeAll } from "vitest";
import { SourceResolver } from "../index.js";
import { ReactFiberAdapter } from "../adapters/ReactFiberAdapter.js";
import { VueAdapter } from "../adapters/VueAdapter.js";
import { SvelteAdapter } from "../adapters/SvelteAdapter.js";
import { PreactAdapter } from "../adapters/PreactAdapter.js";
import { SolidAdapter } from "../adapters/SolidAdapter.js";
import { AstroAdapter } from "../adapters/AstroAdapter.js";
import { AngularAdapter } from "../adapters/AngularAdapter.js";

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
      classList: ["btn", "btn-primary"],
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
      classList: [],
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
      classList: [],
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

  it("should resolve Vue component metadata from individual data-v-inspector-* attributes", () => {
    const adapter = new VueAdapter();
    const mockElement = {
      tagName: "BUTTON",
      classList: [],
      hasAttribute: (name: string) => name === "data-v-inspector-file",
      getAttribute: (name: string) => {
        if (name === "data-v-inspector-file") return "/src/components/Header.vue";
        if (name === "data-v-inspector-line") return "42";
        if (name === "data-v-inspector-column") return "12";
        return null;
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/Header.vue");
    expect(result?.lineNumber).toBe(42);
    expect(result?.columnNumber).toBe(12);
    expect(result?.componentName).toBe("Header");
    expect(result?.framework).toBe("Vue");
  });
});

describe("SvelteAdapter", () => {
  it("should resolve Svelte component metadata and infer component name", () => {
    const adapter = new SvelteAdapter();
    const mockElement = {
      tagName: "SPAN",
      classList: [],
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

describe("PreactAdapter", () => {
  it("should resolve Preact component metadata from VNode", () => {
    const adapter = new PreactAdapter();
    const mockElement = {
      tagName: "DIV",
      classList: [],
      __v: {
        __source: {
          fileName: "/src/components/PreactCard.tsx",
          lineNumber: 15,
          columnNumber: 4
        },
        __: {
          type: (() => {
            function PreactCard() {}
            return PreactCard;
          })()
        }
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/PreactCard.tsx");
    expect(result?.lineNumber).toBe(15);
    expect(result?.columnNumber).toBe(4);
    expect(result?.componentName).toBe("PreactCard");
    expect(result?.framework).toBe("Preact");
  });
});

describe("SolidAdapter", () => {
  it("should resolve SolidJS component metadata from data-source-loc", () => {
    const adapter = new SolidAdapter();
    const mockElement = {
      tagName: "DIV",
      classList: [],
      hasAttribute: (name: string) => name === "data-source-loc",
      getAttribute: (name: string) => name === "data-source-loc" ? "/src/components/SolidCounter.tsx:25:8" : null
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/components/SolidCounter.tsx");
    expect(result?.lineNumber).toBe(25);
    expect(result?.columnNumber).toBe(8);
    expect(result?.componentName).toBe("SolidCounter");
    expect(result?.framework).toBe("SolidJS");
  });
});

describe("AstroAdapter", () => {
  it("should resolve Astro component metadata from data-astro-source attributes", () => {
    const adapter = new AstroAdapter();
    const mockElement = {
      tagName: "MAIN",
      classList: [],
      hasAttribute: (name: string) => name === "data-astro-source-file",
      getAttribute: (name: string) => {
        if (name === "data-astro-source-file") return "/src/pages/index.astro";
        if (name === "data-astro-source-loc") return "12:5";
        return null;
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/pages/index.astro");
    expect(result?.lineNumber).toBe(12);
    expect(result?.columnNumber).toBe(5);
    expect(result?.componentName).toBe("index");
    expect(result?.framework).toBe("Astro");
  });
});

describe("AngularAdapter", () => {
  it("should resolve Angular component name non-invasively", () => {
    const adapter = new AngularAdapter();
    (globalThis as any).ng = {
      getOwningComponent: () => ({
        constructor: {
          name: "AngularComponent"
        }
      })
    };
    const mockElement = {
      tagName: "APP-ROOT",
      classList: [],
      __ngContext__: {}
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.componentName).toBe("AngularComponent");
    expect(result?.framework).toBe("Angular");
    delete (globalThis as any).ng;
  });

  it("should resolve Angular component details in invasive mode", () => {
    const adapter = new AngularAdapter();
    const mockElement = {
      tagName: "DIV",
      classList: [],
      hasAttribute: (name: string) => name === "data-ng-source-file",
      getAttribute: (name: string) => {
        if (name === "data-ng-source-file") return "/src/app/app.component.ts";
        if (name === "data-ng-source-line") return "10";
        if (name === "data-ng-source-column") return "2";
        if (name === "data-ng-component") return "AppComponent";
        return null;
      }
    } as any;

    expect(adapter.canResolve(mockElement)).toBe(true);
    const result = adapter.resolve(mockElement);
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("/src/app/app.component.ts");
    expect(result?.lineNumber).toBe(10);
    expect(result?.columnNumber).toBe(2);
    expect(result?.componentName).toBe("AppComponent");
    expect(result?.framework).toBe("Angular");
  });
});

describe("SourceResolver", () => {
  it("should route resolution to the correct adapter", () => {
    const resolver = new SourceResolver();
    const mockReact = {
      tagName: "DIV",
      classList: [],
      __reactFiber$: {
        _debugSource: { fileName: "ReactFile.tsx", lineNumber: 10 }
      }
    } as any;
    const mockVue = {
      tagName: "DIV",
      classList: [],
      __vueParentComponent: {
        type: { __file: "VueFile.vue", __name: "VueComp" }
      }
    } as any;
    const mockPreact = {
      tagName: "DIV",
      classList: [],
      __v: {
        __source: { fileName: "PreactFile.tsx", lineNumber: 12 }
      }
    } as any;
    const mockSolid = {
      tagName: "DIV",
      classList: [],
      hasAttribute: (name: string) => name === "data-source-loc",
      getAttribute: (name: string) => name === "data-source-loc" ? "SolidFile.tsx:15:2" : null
    } as any;
    const mockAstro = {
      tagName: "DIV",
      classList: [],
      hasAttribute: (name: string) => name === "data-astro-source-file",
      getAttribute: (name: string) => {
        if (name === "data-astro-source-file") return "AstroFile.astro";
        if (name === "data-astro-source-loc") return "20:4";
        return null;
      }
    } as any;
    const mockAngular = {
      tagName: "DIV",
      classList: [],
      hasAttribute: (name: string) => name === "data-ng-source-file",
      getAttribute: (name: string) => name === "data-ng-source-file" ? "AngularFile.ts" : null
    } as any;

    const reactResult = resolver.resolve(mockReact);
    expect(reactResult?.framework).toBe("React");
    expect(reactResult?.fileName).toBe("ReactFile.tsx");

    const vueResult = resolver.resolve(mockVue);
    expect(vueResult?.framework).toBe("Vue");
    expect(vueResult?.fileName).toBe("VueFile.vue");

    const preactResult = resolver.resolve(mockPreact);
    expect(preactResult?.framework).toBe("Preact");
    expect(preactResult?.fileName).toBe("PreactFile.tsx");

    const solidResult = resolver.resolve(mockSolid);
    expect(solidResult?.framework).toBe("SolidJS");
    expect(solidResult?.fileName).toBe("SolidFile.tsx");

    const astroResult = resolver.resolve(mockAstro);
    expect(astroResult?.framework).toBe("Astro");
    expect(astroResult?.fileName).toBe("AstroFile.astro");

    const angularResult = resolver.resolve(mockAngular);
    expect(angularResult?.framework).toBe("Angular");
    expect(angularResult?.fileName).toBe("AngularFile.ts");
  });

  it("should resolve ancestors layout and framework metadata", () => {
    const resolver = new SourceResolver();
    
    // Create ancestor tree
    const rootEl = {
      tagName: "DIV",
      id: "root",
      classList: [],
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
      classList: ["flex-container"],
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
      classList: [],
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
