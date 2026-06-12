export function getElementMetadata(element: HTMLElement) {
  return {
    tagName: element.tagName.toLowerCase(),
    classList: element.classList ? Array.from(element.classList) : []
  };
}

export function getComponentNameFromFile(
  file: string | null | undefined,
  extensions = [".vue", ".svelte", ".astro", ".tsx", ".jsx", ".ts", ".js"]
): string | undefined {
  if (!file) return undefined;
  const baseName = file.split(/[/\\\\]/).pop();
  if (!baseName) return undefined;

  for (const ext of extensions) {
    if (baseName.endsWith(ext)) {
      return baseName.slice(0, -ext.length);
    }
  }

  const dotIdx = baseName.lastIndexOf(".");
  if (dotIdx !== -1) {
    return baseName.slice(0, dotIdx);
  }
  return baseName;
}

export function parseColonLocation(loc: string | null | undefined): {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
} | null {
  if (!loc) return null;
  const parts = loc.split(":");
  if (parts.length >= 3) {
    const columnStr = parts.pop() || "";
    const lineStr = parts.pop() || "";
    const file = parts.join(":");

    const line = Number.parseInt(lineStr, 10);
    const column = Number.parseInt(columnStr, 10);

    return {
      fileName: file,
      lineNumber: !Number.isNaN(line) ? line : undefined,
      columnNumber: !Number.isNaN(column) ? column : undefined
    };
  }
  return null;
}
