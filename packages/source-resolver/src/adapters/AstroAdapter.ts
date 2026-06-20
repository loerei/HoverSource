import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile } from "./utils.js";

export class AstroAdapter implements SourceAdapter {
  name = "astro";

  canResolve(element: HTMLElement): boolean {
    return !!(element.dataset && "astroSourceFile" in element.dataset);
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const file = element.dataset?.astroSourceFile;
    if (!file) return null;

    const loc = element.dataset.astroSourceLoc;
    let line: number | undefined = undefined;
    let column: number | undefined = undefined;

    if (loc) {
      const parts = loc.split(":");
      if (parts.length === 2) {
        const l = Number.parseInt(parts[0], 10);
        const c = Number.parseInt(parts[1], 10);
        if (Number.isInteger(l)) line = l;
        if (Number.isInteger(c)) column = c;
      }
    }

    return {
      fileName: file,
      lineNumber: line,
      columnNumber: column,
      componentName: getComponentNameFromFile(file),
      framework: "Astro",
      ...getElementMetadata(element)
    };
  }
}
