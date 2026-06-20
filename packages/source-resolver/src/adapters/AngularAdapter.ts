import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata } from "./utils.js";

export class AngularAdapter implements SourceAdapter {
  name = "angular";

  private getNgContext(element: HTMLElement): any {
    return (element as any).__ngContext__;
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getNgContext(element) || 
      (element.dataset && "ngSourceFile" in element.dataset);
  }

  private resolveInvasive(element: HTMLElement): SourceInfo | null {
    const file = element.dataset.ngSourceFile;
    if (!file) return null;

    const lineStr = element.dataset.ngSourceLine;
    const columnStr = element.dataset.ngSourceColumn;
    const compName = element.dataset.ngComponent;
    const line = lineStr ? Number.parseInt(lineStr, 10) : Number.NaN;
    const column = columnStr ? Number.parseInt(columnStr, 10) : Number.NaN;

    return {
      fileName: file,
      lineNumber: Number.isNaN(line) ? undefined : line,
      columnNumber: Number.isNaN(column) ? undefined : column,
      componentName: compName || undefined,
      framework: "Angular",
      ...getElementMetadata(element)
    };
  }

  resolve(element: HTMLElement): SourceInfo | null {
    // 1. Check if invasive source mapping is present (if user sets up custom transformer/attributes)
    if (element.dataset && "ngSourceFile" in element.dataset) {
      return this.resolveInvasive(element);
    }

    // 2. Non-invasive mode: resolve via __ngContext__ / global ng utilities if available
    const context = this.getNgContext(element);
    if (context) {
      let componentName: string | undefined = undefined;
      const ng = (globalThis as any).ng;
      if (ng && typeof ng.getOwningComponent === "function") {
        try {
          const compInstance = ng.getOwningComponent(element);
          if (compInstance?.constructor) {
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
