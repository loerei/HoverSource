import { SourceAdapter, SourceInfo, AncestorInfo } from "./adapters/types.js";
import { ReactFiberAdapter } from "./adapters/ReactFiberAdapter.js";

export * from "./adapters/types.js";
export * from "./adapters/ReactFiberAdapter.js";

export class SourceResolver {
  private readonly adapters: SourceAdapter[] = [];
  private readonly fiberAdapter: ReactFiberAdapter;

  constructor() {
    // Register default adapters
    this.fiberAdapter = new ReactFiberAdapter();
    this.adapters.push(this.fiberAdapter);
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
   * each ancestor (up to `maxDepth` levels). Delegates to the React fiber
   * adapter for source resolution; display/position are always resolved via
   * getComputedStyle regardless of framework.
   */
  resolveAncestors(element: HTMLElement, maxDepth = 8): AncestorInfo[] {
    return this.fiberAdapter.resolveAncestors(element, maxDepth);
  }
}
