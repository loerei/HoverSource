import { SourceResolver } from "@hoversource/source-resolver";

function getCompanionPort(): number {
  return (window as any).__HOVERSOURCE_PORT__ ?? 3000;
}

class HoverSourceOverlay {
  private uiVisible = true;
  private minimalMode = false;
  private isFrozen = false;
  private freezeStyle: HTMLStyleElement | null = null;
  private resolver = new SourceResolver();
  private config: any = null;
  
  // DOM Elements for Overlay UI
  private container: HTMLDivElement | null = null;
  private outlineBox: HTMLDivElement | null = null;
  private tooltipBox: HTMLDivElement | null = null;
  private currentElement: HTMLElement | null = null;
  private currentSourceInfo: any = null;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadConfig();
    this.initStyles();
    this.createUI();
    this.initShortcuts();
    
    // Always listen to pointer events to track source files in the background
    window.addEventListener("pointerover", this.handlePointerOver, { capture: true });
    window.addEventListener("pointermove", this.handlePointerMove, { capture: true });

    // Listen to live configuration updates from server via postMessage
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "HOVERSOURCE_CONFIG_CHANGED") {
        this.handleConfigUpdate(e.data.config);
      }
    });
  }

  private handleConfigUpdate(newConfig: any) {
    console.log("[HoverSource] Live reloading config...", newConfig);
    this.config = newConfig;
    this.minimalMode = !!newConfig.minimalModeByDefault;

    const oldStyle = document.getElementById("hoversource-styles");
    if (oldStyle) oldStyle.remove();
    this.initStyles();

    if (this.currentElement && this.currentSourceInfo && this.uiVisible) {
      const dummyEvent = { clientX: 0, clientY: 0 } as PointerEvent;
      this.updateTooltip(this.currentElement, this.currentSourceInfo, dummyEvent);
    }
  }

  private async loadConfig() {
    try {
      const res = await fetch(`http://127.0.0.1:${getCompanionPort()}/config`);
      const data = await res.json();
      this.config = data.config;
      this.minimalMode = !!this.config?.minimalModeByDefault;
      console.log("[HoverSource] Configuration loaded from companion server:", this.config);
    } catch (e) {
      console.warn("[HoverSource] Failed to fetch config, falling back to defaults", e);
      // Fallback defaults
      this.config = {
        theme: "dark",
        minimalModeByDefault: false,
        shortcuts: {
          toggleUI: { key: "h", altKey: true, ctrlKey: false, shiftKey: false },
          toggleMinimal: { key: "m", altKey: true, ctrlKey: false, shiftKey: false },
          toggleFreeze: { key: "q", altKey: true, ctrlKey: false, shiftKey: false },
          copyMetadata: { key: "c", altKey: true, ctrlKey: false, shiftKey: false },
          openDashboard: { key: "s", altKey: true, ctrlKey: false, shiftKey: false }
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
        pointer-events: auto; /* Allow clicking links inside tooltip */
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
      .hoversource-section {
        margin-top: 6px;
      }
      .hoversource-label {
        color: ${isLightTheme ? "#6b7280" : "#9ca3af"};
        font-weight: 500;
      }
      .hoversource-value {
        font-family: monospace;
        color: #10b981;
        word-break: break-all;
      }
      .hoversource-link {
        color: #2563eb;
        text-decoration: underline;
        cursor: pointer;
      }
      .hoversource-link:hover {
        color: #3b82f6;
      }
      .hoversource-stack {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 4px;
      }
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

  private initShortcuts() {
    window.addEventListener("keydown", (e) => {
      const shortcuts = this.config?.shortcuts;
      if (!shortcuts) return;

      // Toggle UI visibility shortcut
      if (this.matchShortcut(e, shortcuts.toggleUI)) {
        e.preventDefault();
        this.toggleUIVisibility();
      }

      // Toggle Minimalist/Detailed Mode
      if (this.matchShortcut(e, shortcuts.toggleMinimal) && !this.isTyping(e)) {
        e.preventDefault();
        this.toggleMinimalMode();
      }

      // Toggle Freeze/Unfreeze Mode
      if (this.matchShortcut(e, shortcuts.toggleFreeze) && !this.isTyping(e)) {
        e.preventDefault();
        this.toggleFreezeMode();
      }

      // Copy shortcut when we have hover target
      if (this.currentSourceInfo && this.matchShortcut(e, shortcuts.copyMetadata) && !this.isTyping(e)) {
        e.preventDefault();
        this.copyToClipboard();
      }

      // Open Dashboard shortcut
      if (this.matchShortcut(e, shortcuts.openDashboard) && !this.isTyping(e)) {
        e.preventDefault();
        this.openDashboardInBrowser();
      }
    });
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
    const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
    const altMatch = !!e.altKey === !!shortcut.altKey;
    const ctrlMatch = !!e.ctrlKey === !!shortcut.ctrlKey;
    const shiftMatch = !!e.shiftKey === !!shortcut.shiftKey;
    return keyMatch && altMatch && ctrlMatch && shiftMatch;
  }

  private isTyping(e: KeyboardEvent): boolean {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
  }

  private toggleUIVisibility() {
    this.uiVisible = !this.uiVisible;
    console.log(`[HoverSource] UI Tooltip Visibility: ${this.uiVisible ? "visible" : "hidden"} (Background tracking active)`);
    
    if (this.container) {
      this.container.style.display = this.uiVisible ? "block" : "none";
    }
  }

  private toggleMinimalMode() {
    this.minimalMode = !this.minimalMode;
    console.log(`[HoverSource] Minimalist Mode: ${this.minimalMode ? "enabled" : "disabled"}`);
    
    if (this.currentElement && this.currentSourceInfo) {
      const mockEvent = { clientX: 0, clientY: 0 } as PointerEvent; // Dummy coordinates
      this.updateTooltip(this.currentElement, this.currentSourceInfo, mockEvent);
    }
  }

  private toggleFreezeMode() {
    this.isFrozen = !this.isFrozen;
    console.log(`[HoverSource] Freeze Mode: ${this.isFrozen ? "enabled" : "disabled"}`);
    
    if (this.outlineBox) {
      this.outlineBox.style.borderColor = this.isFrozen ? "#f59e0b" : "#3b82f6";
      this.outlineBox.style.backgroundColor = this.isFrozen ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.1)";
    }

    const events = [
      "pointerout", "mouseout",
      "pointerleave", "mouseleave",
      "pointerenter", "mouseenter",
      "mousedown", "mouseup", "click", "contextmenu",
      "mousemove", "mouseover"
    ];

    if (this.isFrozen) {
      events.forEach(event => {
        window.addEventListener(event, this.blockEvent, { capture: true });
      });

      // Force pointer-events: auto on all elements so we can hover over tooltips
      this.freezeStyle = document.createElement("style");
      this.freezeStyle.id = "hoversource-freeze-styles";
      this.freezeStyle.innerHTML = `
        * {
          pointer-events: auto !important;
        }
        .hoversource-container {
          pointer-events: none !important;
        }
        .hoversource-outline {
          pointer-events: none !important;
        }
        .hoversource-tooltip, .hoversource-tooltip * {
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(this.freezeStyle);
    } else {
      events.forEach(event => {
        window.removeEventListener(event, this.blockEvent, { capture: true });
      });

      if (this.freezeStyle) {
        this.freezeStyle.remove();
        this.freezeStyle = null;
      }
    }

    if (this.currentElement && this.currentSourceInfo) {
      const mockEvent = { clientX: 0, clientY: 0 } as PointerEvent;
      this.updateTooltip(this.currentElement, this.currentSourceInfo, mockEvent);
    }
  }

  private blockEvent = (e: Event) => {
    if (this.container && this.container.contains(e.target as Node)) {
      return;
    }
    e.stopImmediatePropagation();
    e.preventDefault();
  };

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

  private handlePointerOver = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target || target === this.container || this.container?.contains(target)) {
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return;
    }

    const info = this.resolver.resolve(target);
    if (info) {
      this.currentElement = target;
      this.currentSourceInfo = info;
      
      // Update DOM UI only if visibility is enabled
      if (this.uiVisible) {
        this.updateOutline(target);
        this.updateTooltip(target, info, e);
      }

      // Background validation to correct line mappings
      const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
      
      fetch(validateUrl)
        .then(r => r.json())
        .then(data => {
          if (data && data.corrected && (data.corrected.line !== info.lineNumber || data.corrected.column !== info.columnNumber)) {
            if (this.currentElement === target) {
              info.lineNumber = data.corrected.line;
              info.columnNumber = data.corrected.column;
              this.currentSourceInfo = info;
              if (this.uiVisible) {
                this.updateTooltip(target, info, e);
              }
            }
          }
        })
        .catch(err => console.warn("[HoverSource] Background line validation failed:", err));
    } else {
      this.hideOverlay();
    }

    if (this.isFrozen) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.uiVisible && this.currentElement && this.tooltipBox && this.tooltipBox.style.display !== "none") {
      this.positionTooltip(e);
    }
    if (this.isFrozen) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  private updateOutline(element: HTMLElement) {
    if (!this.outlineBox) return;
    const rect = element.getBoundingClientRect();
    this.outlineBox.style.width = `${rect.width}px`;
    this.outlineBox.style.height = `${rect.height}px`;
    this.outlineBox.style.left = `${rect.left + window.scrollX}px`;
    this.outlineBox.style.top = `${rect.top + window.scrollY}px`;
    this.outlineBox.style.display = "block";
  }

  private updateTooltip(element: HTMLElement, info: any, e: PointerEvent) {
    if (!this.tooltipBox) return;

    const shortcuts = this.config?.shortcuts;
    const getShortcutLabel = (shortcut: any) => {
      if (!shortcut) return "";
      const parts = [];
      if (shortcut.ctrlKey) parts.push("Ctrl");
      if (shortcut.altKey) parts.push("Alt");
      if (shortcut.shiftKey) parts.push("Shift");
      parts.push(shortcut.key.toUpperCase());
      return parts.join("+");
    };

    const copyLabel = getShortcutLabel(shortcuts?.copyMetadata) || "[C]";
    const minimalLabel = getShortcutLabel(shortcuts?.toggleMinimal) || "[M]";
    const freezeLabel = getShortcutLabel(shortcuts?.toggleFreeze) || "[F]";
    const uiToggleLabel = getShortcutLabel(shortcuts?.toggleUI) || "[Alt+F12]";
    const dbLabel = getShortcutLabel(shortcuts?.openDashboard) || "[Alt+D]";

    if (this.minimalMode) {
      // Minimalist Mode Render
      this.tooltipBox.innerHTML = `
        <div class="hoversource-title" style="${this.isFrozen ? 'color: #f59e0b;' : ''}">
          <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? ' [FROZEN]' : ''}</span>
          <span class="hoversource-framework" style="${this.isFrozen ? 'background: #78350f; color: #fde68a;' : ''}">${info.framework}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">File: </span>
          <span class="hoversource-link" onclick="window.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
            ${info.fileName.split('/').pop().split('\\').pop()}:${info.lineNumber || 1}
          </span>
        </div>
        <div class="hoversource-shortcut-hint">
          Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config
        </div>
      `;
    } else {
      // Detailed Mode Render
      const computed = window.getComputedStyle(element);
      const width = element.offsetWidth || element.clientWidth;
      const height = element.offsetHeight || element.clientHeight;
      const color = computed.color;
      const bgColor = computed.backgroundColor;
      const shadow = computed.boxShadow;
      const animation = computed.animationName !== "none" ? `${computed.animationName} ${computed.animationDuration}` : null;

      const stack: string[] = [];
      let current: HTMLElement | null = element;
      while (current && stack.length < 5) {
        const elInfo = this.resolver.resolve(current);
        if (elInfo && elInfo.componentName) {
          stack.push(elInfo.componentName);
        } else {
          const classStr = current.className ? `.${Array.from(current.classList).join(".")}` : "";
          stack.push(`${current.tagName.toLowerCase()}${classStr}`);
        }
        current = current.parentElement;
      }

      let html = `
        <div class="hoversource-title" style="${this.isFrozen ? 'color: #f59e0b;' : ''}">
          <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? ' [FROZEN]' : ''}</span>
          <span class="hoversource-framework" style="${this.isFrozen ? 'background: #78350f; color: #fde68a;' : ''}">${info.framework}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">File: </span>
          <span class="hoversource-link" onclick="window.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
            ${info.fileName.split('/').pop().split('\\').pop()}:${info.lineNumber || 1}
          </span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Path: </span>
          <span class="hoversource-value">${info.fileName}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Size: </span>
          <span class="hoversource-value">${width}px × ${height}px</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Color: </span>
          <span class="hoversource-value">${color}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Background: </span>
          <span class="hoversource-value">${bgColor}</span>
        </div>
      `;

      if (shadow && shadow !== "none") {
        html += `
          <div class="hoversource-section">
            <span class="hoversource-label">Shadow: </span>
            <span class="hoversource-value">${shadow}</span>
          </div>
        `;
      }

      if (animation) {
        html += `
          <div class="hoversource-section">
            <span class="hoversource-label">Animation: </span>
            <span class="hoversource-value">${animation}</span>
          </div>
        `;
      }

      html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Stack: </span>
          <div class="hoversource-stack">
            ${stack.map(item => `<div class="hoversource-stack-item">${item}</div>`).join('')}
          </div>
        </div>
        <div class="hoversource-shortcut-hint">
          Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Minimal | ${dbLabel} for Config
        </div>
      `;
      this.tooltipBox.innerHTML = html;
    }

    this.tooltipBox.style.display = "block";
    if (e.clientX !== 0 || e.clientY !== 0) {
      this.positionTooltip(e);
    }
  }

  private positionTooltip(e: PointerEvent) {
    if (!this.tooltipBox) return;
    const padding = 15;
    let x = e.clientX + padding;
    let y = e.clientY + padding;

    const boxRect = this.tooltipBox.getBoundingClientRect();
    if (x + boxRect.width > window.innerWidth) {
      x = e.clientX - boxRect.width - padding;
    }
    if (y + boxRect.height > window.innerHeight) {
      y = e.clientY - boxRect.height - padding;
    }

    this.tooltipBox.style.left = `${x + window.scrollX}px`;
    this.tooltipBox.style.top = `${y + window.scrollY}px`;
  }

  private hideOverlay() {
    if (this.outlineBox) this.outlineBox.style.display = "none";
    if (this.tooltipBox) this.tooltipBox.style.display = "none";
    this.currentElement = null;
    this.currentSourceInfo = null;
  }

  private copyToClipboard() {
    if (!this.currentSourceInfo || !this.currentElement) return;
    
    const element = this.currentElement;
    const info = this.currentSourceInfo;
    const computed = window.getComputedStyle(element);
    
    const data = {
      framework: info.framework,
      component: info.componentName || element.tagName.toLowerCase(),
      file: info.fileName,
      line: info.lineNumber || 1,
      column: info.columnNumber || 1,
      dimensions: `${element.offsetWidth}x${element.offsetHeight}`,
      styles: {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        boxShadow: computed.boxShadow,
        margin: computed.margin,
        padding: computed.padding,
        display: computed.display,
        flexDirection: computed.flexDirection
      }
    };

    const text = `
### HoverSource Component Metadata
* **Component**: \`${data.component}\`
* **File Path**: \`${data.file}\` (Line: ${data.line}, Column: ${data.column})
* **Framework**: ${data.framework}
* **Dimensions**: ${data.dimensions}
* **Key Styles**:
  - Color: \`${data.styles.color}\`
  - Background: \`${data.styles.backgroundColor}\`
  - Box Shadow: \`${data.styles.boxShadow}\`
  - Margin: \`${data.styles.margin}\` | Padding: \`${data.styles.padding}\`
  - Display: \`${data.styles.display}\` ${data.styles.display === "flex" ? `(direction: ${data.styles.flexDirection})` : ""}
    `.trim();

    navigator.clipboard.writeText(text).then(() => {
      console.log("[HoverSource] Copied component metadata to clipboard!");
      
      if (this.uiVisible && this.tooltipBox) {
        const originalText = this.tooltipBox.querySelector(".hoversource-shortcut-hint")?.innerHTML;
        const hint = this.tooltipBox.querySelector(".hoversource-shortcut-hint");
        if (hint) {
          hint.innerHTML = "<span style='color: #10b981; font-weight: bold;'>Copied successfully for AI!</span>";
          setTimeout(() => {
            if (hint) hint.innerHTML = originalText || "";
          }, 1500);
        }
      }
    });
  }
}

// Global deep-linking trigger function
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
    .catch(e => {
      console.error("[HoverSource] Failed to reach companion server:", e);
    });
};

// Initialize only once
if (!(window as any).__HoverSourceInitialized__) {
  (window as any).__HoverSourceInitialized__ = true;
  new HoverSourceOverlay();
  console.log("[HoverSource] Overlay injected.");
}
