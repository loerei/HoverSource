export function setupVanillaMonkeyPatch() {
  if (typeof document === "undefined") return;

  // Prevent double patching
  if ((globalThis as any).__HOVERSOURCE_VANILLA_PATCHED__) return;
  (globalThis as any).__HOVERSOURCE_VANILLA_PATCHED__ = true;

  const originalCreateElement = document.createElement;
  document.createElement = function (
    this: Document,
    tagName: string,
    options?: ElementCreationOptions
  ) {
    const el = originalCreateElement.call(this, tagName, options);
    const source = captureSourceLocation();
    if (source && (el as any).dataset) {
      (el as any).dataset.hsSource = source;
    }
    return el;
  };

  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (descriptor?.set) {
    const originalSet = descriptor.set;
    descriptor.set = function (this: Element, html: string) {
      originalSet.call(this, html);
      const source = captureSourceLocation();
      if (source) {
        if ((this as any).dataset) {
          (this as any).dataset.hsSource = source;
        }
        if (this.children) {
          for (const child of this.children) {
            if ((child as any).dataset) {
              (child as any).dataset.hsSource = source;
            }
          }
        }
      }
    };
    Object.defineProperty(Element.prototype, "innerHTML", descriptor);
  }
}

function isOverlayFrame(line: string): boolean {
  return (
    line.includes("hoversource-overlay.js") ||
    line.includes("overlay.bundle.js") ||
    line.includes("captureSourceLocation") ||
    line.includes("setupVanillaMonkeyPatch") ||
    line.includes("createElement") ||
    line.includes("innerHTML")
  );
}

function parseStackLine(line: string): string | null {
  const match = /([^\s(]+):(\d+):(\d+)/.exec(line);
  if (!match) return null;

  const urlStr = match[1];
  const ln = match[2];
  const col = match[3];
  try {
    let filePath = "";
    if (urlStr.startsWith("file://")) {
      filePath = urlStr.replace(/^file:\/\/\/?/, "");
      if (!/^[a-zA-Z]:/.test(filePath) && !filePath.startsWith("/")) {
        filePath = "/" + filePath;
      }
    } else if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      const url = new URL(urlStr);
      filePath = url.pathname;
    } else {
      filePath = urlStr;
    }
    return `${filePath}:${ln}:${col}`;
  } catch {
    return null;
  }
}

function captureSourceLocation(): string | null {
  const err = new Error();
  const stack = err.stack;
  if (!stack) return null;

  const lines = stack.split("\n");
  for (const line of lines) {
    if (!line.includes("at ")) continue;

    // Skip our own overlay/patch frames
    if (isOverlayFrame(line)) continue;

    const parsed = parseStackLine(line);
    if (parsed) return parsed;
  }
  return null;
}
