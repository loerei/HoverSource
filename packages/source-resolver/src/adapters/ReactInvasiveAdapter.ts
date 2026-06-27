import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, getComponentNameFromFile, parseColonLocation } from "./utils.js";

const invasiveLocs = new WeakMap<HTMLElement, string>();

if (globalThis.window !== undefined && globalThis.document !== undefined) {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element
            const el = node as HTMLElement;
            const loc = el.dataset.hoversourceLoc;
            if (loc) {
              invasiveLocs.set(el, loc);
            }
            try {
              el.querySelectorAll("[data-hoversource-loc]").forEach((child) => {
                if (child instanceof HTMLElement) {
                  invasiveLocs.set(child, child.dataset.hoversourceLoc!);
                }
              });
            } catch {}
          }
        });
      } else if (m.type === "attributes" && m.attributeName === "data-hoversource-loc") {
        const el = m.target as HTMLElement;
        const loc = el.dataset.hoversourceLoc;
        if (loc) {
          invasiveLocs.set(el, loc);
        }
      }
    }
  });

  const scan = () => {
    try {
      document.querySelectorAll("[data-hoversource-loc]").forEach((el) => {
        if (el instanceof HTMLElement) {
          invasiveLocs.set(el, el.dataset.hoversourceLoc!);
        }
      });
    } catch {}
  };

  const startObserver = () => {
    scan();
    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-hoversource-loc"]
      });
    } catch {}
  };

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver);
  }
}

export class ReactInvasiveAdapter implements SourceAdapter {
  name = "react-invasive";

  canResolve(element: HTMLElement): boolean {
    return invasiveLocs.has(element) || !!(element.dataset && typeof element.dataset.hoversourceLoc === "string");
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const value = invasiveLocs.get(element) || element.dataset?.hoversourceLoc;
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
