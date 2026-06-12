import { SourceAdapter, SourceInfo } from "./types.js";

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

    let componentName: string | undefined = undefined;
    const baseName = file.split(/[/\\\\]/).pop();
    if (baseName && baseName.endsWith(".astro")) {
      componentName = baseName.slice(0, -6);
    }

    return {
      fileName: file,
      lineNumber: line,
      columnNumber: column,
      componentName,
      framework: "Astro",
      tagName: element.tagName.toLowerCase(),
      classList: Array.from(element.classList)
    };
  }
}
