import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata } from "./utils.js";

export class PreactAdapter implements SourceAdapter {
  name = "preact";

  private getVNode(element: HTMLElement): any {
    const keys = Object.keys(element);
    const vnodeKey = keys.find(
      (key) => key.startsWith("__v") || key.startsWith("__preact")
    );
    if (!vnodeKey) return null;
    return (element as any)[vnodeKey];
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getVNode(element);
  }

  private findComponentNameFromVNode(vnode: any): string | undefined {
    let parent = vnode.__; // Preact uses __ for parent reference
    while (parent) {
      if (parent.type && typeof parent.type === "function") {
        return parent.type.name || parent.type.displayName;
      }
      parent = parent.__;
    }
    return undefined;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    let vnode = this.getVNode(element);

    while (vnode) {
      const source = vnode.__source || (vnode.props && vnode.props.__source);
      if (source) {
        const componentName = this.findComponentNameFromVNode(vnode);

        return {
          fileName: source.fileName || "",
          lineNumber: source.lineNumber,
          columnNumber: source.columnNumber,
          componentName: componentName || (typeof vnode.type === "function" ? vnode.type.name : undefined),
          framework: "Preact",
          ...getElementMetadata(element)
        };
      }
      vnode = vnode.__;
    }

    return null;
  }
}
