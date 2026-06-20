import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

export class ReactInvasiveAdapter implements SourceAdapter {
  name = "react-invasive";

  canResolve(element: HTMLElement): boolean {
    return !!(element.dataset && typeof element.dataset.hoversourceLoc === "string");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const value = element.dataset?.hoversourceLoc;
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
    return null;
  }
}
