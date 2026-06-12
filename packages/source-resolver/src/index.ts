import { SourceAdapter, SourceInfo, AncestorInfo } from "./adapters/types.js";
import { ReactFiberAdapter } from "./adapters/ReactFiberAdapter.js";
import { VueAdapter } from "./adapters/VueAdapter.js";
import { SvelteAdapter } from "./adapters/SvelteAdapter.js";
import { PreactAdapter } from "./adapters/PreactAdapter.js";
import { SolidAdapter } from "./adapters/SolidAdapter.js";
import { AstroAdapter } from "./adapters/AstroAdapter.js";
import { AngularAdapter } from "./adapters/AngularAdapter.js";

export * from "./adapters/types.js";
export * from "./adapters/ReactFiberAdapter.js";
export * from "./adapters/VueAdapter.js";
export * from "./adapters/SvelteAdapter.js";
export * from "./adapters/PreactAdapter.js";
export * from "./adapters/SolidAdapter.js";
export * from "./adapters/AstroAdapter.js";
export * from "./adapters/AngularAdapter.js";

export class SourceResolver {
  private readonly adapters: SourceAdapter[] = [];
  private readonly fiberAdapter: ReactFiberAdapter;

  constructor() {
    // Register default adapters
    this.fiberAdapter = new ReactFiberAdapter();
    this.adapters.push(this.fiberAdapter);
    this.adapters.push(new VueAdapter());
    this.adapters.push(new SvelteAdapter());
    this.adapters.push(new PreactAdapter());
    this.adapters.push(new SolidAdapter());
    this.adapters.push(new AstroAdapter());
    this.adapters.push(new AngularAdapter());
  }

  registerAdapter(adapter: SourceAdapter) {
    this.adapters.push(adapter);
  }

  resolve(element: HTMLElement): SourceInfo | null {
    // Iterate through registered adapters and find the first one that can resolve
    for (const adapter of this.adapters) {
      if (adapter.canResolve(element)) {
        try {
          const info = adapter.resolve(element);
          if (info) return info;
        } catch (e) {
          console.warn(`[HoverSource] Adapter ${adapter.name} failed resolving element`, e);
        }
      }
    }
    return null;
  }

  /**
   * Walks up the DOM from `element` and returns layout + source info for
   * each ancestor (up to `maxDepth` levels).
   *
   * Always resolves: selector, display, position.
   * Resolves conditionally: layoutProps (flex/grid only), fileName/lineNumber/componentName (via adapters).
   */
  resolveAncestors(element: HTMLElement, maxDepth = 8): AncestorInfo[] {
    const results: AncestorInfo[] = [];
    let current: HTMLElement | null = element.parentElement;
    let depth = 0;

    while (current && current !== document.documentElement && depth < maxDepth) {
      try {
        const comp = globalThis.getComputedStyle(current);
        const display = comp.display || "block";
        const position = comp.position || "static";

        const info: AncestorInfo = {
          selector: this.buildSelector(current),
          display,
          position,
        };

        // Collect flex/grid layout props
        if (display === "flex" || display === "inline-flex") {
          info.layoutProps = {
            "flex-direction": comp.flexDirection,
            "justify-content": comp.justifyContent,
            "align-items": comp.alignItems,
            "gap": comp.gap,
            "flex-wrap": comp.flexWrap,
          };
        } else if (display === "grid" || display === "inline-grid") {
          info.layoutProps = {
            "grid-template-columns": comp.gridTemplateColumns,
            "grid-template-rows": comp.gridTemplateRows,
            "gap": comp.gap,
          };
        }

        // Attempt source resolution via registered adapters
        const sourceInfo = this.resolve(current);
        if (sourceInfo) {
          info.fileName = sourceInfo.fileName;
          info.lineNumber = sourceInfo.lineNumber;
          info.componentName = sourceInfo.componentName;
        }

        results.push(info);
      } catch {
        // Skip elements where getComputedStyle throws (e.g. detached)
      }

      current = current.parentElement;
      depth++;
    }

    return results;
  }

  private buildSelector(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList)
      .filter(c => c && !c.startsWith("hoversource") && !c.startsWith("hs-"))
      .join(".");
    return `${tag}${id}${classes ? "." + classes : ""}`;
  }
}
