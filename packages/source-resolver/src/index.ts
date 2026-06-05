import { SourceAdapter, SourceInfo } from "./adapters/types.js";
import { ReactFiberAdapter } from "./adapters/ReactFiberAdapter.js";

export * from "./adapters/types.js";
export * from "./adapters/ReactFiberAdapter.js";

export class SourceResolver {
  private adapters: SourceAdapter[] = [];

  constructor() {
    // Register default adapters
    this.adapters.push(new ReactFiberAdapter());
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
}
