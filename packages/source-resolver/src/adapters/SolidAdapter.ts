import { SourceAdapter, SourceInfo } from "./types.js";

export class SolidAdapter implements SourceAdapter {
  name = "solid";

  canResolve(element: HTMLElement): boolean {
    return typeof element.hasAttribute === "function" && element.hasAttribute("data-source-loc");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const loc = element.getAttribute("data-source-loc");
    if (!loc) return null;

    const parts = loc.split(":");
    if (parts.length >= 3) {
      const columnStr = parts.pop() || "";
      const lineStr = parts.pop() || "";
      const file = parts.join(":");

      const line = Number.parseInt(lineStr, 10);
      const column = Number.parseInt(columnStr, 10);

      let componentName: string | undefined = undefined;
      if (file) {
        const baseName = file.split(/[/\\\\]/).pop();
        if (baseName) {
          const dotIdx = baseName.lastIndexOf(".");
          if (dotIdx !== -1) {
            componentName = baseName.slice(0, dotIdx);
          } else {
            componentName = baseName;
          }
        }
      }

      return {
        fileName: file,
        lineNumber: !Number.isNaN(line) ? line : undefined,
        columnNumber: !Number.isNaN(column) ? column : undefined,
        componentName,
        framework: "SolidJS",
        tagName: element.tagName.toLowerCase(),
        classList: Array.from(element.classList)
      };
    }

    return null;
  }
}
