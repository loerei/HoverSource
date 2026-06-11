import { SourceAdapter, SourceInfo, AncestorInfo } from "./types.js";

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

  /**
   * Walks up the DOM from `element`, collecting layout and source info for
   * each ancestor up to `maxDepth` levels. Returns ancestors ordered from
   * closest (index 0) to furthest.
   *
   * Always resolves: selector, display, position.
   * Resolves conditionally: layoutProps (flex/grid only), fileName/lineNumber/componentName (fiber only).
   */
  resolveAncestors(element: HTMLElement, maxDepth = 8): AncestorInfo[] {
    const results: AncestorInfo[] = [];
    let current: HTMLElement | null = element.parentElement;
    let depth = 0;

    while (current && current !== document.documentElement && depth < maxDepth) {
      try {
        const comp = globalThis.getComputedStyle(current);
        const display = comp.display || "block";
        const position = comp.position || "static";

        const info: AncestorInfo = {
          selector: this.buildSelector(current),
          display,
          position,
        };

        // Collect flex/grid layout props
        if (display === "flex" || display === "inline-flex") {
          info.layoutProps = {
            "flex-direction": comp.flexDirection,
            "justify-content": comp.justifyContent,
            "align-items": comp.alignItems,
            "gap": comp.gap,
            "flex-wrap": comp.flexWrap,
          };
        } else if (display === "grid" || display === "inline-grid") {
          info.layoutProps = {
            "grid-template-columns": comp.gridTemplateColumns,
            "grid-template-rows": comp.gridTemplateRows,
            "gap": comp.gap,
          };
        }

        // Attempt fiber source resolution
        const sourceInfo = this.resolve(current);
        if (sourceInfo) {
          info.fileName = sourceInfo.fileName;
          info.lineNumber = sourceInfo.lineNumber;
          info.componentName = sourceInfo.componentName;
        }

        results.push(info);
      } catch {
        // Skip elements where getComputedStyle throws (e.g. detached)
      }

      current = current.parentElement;
      depth++;
    }

    return results;
  }

  private buildSelector(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList)
      .filter(c => c && !c.startsWith("hoversource") && !c.startsWith("hs-"))
      .join(".");
    return `${tag}${id}${classes ? "." + classes : ""}`;
  }
}
