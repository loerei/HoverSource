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
    /**
     * Walks up the DOM from `element`, collecting layout and source info for
     * each ancestor up to `maxDepth` levels. Returns ancestors ordered from
     * closest (index 0) to furthest.
     *
     * Always resolves: selector, display, position.
     * Resolves conditionally: layoutProps (flex/grid only), fileName/lineNumber/componentName (fiber only).
     */
    resolveAncestors(element, maxDepth = 8) {
      const results = [];
      let current = element.parentElement;
      let depth = 0;
      while (current && current !== document.documentElement && depth < maxDepth) {
        try {
          const comp = globalThis.getComputedStyle(current);
          const display = comp.display || "block";
          const position = comp.position || "static";
          const info = {
            selector: this.buildSelector(current),
            display,
            position
          };
          if (display === "flex" || display === "inline-flex") {
            info.layoutProps = {
              "flex-direction": comp.flexDirection,
              "justify-content": comp.justifyContent,
              "align-items": comp.alignItems,
              "gap": comp.gap,
              "flex-wrap": comp.flexWrap
            };
          } else if (display === "grid" || display === "inline-grid") {
            info.layoutProps = {
              "grid-template-columns": comp.gridTemplateColumns,
              "grid-template-rows": comp.gridTemplateRows,
              "gap": comp.gap
            };
          }
          const sourceInfo = this.resolve(current);
          if (sourceInfo) {
            info.fileName = sourceInfo.fileName;
            info.lineNumber = sourceInfo.lineNumber;
            info.componentName = sourceInfo.componentName;
          }
          results.push(info);
        } catch {
        }
        current = current.parentElement;
        depth++;
      }
      return results;
    }
    buildSelector(el) {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const classes = Array.from(el.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
      return `${tag}${id}${classes ? "." + classes : ""}`;
    }
  };

  // ../source-resolver/dist/index.js
  var SourceResolver = class {
    adapters = [];
    fiberAdapter;
    constructor() {
      this.fiberAdapter = new ReactFiberAdapter();
      this.adapters.push(this.fiberAdapter);
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
    /**
     * Walks up the DOM from `element` and returns layout + source info for
     * each ancestor (up to `maxDepth` levels). Delegates to the React fiber
     * adapter for source resolution; display/position are always resolved via
     * getComputedStyle regardless of framework.
     */
    resolveAncestors(element, maxDepth = 8) {
      return this.fiberAdapter.resolveAncestors(element, maxDepth);
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
    renderMinimalTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel, modeLabel) {
      const hintText = `Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
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
        ${hintHtml}
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
    renderDetailedTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel, modeLabel) {
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
      const hintText = `Press ${copyLabel} to copy | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Minimal | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
      html += `
      <div class="hoversource-section">
        <span class="hoversource-label">Stack: </span>
        <div class="hoversource-stack">
          ${stack.map((item) => `<div class="hoversource-stack-item">${item}</div>`).join("")}
        </div>
      </div>
      <div class="hoversource-shortcut-hint">
        ${hintHtml}
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
      const modeLabel = this.getShortcutLabel(shortcuts?.toggleMode) || "[Alt+X]";
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
      const innerHtml = this.minimalMode ? this.renderMinimalTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel, modeLabel) : this.renderDetailedTooltip(element, info, copyLabel, freezeLabel, minimalLabel, dbLabel, modeLabel);
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
    resolver = new SourceResolver();
    // Snapping and offset state
    targetElement = null;
    targetRect = null;
    anchorHElement = null;
    anchorVElement = null;
    isSnappedH = false;
    isSnappedV = false;
    snapBoundaryH = null;
    snapBoundaryV = null;
    snapX = 0;
    snapY = 0;
    snapMouseX = 0;
    snapMouseY = 0;
    dX = 0;
    dY = 0;
    lastMouseX = 0;
    lastMouseY = 0;
    // Spawning coordinates & dragging state
    crosshairX = 0;
    crosshairY = 0;
    isDragging = false;
    dragStartX = 0;
    dragStartY = 0;
    dragStartCrosshairX = 0;
    dragStartCrosshairY = 0;
    // DOM elements for Design Mode Overlay
    svgOverlay = null;
    badgeElementH = null;
    badgeElementV = null;
    dragBlocker = null;
    activate(controller) {
      this.controller = controller;
      this.isFrozen = false;
      this.dX = 0;
      this.dY = 0;
      this.isSnappedH = false;
      this.isSnappedV = false;
      this.targetElement = null;
      this.anchorHElement = null;
      this.anchorVElement = null;
      this.crosshairX = window.innerWidth / 2;
      this.crosshairY = window.innerHeight / 2;
      this.lastMouseX = this.crosshairX;
      this.lastMouseY = this.crosshairY;
      const container = this.controller.container;
      if (container) {
        this.svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgOverlay.setAttribute("id", "hoversource-design-svg");
        this.svgOverlay.style.position = "absolute";
        this.svgOverlay.style.top = "0";
        this.svgOverlay.style.left = "0";
        this.svgOverlay.style.width = "100%";
        this.svgOverlay.style.height = "100%";
        this.svgOverlay.style.pointerEvents = "none";
        this.svgOverlay.style.overflow = "visible";
        this.svgOverlay.style.zIndex = "99999";
        container.appendChild(this.svgOverlay);
        this.badgeElementH = document.createElement("div");
        this.badgeElementH.style.position = "absolute";
        this.badgeElementH.style.background = "#10b981";
        this.badgeElementH.style.color = "#ffffff";
        this.badgeElementH.style.padding = "2px 6px";
        this.badgeElementH.style.borderRadius = "4px";
        this.badgeElementH.style.fontSize = "10px";
        this.badgeElementH.style.fontWeight = "bold";
        this.badgeElementH.style.pointerEvents = "none";
        this.badgeElementH.style.display = "none";
        this.badgeElementH.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        this.badgeElementH.style.zIndex = "100000";
        container.appendChild(this.badgeElementH);
        this.badgeElementV = document.createElement("div");
        this.badgeElementV.style.position = "absolute";
        this.badgeElementV.style.background = "#10b981";
        this.badgeElementV.style.color = "#ffffff";
        this.badgeElementV.style.padding = "2px 6px";
        this.badgeElementV.style.borderRadius = "4px";
        this.badgeElementV.style.fontSize = "10px";
        this.badgeElementV.style.fontWeight = "bold";
        this.badgeElementV.style.pointerEvents = "none";
        this.badgeElementV.style.display = "none";
        this.badgeElementV.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        this.badgeElementV.style.zIndex = "100000";
        container.appendChild(this.badgeElementV);
      }
      this.updateTargetAtPosition(this.crosshairX, this.crosshairY);
      this.checkSnapping(this.crosshairX, this.crosshairY);
      this.updateVisuals();
      window.addEventListener("keydown", this.handleKeyDown, { capture: true });
      console.log("[HoverSource] Activated Design Mode - Spawned at Center");
    }
    deactivate() {
      this.controller.clear();
      if (this.svgOverlay)
        this.svgOverlay.remove();
      if (this.badgeElementH)
        this.badgeElementH.remove();
      if (this.badgeElementV)
        this.badgeElementV.remove();
      if (this.dragBlocker) {
        this.dragBlocker.remove();
        this.dragBlocker = null;
      }
      window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
      window.removeEventListener("pointermove", this.handleDragMove, { capture: true });
      window.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
      if (this.isFrozen) {
        this.isFrozen = false;
        this.controller.setFreezeMode(false);
      }
    }
    onPointerOver(event, target) {
    }
    onPointerMove(event) {
      if (!this.isDragging && this.targetElement) {
        this.controller.drawTooltip("", event);
      }
    }
    updateTargetAtPosition(x, y) {
      const container = this.controller.container;
      const elements = document.elementsFromPoint(x, y);
      let target = elements.find((el) => {
        if (el === document.documentElement || el === document.body)
          return false;
        if (container && (el === container || container.contains(el)))
          return false;
        return true;
      });
      if (!target) {
        target = this.anchorHElement || this.anchorVElement || void 0;
      }
      if (target) {
        this.targetElement = target;
        this.targetRect = target.getBoundingClientRect();
      } else {
        this.targetElement = null;
        this.targetRect = null;
      }
    }
    handleDragStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartCrosshairX = this.crosshairX;
      this.dragStartCrosshairY = this.crosshairY;
      const container = this.controller.container;
      if (container && !this.dragBlocker) {
        this.dragBlocker = document.createElement("div");
        this.dragBlocker.style.position = "fixed";
        this.dragBlocker.style.top = "0";
        this.dragBlocker.style.left = "0";
        this.dragBlocker.style.width = "100vw";
        this.dragBlocker.style.height = "100vh";
        this.dragBlocker.style.pointerEvents = "auto";
        this.dragBlocker.style.cursor = "grabbing";
        this.dragBlocker.style.zIndex = "99998";
        container.appendChild(this.dragBlocker);
      }
      window.addEventListener("pointermove", this.handleDragMove, { capture: true });
      window.addEventListener("pointerup", this.handleDragEnd, { capture: true });
    };
    handleDragMove = (e) => {
      if (!this.isDragging)
        return;
      e.preventDefault();
      e.stopPropagation();
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      const newX = this.dragStartCrosshairX + deltaX;
      const newY = this.dragStartCrosshairY + deltaY;
      this.lastMouseX = newX;
      this.lastMouseY = newY;
      this.updateTargetAtPosition(newX, newY);
      if (this.isSnappedH || this.isSnappedV) {
        if (shouldReleaseSnap(newX, newY, this.snapMouseX, this.snapMouseY, 15)) {
          this.isSnappedH = false;
          this.isSnappedV = false;
          this.checkSnapping(newX, newY);
        }
      } else {
        this.checkSnapping(newX, newY);
      }
      this.crosshairX = this.isSnappedH ? this.snapX : newX;
      this.crosshairY = this.isSnappedV ? this.snapY : newY;
      this.updateVisuals();
      this.renderTooltip(e);
    };
    handleDragEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDragging = false;
      if (this.dragBlocker) {
        this.dragBlocker.remove();
        this.dragBlocker = null;
      }
      window.removeEventListener("pointermove", this.handleDragMove, { capture: true });
      window.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
    };
    checkSnapping(mouseX, mouseY) {
      const container = this.controller.container;
      const allEls = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, button, input, textarea, label, span, div, section, main, article, li, img, svg"));
      const candidates = [];
      for (const el of allEls) {
        if (el === document.documentElement || el === document.body)
          continue;
        if (container && (el === container || container.contains(el)))
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
          continue;
        const distToCenterH = Math.min(Math.abs(rect.left - mouseX), Math.abs(rect.right - mouseX), Math.abs(rect.left + rect.width / 2 - mouseX));
        const distToCenterV = Math.min(Math.abs(rect.top - mouseY), Math.abs(rect.bottom - mouseY), Math.abs(rect.top + rect.height / 2 - mouseY));
        if (distToCenterH > 450 && distToCenterV > 450)
          continue;
        candidates.push({ element: el, rect });
      }
      if (candidates.length === 0) {
        this.anchorHElement = null;
        this.anchorVElement = null;
        this.isSnappedH = false;
        this.isSnappedV = false;
        this.snapBoundaryH = null;
        this.snapBoundaryV = null;
        return;
      }
      let bestH = null;
      let minScoreH = Infinity;
      for (const cand of candidates) {
        const rect = cand.rect;
        const leftVal = rect.left;
        const rightVal = rect.right;
        const centerVal = rect.left + rect.width / 2;
        const opts = [
          { boundary: "Left-Edge", value: leftVal },
          { boundary: "Right-Edge", value: rightVal },
          { boundary: "Center-Axis", value: centerVal }
        ];
        for (const opt of opts) {
          const minDistH = Math.abs(mouseX - opt.value);
          let visualDistV = 0;
          if (mouseY < rect.top) {
            visualDistV = rect.top - mouseY;
          } else if (mouseY > rect.bottom) {
            visualDistV = mouseY - rect.bottom;
          }
          const scoreH = minDistH + visualDistV * 0.4;
          if (scoreH < minScoreH) {
            minScoreH = scoreH;
            bestH = {
              element: cand.element,
              rect,
              boundary: opt.boundary,
              value: opt.value,
              distance: minDistH
            };
          }
        }
      }
      let bestV = null;
      let minScoreV = Infinity;
      for (const cand of candidates) {
        const rect = cand.rect;
        const topVal = rect.top;
        const bottomVal = rect.bottom;
        const centerVal = rect.top + rect.height / 2;
        const opts = [
          { boundary: "Top-Edge", value: topVal },
          { boundary: "Bottom-Edge", value: bottomVal },
          { boundary: "Center-Axis", value: centerVal }
        ];
        for (const opt of opts) {
          const minDistV = Math.abs(mouseY - opt.value);
          let visualDistH = 0;
          if (mouseX < rect.left) {
            visualDistH = rect.left - mouseX;
          } else if (mouseX > rect.right) {
            visualDistH = mouseX - rect.right;
          }
          const scoreV = minDistV + visualDistH * 0.4;
          if (scoreV < minScoreV) {
            minScoreV = scoreV;
            bestV = {
              element: cand.element,
              rect,
              boundary: opt.boundary,
              value: opt.value,
              distance: minDistV
            };
          }
        }
      }
      if (bestH) {
        this.anchorHElement = bestH.element;
        this.snapBoundaryH = bestH.boundary;
        if (bestH.distance < 15) {
          if (!this.isSnappedH) {
            this.isSnappedH = true;
            this.snapX = bestH.value;
            this.snapMouseX = mouseX;
            this.dX = 0;
          }
        } else {
          this.isSnappedH = false;
          this.snapX = mouseX;
        }
      } else {
        this.anchorHElement = null;
        this.snapBoundaryH = null;
        this.isSnappedH = false;
      }
      if (bestV) {
        this.anchorVElement = bestV.element;
        this.snapBoundaryV = bestV.boundary;
        if (bestV.distance < 15) {
          if (!this.isSnappedV) {
            this.isSnappedV = true;
            this.snapY = bestV.value;
            this.snapMouseY = mouseY;
            this.dY = 0;
          }
        } else {
          this.isSnappedV = false;
          this.snapY = mouseY;
        }
      } else {
        this.anchorVElement = null;
        this.snapBoundaryV = null;
        this.isSnappedV = false;
      }
    }
    updateVisuals() {
      if (!this.svgOverlay || !this.controller.isUIVisible())
        return;
      this.svgOverlay.innerHTML = "";
      if (this.badgeElementH)
        this.badgeElementH.style.display = "none";
      if (this.badgeElementV)
        this.badgeElementV.style.display = "none";
      if (this.targetElement) {
        this.controller.drawHighlight(this.targetElement, this.isFrozen);
      }
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const dotAbsX = dotViewportX + globalThis.scrollX;
      const dotAbsY = dotViewportY + globalThis.scrollY;
      const svgNS = "http://www.w3.org/2000/svg";
      const drawAnchorOutline = (el, color) => {
        const rect = el.getBoundingClientRect();
        const box = document.createElementNS(svgNS, "rect");
        box.setAttribute("x", (rect.left + globalThis.scrollX).toString());
        box.setAttribute("y", (rect.top + globalThis.scrollY).toString());
        box.setAttribute("width", rect.width.toString());
        box.setAttribute("height", rect.height.toString());
        box.setAttribute("fill", color);
        box.setAttribute("stroke", "#10b981");
        box.setAttribute("stroke-width", "1");
        box.setAttribute("stroke-dasharray", "2");
        this.svgOverlay.appendChild(box);
      };
      if (this.anchorHElement) {
        drawAnchorOutline(this.anchorHElement, "rgba(16, 185, 129, 0.1)");
      }
      if (this.anchorVElement && this.anchorVElement !== this.anchorHElement) {
        drawAnchorOutline(this.anchorVElement, "rgba(59, 130, 246, 0.1)");
      }
      const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
      if (this.anchorHElement && rectH) {
        const rectAbsLeft = rectH.left + globalThis.scrollX;
        const rectAbsRight = rectH.right + globalThis.scrollX;
        const rectAbsCenterX = rectAbsLeft + rectH.width / 2;
        let anchorX = rectAbsLeft;
        if (this.snapBoundaryH === "Right-Edge") {
          anchorX = rectAbsRight;
        } else if (this.snapBoundaryH === "Center-Axis") {
          anchorX = rectAbsCenterX;
        }
        const lineH = document.createElementNS(svgNS, "line");
        lineH.setAttribute("x1", anchorX.toString());
        lineH.setAttribute("y1", dotAbsY.toString());
        lineH.setAttribute("x2", dotAbsX.toString());
        lineH.setAttribute("y2", dotAbsY.toString());
        lineH.setAttribute("stroke", "#10b981");
        lineH.setAttribute("stroke-dasharray", "4");
        lineH.setAttribute("stroke-width", "1.5");
        this.svgOverlay.appendChild(lineH);
        const offsetH = Math.round(dotViewportX - (anchorX - globalThis.scrollX));
        const displayOffsetH = offsetH >= 0 ? `+${offsetH}` : `${offsetH}`;
        if (this.badgeElementH) {
          this.badgeElementH.textContent = `${displayOffsetH}px`;
          this.badgeElementH.style.display = "block";
          this.badgeElementH.style.left = `${(anchorX + dotAbsX) / 2 - 20}px`;
          this.badgeElementH.style.top = `${dotAbsY - 20}px`;
        }
      }
      const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
      if (this.anchorVElement && rectV) {
        const rectAbsTop = rectV.top + globalThis.scrollY;
        const rectAbsBottom = rectV.bottom + globalThis.scrollY;
        const rectAbsCenterY = rectAbsTop + rectV.height / 2;
        let anchorY = rectAbsTop;
        if (this.snapBoundaryV === "Bottom-Edge") {
          anchorY = rectAbsBottom;
        } else if (this.snapBoundaryV === "Center-Axis") {
          anchorY = rectAbsCenterY;
        }
        const lineV = document.createElementNS(svgNS, "line");
        lineV.setAttribute("x1", dotAbsX.toString());
        lineV.setAttribute("y1", anchorY.toString());
        lineV.setAttribute("x2", dotAbsX.toString());
        lineV.setAttribute("y2", dotAbsY.toString());
        lineV.setAttribute("stroke", "#10b981");
        lineV.setAttribute("stroke-dasharray", "4");
        lineV.setAttribute("stroke-width", "1.5");
        this.svgOverlay.appendChild(lineV);
        const offsetV = Math.round(dotViewportY - (anchorY - globalThis.scrollY));
        const displayOffsetV = offsetV >= 0 ? `+${offsetV}` : `${offsetV}`;
        if (this.badgeElementV) {
          this.badgeElementV.textContent = `${displayOffsetV}px`;
          this.badgeElementV.style.display = "block";
          this.badgeElementV.style.left = `${dotAbsX + 10}px`;
          this.badgeElementV.style.top = `${(anchorY + dotAbsY) / 2 - 8}px`;
        }
      }
      const crosshairCircle = document.createElementNS(svgNS, "circle");
      crosshairCircle.setAttribute("cx", dotAbsX.toString());
      crosshairCircle.setAttribute("cy", dotAbsY.toString());
      crosshairCircle.setAttribute("r", "5");
      crosshairCircle.setAttribute("fill", "none");
      crosshairCircle.setAttribute("stroke", "#10b981");
      crosshairCircle.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairCircle);
      const crosshairH = document.createElementNS(svgNS, "line");
      crosshairH.setAttribute("x1", (dotAbsX - 8).toString());
      crosshairH.setAttribute("y1", dotAbsY.toString());
      crosshairH.setAttribute("x2", (dotAbsX + 8).toString());
      crosshairH.setAttribute("y2", dotAbsY.toString());
      crosshairH.setAttribute("stroke", "#10b981");
      crosshairH.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairH);
      const crosshairV = document.createElementNS(svgNS, "line");
      crosshairV.setAttribute("x1", dotAbsX.toString());
      crosshairV.setAttribute("y1", (dotAbsY - 8).toString());
      crosshairV.setAttribute("x2", dotAbsX.toString());
      crosshairV.setAttribute("y2", (dotAbsY + 8).toString());
      crosshairV.setAttribute("stroke", "#10b981");
      crosshairV.setAttribute("stroke-width", "1.5");
      this.svgOverlay.appendChild(crosshairV);
      const dragHandle = document.createElementNS(svgNS, "circle");
      dragHandle.setAttribute("cx", dotAbsX.toString());
      dragHandle.setAttribute("cy", dotAbsY.toString());
      dragHandle.setAttribute("r", "15");
      dragHandle.setAttribute("fill", "transparent");
      dragHandle.style.cursor = "move";
      dragHandle.style.pointerEvents = "auto";
      dragHandle.addEventListener("pointerdown", this.handleDragStart);
      this.svgOverlay.appendChild(dragHandle);
    }
    renderTooltip(e) {
      if (!this.targetElement)
        return;
      const info = this.resolver.resolve(this.targetElement) || {
        componentName: this.targetElement.tagName.toLowerCase(),
        tagName: this.targetElement.tagName.toLowerCase(),
        framework: "Unknown",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(this.targetElement.classList)
      };
      const config = this.controller.getConfig();
      const shortcuts = config?.shortcuts;
      const copyLabel = shortcuts?.copyMetadata?.key ? `Alt+${shortcuts.copyMetadata.key.toUpperCase()}` : "Alt+C";
      const freezeLabel = shortcuts?.toggleFreeze?.key ? `Alt+${shortcuts.toggleFreeze.key.toUpperCase()}` : "Alt+P";
      const modeLabel = shortcuts?.toggleMode?.key ? `Alt+${shortcuts.toggleMode.key.toUpperCase()}` : "Alt+X";
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
      let valH = 0;
      if (rectH) {
        valH = rectH.left;
        if (this.snapBoundaryH === "Right-Edge")
          valH = rectH.right;
        else if (this.snapBoundaryH === "Center-Axis")
          valH = rectH.left + rectH.width / 2;
      }
      const offsetH = Math.round(dotViewportX - valH);
      const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
      let valV = 0;
      if (rectV) {
        valV = rectV.top;
        if (this.snapBoundaryV === "Bottom-Edge")
          valV = rectV.bottom;
        else if (this.snapBoundaryV === "Center-Axis")
          valV = rectV.top + rectV.height / 2;
      }
      const offsetV = Math.round(dotViewportY - valV);
      const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
      const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
      const hStatus = this.anchorHElement ? `<span style="color: #10b981; font-weight:bold;">${selectorH} @ ${this.snapBoundaryH || "None"} (${offsetH >= 0 ? "+" : ""}${offsetH}px)</span>` : '<span style="color: #6b7280;">No Anchor</span>';
      const vStatus = this.anchorVElement ? `<span style="color: #10b981; font-weight:bold;">${selectorV} @ ${this.snapBoundaryV || "None"} (${offsetV >= 0 ? "+" : ""}${offsetV}px)</span>` : '<span style="color: #6b7280;">No Anchor</span>';
      const fileBase = info.fileName ? info.fileName.split("/").pop()?.split("\\").pop() || "unknown" : "unknown";
      const hintText = `Drag the Crosshair to position | Press ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze & Nudge"} | ${copyLabel} to Copy Design Metadata | ${modeLabel} to Switch Mode`;
      const hintHtml = hintText.split("|").map((part) => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
      const html = `
      <div class="hoversource-title" style="color: #10b981;">
        <span>Design Mode ${this.isFrozen ? "[FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="background: #064e3b; color: #34d399;">Active</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor Element: </span>
        <span class="hoversource-value">${this.targetElement.tagName.toLowerCase()}${this.targetElement.id ? "#" + this.targetElement.id : ""}${this.targetElement.classList.length > 0 ? "." + Array.from(this.targetElement.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".") : ""}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor File: </span>
        <span class="hoversource-value" style="color: #60a5fa;">${fileBase}:${info.lineNumber || 1}</span>
      </div>
      <div class="hoversource-section" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
        <span class="hoversource-label">H-Anchor: </span>
        ${hStatus}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">V-Anchor: </span>
        ${vStatus}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Nudge Offsets (dX, dY): </span>
        <span class="hoversource-value">${this.dX}px, ${this.dY}px</span>
      </div>
      <div class="hoversource-shortcut-hint" style="margin-top: 8px;">
        ${hintHtml}
      </div>
    `;
      this.controller.drawTooltip(html, e);
    }
    onShortcut(command) {
      if (command === "toggleFreeze") {
        this.isFrozen = !this.isFrozen;
        this.controller.setFreezeMode(this.isFrozen);
        console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
        this.updateVisuals();
        this.renderTooltip({ clientX: this.lastMouseX, clientY: this.lastMouseY });
      } else if (command === "copyMetadata") {
        this.copyMetadata();
      }
    }
    handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable")) {
          return;
        }
      }
      if (this.isFrozen && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const nudge = calculateNudge(e.key, e.shiftKey, this.dX, this.dY);
        this.dX = nudge.dX;
        this.dY = nudge.dY;
        this.updateVisuals();
        this.renderTooltip({ clientX: this.lastMouseX, clientY: this.lastMouseY });
      }
    };
    copyMetadata() {
      if (!this.targetElement)
        return;
      const info = this.resolver.resolve(this.targetElement) || {
        componentName: this.targetElement.tagName.toLowerCase(),
        tagName: this.targetElement.tagName.toLowerCase(),
        framework: "Unknown",
        fileName: "",
        lineNumber: 0,
        columnNumber: 0,
        classList: Array.from(this.targetElement.classList)
      };
      const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
      const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
      const commonParent = findCommonAncestor(this.anchorHElement, this.anchorVElement);
      const parentSelector = getSelector(commonParent);
      const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
      const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
      const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
      let valH = 0;
      if (rectH) {
        valH = rectH.left;
        if (this.snapBoundaryH === "Right-Edge")
          valH = rectH.right;
        else if (this.snapBoundaryH === "Center-Axis")
          valH = rectH.left + rectH.width / 2;
      }
      const offsetH = Math.round(dotViewportX - valH);
      const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
      let valV = 0;
      if (rectV) {
        valV = rectV.top;
        if (this.snapBoundaryV === "Bottom-Edge")
          valV = rectV.bottom;
        else if (this.snapBoundaryV === "Center-Axis")
          valV = rectV.top + rectV.height / 2;
      }
      const offsetV = Math.round(dotViewportY - valV);
      const cssRules = getSuggestedCSS(
        this.snapBoundaryH,
        this.snapBoundaryV,
        offsetH,
        offsetV,
        commonParent,
        dotViewportX,
        dotViewportY,
        this.anchorHElement,
        this.anchorVElement
      );
      const isHAndVSame = this.anchorHElement && this.anchorHElement === this.anchorVElement;
      const tagName = this.targetElement.tagName.toLowerCase();
      const classList = Array.from(this.targetElement.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
      const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
      const idStr = this.targetElement.id ? `#${this.targetElement.id}` : "";
      const selector = `${tagName}${idStr}${classStr}`;
      const anchorForContext = this.anchorHElement || this.anchorVElement || this.targetElement;
      const ancestors = this.resolver.resolveAncestors(anchorForContext, 8);
      let anchorElementDisplay = "";
      let anchorDisplayNote = null;
      if (anchorForContext) {
        try {
          const anchorComp = globalThis.getComputedStyle(anchorForContext);
          const d = anchorComp.display || "block";
          if (d === "flex" || d === "inline-flex") {
            anchorElementDisplay = `${d} (flex-direction: ${anchorComp.flexDirection})`;
            anchorDisplayNote = `Anchor element is a flex container. If inserting a new child into it, a flex child approach (e.g. margin-left: auto) may be more appropriate than position: absolute.`;
          } else if (d === "grid" || d === "inline-grid") {
            anchorElementDisplay = d;
            anchorDisplayNote = `Anchor element is a grid container. If inserting a new child into it, a grid child approach may be more appropriate than position: absolute.`;
          } else {
            anchorElementDisplay = d;
          }
        } catch {
        }
      }
      const positionedAncestor = ancestors.find((a) => a.position !== "static") ?? null;
      const directParent = ancestors[0] ?? null;
      const anchorFile = info.fileName || "";
      const seenFiles = /* @__PURE__ */ new Set([anchorFile]);
      const relatedFiles = anchorFile ? [`\`${anchorFile}\` (Line: ${info.lineNumber || 1}) \u2014 anchor component`] : [];
      for (const anc of ancestors) {
        if (anc.fileName && !seenFiles.has(anc.fileName)) {
          seenFiles.add(anc.fileName);
          const label = anc.componentName ? ` \u2014 \`${anc.componentName}\`` : "";
          relatedFiles.push(`\`${anc.fileName}\` (Line: ${anc.lineNumber || 1})${label}`);
        }
      }
      const posAncLine = positionedAncestor ? `\`${positionedAncestor.selector}\` (position: ${positionedAncestor.position})` + (positionedAncestor.fileName ? `, source: \`${positionedAncestor.fileName}\`:${positionedAncestor.lineNumber || 1}` : ", source unresolved (no fiber)") : "none found within 8 levels \u2014 CSS rules may need `position: relative` added to a parent";
      const directParentLine = directParent ? `\`${directParent.selector}\` (display: ${directParent.display})` + (directParent.layoutProps ? "\n  - " + Object.entries(directParent.layoutProps).filter(([, v]) => v && v !== "normal" && v !== "0px").map(([k, v]) => `${k}: ${v}`).join(" | ") : "") : "unresolved";
      const parentDisplay = directParent?.display ?? "";
      const layoutWarning = parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid" ? `Direct parent is a ${parentDisplay} container. Inserting as a ${parentDisplay.startsWith("grid") ? "grid" : "flex"} child or with position: absolute are both options \u2014 verify which fits the component layout.` : null;
      const filesSection = relatedFiles.length > 0 ? relatedFiles.map((f) => `  - ${f}`).join("\n") : "  - No source files resolved (fiber not available \u2014 non-React or production build)";
      const text = `
### HoverSource Design Placement Metadata
* **Component**: \`${info.componentName || tagName}\`
* **Element**: \`${selector}\`
* **File Path**: \`${info.fileName || "unknown"}\` (Line: ${info.lineNumber || 1}, Column: ${info.columnNumber || 1})
* **Framework**: ${info.framework}
* **Horizontal Anchor**:
  - Selector: \`${selectorH}\`
  - Boundary: \`${this.snapBoundaryH || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetH >= 0 ? "+" : ""}${offsetH}px\` (${this.isSnappedH ? "Snapped" : "Free"})
* **Vertical Anchor**:
  - Selector: \`${selectorV}\`
  - Boundary: \`${this.snapBoundaryV || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetV >= 0 ? "+" : ""}${offsetV}px\` (${this.isSnappedV ? "Snapped" : "Free"})

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${posAncLine}
* **Anchor Element**: \`${getSelector(anchorForContext)}\` (display: ${anchorElementDisplay || "block"})
${anchorDisplayNote ? `  - ${anchorDisplayNote}
` : ""}* **Direct Parent of Anchor**: ${directParentLine}
${layoutWarning ? `* ${layoutWarning}
` : ""}* **USE THIS CSS** (do not use the distance values above as CSS \u2014 use this block):
\`\`\`css
${cssRules}
\`\`\`
* **Source Files to Examine**:
${filesSection}

#### For the AI Agent
The CSS above assumes the new element will be a direct child of the Positioned Ancestor.
You must determine the actual DOM insertion point by examining the source files above.
The following is NOT resolved automatically and requires your judgment:
- **DOM insertion point**: where in the JSX/template tree the new element belongs
  (sibling of anchor, child of a wrapper, inside a portal, etc.)
- **Whether \`position: absolute\` is appropriate**: if the anchor or its parent is a flex/grid
  container, a flex/grid child approach may be more appropriate
- **Whether the Positioned Ancestor has \`position: relative\` in source**: verify
  it is not conditionally applied

Suggested layout insertion (heuristic only):
* Target DOM Parent: \`${isHAndVSame ? selectorH : parentSelector}\` (${isHAndVSame ? "same as anchor" : "common ancestor of H and V anchors"})
`.trim();
      this.controller.copyToClipboard(text);
    }
    onConfigUpdate(newConfig) {
    }
    onUIVisibilityChanged(visible) {
      if (this.svgOverlay) {
        this.svgOverlay.style.display = visible ? "block" : "none";
      }
      if (this.badgeElementH) {
        this.badgeElementH.style.display = visible && this.isSnappedH ? "block" : "none";
      }
      if (this.badgeElementV) {
        this.badgeElementV.style.display = visible && this.isSnappedV ? "block" : "none";
      }
    }
  };
  function shouldReleaseSnap(mouseX, mouseY, snapMouseX, snapMouseY, deadzone) {
    const distX = Math.abs(mouseX - snapMouseX);
    const distY = Math.abs(mouseY - snapMouseY);
    return distX > deadzone || distY > deadzone;
  }
  function calculateNudge(key, shiftKey, currentDx, currentDy) {
    const step = shiftKey ? 8 : 1;
    let dX = currentDx;
    let dY = currentDy;
    if (key === "ArrowLeft") {
      dX -= step;
    } else if (key === "ArrowRight") {
      dX += step;
    } else if (key === "ArrowUp") {
      dY -= step;
    } else if (key === "ArrowDown") {
      dY += step;
    }
    return { dX, dY };
  }
  function findCommonAncestor(el1, el2) {
    if (!el1 || !el2)
      return typeof document !== "undefined" ? document.body : el1 || el2 || {};
    const path = [];
    let curr = el1;
    while (curr) {
      path.push(curr);
      curr = curr.parentElement;
    }
    curr = el2;
    while (curr) {
      if (path.includes(curr))
        return curr;
      curr = curr.parentElement;
    }
    return document.body;
  }
  function getSelector(el) {
    if (!el)
      return "";
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList).filter((c) => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
    const classStr = classes ? `.${classes}` : "";
    return `${tag}${id}${classStr}`;
  }
  function getSuggestedCSS(boundaryH, boundaryV, offsetH, offsetV, parentContainer, activeX, activeY, anchorH, anchorV) {
    const rules = ["position: absolute;"];
    let transformX = "";
    let transformY = "";
    if (anchorH && anchorH === anchorV) {
      if (boundaryH === "Left-Edge") {
        if (offsetH >= 0) {
          rules.push(`  left: ${offsetH}px;`);
        } else {
          rules.push(`  right: calc(100% + ${Math.abs(offsetH)}px);`);
        }
      } else if (boundaryH === "Right-Edge") {
        if (offsetH >= 0) {
          rules.push(`  left: calc(100% + ${offsetH}px);`);
        } else {
          rules.push(`  right: ${Math.abs(offsetH)}px;`);
        }
      } else if (boundaryH === "Center-Axis") {
        if (offsetH === 0) {
          rules.push(`  left: 50%;`);
        } else {
          rules.push(`  left: calc(50% + ${offsetH}px);`);
        }
        transformX = "translateX(-50%)";
      }
      if (boundaryV === "Top-Edge") {
        if (offsetV >= 0) {
          rules.push(`  top: ${offsetV}px;`);
        } else {
          rules.push(`  bottom: calc(100% + ${Math.abs(offsetV)}px);`);
        }
      } else if (boundaryV === "Bottom-Edge") {
        if (offsetV >= 0) {
          rules.push(`  top: calc(100% + ${offsetV}px);`);
        } else {
          rules.push(`  bottom: ${Math.abs(offsetV)}px;`);
        }
      } else if (boundaryV === "Center-Axis") {
        if (offsetV === 0) {
          rules.push(`  top: 50%;`);
        } else {
          rules.push(`  top: calc(50% + ${offsetV}px);`);
        }
        transformY = "translateY(-50%)";
      }
      if (transformX && transformY) {
        rules.push("  transform: translate(-50%, -50%);");
      } else if (transformX) {
        rules.push(`  transform: ${transformX};`);
      } else if (transformY) {
        rules.push(`  transform: ${transformY};`);
      }
      rules.push(`  white-space: nowrap;`);
    } else {
      const parentRect = parentContainer.getBoundingClientRect();
      const relX = activeX - parentRect.left;
      const relY = activeY - parentRect.top;
      const pctX = Math.round(relX / parentRect.width * 100);
      const pctY = Math.round(relY / parentRect.height * 100);
      rules.push(`  left: ${pctX}%;`);
      rules.push(`  top: ${pctY}%;`);
      rules.push(`  white-space: nowrap;`);
    }
    return rules.join("\n");
  }

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
