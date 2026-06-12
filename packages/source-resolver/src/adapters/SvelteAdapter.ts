import { SourceAdapter, SourceInfo } from "./types.js";

export class SvelteAdapter implements SourceAdapter {
  name = "svelte";

  canResolve(element: HTMLElement): boolean {
    return !!(element as any).__svelte_meta;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const meta = (element as any).__svelte_meta;
    if (!meta || !meta.loc) return null;

    const { file, line, column } = meta.loc;
    
    // Infer component name from the filename (e.g. "MyButton.svelte" -> "MyButton")
    let componentName: string | undefined = undefined;
    if (file) {
      const baseName = file.split(/[/\\]/).pop();
      if (baseName && baseName.endsWith(".svelte")) {
        componentName = baseName.slice(0, -7);
      }
    }

    return {
      fileName: file || "",
      lineNumber: typeof line === "number" ? line + 1 : undefined,
      columnNumber: typeof column === "number" ? column + 1 : undefined,
      componentName,
      framework: "Svelte",
      tagName: element.tagName.toLowerCase(),
      classList: Array.from(element.classList)
    };
  }
}
