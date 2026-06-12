import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class VueAdapter implements SourceAdapter {
  name = "vue";

  private getVueInstance(element: HTMLElement): any {
    // Vue 3 attaches the parent component instance to '__vueParentComponent'
    return (element as any).__vueParentComponent;
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getVueInstance(element) || 
      (typeof element.hasAttribute === "function" && 
        (element.hasAttribute("data-v-inspector") || element.hasAttribute("data-v-inspector-file"))
      );
  }

  resolve(element: HTMLElement): SourceInfo | null {
    // 1. Check if individual invasive inspector attributes are present
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-v-inspector-file")) {
      const file = typeof element.getAttribute === "function" ? element.getAttribute("data-v-inspector-file") : null;
      if (file) {
        const lineStr = typeof element.getAttribute === "function" ? element.getAttribute("data-v-inspector-line") : null;
        const columnStr = typeof element.getAttribute === "function" ? element.getAttribute("data-v-inspector-column") : null;
        const line = lineStr ? Number.parseInt(lineStr, 10) : NaN;
        const column = columnStr ? Number.parseInt(columnStr, 10) : NaN;

        return {
          fileName: file,
          lineNumber: !Number.isNaN(line) ? line : undefined,
          columnNumber: !Number.isNaN(column) ? column : undefined,
          componentName: getComponentNameFromFile(file),
          framework: "Vue",
          ...getElementMetadata(element)
        };
      }
    }

    // 2. Check if single combined invasive inspector attribute is present
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-v-inspector")) {
      const value = typeof element.getAttribute === "function" ? element.getAttribute("data-v-inspector") : null;
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
