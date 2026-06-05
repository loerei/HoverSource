import { VisualContext, ParentVisualEffect } from "@hoversource/source-resolver";

export function inspectVisualContext(element: HTMLElement): VisualContext {
  const parentEffects: ParentVisualEffect[] = [];
  const layoutConstraints: Record<string, string> = {};

  // 1. Inspect layout constraints on the element itself
  try {
    const computed = window.getComputedStyle(element);
    
    if (computed.position && computed.position !== "static") {
      layoutConstraints["position"] = computed.position;
    }
    if (computed.flexGrow && computed.flexGrow !== "0") {
      layoutConstraints["flex-grow"] = computed.flexGrow;
    }
    if (computed.alignSelf && computed.alignSelf !== "auto" && computed.alignSelf !== "normal") {
      layoutConstraints["align-self"] = computed.alignSelf;
    }
    if (computed.gridColumn && computed.gridColumn !== "auto") {
      layoutConstraints["grid-column"] = computed.gridColumn;
    }
    if (computed.display && computed.display !== "inline" && computed.display !== "block") {
      layoutConstraints["display"] = computed.display;
    }
  } catch (e) {
    console.warn("[HoverSource] Failed to compute element layout constraints", e);
  }

  // 2. Traverse up parent hierarchy (up to 5 levels) to identify inherited visual/scrolling effects
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;

  while (current && depth < 5) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === "body" || tagName === "html") {
      break;
    }

    try {
      const comp = window.getComputedStyle(current);
      const classList = Array.from(current.classList);

      // Check mask-image / -webkit-mask-image
      const mask = comp.maskImage || (comp as any).webkitMaskImage;
      if (mask && mask !== "none") {
        parentEffects.push({
          tagName,
          classList,
          property: "mask-image",
          value: mask
        });
      }

      // Check backdrop-filter / -webkit-backdrop-filter
      const backdropFilter = comp.backdropFilter || (comp as any).webkitBackdropFilter;
      if (backdropFilter && backdropFilter !== "none") {
        parentEffects.push({
          tagName,
          classList,
          property: "backdrop-filter",
          value: backdropFilter
        });
      }

      // Check filter
      if (comp.filter && comp.filter !== "none") {
        parentEffects.push({
          tagName,
          classList,
          property: "filter",
          value: comp.filter
        });
      }

      // Check opacity
      if (comp.opacity && comp.opacity !== "1" && comp.opacity !== "") {
        const opacityVal = parseFloat(comp.opacity);
        if (opacityVal < 1) {
          parentEffects.push({
            tagName,
            classList,
            property: "opacity",
            value: comp.opacity
          });
        }
      }

      // Check overflow (scroll containers)
      if (comp.overflowY && (comp.overflowY === "auto" || comp.overflowY === "scroll" || comp.overflowY === "hidden")) {
        parentEffects.push({
          tagName,
          classList,
          property: "overflow-y",
          value: comp.overflowY
        });
      }
      if (comp.overflowX && (comp.overflowX === "auto" || comp.overflowX === "scroll" || comp.overflowX === "hidden")) {
        parentEffects.push({
          tagName,
          classList,
          property: "overflow-x",
          value: comp.overflowX
        });
      }

      // Check position: sticky / fixed
      if (comp.position && (comp.position === "sticky" || comp.position === "fixed")) {
        parentEffects.push({
          tagName,
          classList,
          property: "position",
          value: comp.position
        });
      }

    } catch (e) {
      console.warn(`[HoverSource] Failed to compute styles for parent element <${tagName}>`, e);
    }

    current = current.parentElement;
    depth++;
  }

  return {
    parentEffects,
    layoutConstraints
  };
}
