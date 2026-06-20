import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class ReactInvasiveAdapter implements SourceAdapter {
  name = "react-invasive";

  canResolve(element: HTMLElement): boolean {
    return typeof element.hasAttribute === "function" && element.hasAttribute("data-hoversource-loc");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    if (typeof element.hasAttribute === "function" && element.hasAttribute("data-hoversource-loc")) {
      const value = typeof element.getAttribute === "function" ? element.getAttribute("data-hoversource-loc") : null;
      if (value) {
        const parsed = parseColonLocation(value);
        if (parsed) {
          return {
            fileName: parsed.fileName,
            lineNumber: parsed.lineNumber,
            columnNumber: parsed.columnNumber,
            componentName: getComponentNameFromFile(parsed.fileName),
            framework: "React",
            ...getElementMetadata(element)
          };
        }
      }
    }
    return null;
  }
}
