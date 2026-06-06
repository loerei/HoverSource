export function inspectVisualContext(element) {
    const parentEffects = [];
    const layoutConstraints = {};
    // 1. Inspect layout constraints on the element itself
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
    // 2. Traverse up parent hierarchy (up to 5 levels) to identify inherited visual/scrolling effects
    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 5) {
        const tagName = current.tagName.toLowerCase();
        if (tagName === "body" || tagName === "html") {
            break;
        }
        inspectParentElementStyle(current, parentEffects);
        current = current.parentElement;
        depth++;
    }
    return {
        parentEffects,
        layoutConstraints
    };
}
function checkMaskEffect(comp, tagName, classList, parentEffects) {
    const mask = comp.maskImage || comp.webkitMaskImage;
    if (mask && mask !== "none") {
        parentEffects.push({ tagName, classList, property: "mask-image", value: mask });
    }
}
function checkBackdropEffect(comp, tagName, classList, parentEffects) {
    const backdropFilter = comp.backdropFilter || comp.webkitBackdropFilter;
    if (backdropFilter && backdropFilter !== "none") {
        parentEffects.push({ tagName, classList, property: "backdrop-filter", value: backdropFilter });
    }
}
function checkFilterEffect(comp, tagName, classList, parentEffects) {
    if (comp.filter && comp.filter !== "none") {
        parentEffects.push({ tagName, classList, property: "filter", value: comp.filter });
    }
}
function checkOpacityEffect(comp, tagName, classList, parentEffects) {
    if (comp.opacity && comp.opacity !== "1" && comp.opacity !== "") {
        const opacityVal = Number.parseFloat(comp.opacity);
        if (opacityVal < 1) {
            parentEffects.push({ tagName, classList, property: "opacity", value: comp.opacity });
        }
    }
}
function checkOverflowEffect(comp, tagName, classList, parentEffects) {
    if (comp.overflowY && (comp.overflowY === "auto" || comp.overflowY === "scroll" || comp.overflowY === "hidden")) {
        parentEffects.push({ tagName, classList, property: "overflow-y", value: comp.overflowY });
    }
    if (comp.overflowX && (comp.overflowX === "auto" || comp.overflowX === "scroll" || comp.overflowX === "hidden")) {
        parentEffects.push({ tagName, classList, property: "overflow-x", value: comp.overflowX });
    }
}
function checkPositionEffect(comp, tagName, classList, parentEffects) {
    if (comp.position && (comp.position === "sticky" || comp.position === "fixed")) {
        parentEffects.push({ tagName, classList, property: "position", value: comp.position });
    }
}
function inspectParentElementStyle(current, parentEffects) {
    const tagName = current.tagName.toLowerCase();
    try {
        const comp = globalThis.getComputedStyle(current);
        const classList = Array.from(current.classList);
        checkMaskEffect(comp, tagName, classList, parentEffects);
        checkBackdropEffect(comp, tagName, classList, parentEffects);
        checkFilterEffect(comp, tagName, classList, parentEffects);
        checkOpacityEffect(comp, tagName, classList, parentEffects);
        checkOverflowEffect(comp, tagName, classList, parentEffects);
        checkPositionEffect(comp, tagName, classList, parentEffects);
    }
    catch (e) {
        console.warn(`[HoverSource] Failed to compute styles for parent element <${tagName}>`, e);
    }
}
