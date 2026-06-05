"use strict";
(() => {
  // ../source-resolver/dist/adapters/ReactFiberAdapter.js
  var ReactFiberAdapter = class {
    name = "react-fiber";
    getFiber(element) {
      const keys = Object.keys(element);
      const fiberKey = keys.find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
      if (!fiberKey)
        return null;
      return element[fiberKey];
    }
    canResolve(element) {
      return !!this.getFiber(element);
    }
    resolve(element) {
      let fiber = this.getFiber(element);
      while (fiber) {
        const source = fiber._debugSource;
        if (source) {
          let componentName = void 0;
          let owner = fiber._debugOwner;
          while (owner) {
            if (owner.type && typeof owner.type === "function") {
              componentName = owner.type.name || owner.type.displayName;
              break;
            } else if (owner.type && typeof owner.type === "string") {
              owner = owner._debugOwner;
            } else if (owner.type && typeof owner.type === "object" && owner.type.render) {
              componentName = owner.type.render.name || owner.type.displayName;
              break;
            } else {
              owner = owner._debugOwner;
            }
          }
          return {
            fileName: source.fileName,
            lineNumber: source.lineNumber,
            columnNumber: source.columnNumber,
            componentName: componentName || (typeof fiber.type === "function" ? fiber.type.name : void 0),
            framework: "React",
            tagName: element.tagName.toLowerCase(),
            classList: Array.from(element.classList)
          };
        }
        fiber = fiber.return;
      }
      return null;
    }
  };

  // ../source-resolver/dist/index.js
  var SourceResolver = class {
    adapters = [];
    constructor() {
      this.adapters.push(new ReactFiberAdapter());
    }
    registerAdapter(adapter) {
      this.adapters.push(adapter);
    }
    resolve(element) {
      for (const adapter of this.adapters) {
        if (adapter.canResolve(element)) {
          try {
            const info = adapter.resolve(element);
            if (info)
              return info;
          } catch (e) {
            console.warn(`[HoverSource] Adapter ${adapter.name} failed resolving element`, e);
          }
        }
      }
      return null;
    }
  };

  // src/overlay.ts
  function getCompanionPort() {
    return window.__HOVERSOURCE_PORT__ ?? 3e3;
  }
  var HoverSourceOverlay = class {
    uiVisible = true;
    minimalMode = false;
    isFrozen = false;
    freezeStyle = null;
    resolver = new SourceResolver();
    config = null;
    // DOM Elements for Overlay UI
    container = null;
    outlineBox = null;
    tooltipBox = null;
    currentElement = null;
    currentSourceInfo = null;
    constructor() {
      this.init();
    }
    async init() {
      await this.loadConfig();
      this.initStyles();
      this.createUI();
      this.initShortcuts();
      window.addEventListener("pointerover", this.handlePointerOver, { capture: true });
      window.addEventListener("pointermove", this.handlePointerMove, { capture: true });
      window.addEventListener("message", (e) => {
        if (e.data && e.data.type === "HOVERSOURCE_CONFIG_CHANGED") {
          this.handleConfigUpdate(e.data.config);
        }
      });
    }
    handleConfigUpdate(newConfig) {
      console.log("[HoverSource] Live reloading config...", newConfig);
      this.config = newConfig;
      this.minimalMode = !!newConfig.minimalModeByDefault;
      const oldStyle = document.getElementById("hoversource-styles");
      if (oldStyle)
        oldStyle.remove();
      this.initStyles();
      if (this.currentElement && this.currentSourceInfo && this.uiVisible) {
        const dummyEvent = { clientX: 0, clientY: 0 };
        this.updateTooltip(this.currentElement, this.currentSourceInfo, dummyEvent);
      }
    }
    async loadConfig() {
      try {
        const res = await fetch(`http://127.0.0.1:${getCompanionPort()}/config`);
        const data = await res.json();
        this.config = data.config;
        this.minimalMode = !!this.config?.minimalModeByDefault;
        console.log("[HoverSource] Configuration loaded from companion server:", this.config);
      } catch (e) {
        console.warn("[HoverSource] Failed to fetch config, falling back to defaults", e);
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
    initStyles() {
      const isLightTheme = this.config?.theme === "light" || this.config?.theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches;
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
    initShortcuts() {
      window.addEventListener("keydown", (e) => {
        const shortcuts = this.config?.shortcuts;
        if (!shortcuts)
          return;
        if (this.matchShortcut(e, shortcuts.toggleUI)) {
          e.preventDefault();
          this.toggleUIVisibility();
        }
        if (this.matchShortcut(e, shortcuts.toggleMinimal) && !this.isTyping(e)) {
          e.preventDefault();
          this.toggleMinimalMode();
        }
        if (this.matchShortcut(e, shortcuts.toggleFreeze) && !this.isTyping(e)) {
          e.preventDefault();
          this.toggleFreezeMode();
        }
        if (this.currentSourceInfo && this.matchShortcut(e, shortcuts.copyMetadata) && !this.isTyping(e)) {
          e.preventDefault();
          this.copyToClipboard();
        }
        if (this.matchShortcut(e, shortcuts.openDashboard) && !this.isTyping(e)) {
          e.preventDefault();
          this.openDashboardInBrowser();
        }
      });
    }
    openDashboardInBrowser() {
      fetch(`http://127.0.0.1:${getCompanionPort()}/open-dashboard`).then((r) => r.json()).then((data) => {
        if (data.success) {
          console.log("[HoverSource] Triggered dashboard browser open.");
        } else {
          console.error("[HoverSource] Failed to open dashboard:", data.error);
        }
      }).catch((e) => {
        console.error("[HoverSource] Failed to request dashboard open:", e);
      });
    }
    matchShortcut(e, shortcut) {
      if (!shortcut || !shortcut.key)
        return false;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const altMatch = !!e.altKey === !!shortcut.altKey;
      const ctrlMatch = !!e.ctrlKey === !!shortcut.ctrlKey;
      const shiftMatch = !!e.shiftKey === !!shortcut.shiftKey;
      return keyMatch && altMatch && ctrlMatch && shiftMatch;
    }
    isTyping(e) {
      const activeEl = document.activeElement;
      if (!activeEl)
        return false;
      const tag = activeEl.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
    }
    toggleUIVisibility() {
      this.uiVisible = !this.uiVisible;
      console.log(`[HoverSource] UI Tooltip Visibility: ${this.uiVisible ? "visible" : "hidden"} (Background tracking active)`);
      if (this.container) {
        this.container.style.display = this.uiVisible ? "block" : "none";
      }
    }
    toggleMinimalMode() {
      this.minimalMode = !this.minimalMode;
      console.log(`[HoverSource] Minimalist Mode: ${this.minimalMode ? "enabled" : "disabled"}`);
      if (this.currentElement && this.currentSourceInfo) {
        const mockEvent = { clientX: 0, clientY: 0 };
        this.updateTooltip(this.currentElement, this.currentSourceInfo, mockEvent);
      }
    }
    toggleFreezeMode() {
      this.isFrozen = !this.isFrozen;
      console.log(`[HoverSource] Freeze Mode: ${this.isFrozen ? "enabled" : "disabled"}`);
      if (this.outlineBox) {
        this.outlineBox.style.borderColor = this.isFrozen ? "#f59e0b" : "#3b82f6";
        this.outlineBox.style.backgroundColor = this.isFrozen ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.1)";
      }
      const events = [
        "pointerout",
        "mouseout",
        "pointerleave",
        "mouseleave",
        "pointerenter",
        "mouseenter",
        "mousedown",
        "mouseup",
        "click",
        "contextmenu",
        "mousemove",
        "mouseover"
      ];
      if (this.isFrozen) {
        events.forEach((event) => {
          window.addEventListener(event, this.blockEvent, { capture: true });
        });
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
        events.forEach((event) => {
          window.removeEventListener(event, this.blockEvent, { capture: true });
        });
        if (this.freezeStyle) {
          this.freezeStyle.remove();
          this.freezeStyle = null;
        }
      }
      if (this.currentElement && this.currentSourceInfo) {
        const mockEvent = { clientX: 0, clientY: 0 };
        this.updateTooltip(this.currentElement, this.currentSourceInfo, mockEvent);
      }
    }
    blockEvent = (e) => {
      if (this.container && this.container.contains(e.target)) {
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    };
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
    handlePointerOver = (e) => {
      const target = e.target;
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
        if (this.uiVisible) {
          this.updateOutline(target);
          this.updateTooltip(target, info, e);
        }
        const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
        fetch(validateUrl).then((r) => r.json()).then((data) => {
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
        }).catch((err) => console.warn("[HoverSource] Background line validation failed:", err));
      } else {
        this.hideOverlay();
      }
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    handlePointerMove = (e) => {
      if (this.uiVisible && this.currentElement && this.tooltipBox && this.tooltipBox.style.display !== "none") {
        this.positionTooltip(e);
      }
      if (this.isFrozen) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    updateOutline(element) {
      if (!this.outlineBox)
        return;
      const rect = element.getBoundingClientRect();
      this.outlineBox.style.width = `${rect.width}px`;
      this.outlineBox.style.height = `${rect.height}px`;
      this.outlineBox.style.left = `${rect.left + window.scrollX}px`;
      this.outlineBox.style.top = `${rect.top + window.scrollY}px`;
      this.outlineBox.style.display = "block";
    }
    updateTooltip(element, info, e) {
      if (!this.tooltipBox)
        return;
      const shortcuts = this.config?.shortcuts;
      const getShortcutLabel = (shortcut) => {
        if (!shortcut)
          return "";
        const parts = [];
        if (shortcut.ctrlKey)
          parts.push("Ctrl");
        if (shortcut.altKey)
          parts.push("Alt");
        if (shortcut.shiftKey)
          parts.push("Shift");
        parts.push(shortcut.key.toUpperCase());
        return parts.join("+");
      };
      const copyLabel = getShortcutLabel(shortcuts?.copyMetadata) || "[C]";
      const minimalLabel = getShortcutLabel(shortcuts?.toggleMinimal) || "[M]";
      const freezeLabel = getShortcutLabel(shortcuts?.toggleFreeze) || "[F]";
      const uiToggleLabel = getShortcutLabel(shortcuts?.toggleUI) || "[Alt+F12]";
      const dbLabel = getShortcutLabel(shortcuts?.openDashboard) || "[Alt+D]";
      if (this.minimalMode) {
        this.tooltipBox.innerHTML = `
        <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
          <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
          <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">File: </span>
          <span class="hoversource-link" onclick="window.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
            ${info.fileName.split("/").pop().split("\\").pop()}:${info.lineNumber || 1}
          </span>
        </div>
        <div class="hoversource-shortcut-hint">
          Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config
        </div>
      `;
      } else {
        const computed = window.getComputedStyle(element);
        const width = element.offsetWidth || element.clientWidth;
        const height = element.offsetHeight || element.clientHeight;
        const color = computed.color;
        const bgColor = computed.backgroundColor;
        const shadow = computed.boxShadow;
        const animation = computed.animationName !== "none" ? `${computed.animationName} ${computed.animationDuration}` : null;
        const stack = [];
        let current = element;
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
        <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
          <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
          <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">File: </span>
          <span class="hoversource-link" onclick="window.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
            ${info.fileName.split("/").pop().split("\\").pop()}:${info.lineNumber || 1}
          </span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Path: </span>
          <span class="hoversource-value">${info.fileName}</span>
        </div>
        <div class="hoversource-section">
          <span class="hoversource-label">Size: </span>
          <span class="hoversource-value">${width}px \xD7 ${height}px</span>
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
            ${stack.map((item) => `<div class="hoversource-stack-item">${item}</div>`).join("")}
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
    positionTooltip(e) {
      if (!this.tooltipBox)
        return;
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
    hideOverlay() {
      if (this.outlineBox)
        this.outlineBox.style.display = "none";
      if (this.tooltipBox)
        this.tooltipBox.style.display = "none";
      this.currentElement = null;
      this.currentSourceInfo = null;
    }
    copyToClipboard() {
      if (!this.currentSourceInfo || !this.currentElement)
        return;
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
              if (hint)
                hint.innerHTML = originalText || "";
            }, 1500);
          }
        }
      });
    }
  };
  window.__HoverSourceOpen__ = (file, line, col, tagName, classList) => {
    let url = `http://127.0.0.1:${getCompanionPort()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
    if (tagName)
      url += `&tagName=${encodeURIComponent(tagName)}`;
    if (classList)
      url += `&classList=${encodeURIComponent(classList)}`;
    fetch(url).then((r) => r.json()).then((data) => {
      if (data.success) {
        console.log(`[HoverSource] Opened file in editor: ${file}`);
      } else {
        console.error("[HoverSource] Editor open failed:", data.error);
      }
    }).catch((e) => {
      console.error("[HoverSource] Failed to reach companion server:", e);
    });
  };
  if (!window.__HoverSourceInitialized__) {
    window.__HoverSourceInitialized__ = true;
    new HoverSourceOverlay();
    console.log("[HoverSource] Overlay injected.");
  }
})();
