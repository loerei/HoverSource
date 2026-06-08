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
    findComponentNameFromFiber(fiber) {
      let owner = fiber._debugOwner;
      while (owner) {
        if (owner.type && typeof owner.type === "function") {
          return owner.type.name || owner.type.displayName;
        } else if (owner.type && typeof owner.type === "string") {
          owner = owner._debugOwner;
        } else if (owner.type && typeof owner.type === "object" && owner.type.render) {
          return owner.type.render.name || owner.type.displayName;
        } else {
          owner = owner._debugOwner;
        }
      }
      return void 0;
    }
    resolve(element) {
      let fiber = this.getFiber(element);
      while (fiber) {
        const source = fiber._debugSource;
        if (source) {
          const componentName = this.findComponentNameFromFiber(fiber);
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

  // src/inspector.ts
  function inspectVisualContext(element) {
    const parentEffects = [];
    const layoutConstraints = {};
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
    } catch (e) {
      console.warn("[HoverSource] Failed to compute element layout constraints", e);
    }
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
    } catch (e) {
      console.warn(`[HoverSource] Failed to compute styles for parent element <${tagName}>`, e);
    }
  }

  // src/modes/InspectorAdapter.ts
  function getCompanionPort() {
    return window.__HOVERSOURCE_PORT__ ?? 3e3;
  }
  var InspectorAdapter = class {
    id = "inspector";
    controller;
    resolver = new SourceResolver();
    isFrozen = false;
    minimalMode = false;
    currentElement = null;
    currentSourceInfo = null;
    // --- Layer Picker state ---
    layerStack = [];
    activeLayerIndex = 0;
    layerPickerEnabled = true;
    layerScrollModifiers = { altKey: true, shiftKey: true, ctrlKey: false };
    activate(controller) {
      this.controller = controller;
      const config = this.controller.getConfig();
      this.minimalMode = !!config?.minimalModeByDefault;
      this.layerPickerEnabled = config?.layerPickerEnabled !== false;
      this.layerScrollModifiers = config?.layerPickerScroll ?? { altKey: true, shiftKey: true, ctrlKey: false };
      if (this.layerPickerEnabled) {
        window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
      }
      console.log("[HoverSource] Activated Inspector Mode");
    }
    deactivate() {
      this.controller.clear();
      this.currentElement = null;
      this.currentSourceInfo = null;
      this.layerStack = [];
      this.activeLayerIndex = 0;
      window.removeEventListener("wheel", this.handleAltScroll, { capture: true });
      if (this.isFrozen) {
        this.isFrozen = false;
        this.controller.setFreezeMode(false);
      }
    }
    onPointerOver(event, target) {
      const rawStack = document.elementsFromPoint(event.clientX, event.clientY);
      const container = this.controller.container;
      this.layerStack = rawStack.filter((el) => {
        if (el === document.documentElement || el === document.body)
          return false;
        if (container && (el === container || container.contains(el)))
          return false;
        return true;
      });
      this.activeLayerIndex = 0;
      this.resolveAndShowLayer(this.activeLayerIndex, event);
    }
    onPointerMove(event) {
      if (!this.currentElement)
        return;
      const activeEl = this.layerStack[this.activeLayerIndex];
      if (activeEl && this.activeLayerIndex > 0) {
        const rect = activeEl.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) {
          this.activeLayerIndex = 0;
          this.resolveAndShowLayer(0, event);
          return;
        }
      }
      if (this.currentSourceInfo && this.controller.isUIVisible()) {
        this.controller.drawTooltip("", event);
      }
    }
    onShortcut(command) {
      if (command === "toggleFreeze") {
        this.isFrozen = !this.isFrozen;
        this.controller.setFreezeMode(this.isFrozen);
        console.log(`[HoverSource] Freeze: ${this.isFrozen}`);
        this.renderTooltip({ clientX: 0, clientY: 0 });
      } else if (command === "toggleMinimal") {
        this.minimalMode = !this.minimalMode;
        console.log(`[HoverSource] Minimal Mode: ${this.minimalMode}`);
        this.renderTooltip({ clientX: 0, clientY: 0 });
      } else if (command === "copyMetadata") {
        this.copyMetadata();
      }
    }
    onConfigUpdate(newConfig) {
      this.minimalMode = !!newConfig.minimalModeByDefault;
      const newEnabled = newConfig.layerPickerEnabled !== false;
      if (newEnabled !== this.layerPickerEnabled) {
        this.layerPickerEnabled = newEnabled;
        if (newEnabled) {
          window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
        } else {
          window.removeEventListener("wheel", this.handleAltScroll, { capture: true });
        }
      }
      this.layerScrollModifiers = newConfig.layerPickerScroll ?? this.layerScrollModifiers;
      this.renderTooltip({ clientX: 0, clientY: 0 });
    }
    onUIVisibilityChanged(visible) {
    }
    handleAltScroll = (e) => {
      const m = this.layerScrollModifiers;
      if (!!e.altKey !== !!m.altKey || !!e.shiftKey !== !!m.shiftKey || !!e.ctrlKey !== !!m.ctrlKey)
        return;
      if (this.layerStack.length === 0)
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.activeLayerIndex = (this.activeLayerIndex + dir + this.layerStack.length) % this.layerStack.length;
      this.resolveAndShowLayer(this.activeLayerIndex, { clientX: e.clientX, clientY: e.clientY });
    };
    resolveAndShowLayer(index, event) {
      const target = this.layerStack[index];
      if (!target) {
        this.controller.clear();
        this.currentElement = null;
        this.currentSourceInfo = null;
        return;
      }
      const info = this.resolver.resolve(target) || {
        componentName: target.tagName.toLowerCase(),
        tagName: target.tagName.toLowerCase(),
        framework: "Unknown",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(target.classList),
        visualContext: null,
        staticMetadata: null
      };
      info.visualContext = inspectVisualContext(target);
      this.currentElement = target;
      this.currentSourceInfo = info;
      if (this.controller.isUIVisible()) {
        this.controller.drawHighlight(target, this.isFrozen);
        this.renderTooltip(event);
      }
      if (info.fileName) {
        this.fetchBackgroundValidation(info, target, event);
      }
    }
    fetchBackgroundValidation(info, target, e) {
      const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
      fetch(validateUrl).then((res) => res.json()).then((data) => {
        if (this.currentElement === target) {
          let line = info.lineNumber || 1;
          let col = info.columnNumber || 1;
          if (data && data.corrected) {
            line = data.corrected.line;
            col = data.corrected.column;
          }
          info.lineNumber = line;
          info.columnNumber = col;
          const classesToResolve = /* @__PURE__ */ new Set();
          if (info.visualContext) {
            info.visualContext.parentEffects.forEach((fx) => {
              fx.classList.forEach((cls) => classesToResolve.add(cls));
            });
          }
          if (info.classList) {
            info.classList.forEach((cls) => classesToResolve.add(cls));
          }
          const classListParam = Array.from(classesToResolve).join(",");
          const staticContextUrl = `http://127.0.0.1:${getCompanionPort()}/static-context?file=${encodeURIComponent(info.fileName)}&line=${line}&column=${col}&tagName=${encodeURIComponent(info.componentName || info.tagName || "")}&classList=${encodeURIComponent(classListParam)}`;
          fetch(staticContextUrl).then((res) => res.json()).then((staticData) => {
            if (staticData && this.currentElement === target) {
              info.staticMetadata = staticData;
              this.currentSourceInfo = info;
              if (this.controller.isUIVisible()) {
                this.renderTooltip(e);
              }
            }
          }).catch((err) => console.warn("[HoverSource] Static context fetch failed:", err));
        }
      }).catch((err) => console.warn("[HoverSource] Background line validation failed:", err));
    }
    getShortcutLabel(shortcut) {
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
    }
    renderMinimalTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel) {
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
          ${info.fileName.split("/").pop().split("\\").pop()}:${info.lineNumber || 1}
        </span>
      </div>
      <div class="hoversource-shortcut-hint">
        Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config
      </div>
    `;
    }
    renderBasicStats(element, info, computed) {
      const width = element.offsetWidth || element.clientWidth;
      const height = element.offsetHeight || element.clientHeight;
      const color = computed.color;
      const bgColor = computed.backgroundColor;
      const tagName = element.tagName.toLowerCase();
      const classList = Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const elementSelector = `${tagName}${classStr}`;
      let selectorHtml = `<span class="hoversource-value">${elementSelector}</span>`;
      if (info.staticMetadata?.classOrigins) {
        const originParts = [];
        for (const cls of classList) {
          const origin = info.staticMetadata.classOrigins[cls];
          if (origin) {
            const fileBase = origin.file.split("/").pop().split("\\").pop();
            originParts.push(`<span style="color: #6b7280; font-size: 9px;">[${fileBase}:${origin.line}]</span>`);
          }
        }
        if (originParts.length > 0) {
          selectorHtml += ` \u2794 ${originParts.join(" ")}`;
        }
      }
      return `
      <div class="hoversource-title" style="${this.isFrozen ? "color: #f59e0b;" : ""}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? " [FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? "background: #78350f; color: #fde68a;" : ""}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Element: </span>
        ${selectorHtml}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
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
    }
    renderVisualDetails(shadow, animation, info) {
      let html = "";
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
      if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
        const constraints = Object.entries(info.visualContext.layoutConstraints).map(([prop, val]) => `${prop}: ${val}`).join(", ");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Layout: </span>
          <span class="hoversource-value">${constraints}</span>
        </div>
      `;
      }
      return html;
    }
    renderParentEffects(info) {
      if (!info.visualContext || info.visualContext.parentEffects.length === 0) {
        return "";
      }
      const effectsHtml = info.visualContext.parentEffects.map((fx) => {
        const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
        let originLabel = "";
        if (info.staticMetadata?.classOrigins) {
          for (const cls of fx.classList) {
            const origin = info.staticMetadata.classOrigins[cls];
            if (origin) {
              const fileBase = origin.file.split("/").pop();
              originLabel = ` <span style="color: #6b7280; font-size: 9px;">[${fileBase}:${origin.line}]</span>`;
              break;
            }
          }
        }
        return `<div class="hoversource-stack-item">${fx.tagName}${classStr}${originLabel} \u2794 ${fx.property}: ${fx.value}</div>`;
      }).join("");
      return `
      <div class="hoversource-section">
        <span class="hoversource-label">Parent Styles: </span>
        <div class="hoversource-stack">
          ${effectsHtml}
        </div>
      </div>
    `;
    }
    renderStaticMetadata(info) {
      if (!info.staticMetadata)
        return "";
      let html = "";
      if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
        const commentsHtml = info.staticMetadata.comments.map((c) => `<div class="hoversource-stack-item" style="color: #6b7280; font-style: italic;">${c}</div>`).join("");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Source Comments: </span>
          <div class="hoversource-stack">
            ${commentsHtml}
          </div>
        </div>
      `;
      }
      if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
        const attrs = Object.entries(info.staticMetadata.rawAttributes).map(([k, v]) => `${k}="${v}"`).join(" ");
        html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Source Attributes: </span>
          <span class="hoversource-value">${attrs}</span>
        </div>
      `;
      }
      return html;
    }
    renderDetailedTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel) {
      const computed = window.getComputedStyle(element);
      const shadow = computed.boxShadow;
      const animation = computed.animationName === "none" ? null : `${computed.animationName} ${computed.animationDuration}`;
      const stack = [];
      let current = element;
      while (current && stack.length < 5) {
        const elInfo = this.resolver.resolve(current);
        if (elInfo?.componentName) {
          stack.push(elInfo.componentName);
        } else {
          const classStr = current.className && typeof current.className === "string" ? `.${Array.from(current.classList).join(".")}` : "";
          stack.push(`${current.tagName.toLowerCase()}${classStr}`);
        }
        current = current.parentElement;
      }
      let html = this.renderBasicStats(element, info, computed);
      html += this.renderVisualDetails(shadow, animation, info);
      html += this.renderParentEffects(info);
      html += this.renderStaticMetadata(info);
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
      return html;
    }
    renderTooltip(e) {
      if (!this.currentElement || !this.currentSourceInfo)
        return;
      const element = this.currentElement;
      const info = this.currentSourceInfo;
      const config = this.controller.getConfig();
      const shortcuts = config?.shortcuts;
      const copyLabel = this.getShortcutLabel(shortcuts?.copyMetadata) || "[C]";
      const minimalLabel = this.getShortcutLabel(shortcuts?.toggleMinimal) || "[M]";
      const freezeLabel = this.getShortcutLabel(shortcuts?.toggleFreeze) || "[F]";
      const dbLabel = this.getShortcutLabel(shortcuts?.openDashboard) || "[Alt+D]";
      const topLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2z" /></svg>`;
      const chevronLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M112.1 154.4L276.4 230.3C304.1 243.1 336 243.1 363.7 230.3L528 154.4L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L112.1 154.4z" /></svg>`;
      const layerDots = this.layerStack.map((el, i) => {
        const isActive = i === this.activeLayerIndex;
        const tag = el.tagName.toLowerCase();
        const cls = Array.from(el.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-")).slice(0, 2).join(".");
        const label = cls ? `${tag}.${cls}` : tag;
        const zIndex = this.layerStack.length - i;
        const svgContent = i === 0 ? topLayerSvg : chevronLayerSvg;
        return `<div class="hs-layer-dot${isActive ? " hs-layer-dot--active" : ""}" style="z-index: ${zIndex}" title="Layer ${i + 1}: ${label}">${svgContent}</div>`;
      }).join("");
      const scrollHint = (() => {
        const m = this.layerScrollModifiers;
        const parts = [];
        if (m.ctrlKey)
          parts.push("Ctrl");
        if (m.altKey)
          parts.push("Alt");
        if (m.shiftKey)
          parts.push("Shift");
        parts.push("Scroll");
        return parts.join("+");
      })();
      const layerHint = this.layerStack.length > 1 ? `<div class="hs-layer-hint">${scrollHint}</div>` : "";
      const layerColumnHtml = `<div class="hs-layer-column">${layerDots}${layerHint}</div>`;
      const innerHtml = this.minimalMode ? this.renderMinimalTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel) : this.renderDetailedTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel);
      const html = `<div class="hs-tooltip-content-wrapper"><div style="flex:1;min-width:0">${innerHtml}</div>${layerColumnHtml}</div>`;
      this.controller.drawTooltip(html, e);
    }
    formatSelectorLabel(tagName, classList, classOrigins) {
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const elementSelector = `${tagName}${classStr}`;
      let label = `\`${elementSelector}\``;
      if (classOrigins) {
        const originList = [];
        for (const cls of classList) {
          const origin = classOrigins[cls];
          if (origin) {
            originList.push(`[Source: \`${origin.file}\` (Line: \`${origin.line}\`, Column: \`${origin.column}\`)]`);
          }
        }
        if (originList.length > 0) {
          label += ` \u2794 ${originList.join(" ")}`;
        }
      }
      return label;
    }
    formatParentStyles(parentEffects, classOrigins) {
      return parentEffects.map((fx) => {
        const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
        let originLabel = "";
        if (classOrigins) {
          for (const cls of fx.classList) {
            const origin = classOrigins[cls];
            if (origin) {
              originLabel = ` \u2794 [Source: \`${origin.file}\` (Line: ${origin.line}, Column: ${origin.column})]`;
              break;
            }
          }
        }
        return `  - \`${fx.tagName}${classStr}\` \u2794 \`${fx.property}: ${fx.value}\`${originLabel}`;
      }).join("\n");
    }
    formatLayoutConstraints(layoutConstraints) {
      return Object.entries(layoutConstraints).map(([k, v]) => `  - \`${k}: ${v}\``).join("\n");
    }
    formatSourceComments(comments) {
      return comments.map((c) => `  - \`${c}\``).join("\n");
    }
    formatSourceAttributes(rawAttributes) {
      return Object.entries(rawAttributes).map(([k, v]) => `  - \`${k}="${v}"\``).join("\n");
    }
    copyMetadata() {
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
      const tagName = element.tagName.toLowerCase();
      const classList = Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const selectorLabel = this.formatSelectorLabel(tagName, classList, info.staticMetadata?.classOrigins);
      let text = `
### HoverSource Component Metadata
* **Component**: \`${data.component}\`
* **Element**: ${selectorLabel}
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
      if (info.visualContext && info.visualContext.parentEffects.length > 0) {
        const parentList = this.formatParentStyles(info.visualContext.parentEffects, info.staticMetadata?.classOrigins);
        text += `
* **Parent Styles**:
${parentList}`;
      }
      if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
        const layoutList = this.formatLayoutConstraints(info.visualContext.layoutConstraints);
        text += `
* **Layout Constraints**:
${layoutList}`;
      }
      if (info.staticMetadata) {
        if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
          const commentList = this.formatSourceComments(info.staticMetadata.comments);
          text += `
* **Source Comments**:
${commentList}`;
        }
        if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
          const attrList = this.formatSourceAttributes(info.staticMetadata.rawAttributes);
          text += `
* **Source Attributes**:
${attrList}`;
        }
      }
      this.controller.copyToClipboard(text);
    }
  };

  // src/modes/DesignAdapter.ts
  var DesignAdapter = class {
    id = "design";
    controller;
    isFrozen = false;
    activate(controller) {
      this.controller = controller;
      console.log("[HoverSource] Activated Design Mode");
    }
    deactivate() {
      this.controller.clear();
      if (this.isFrozen) {
        this.isFrozen = false;
        this.controller.setFreezeMode(false);
      }
    }
    onPointerOver(event, target) {
      if (this.isFrozen)
        return;
      if (this.controller.isUIVisible()) {
        this.controller.drawHighlight(target, this.isFrozen);
        const html = `
        <div class="hoversource-title" style="color: #10b981;">
          <span>Design Mode</span>
          <span class="hoversource-framework" style="background: #064e3b; color: #34d399;">PREVIEW</span>
        </div>
        <div class="hoversource-section">
          <p style="color: #9ca3af; margin: 4px 0;">
            This mode will track spatial layout, empty space, and layout containers instead of specific elements.
          </p>
          <p style="color: #9ca3af; margin: 4px 0;">
            (Coming Soon)
          </p>
        </div>
      `;
        this.controller.drawTooltip(html, event);
      }
    }
    onPointerMove(event) {
      if (this.isFrozen)
        return;
      this.controller.drawTooltip("", event);
    }
    onShortcut(command) {
      if (command === "toggleFreeze") {
        this.isFrozen = !this.isFrozen;
        this.controller.setFreezeMode(this.isFrozen);
        console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
        if (this.isFrozen) {
        }
      }
    }
    onConfigUpdate(newConfig) {
    }
    onUIVisibilityChanged(visible) {
    }
  };

  // src/overlay.ts
  function getCompanionPort2() {
    return globalThis.__HOVERSOURCE_PORT__ ?? 3e3;
  }
  var OverlayEngine = class _OverlayEngine {
    config = null;
    container = null;
    outlineBox = null;
    tooltipBox = null;
    uiVisible = true;
    isFrozen = false;
    freezeStyle = null;
    inspectorMode = new InspectorAdapter();
    designMode = new DesignAdapter();
    activeMode = this.inspectorMode;
    constructor() {
    }
    static async launch() {
      const engine = new _OverlayEngine();
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
        if (e.origin === globalThis.location.origin && e.source === globalThis && e.data?.type === "HOVERSOURCE_CONFIG_CHANGED") {
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
        const res = await fetch(`http://127.0.0.1:${getCompanionPort2()}/config`);
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
    initStyles() {
      const isLightTheme = this.config?.theme === "light" || this.config?.theme === "system" && !globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
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
        fill: ${isLightTheme ? "#e5e7eb" : "#262626"};
        stroke: ${isLightTheme ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)"};
        stroke-width: 1.5;
        transition: fill 0.12s, stroke 0.12s;
      }
      .hs-layer-dot:hover .hs-layer-shape {
        fill: ${isLightTheme ? "#d1d5db" : "#3f3f46"};
        stroke: ${isLightTheme ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)"};
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
        color: ${isLightTheme ? "#9ca3af" : "#6b7280"};
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
        this.activeMode.onShortcut("toggleMinimal");
      } else if (this.matchShortcut(e, shortcuts.toggleFreeze)) {
        e.preventDefault();
        this.activeMode.onShortcut("toggleFreeze");
      } else if (this.matchShortcut(e, shortcuts.copyMetadata)) {
        e.preventDefault();
        this.activeMode.onShortcut("copyMetadata");
      }
    };
    switchMode() {
      this.activeMode.deactivate();
      this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
      this.activeMode.activate(this);
    }
    openDashboardInBrowser() {
      fetch(`http://127.0.0.1:${getCompanionPort2()}/open-dashboard`).then((r) => r.json()).then((data) => {
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
      if (!shortcut?.key)
        return false;
      if (!!e.altKey !== !!shortcut.altKey || !!e.ctrlKey !== !!shortcut.ctrlKey || !!e.shiftKey !== !!shortcut.shiftKey)
        return false;
      const targetKey = shortcut.key.toLowerCase();
      const keyMatch = e.key.toLowerCase() === targetKey;
      const codeMatch = e.code && (e.code.toLowerCase() === targetKey || e.code.toLowerCase() === `key${targetKey}` || e.code.toLowerCase() === `digit${targetKey}`);
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
      this.outlineBox.style.left = `${rect.left + globalThis.scrollX}px`;
      this.outlineBox.style.top = `${rect.top + globalThis.scrollY}px`;
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
      this.tooltipBox.classList.toggle("hs-tooltip-above", isAbove);
      this.tooltipBox.style.left = `${x + globalThis.scrollX}px`;
      this.tooltipBox.style.top = `${y + globalThis.scrollY}px`;
    }
    clear() {
      if (this.outlineBox)
        this.outlineBox.style.display = "none";
      if (this.tooltipBox)
        this.tooltipBox.style.display = "none";
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
    getConfig() {
      return this.config;
    }
    isUIVisible() {
      return this.uiVisible;
    }
    setFreezeMode(frozen) {
      this.isFrozen = frozen;
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
        events.forEach((event) => globalThis.addEventListener(event, this.blockEvent, { capture: true }));
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
        events.forEach((event) => globalThis.removeEventListener(event, this.blockEvent, { capture: true }));
        if (this.freezeStyle) {
          this.freezeStyle.remove();
          this.freezeStyle = null;
        }
      }
    }
  };
  globalThis.__HoverSourceOpen__ = (file, line, col, tagName, classList) => {
    let url = `http://127.0.0.1:${getCompanionPort2()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
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
    }).catch((e) => console.error("[HoverSource] Failed to reach companion server:", e));
  };
  if (!globalThis.__HoverSourceInitialized__) {
    globalThis.__HoverSourceInitialized__ = true;
    OverlayEngine.launch();
    console.log("[HoverSource] Overlay injected.");
  }
})();
