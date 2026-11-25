import { isBundlerOrRuntimeFrame, parseV8StackLine, stripQueryAndHash, } from "@hoversource/source-resolver";
export function setupVanillaMonkeyPatch() {
    if (typeof document === "undefined")
        return;
    // Prevent double patching
    if (globalThis.__HOVERSOURCE_VANILLA_PATCHED__)
        return;
    globalThis.__HOVERSOURCE_VANILLA_PATCHED__ = true;
    if (typeof document.createElement === "function") {
        const originalCreateElement = document.createElement;
        document.createElement = function (tagName, options) {
            const el = originalCreateElement.call(this, tagName, options);
            const source = captureSourceLocation();
            if (source && el.dataset) {
                el.dataset.hsSource = source;
            }
            return el;
        };
    }
    if (typeof Element !== "undefined" && Element?.prototype) {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
        if (descriptor?.set) {
            const originalSet = descriptor.set;
            descriptor.set = function (html) {
                originalSet.call(this, html);
                const source = captureSourceLocation();
                if (source) {
                    if (this.dataset) {
                        this.dataset.hsSource = source;
                    }
                    if (this.children) {
                        for (const child of this.children) {
                            if (child.dataset) {
                                child.dataset.hsSource = source;
                            }
                        }
                    }
                }
            };
            Object.defineProperty(Element.prototype, "innerHTML", descriptor);
        }
    }
}
function isOverlayFrame(line) {
    return (line.includes("hoversource-overlay.js") ||
        line.includes("overlay.bundle.js") ||
        line.includes("captureSourceLocation") ||
        line.includes("setupVanillaMonkeyPatch") ||
        line.includes("createElement") ||
        line.includes("innerHTML"));
}
function captureSourceLocation() {
    const err = new Error();
    const stack = err.stack;
    if (!stack)
        return null;
    const lines = stack.split("\n");
    for (const line of lines) {
        if (!line.includes("at "))
            continue;
        // Skip our own overlay/patch frames and bundler/runtime internals
        if (isOverlayFrame(line) || isBundlerOrRuntimeFrame(line))
            continue;
        const parsed = parseV8StackLine(line);
        if (parsed) {
            const cleanFile = stripQueryAndHash(parsed.fileName);
            if (!cleanFile ||
                cleanFile === "<anonymous>" ||
                isBundlerOrRuntimeFrame(cleanFile)) {
                continue;
            }
            return `${cleanFile}:${parsed.lineNumber}:${parsed.columnNumber}`;
        }
    }
    return null;
}
