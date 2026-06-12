import { SourceAdapter, SourceInfo } from "./types.js";

export class VueAdapter implements SourceAdapter {
  name = "vue";

  private getVueInstance(element: HTMLElement): any {
    // Vue 3 attaches the parent component instance to '__vueParentComponent'
    return (element as any).__vueParentComponent;
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getVueInstance(element);
  }

  resolve(element: HTMLElement): SourceInfo | null {
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
