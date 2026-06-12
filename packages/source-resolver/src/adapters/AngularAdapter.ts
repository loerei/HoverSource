import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata } from "./utils.js";

export class AngularAdapter implements SourceAdapter {
  name = "angular";

  private getNgContext(element: HTMLElement): any {
    return (element as any).__ngContext__;
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getNgContext(element) || 
      (typeof element.hasAttribute === "function" && element.hasAttribute("data-ng-source-file"));
  }

  resolve(element: HTMLElement): SourceInfo | null {
    // 1. Check if invasive source mapping is present (if user sets up custom transformer/attributes)
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-ng-source-file")) {
      const file = element.getAttribute("data-ng-source-file");
      if (file) {
        const lineStr = element.getAttribute("data-ng-source-line");
        const columnStr = element.getAttribute("data-ng-source-column");
        const compName = element.getAttribute("data-ng-component");
        const line = lineStr ? Number.parseInt(lineStr, 10) : NaN;
        const column = columnStr ? Number.parseInt(columnStr, 10) : NaN;

        return {
          fileName: file,
          lineNumber: !Number.isNaN(line) ? line : undefined,
          columnNumber: !Number.isNaN(column) ? column : undefined,
          componentName: compName || undefined,
          framework: "Angular",
          ...getElementMetadata(element)
        };
      }
    }

    // 2. Non-invasive mode: resolve via __ngContext__ / global ng utilities if available
    const context = this.getNgContext(element);
    if (context) {
      let componentName: string | undefined = undefined;
      const ng = (globalThis as any).ng;
      if (ng && typeof ng.getOwningComponent === "function") {
        try {
          const compInstance = ng.getOwningComponent(element);
          if (compInstance && compInstance.constructor) {
            componentName = compInstance.constructor.name;
          }
        } catch {
          // Ignore errors
        }
      }

      return {
        fileName: "", // Not resolvable at runtime in non-invasive mode
        componentName,
        framework: "Angular",
        ...getElementMetadata(element)
      };
    }

    return null;
  }
}
