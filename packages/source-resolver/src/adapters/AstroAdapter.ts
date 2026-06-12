import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile } from "./utils.js";

export class AstroAdapter implements SourceAdapter {
  name = "astro";

  canResolve(element: HTMLElement): boolean {
    return typeof element.hasAttribute === "function" && element.hasAttribute("data-astro-source-file");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const file = element.getAttribute("data-astro-source-file");
    if (!file) return null;

    const loc = element.getAttribute("data-astro-source-loc");
    let line: number | undefined = undefined;
    let column: number | undefined = undefined;

    if (loc) {
      const parts = loc.split(":");
      if (parts.length === 2) {
        const l = Number.parseInt(parts[0], 10);
        const c = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(l)) line = l;
        if (!Number.isNaN(c)) column = c;
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
