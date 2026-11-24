import { SourceAdapter, SourceInfo } from "./types.js";
import { getElementMetadata, parseColonLocation } from "./utils.js";

export interface StaticHtmlMapEntry {
  tagName: string;
  id?: string;
  classList: string[];
  attributes: Record<string, string>;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

function matchStaticHtmlMap(element: HTMLElement): StaticHtmlMapEntry | null {
  const map: StaticHtmlMapEntry[] | undefined =
    (globalThis as any).__HOVERSOURCE_STATIC_HTML_MAP__ ||
    (typeof window !== "undefined" ? (window as any).__HOVERSOURCE_STATIC_HTML_MAP__ : undefined);

  if (!map || !Array.isArray(map) || map.length === 0) return null;

  const targetTag = element.tagName ? element.tagName.toLowerCase() : "";
  if (!targetTag) return null;

  const targetId = element.id || undefined;
  const targetClasses = element.classList
    ? Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"))
    : [];

  let bestMatch: StaticHtmlMapEntry | null = null;
  let bestScore = 0;

  for (const entry of map) {
    if (entry.tagName.toLowerCase() !== targetTag) continue;

    let score = 10;

    // 1. Match ID
    if (targetId) {
      if (entry.id === targetId) {
        score += 1000;
      } else {
        continue;
      }
    } else if (entry.id) {
      // Entry has ID but DOM element does not
      continue;
    }

    // 2. Match Classes
    if (targetClasses.length > 0 && entry.classList && entry.classList.length > 0) {
      let matched = 0;
      for (const cls of targetClasses) {
        if (entry.classList.includes(cls)) matched++;
      }
      if (matched > 0) {
        score += matched * 100;
      }
    }

    // 3. Match Attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (attr.name !== "id" && attr.name !== "class" && !attr.name.startsWith("data-hs-")) {
          if (entry.attributes && entry.attributes[attr.name] === attr.value) {
            score += 200;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

export class VanillaAdapter implements SourceAdapter {
  name = "vanilla";

  canResolve(element: HTMLElement): boolean {
    if (typeof element?.closest === "function" && !!element.closest("[data-hs-source]")) {
      return true;
    }
    if (matchStaticHtmlMap(element)) {
      return true;
    }
    // Fallback for any standard DOM element
    return !!element?.tagName;
  }

  resolve(element: HTMLElement): SourceInfo | null {
    const target = (typeof element?.closest === "function" ? element.closest("[data-hs-source]") : null) as HTMLElement | null;
    if (target) {
      const sourceAttr = target.dataset.hsSource;
      const parsed = parseColonLocation(sourceAttr);
      if (parsed) {
        return {
          fileName: parsed.fileName,
          lineNumber: parsed.lineNumber,
          columnNumber: parsed.columnNumber,
          framework: "Vanilla",
          ...getElementMetadata(element)
        };
      }
    }

    const staticMatch = matchStaticHtmlMap(element);
    if (staticMatch) {
      return {
        fileName: staticMatch.fileName,
        lineNumber: staticMatch.lineNumber,
        columnNumber: staticMatch.columnNumber,
        framework: "Vanilla",
        ...getElementMetadata(element)
      };
    }

    return {
      fileName: "",
      lineNumber: 0,
      columnNumber: 0,
      framework: "Vanilla",
      ...getElementMetadata(element)
    };
  }
}
