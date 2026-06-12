import { SourceAdapter, SourceInfo } from "./types.js";

export class ReactFiberAdapter implements SourceAdapter {
  name = "react-fiber";

  private getFiber(element: HTMLElement): any {
    const keys = Object.keys(element);
    const fiberKey = keys.find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
    );
    if (!fiberKey) return null;
    return (element as any)[fiberKey];
  }

  canResolve(element: HTMLElement): boolean {
    return !!this.getFiber(element);
  }

  private findComponentNameFromFiber(fiber: any): string | undefined {
    let owner = fiber._debugOwner;
    while (owner) {
      if (owner.type && typeof owner.type === "function") {
        return owner.type.name || owner.type.displayName;
      } else if (owner.type && typeof owner.type === "string") {
        // HTML tag name
        owner = owner._debugOwner;
      } else if (owner.type && typeof owner.type === "object" && owner.type.render) {
        return owner.type.render.name || owner.type.displayName;
      } else {
        owner = owner._debugOwner;
      }
    }
    return undefined;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    let fiber = this.getFiber(element);

    // Walk up the fiber tree if the current node doesn't have a debug source,
    // as some wrapper divs or host elements might not have it directly.
    while (fiber) {
      const source = fiber._debugSource;
      if (source) {
        // Extract component name from owner
        const componentName = this.findComponentNameFromFiber(fiber);

        return {
          fileName: source.fileName,
          lineNumber: source.lineNumber,
          columnNumber: source.columnNumber,
          componentName: componentName || (typeof fiber.type === "function" ? fiber.type.name : undefined),
          framework: "React",
          tagName: element.tagName.toLowerCase(),
          classList: Array.from(element.classList)
        };
      }
      fiber = fiber.return;
    }

    return null;
  }


}
