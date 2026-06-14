import { InspectorAdapter } from "./modes/InspectorAdapter.js";
import { DesignAdapter } from "./modes/DesignAdapter.js";
function getCompanionPort() {
    return globalThis.__HOVERSOURCE_PORT__ ?? 3000;
}
class OverlayEngine {
    config = null;
    container = null;
    outlineBox = null;
    tooltipBox = null;
    parentHighlightElements = [];
    uiVisible = true;
    isFrozen = false;
    freezeStyle = null;
    inspectorMode = new InspectorAdapter();
    designMode = new DesignAdapter();
    activeMode = this.inspectorMode;
    constructor() { }
    static async launch() {
        const engine = new OverlayEngine();
        await engine.init();
        return engine;
    }
    async init() {
        await this.loadConfig();
        this.initStyles();
        this.createUI();
        this.initShortcuts();
        this.activeMode.activate(this);
        globalThis.addEventListener("pointerover", this.handlePointerOver, { capture: true });
        globalThis.addEventListener("pointermove", this.handlePointerMove, { capture: true });
        globalThis.addEventListener("message", (e) => {
            if (e.origin === globalThis.location.origin &&
                e.source === globalThis &&
                e.data?.type === "HOVERSOURCE_CONFIG_CHANGED") {
                this.handleConfigUpdate(e.data.config);
            }
        });
    }
    handleConfigUpdate(newConfig) {
        console.log("[HoverSource] Live reloading config...", newConfig);
        this.config = newConfig;
        const oldStyle = document.getElementById("hoversource-styles");
        if (oldStyle)
            oldStyle.remove();
        this.initStyles();
        this.activeMode.onConfigUpdate(newConfig);
    }
    async loadConfig() {
        try {
            const res = await fetch(`http://127.0.0.1:${getCompanionPort()}/config`);
            const data = await res.json();
            this.config = data.config;
            console.log("[HoverSource] Configuration loaded from companion server:", this.config);
        }
        catch (e) {
            console.warn("[HoverSource] Failed to fetch config, falling back to defaults", e);
            this.config = {
                theme: "dark",
                minimalModeByDefault: false,
                snappingThreshold: 15,
                desnappingThreshold: 15,
                maxTraversalDepth: 32,
                shortcuts: {
                    toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false },
                    toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false },
                    toggleFreeze: { key: "p", altKey: true, ctrlKey: false, shiftKey: false },
                    copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false },
                    openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false },
                    toggleMode: { key: "x", altKey: true, ctrlKey: false, shiftKey: false }
                }
            };
        }
    }
    initStyles() {
        const isLightTheme = this.config?.theme === "light" ||
            (this.config?.theme === "system" && !globalThis.matchMedia("(prefers-color-scheme: dark)").matches);
        const style = document.createElement("style");
        style.id = "hoversource-styles";
        style.innerHTML = `
      .hoversource-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .hoversource-outline {
        position: absolute;
        border: 2px dashed #3b82f6;
        background-color: rgba(59, 130, 246, 0.1);
        transition: all 0.05s ease-out;
        pointer-events: none;
        box-sizing: border-box;
      }
      .hoversource-parent-outline {
        position: absolute;
        border: 2px dashed #a855f7;
        background-color: rgba(168, 85, 247, 0.05);
        pointer-events: none;
        box-sizing: border-box;
        z-index: 999998;
      }
      .hoversource-parent-svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 999999;
      }
      .hoversource-leader-line {
        stroke: #a855f7;
        stroke-width: 1.5;
        fill: none;
        stroke-dasharray: 2 2;
      }
      .hoversource-leader-dot {
        fill: #a855f7;
        stroke: #c084fc;
        stroke-width: 1.5;
      }
      .hoversource-parent-badge {
        position: absolute;
        background: #a855f7;
        color: #ffffff;
        font-size: 10px;
        font-family: monospace;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.35);
        pointer-events: auto;
        white-space: nowrap;
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .hoversource-parent-badge-title {
        border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        padding-bottom: 1px;
        margin-bottom: 2px;
        font-weight: bold;
      }
      .hoversource-parent-badge-effect {
        font-size: 9px;
        color: #f3e8ff;
      }
      .hoversource-tooltip {
        position: absolute;
        background: ${isLightTheme ? "rgba(255, 255, 255, 0.96)" : "rgba(18, 18, 18, 0.95)"};
        backdrop-filter: blur(8px);
        border: 1px solid ${isLightTheme ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)"};
        color: ${isLightTheme ? "#1f2937" : "#f3f4f6"};
        padding: 12px;
        border-radius: 8px;
        font-size: 11px;
        max-width: 460px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
        z-index: 1000000;
        line-height: 1.4;
      }
      .hoversource-title {
        font-weight: bold;
        font-size: 13px;
        color: #3b82f6;
        margin-bottom: 6px;
        border-bottom: 1px solid ${isLightTheme ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)"};
        padding-bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hoversource-framework {
        font-size: 9px;
        background: #1e3a8a;
        color: #93c5fd;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .hoversource-section { margin-top: 6px; }
      .hoversource-label { color: ${isLightTheme ? "#6b7280" : "#9ca3af"}; font-weight: 500; }
      .hoversource-value { font-family: monospace; color: #10b981; word-break: break-all; }
      .hoversource-link { color: #2563eb; text-decoration: underline; cursor: pointer; }
      .hoversource-link:hover { color: #3b82f6; }
      .hoversource-stack { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
      .hoversource-stack-item {
        font-family: monospace;
        color: ${isLightTheme ? "#374151" : "#e5e7eb"};
        background: ${isLightTheme ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)"};
        padding: 2px 4px;
        border-radius: 3px;
      }
      .hs-layer-column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding-top: 4px;
        flex-shrink: 0;
      }
      .hs-layer-dot {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 12px;
        cursor: pointer;
        border-radius: 3px;
        position: relative;
        margin-top: -7px;
        transition: transform 0.12s, z-index 0.12s;
      }
      .hs-layer-dot:first-child {
        margin-top: 0;
      }
      .hs-layer-dot:hover {
        transform: translateY(-3px);
        z-index: 100 !important;
      }
      .hs-layer-dot svg {
        overflow: visible;
      }
      .hs-layer-shape {
        fill: ${isLightTheme ? '#e5e7eb' : '#262626'};
        stroke: ${isLightTheme ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'};
        stroke-width: 1.5;
        transition: fill 0.12s, stroke 0.12s;
      }
      .hs-layer-dot:hover .hs-layer-shape {
        fill: ${isLightTheme ? '#d1d5db' : '#3f3f46'};
        stroke: ${isLightTheme ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'};
      }
      .hs-layer-dot--active .hs-layer-shape {
        fill: #3b82f6;
        stroke: #60a5fa;
      }
      .hs-layer-dot--active:hover .hs-layer-shape {
        fill: #2563eb;
        stroke: #3b82f6;
      }
      .hs-layer-dot--active svg {
        filter: drop-shadow(0 1px 3px rgba(59, 130, 246, 0.4));
      }
      .hs-layer-hint {
        font-size: 8px;
        color: ${isLightTheme ? '#9ca3af' : '#6b7280'};
        text-align: center;
        margin-top: 2px;
        white-space: nowrap;
      }
      .hs-tooltip-content-wrapper {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .hoversource-tooltip.hs-tooltip-above .hs-tooltip-content-wrapper {
        align-items: flex-end;
      }
      .hoversource-shortcut-hint {
        margin-top: 8px;
        font-size: 9px;
        color: #6b7280;
        text-align: right;
        border-top: 1px dashed ${isLightTheme ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)"};
        padding-top: 4px;
      }
    `;
        document.head.appendChild(style);
    }
    createUI() {
        if (this.container)
            return;
        this.container = document.createElement("div");
        this.container.className = "hoversource-container";
        this.outlineBox = document.createElement("div");
        this.outlineBox.className = "hoversource-outline";
        this.outlineBox.style.display = "none";
        this.container.appendChild(this.outlineBox);
        this.tooltipBox = document.createElement("div");
        this.tooltipBox.className = "hoversource-tooltip";
        this.tooltipBox.style.display = "none";
        this.container.appendChild(this.tooltipBox);
        document.body.appendChild(this.container);
    }
    initShortcuts() {
        globalThis.addEventListener("keydown", this.handleKeyDown);
    }
    handleKeyDown = (e) => {
        const shortcuts = this.config?.shortcuts;
        if (!shortcuts)
            return;
        if (this.matchShortcut(e, shortcuts.toggleUI)) {
            e.preventDefault();
            this.uiVisible = !this.uiVisible;
            if (this.container) {
                this.container.style.display = this.uiVisible ? "block" : "none";
            }
            console.log(`[HoverSource] UI Tooltip Visibility: ${this.uiVisible ? "visible" : "hidden"} (Background tracking active)`);
            this.activeMode.onUIVisibilityChanged(this.uiVisible);
            return;
        }
        if (this.isTyping(e))
            return;
        // Hardcoded fallback for toggleMode if not in config
        const toggleModeShortcut = shortcuts.toggleMode || { key: "x", altKey: true, ctrlKey: false, shiftKey: false };
        if (this.matchShortcut(e, shortcuts.openDashboard)) {
            e.preventDefault();
            console.log("[HoverSource] Shortcut matched: openDashboard");
            this.openDashboardInBrowser();
        }
        else if (this.matchShortcut(e, toggleModeShortcut)) {
            e.preventDefault();
            this.switchMode();
        }
        else if (this.matchShortcut(e, shortcuts.toggleMinimal)) {
            e.preventDefault();
            this.activeMode.onShortcut('toggleMinimal');
        }
        else if (this.matchShortcut(e, shortcuts.toggleFreeze)) {
            e.preventDefault();
            this.activeMode.onShortcut('toggleFreeze');
        }
        else if (this.matchShortcut(e, shortcuts.copyMetadata)) {
            e.preventDefault();
            this.activeMode.onShortcut('copyMetadata');
        }
        else if (this.matchShortcut(e, shortcuts.copyAllLayers || { key: "c", altKey: true, ctrlKey: false, shiftKey: true })) {
            e.preventDefault();
            this.activeMode.onShortcut('copyAllLayers');
        }
    };
    switchMode() {
        this.activeMode.deactivate();
        this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
        this.activeMode.activate(this);
    }
    openDashboardInBrowser() {
        fetch(`http://127.0.0.1:${getCompanionPort()}/open-dashboard`)
            .then(r => r.json())
            .then(data => {
            if (data.success) {
                console.log("[HoverSource] Triggered dashboard browser open.");
            }
            else {
                console.error("[HoverSource] Failed to open dashboard:", data.error);
            }
        })
            .catch(e => {
            console.error("[HoverSource] Failed to request dashboard open:", e);
        });
    }
    matchShortcut(e, shortcut) {
        if (!shortcut?.key)
            return false;
        if (!!e.altKey !== !!shortcut.altKey || !!e.ctrlKey !== !!shortcut.ctrlKey || !!e.shiftKey !== !!shortcut.shiftKey)
            return false;
        const targetKey = shortcut.key.toLowerCase();
        const keyMatch = e.key.toLowerCase() === targetKey;
        const codeMatch = e.code && (e.code.toLowerCase() === targetKey ||
            e.code.toLowerCase() === `key${targetKey}` ||
            e.code.toLowerCase() === `digit${targetKey}`);
        return keyMatch || !!codeMatch;
    }
    isTyping(e) {
        const activeEl = document.activeElement;
        if (!activeEl)
            return false;
        const tag = activeEl.tagName.toLowerCase();
        return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
    }
    handlePointerOver = (e) => {
        const target = e.target;
        if (!target || target === this.container || this.container?.contains(target)) {
            if (this.isFrozen) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
            return;
        }
        this.activeMode.onPointerOver(e, target);
        if (this.isFrozen) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    handlePointerMove = (e) => {
        this.activeMode.onPointerMove(e);
        if (this.isFrozen) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    blockEvent = (e) => {
        if (this.container?.contains(e.target))
            return;
        e.stopImmediatePropagation();
        e.preventDefault();
    };
    // --- OverlayController Implementation ---
    drawHighlight(target, isFrozen) {
        if (!this.outlineBox)
            return;
        const rect = target.getBoundingClientRect();
        this.outlineBox.style.width = `${rect.width}px`;
        this.outlineBox.style.height = `${rect.height}px`;
        this.outlineBox.style.left = `${rect.left}px`;
        this.outlineBox.style.top = `${rect.top}px`;
        this.outlineBox.style.display = "block";
        this.outlineBox.style.borderColor = isFrozen ? "#f59e0b" : "#3b82f6";
        this.outlineBox.style.backgroundColor = isFrozen ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.1)";
    }
    drawTooltip(html, pointerEvent) {
        if (!this.tooltipBox)
            return;
        if (html) {
            this.tooltipBox.innerHTML = html;
            if (this.tooltipBox.style.display !== "block") {
                this.tooltipBox.style.display = "block";
            }
        }
        if (pointerEvent.clientX !== 0 || pointerEvent.clientY !== 0) {
            this.positionTooltip(pointerEvent);
        }
    }
    positionTooltip(e) {
        if (!this.tooltipBox)
            return;
        const padding = 15;
        const boxRect = this.tooltipBox.getBoundingClientRect();
        let x = e.clientX + padding;
        if (x + boxRect.width > window.innerWidth) {
            x = e.clientX - boxRect.width - padding;
        }
        const maxX = Math.max(0, window.innerWidth - boxRect.width);
        x = Math.max(0, Math.min(x, maxX));
        const fitsBelow = e.clientY + padding + boxRect.height <= window.innerHeight;
        const fitsAbove = e.clientY - padding - boxRect.height >= 0;
        let isAbove = false;
        if (!fitsBelow && fitsAbove) {
            isAbove = true;
        }
        else if (!fitsBelow && !fitsAbove) {
            const spaceBelow = window.innerHeight - (e.clientY + padding);
            const spaceAbove = e.clientY - padding;
            if (spaceAbove > spaceBelow) {
                isAbove = true;
            }
        }
        let y = isAbove ? e.clientY - boxRect.height - padding : e.clientY + padding;
        const maxY = Math.max(0, window.innerHeight - boxRect.height);
        y = Math.max(0, Math.min(y, maxY));
        this.tooltipBox.classList.toggle('hs-tooltip-above', isAbove);
        this.tooltipBox.style.left = `${x}px`;
        this.tooltipBox.style.top = `${y}px`;
    }
    drawParentHighlight(fx, rowRect) {
        this.clearParentHighlights();
        if (!this.container || !fx || !fx.element || !(fx.element instanceof HTMLElement))
            return;
        // Filter properties to only visual modifier/scrolling ones
        const prop = fx.property;
        const isVisualEffect = prop === "mask-image" || prop === "clip-path" || prop.startsWith("overflow");
        if (!isVisualEffect)
            return;
        const parentEl = fx.element;
        const rect = parentEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
            return;
        // Calculate sub-border dimensions based on effect
        let subRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        if (prop === "mask-image") {
            const parsed = parseMaskGradient(fx.value, rect);
            if (parsed)
                subRect = parsed;
        }
        else if (prop === "clip-path") {
            const parsed = parseClipPathInset(fx.value, rect);
            if (parsed)
                subRect = parsed;
        }
        // 1. Outline frame
        const frame = document.createElement("div");
        frame.className = "hoversource-parent-outline";
        frame.style.width = `${subRect.width}px`;
        frame.style.height = `${subRect.height}px`;
        frame.style.left = `${subRect.left}px`;
        frame.style.top = `${subRect.top}px`;
        this.container.appendChild(frame);
        this.parentHighlightElements.push(frame);
        // 2. SVG overlay for leader line
        if (rowRect) {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "hoversource-parent-svg");
            this.container.appendChild(svg);
            this.parentHighlightElements.push(svg);
            // Tooltip row target point: vertical center of rowRect
            const rx = rowRect.left;
            const ry = rowRect.top + rowRect.height / 2;
            // Start point: EXACT CENTER of the sub-border
            const x1 = subRect.left + subRect.width / 2;
            const y1 = subRect.top + subRect.height / 2;
            // Draw target dot
            const dotCircle = document.createElementNS(svgNS, "circle");
            dotCircle.setAttribute("cx", x1.toString());
            dotCircle.setAttribute("cy", y1.toString());
            dotCircle.setAttribute("r", "5");
            dotCircle.setAttribute("class", "hoversource-leader-dot");
            svg.appendChild(dotCircle);
            const dotInner = document.createElementNS(svgNS, "circle");
            dotInner.setAttribute("cx", x1.toString());
            dotInner.setAttribute("cy", y1.toString());
            dotInner.setAttribute("r", "1.5");
            dotInner.setAttribute("fill", "#ffffff");
            svg.appendChild(dotInner);
            // Draw leader line (diagonal then horizontal) with viewport bounds check
            const dx = rx - x1;
            const dir = dx > 0 ? 1 : -1;
            let x_mid = x1 + dir * 30;
            if (Math.abs(dx) <= 60) {
                x_mid = x1 + dx * 0.5;
            }
            x_mid = Math.max(10, Math.min(x_mid, window.innerWidth - 10));
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", `M ${x1} ${y1} L ${x_mid} ${ry} L ${rx} ${ry}`);
            path.setAttribute("class", "hoversource-leader-line");
            svg.appendChild(path);
        }
    }
    clearParentHighlights() {
        for (const el of this.parentHighlightElements) {
            el.remove();
        }
        this.parentHighlightElements = [];
    }
    clear() {
        if (this.outlineBox)
            this.outlineBox.style.display = "none";
        if (this.tooltipBox)
            this.tooltipBox.style.display = "none";
        this.clearParentHighlights();
    }
    async copyToClipboard(text) {
        await navigator.clipboard.writeText(text);
        console.log("[HoverSource] Copied component metadata to clipboard!");
        if (this.uiVisible && this.tooltipBox) {
            const hint = this.tooltipBox.querySelector(".hoversource-shortcut-hint");
            if (hint) {
                const originalText = hint.innerHTML;
                hint.innerHTML = "<span style='color: #10b981; font-weight: bold;'>Copied successfully for AI!</span>";
                setTimeout(() => {
                    hint.innerHTML = originalText || "";
                }, 1500);
            }
        }
    }
    getConfig() { return this.config; }
    isUIVisible() { return this.uiVisible; }
    setFreezeMode(frozen) {
        this.isFrozen = frozen;
        const events = [
            "pointerout", "mouseout", "pointerleave", "mouseleave",
            "pointerenter", "mouseenter", "mousedown", "mouseup", "click", "contextmenu",
            "mousemove", "mouseover"
        ];
        if (this.isFrozen) {
            events.forEach(event => globalThis.addEventListener(event, this.blockEvent, { capture: true }));
            this.freezeStyle = document.createElement("style");
            this.freezeStyle.id = "hoversource-freeze-styles";
            this.freezeStyle.innerHTML = `
        * { pointer-events: auto !important; }
        .hoversource-container { pointer-events: none !important; }
        .hoversource-outline { pointer-events: none !important; }
        .hoversource-tooltip, .hoversource-tooltip * { pointer-events: auto !important; }
      `;
            document.head.appendChild(this.freezeStyle);
        }
        else {
            events.forEach(event => globalThis.removeEventListener(event, this.blockEvent, { capture: true }));
            if (this.freezeStyle) {
                this.freezeStyle.remove();
                this.freezeStyle = null;
            }
        }
    }
}
globalThis.__HoverSourceOpen__ = (file, line, col, tagName, classList) => {
    let url = `http://127.0.0.1:${getCompanionPort()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
    if (tagName)
        url += `&tagName=${encodeURIComponent(tagName)}`;
    if (classList)
        url += `&classList=${encodeURIComponent(classList)}`;
    fetch(url)
        .then(r => r.json())
        .then(data => {
        if (data.success) {
            console.log(`[HoverSource] Opened file in editor: ${file}`);
        }
        else {
            console.error("[HoverSource] Editor open failed:", data.error);
        }
    })
        .catch(e => console.error("[HoverSource] Failed to reach companion server:", e));
};
if (typeof document !== "undefined" && !globalThis.__HoverSourceInitialized__) {
    globalThis.__HoverSourceInitialized__ = true;
    OverlayEngine.launch();
    console.log("[HoverSource] Overlay injected.");
}
export function parseMaskGradient(value, rect) {
    if (!value || !value.includes("linear-gradient"))
        return null;
    const matches = Array.from(value.matchAll(/(\d+(?:\.\d+)?)(px|%)/g));
    if (matches.length === 0)
        return null;
    let stopValue = 0;
    let stopUnit = "px";
    for (const m of matches) {
        const val = parseFloat(m[1]);
        if (val > 0) {
            stopValue = val;
            stopUnit = m[2];
            break;
        }
    }
    if (stopValue === 0)
        return null;
    let direction = "to bottom";
    if (value.includes("to top"))
        direction = "to top";
    else if (value.includes("to right"))
        direction = "to right";
    else if (value.includes("to left"))
        direction = "to left";
    let subLeft = rect.left;
    let subTop = rect.top;
    let subWidth = rect.width;
    let subHeight = rect.height;
    const rectBottom = (rect.bottom !== undefined) ? rect.bottom : rect.top + rect.height;
    const rectRight = (rect.right !== undefined) ? rect.right : rect.left + rect.width;
    if (direction === "to bottom") {
        const h = (stopUnit === "px") ? stopValue : rect.height * (stopValue / 100);
        subHeight = Math.min(h, rect.height);
    }
    else if (direction === "to top") {
        const h = (stopUnit === "px") ? stopValue : rect.height * (stopValue / 100);
        subHeight = Math.min(h, rect.height);
        subTop = rectBottom - subHeight;
    }
    else if (direction === "to right") {
        const w = (stopUnit === "px") ? stopValue : rect.width * (stopValue / 100);
        subWidth = Math.min(w, rect.width);
    }
    else if (direction === "to left") {
        const w = (stopUnit === "px") ? stopValue : rect.width * (stopValue / 100);
        subWidth = Math.min(w, rect.width);
        subLeft = rectRight - subWidth;
    }
    return { left: subLeft, top: subTop, width: subWidth, height: subHeight };
}
export function parseClipPathInset(value, rect) {
    if (!value || !value.includes("inset("))
        return null;
    const insetMatch = value.match(/inset\(([^)]+)\)/);
    if (!insetMatch)
        return null;
    let content = insetMatch[1].split("round")[0].trim();
    const tokens = content.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0)
        return null;
    const parseVal = (token, size) => {
        const num = parseFloat(token);
        if (isNaN(num))
            return 0;
        if (token.includes("%"))
            return size * (num / 100);
        return num;
    };
    let t = 0, r = 0, b = 0, l = 0;
    if (tokens.length === 1) {
        t = r = b = l = parseVal(tokens[0], Math.min(rect.width, rect.height));
    }
    else if (tokens.length === 2) {
        t = b = parseVal(tokens[0], rect.height);
        l = r = parseVal(tokens[1], rect.width);
    }
    else if (tokens.length === 3) {
        t = parseVal(tokens[0], rect.height);
        l = r = parseVal(tokens[1], rect.width);
        b = parseVal(tokens[2], rect.height);
    }
    else if (tokens.length >= 4) {
        t = parseVal(tokens[0], rect.height);
        r = parseVal(tokens[1], rect.width);
        b = parseVal(tokens[2], rect.height);
        l = parseVal(tokens[3], rect.width);
    }
    return {
        left: rect.left + l,
        top: rect.top + t,
        width: Math.max(0, rect.width - l - r),
        height: Math.max(0, rect.height - t - b)
    };
}
