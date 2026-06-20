import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class VueAdapter implements SourceAdapter {
  name = "vue";

  private getVueInstance(element: HTMLElement): any {
    // Vue 3 attaches the parent component instance to '__vueParentComponent'
    return (element as any).__vueParentComponent;
  }

  private resolveInvasiveFile(element: HTMLElement, dataset: DOMStringMap): SourceInfo | null {
    const file = dataset.vInspectorFile;
    if (file) {
      const lineStr = dataset.vInspectorLine;
      const columnStr = dataset.vInspectorColumn;
      const line = lineStr ? Number.parseInt(lineStr, 10) : NaN;
      const column = columnStr ? Number.parseInt(columnStr, 10) : NaN;

      return {
        fileName: file,
        lineNumber: Number.isNaN(line) ? undefined : line,
        columnNumber: Number.isNaN(column) ? undefined : column,
        componentName: getComponentNameFromFile(file),
        framework: "Vue",
        ...getElementMetadata(element)
      };
    }
    return null;
  }

  private resolveInvasiveCombined(element: HTMLElement, dataset: DOMStringMap): SourceInfo | null {
    const value = dataset.vInspector;
    if (value) {
      const parsed = parseColonLocation(value);
      if (parsed) {
        return {
          fileName: parsed.fileName,
          lineNumber: parsed.lineNumber,
          columnNumber: parsed.columnNumber,
          componentName: getComponentNameFromFile(parsed.fileName),
          framework: "Vue",
          ...getElementMetadata(element)
        };
      }
    }
    return null;
  }

  canResolve(element: HTMLElement): boolean {
    if (this.getVueInstance(element)) return true;
    return !!(element.dataset && ("vInspector" in element.dataset || "vInspectorFile" in element.dataset));
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const dataset = element.dataset;
    if (dataset) {
      if ("vInspectorFile" in dataset) {
        const res = this.resolveInvasiveFile(element, dataset);
        if (res) return res;
      }
      if ("vInspector" in dataset) {
        const res = this.resolveInvasiveCombined(element, dataset);
        if (res) return res;
      }
    }

    // 2. Fallback to non-invasive runtime lookup
    let instance = this.getVueInstance(element);

    // Walk up the component hierarchy if needed to find file information
    while (instance) {
      const type = instance.type;
      if (type && (type.__file || type.name || type.__name)) {
        const componentName = type.name || type.__name;
        
        return {
          fileName: type.__file || "",
          componentName: componentName || undefined,
          framework: "Vue",
          ...getElementMetadata(element)
        };
      }
      instance = instance.parent;
    }

    return null;
  }
}
