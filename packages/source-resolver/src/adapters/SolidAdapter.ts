import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class SolidAdapter implements SourceAdapter {
  name = "solid";

  canResolve(element: HTMLElement): boolean {
    return typeof element.hasAttribute === "function" && element.hasAttribute("data-source-loc");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const loc = element.getAttribute("data-source-loc");
    if (!loc) return null;

    const parsed = parseColonLocation(loc);
    if (parsed) {
      return {
        fileName: parsed.fileName,
        lineNumber: parsed.lineNumber,
        columnNumber: parsed.columnNumber,
        componentName: getComponentNameFromFile(parsed.fileName),
        framework: "SolidJS",
        ...getElementMetadata(element)
      };
    }

    return null;
  }
}
