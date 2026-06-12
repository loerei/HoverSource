import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile } from "./utils.js";

export class SvelteAdapter implements SourceAdapter {
  name = "svelte";

  canResolve(element: HTMLElement): boolean {
    return !!(element as any).__svelte_meta;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const meta = (element as any).__svelte_meta;
    if (!meta || !meta.loc) return null;

    const { file, line, column } = meta.loc;

    return {
      fileName: file || "",
      lineNumber: typeof line === "number" ? line + 1 : undefined,
      columnNumber: typeof column === "number" ? column + 1 : undefined,
      componentName: getComponentNameFromFile(file),
      framework: "Svelte",
      ...getElementMetadata(element)
    };
  }
}
