import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class SolidAdapter implements SourceAdapter {
  name = "solid";

  canResolve(element: HTMLElement): boolean {
    return !!(element.dataset && "sourceLoc" in element.dataset);
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const loc = element.dataset?.sourceLoc;
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
