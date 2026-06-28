import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, parseColonLocation } from "./utils.js";

export class VanillaAdapter implements SourceAdapter {
  name = "vanilla";

  canResolve(element: HTMLElement): boolean {
    return typeof element.closest === "function" && !!element.closest("[data-hs-source]");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const target = element.closest("[data-hs-source]") as HTMLElement | null;
    if (!target) return null;

    const sourceAttr = target.dataset.hsSource;
    const parsed = parseColonLocation(sourceAttr);
    if (!parsed) return null;

    return {
      fileName: parsed.fileName,
      lineNumber: parsed.lineNumber,
      columnNumber: parsed.columnNumber,
      framework: "Vanilla",
      ...getElementMetadata(element)
    };
  }
}
