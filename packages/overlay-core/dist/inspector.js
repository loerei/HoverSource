let contextCache = new WeakMap();
let parentStyleCache = new WeakMap();
export function clearInspectorCache() {
    contextCache = new WeakMap();
    parentStyleCache = new WeakMap();
}
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
    const observer = new MutationObserver(() => {
        clearInspectorCache();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
}
function inspectLayoutConstraints(element, layoutConstraints) {
    try {
        const computed = globalThis.getComputedStyle(element);
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
    }
    catch (e) {
        console.warn("[HoverSource] Failed to compute element layout constraints", e);
    }
}
export function inspectVisualContext(element, maxDepth = 32) {
    if (contextCache.has(element)) {
        return contextCache.get(element);
    }
    const parentEffects = [];
    const layoutConstraints = {};
    // 1. Inspect layout constraints on the element itself
    inspectLayoutConstraints(element, layoutConstraints);
    // 2. Traverse up parent hierarchy (up to maxDepth levels) to identify inherited visual/scrolling effects
    let current = element.parentElement;
    let depth = 0;
    const limit = Math.min(maxDepth, 100);
    while (current && depth < limit) {
        const tagName = current.tagName.toLowerCase();
        if (tagName === "body" || tagName === "html") {
            break;
        }
        inspectParentElementStyle(current, parentEffects);
        current = current.parentElement;
        depth++;
    }
    const result = {
        parentEffects,
        layoutConstraints
    };
    contextCache.set(element, result);
    return result;
}
function checkMaskEffect(comp, tagName, classList, parentEffects, current) {
    const mask = comp.maskImage || comp.webkitMaskImage;
    if (mask && mask !== "none") {
        parentEffects.push({ tagName, classList, property: "mask-image", value: mask, element: current });
    }
}
function checkBackdropEffect(comp, tagName, classList, parentEffects, current) {
    const backdropFilter = comp.backdropFilter || comp.webkitBackdropFilter;
    if (backdropFilter && backdropFilter !== "none") {
        parentEffects.push({ tagName, classList, property: "backdrop-filter", value: backdropFilter, element: current });
    }
}
function checkFilterEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.filter && comp.filter !== "none") {
        parentEffects.push({ tagName, classList, property: "filter", value: comp.filter, element: current });
    }
}
function checkOpacityEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.opacity && comp.opacity !== "1" && comp.opacity !== "") {
        const opacityVal = Number.parseFloat(comp.opacity);
        if (opacityVal < 1) {
            parentEffects.push({ tagName, classList, property: "opacity", value: comp.opacity, element: current });
        }
    }
}
function checkOverflowEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.overflowY && (comp.overflowY === "auto" || comp.overflowY === "scroll" || comp.overflowY === "hidden")) {
        parentEffects.push({ tagName, classList, property: "overflow-y", value: comp.overflowY, element: current });
    }
    if (comp.overflowX && (comp.overflowX === "auto" || comp.overflowX === "scroll" || comp.overflowX === "hidden")) {
        parentEffects.push({ tagName, classList, property: "overflow-x", value: comp.overflowX, element: current });
    }
}
function checkPositionEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.position && (comp.position === "sticky" || comp.position === "fixed" || comp.position === "relative" || comp.position === "absolute")) {
        parentEffects.push({ tagName, classList, property: "position", value: comp.position, element: current });
    }
}
function checkDisplayEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.display && (comp.display === "flex" || comp.display === "grid")) {
        parentEffects.push({ tagName, classList, property: "display", value: comp.display, element: current });
    }
}
function checkTransformEffect(comp, tagName, classList, parentEffects, current) {
    if (comp.transform && comp.transform !== "none" && comp.transform !== "") {
        parentEffects.push({ tagName, classList, property: "transform", value: comp.transform, element: current });
    }
}
function checkClipPathEffect(comp, tagName, classList, parentEffects, current) {
    const clipPath = comp.clipPath || comp.webkitClipPath;
    if (clipPath && clipPath !== "none" && clipPath !== "") {
        parentEffects.push({ tagName, classList, property: "clip-path", value: clipPath, element: current });
    }
}
function inspectParentElementStyle(current, parentEffects) {
    if (parentStyleCache.has(current)) {
        parentEffects.push(...parentStyleCache.get(current));
        return;
    }
    const effects = [];
    const tagName = current.tagName.toLowerCase();
    try {
        const comp = globalThis.getComputedStyle(current);
        const classList = Array.from(current.classList);
        checkMaskEffect(comp, tagName, classList, effects, current);
        checkBackdropEffect(comp, tagName, classList, effects, current);
        checkFilterEffect(comp, tagName, classList, effects, current);
        checkOpacityEffect(comp, tagName, classList, effects, current);
        checkOverflowEffect(comp, tagName, classList, effects, current);
        checkPositionEffect(comp, tagName, classList, effects, current);
        checkDisplayEffect(comp, tagName, classList, effects, current);
        checkTransformEffect(comp, tagName, classList, effects, current);
        checkClipPathEffect(comp, tagName, classList, effects, current);
        parentStyleCache.set(current, effects);
        parentEffects.push(...effects);
    }
    catch (e) {
        console.warn(`[HoverSource] Failed to compute styles for parent element <${tagName}>`, e);
    }
}
