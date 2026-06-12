import { SourceAdapter, SourceInfo } from "./types.js";

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

        let componentName: string | undefined = undefined;
        const baseName = file.split(/[/\\]/).pop();
        if (baseName && baseName.endsWith(".vue")) {
          componentName = baseName.slice(0, -4);
        }

        return {
          fileName: file,
          lineNumber: !Number.isNaN(line) ? line : undefined,
          columnNumber: !Number.isNaN(column) ? column : undefined,
          componentName,
          framework: "Vue",
          tagName: element.tagName.toLowerCase(),
          classList: element.classList ? Array.from(element.classList) : []
        };
      }
    }

    // 2. Check if single combined invasive inspector attribute is present
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-v-inspector")) {
      const value = typeof element.getAttribute === "function" ? element.getAttribute("data-v-inspector") : null;
      if (value) {
        // Format of data-v-inspector is file:line:column
        const parts = value.split(":");
        if (parts.length >= 3) {
          const columnStr = parts.pop() || "";
          const lineStr = parts.pop() || "";
          const file = parts.join(":");
          
          const line = Number.parseInt(lineStr, 10);
          const column = Number.parseInt(columnStr, 10);

          let componentName: string | undefined = undefined;
          if (file) {
            const baseName = file.split(/[/\\]/).pop();
            if (baseName && baseName.endsWith(".vue")) {
              componentName = baseName.slice(0, -4);
            }
          }

          return {
            fileName: file,
            lineNumber: !Number.isNaN(line) ? line : undefined,
            columnNumber: !Number.isNaN(column) ? column : undefined,
            componentName,
            framework: "Vue",
            tagName: element.tagName.toLowerCase(),
            classList: element.classList ? Array.from(element.classList) : []
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
          tagName: element.tagName.toLowerCase(),
          classList: Array.from(element.classList)
        };
      }
      instance = instance.parent;
    }

    return null;
  }
}
