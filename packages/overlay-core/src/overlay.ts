import { InteractionMode, OverlayController } from "./modes/types.js";
import { InspectorAdapter } from "./modes/InspectorAdapter.js";
import { DesignAdapter } from "./modes/DesignAdapter.js";

function getCompanionPort(): number {
  return (globalThis as any).__HOVERSOURCE_PORT__ ?? 3000;
}

class OverlayEngine implements OverlayController {
  private config: any = null;
  private container: HTMLDivElement | null = null;
  private outlineBox: HTMLDivElement | null = null;
  private tooltipBox: HTMLDivElement | null = null;
  
  private uiVisible = true;
  private isFrozen = false;
  private freezeStyle: HTMLStyleElement | null = null;

  private readonly inspectorMode = new InspectorAdapter();
  private readonly designMode = new DesignAdapter();
  private activeMode: InteractionMode = this.inspectorMode;

  private constructor() {}

  public static async launch(): Promise<OverlayEngine> {
    const engine = new OverlayEngine();
    await engine.init();
    return engine;
  }

  private async init() {
    await this.loadConfig();
    this.initStyles();
    this.createUI();
    this.initShortcuts();

    this.activeMode.activate(this);
    
    globalThis.addEventListener("pointerover", this.handlePointerOver, { capture: true });
    globalThis.addEventListener("pointermove", this.handlePointerMove, { capture: true });

    globalThis.addEventListener("message", (e) => {
      if (
        e.origin === globalThis.location.origin &&
        e.source === (globalThis as unknown) &&
        e.data?.type === "HOVERSOURCE_CONFIG_CHANGED"
      ) {
        this.handleConfigUpdate(e.data.config);
      }
    });
  }

  private handleConfigUpdate(newConfig: any) {
    console.log("[HoverSource] Live reloading config...", newConfig);
    this.config = newConfig;

    const oldStyle = document.getElementById("hoversource-styles");
    if (oldStyle) oldStyle.remove();
    this.initStyles();

    this.activeMode.onConfigUpdate(newConfig);
  }

  private async loadConfig() {
    try {
      const res = await fetch(`http://127.0.0.1:${getCompanionPort()}/config`);
      const data = await res.json();
      this.config = data.config;
      console.log("[HoverSource] Configuration loaded from companion server:", this.config);
    } catch (e) {
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

  private initStyles() {
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

  private createUI() {
    if (this.container) return;
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

  private initShortcuts() {
    globalThis.addEventListener("keydown", this.handleKeyDown);
  }

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    const shortcuts = this.config?.shortcuts;
    if (!shortcuts) return;

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

    if (this.isTyping(e)) return;

    // Hardcoded fallback for toggleMode if not in config
    const toggleModeShortcut = shortcuts.toggleMode || { key: "x", altKey: true, ctrlKey: false, shiftKey: false };

    if (this.matchShortcut(e, shortcuts.openDashboard)) {
      e.preventDefault();
      console.log("[HoverSource] Shortcut matched: openDashboard");
      this.openDashboardInBrowser();
    } else if (this.matchShortcut(e, toggleModeShortcut)) {
      e.preventDefault();
      this.switchMode();
    } else if (this.matchShortcut(e, shortcuts.toggleMinimal)) {
      e.preventDefault();
      this.activeMode.onShortcut('toggleMinimal');
    } else if (this.matchShortcut(e, shortcuts.toggleFreeze)) {
      e.preventDefault();
      this.activeMode.onShortcut('toggleFreeze');
    } else if (this.matchShortcut(e, shortcuts.copyMetadata)) {
      e.preventDefault();
      this.activeMode.onShortcut('copyMetadata');
    } else if (this.matchShortcut(e, shortcuts.copyAllLayers || { key: "c", altKey: true, ctrlKey: false, shiftKey: true })) {
      e.preventDefault();
      this.activeMode.onShortcut('copyAllLayers');
    }
  };

  private switchMode() {
    this.activeMode.deactivate();
    this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
    this.activeMode.activate(this);
  }

  private openDashboardInBrowser() {
    fetch(`http://127.0.0.1:${getCompanionPort()}/open-dashboard`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          console.log("[HoverSource] Triggered dashboard browser open.");
        } else {
          console.error("[HoverSource] Failed to open dashboard:", data.error);
        }
      })
      .catch(e => {
        console.error("[HoverSource] Failed to request dashboard open:", e);
      });
  }

  private matchShortcut(e: KeyboardEvent, shortcut: any): boolean {
    if (!shortcut?.key) return false;
    if (!!e.altKey !== !!shortcut.altKey || !!e.ctrlKey !== !!shortcut.ctrlKey || !!e.shiftKey !== !!shortcut.shiftKey) return false;
    const targetKey = shortcut.key.toLowerCase();
    const keyMatch = e.key.toLowerCase() === targetKey;
    const codeMatch = e.code && (
      e.code.toLowerCase() === targetKey ||
      e.code.toLowerCase() === `key${targetKey}` ||
      e.code.toLowerCase() === `digit${targetKey}`
    );
    return keyMatch || !!codeMatch;
  }

  private isTyping(e: KeyboardEvent): boolean {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
  }

  private readonly handlePointerOver = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
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

  private readonly handlePointerMove = (e: PointerEvent) => {
    this.activeMode.onPointerMove(e);
    if (this.isFrozen) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  private readonly blockEvent = (e: Event) => {
    if (this.container?.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  // --- OverlayController Implementation ---

  public drawHighlight(target: HTMLElement, isFrozen: boolean): void {
    if (!this.outlineBox) return;
    const rect = target.getBoundingClientRect();
    this.outlineBox.style.width = `${rect.width}px`;
    this.outlineBox.style.height = `${rect.height}px`;
    this.outlineBox.style.left = `${rect.left}px`;
    this.outlineBox.style.top = `${rect.top}px`;
    this.outlineBox.style.display = "block";
    this.outlineBox.style.borderColor = isFrozen ? "#f59e0b" : "#3b82f6";
    this.outlineBox.style.backgroundColor = isFrozen ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.1)";
  }

  public drawTooltip(html: string, pointerEvent: PointerEvent): void {
    if (!this.tooltipBox) return;
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

  private positionTooltip(e: PointerEvent) {
    if (!this.tooltipBox) return;
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
    } else if (!fitsBelow && !fitsAbove) {
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

  public clear(): void {
    if (this.outlineBox) this.outlineBox.style.display = "none";
    if (this.tooltipBox) this.tooltipBox.style.display = "none";
  }

  public async copyToClipboard(text: string): Promise<void> {
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

  public getConfig(): any { return this.config; }
  public isUIVisible(): boolean { return this.uiVisible; }

  public setFreezeMode(frozen: boolean): void {
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
    } else {
      events.forEach(event => globalThis.removeEventListener(event, this.blockEvent, { capture: true }));
      if (this.freezeStyle) {
        this.freezeStyle.remove();
        this.freezeStyle = null;
      }
    }
  }
}

(globalThis as any).__HoverSourceOpen__ = (file: string, line: number, col: number, tagName?: string, classList?: string) => {
  let url = `http://127.0.0.1:${getCompanionPort()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
  if (tagName) url += `&tagName=${encodeURIComponent(tagName)}`;
  if (classList) url += `&classList=${encodeURIComponent(classList)}`;
  
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        console.log(`[HoverSource] Opened file in editor: ${file}`);
      } else {
        console.error("[HoverSource] Editor open failed:", data.error);
      }
    })
    .catch(e => console.error("[HoverSource] Failed to reach companion server:", e));
};

if (!(globalThis as any).__HoverSourceInitialized__) {
  (globalThis as any).__HoverSourceInitialized__ = true;
  OverlayEngine.launch();
  console.log("[HoverSource] Overlay injected.");
}
