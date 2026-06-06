import { InteractionMode, OverlayController, SemanticShortcut } from "./modes/types.js";
import { InspectorAdapter } from "./modes/InspectorAdapter.js";
import { DesignAdapter } from "./modes/DesignAdapter.js";

function getCompanionPort(): number {
  return (window as any).__HOVERSOURCE_PORT__ ?? 3000;
}

class OverlayEngine implements OverlayController {
  private config: any = null;
  private container: HTMLDivElement | null = null;
  private outlineBox: HTMLDivElement | null = null;
  private tooltipBox: HTMLDivElement | null = null;
  
  private uiVisible = true;
  private isFrozen = false;
  private freezeStyle: HTMLStyleElement | null = null;

  private inspectorMode = new InspectorAdapter();
  private designMode = new DesignAdapter();
  private activeMode: InteractionMode = this.inspectorMode;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadConfig();
    this.initStyles();
    this.createUI();
    this.initShortcuts();

    this.activeMode.activate(this);
    
    window.addEventListener("pointerover", this.handlePointerOver, { capture: true });
    window.addEventListener("pointermove", this.handlePointerMove, { capture: true });

    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "HOVERSOURCE_CONFIG_CHANGED") {
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
      (this.config?.theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches);

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
        max-width: 420px;
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
    window.addEventListener("keydown", (e) => {
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
      }

      if (this.matchShortcut(e, shortcuts.openDashboard) && !this.isTyping(e)) {
        e.preventDefault();
        console.log("[HoverSource] Shortcut matched: openDashboard");
        this.openDashboardInBrowser();
      }

      // Hardcoded fallback for toggleMode if not in config
      const toggleModeShortcut = shortcuts.toggleMode || { key: "x", altKey: true, ctrlKey: false, shiftKey: false };
      if (this.matchShortcut(e, toggleModeShortcut) && !this.isTyping(e)) {
        e.preventDefault();
        this.switchMode();
      }

      if (this.matchShortcut(e, shortcuts.toggleMinimal) && !this.isTyping(e)) {
        e.preventDefault();
        this.activeMode.onShortcut('toggleMinimal');
      }

      if (this.matchShortcut(e, shortcuts.toggleFreeze) && !this.isTyping(e)) {
        e.preventDefault();
        this.activeMode.onShortcut('toggleFreeze');
      }

      if (this.matchShortcut(e, shortcuts.copyMetadata) && !this.isTyping(e)) {
        e.preventDefault();
        this.activeMode.onShortcut('copyMetadata');
      }
    });
  }

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
    if (!shortcut || !shortcut.key) return false;
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

  private handlePointerOver = (e: PointerEvent) => {
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

  private handlePointerMove = (e: PointerEvent) => {
    this.activeMode.onPointerMove(e);
    if (this.isFrozen) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  private blockEvent = (e: Event) => {
    if (this.container && this.container.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  // --- OverlayController Implementation ---

  public drawHighlight(target: HTMLElement, isFrozen: boolean): void {
    if (!this.outlineBox) return;
    const rect = target.getBoundingClientRect();
    this.outlineBox.style.width = `${rect.width}px`;
    this.outlineBox.style.height = `${rect.height}px`;
    this.outlineBox.style.left = `${rect.left + window.scrollX}px`;
    this.outlineBox.style.top = `${rect.top + window.scrollY}px`;
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
    let x = e.clientX + padding;
    let y = e.clientY + padding;

    const boxRect = this.tooltipBox.getBoundingClientRect();
    if (x + boxRect.width > window.innerWidth) x = e.clientX - boxRect.width - padding;
    if (y + boxRect.height > window.innerHeight) y = e.clientY - boxRect.height - padding;

    this.tooltipBox.style.left = `${x + window.scrollX}px`;
    this.tooltipBox.style.top = `${y + window.scrollY}px`;
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
          if (hint) hint.innerHTML = originalText || "";
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
      events.forEach(event => window.addEventListener(event, this.blockEvent, { capture: true }));
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
      events.forEach(event => window.removeEventListener(event, this.blockEvent, { capture: true }));
      if (this.freezeStyle) {
        this.freezeStyle.remove();
        this.freezeStyle = null;
      }
    }
  }
}

(window as any).__HoverSourceOpen__ = (file: string, line: number, col: number, tagName?: string, classList?: string) => {
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

if (!(window as any).__HoverSourceInitialized__) {
  (window as any).__HoverSourceInitialized__ = true;
  new OverlayEngine();
  console.log("[HoverSource] Overlay injected.");
}
