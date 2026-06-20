import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";
import { SourceResolver, ParentVisualEffect } from "@hoversource/source-resolver";
import { inspectVisualContext } from "../inspector.js";

interface TooltipLabels {
  copyLabel: string;
  copyAllLabel: string;
  freezeLabel: string;
  minimalLabel: string;
  dbLabel: string;
  modeLabel: string;
}

function getCompanionPort(): number {
  return (globalThis as any).__HOVERSOURCE_PORT__ ?? 7300;
}

export class InspectorAdapter implements InteractionMode {
  public readonly id = "inspector";
  private controller!: OverlayController;
  
  private readonly resolver = new SourceResolver();
  private isFrozen = false;
  private minimalMode = false;
  
  private currentElement: HTMLElement | null = null;
  private currentSourceInfo: any = null;
  private debounceTimer: any = null;
  private maxTraversalDepth = 32;

  // --- Layer Picker state ---
  private layerStack: HTMLElement[] = [];
  private activeLayerIndex = 0;
  private layerPickerEnabled = true;
  private layerScrollModifiers = { altKey: true, shiftKey: true, ctrlKey: false };

  public activate(controller: OverlayController): void {
    this.controller = controller;
    const config = this.controller.getConfig();
    this.minimalMode = !!config?.minimalModeByDefault;
    this.layerPickerEnabled = config?.layerPickerEnabled !== false;
    this.layerScrollModifiers = config?.layerPickerScroll ?? { altKey: true, shiftKey: true, ctrlKey: false };
    this.maxTraversalDepth = config?.maxTraversalDepth ?? 32;
    if (this.layerPickerEnabled) {
      window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
    }
    console.log("[HoverSource] Activated Inspector Mode");
  }

  public deactivate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.controller.clear();
    this.currentElement = null;
    this.currentSourceInfo = null;
    this.layerStack = [];
    this.activeLayerIndex = 0;
    window.removeEventListener("wheel", this.handleAltScroll, { capture: true } as any);
    if (this.isFrozen) {
      this.isFrozen = false;
      this.controller.setFreezeMode(false);
    }
  }

  public onPointerOver(event: PointerEvent, target: HTMLElement): void {
    const rawStack = document.elementsFromPoint(event.clientX, event.clientY) as HTMLElement[];
    const container = (this.controller as any).container as HTMLElement | null;
    this.layerStack = rawStack.filter(el => {
      if (el === document.documentElement || el === document.body) return false;
      if (container && (el === container || container.contains(el))) return false;
      return true;
    }).slice(0, this.maxTraversalDepth);

    this.activeLayerIndex = 0;
    this.resolveAndShowLayer(this.activeLayerIndex, event);
  }

  public onPointerMove(event: PointerEvent): void {
    if (!this.currentElement) return;

    const activeEl = this.layerStack[this.activeLayerIndex];
    if (activeEl && this.activeLayerIndex > 0) {
      const rect = activeEl.getBoundingClientRect();
      const outside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (outside) {
        this.activeLayerIndex = 0;
        this.resolveAndShowLayer(0, event);
        return;
      }
    }

    if (this.currentSourceInfo && this.controller.isUIVisible()) {
      this.controller.drawTooltip("", event);
      
      const tooltipBox = (this.controller as any).tooltipBox as HTMLElement | null;
      if (tooltipBox && this.currentSourceInfo.visualContext) {
        const parentItems = tooltipBox.querySelectorAll(".hoversource-parent-item");
        const activeItems: { item: HTMLElement; fx: any }[] = [];
        
        parentItems.forEach((item) => {
          if (item.classList.contains("hs-parent-active")) {
            const idxStr = (item as HTMLElement).dataset?.index ?? item.getAttribute("data-index");
            if (idxStr !== null && idxStr !== undefined) {
              const idx = Number.parseInt(idxStr, 10);
              const fx = this.currentSourceInfo.visualContext.parentEffects[idx];
              if (fx?.element) {
                activeItems.push({ item: item as HTMLElement, fx });
              }
            }
          }
        });

        if (activeItems.length > 0) {
          this.controller.clearParentHighlights();
          activeItems.forEach(({ item, fx }) => {
            const rowRect = item.getBoundingClientRect();
            this.controller.drawParentHighlight(fx, rowRect);
          });
        }
      }
    }
  }

  public onShortcut(command: SemanticShortcut): void {
    if (command === 'toggleFreeze') {
      this.isFrozen = !this.isFrozen;
      this.controller.setFreezeMode(this.isFrozen);
      console.log(`[HoverSource] Freeze: ${this.isFrozen}`);
      if (this.isFrozen && this.currentElement) {
        this.flushResolve(this.currentElement, { clientX: 0, clientY: 0 } as PointerEvent);
      } else {
        this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
      }
    } else if (command === 'toggleMinimal') {
      this.minimalMode = !this.minimalMode;
      console.log(`[HoverSource] Minimal Mode: ${this.minimalMode}`);
      this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
    } else if (command === 'copyMetadata') {
      this.copyMetadata();
    } else if (command === 'copyAllLayers') {
      this.copyAllLayers();
    }
  }

  public onConfigUpdate(newConfig: any): void {
    this.minimalMode = !!newConfig.minimalModeByDefault;
    this.maxTraversalDepth = newConfig.maxTraversalDepth ?? 32;
    const newEnabled = newConfig.layerPickerEnabled !== false;
    if (newEnabled !== this.layerPickerEnabled) {
      this.layerPickerEnabled = newEnabled;
      if (newEnabled) {
        window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
      } else {
        window.removeEventListener("wheel", this.handleAltScroll, { capture: true } as any);
      }
    }
    this.layerScrollModifiers = newConfig.layerPickerScroll ?? this.layerScrollModifiers;
    this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
  }

  public onUIVisibilityChanged(visible: boolean): void {
  }

  private readonly handleAltScroll = (e: WheelEvent): void => {
    const m = this.layerScrollModifiers;
    if (!!e.altKey !== !!m.altKey || !!e.shiftKey !== !!m.shiftKey || !!e.ctrlKey !== !!m.ctrlKey) return;
    if (this.layerStack.length === 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const dir = e.deltaY > 0 ? 1 : -1;
    this.activeLayerIndex = (this.activeLayerIndex + dir + this.layerStack.length) % this.layerStack.length;
    this.resolveAndShowLayer(this.activeLayerIndex, { clientX: e.clientX, clientY: e.clientY } as PointerEvent);
  };

  private resolveAndShowLayer(index: number, event: PointerEvent): void {
    const target = this.layerStack[index];
    if (!target) {
      this.controller.clear();
      this.currentElement = null;
      this.currentSourceInfo = null;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      return;
    }

    // Phase A: Draw highlight immediately
    this.currentElement = target;
    if (this.controller.isUIVisible()) {
      this.controller.drawHighlight(target, this.isFrozen);
    }

    // Cancel any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Phase B: Debounce source resolution and visual context
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.currentElement !== target) return;
      this.flushResolve(target, event);
    }, 50);
  }

  private flushResolve(target: HTMLElement, event: PointerEvent): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
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
    info.visualContext = inspectVisualContext(target, this.maxTraversalDepth);
    this.currentSourceInfo = info;

    if (this.controller.isUIVisible()) {
      this.renderTooltip(event);
    }

    if (info.fileName) {
      this.fetchBackgroundValidation(info, target, event);
    }
  }

  private fetchBackgroundValidation(info: any, target: HTMLElement, e: PointerEvent) {
    const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
    
    fetch(validateUrl)
      .then(res => res.json())
      .then(data => {
        if (this.currentElement === target) {
          let line = info.lineNumber || 1;
          let col = info.columnNumber || 1;

          if (data?.corrected) {
            line = data.corrected.line;
            col = data.corrected.column;
          }

          info.lineNumber = line;
          info.columnNumber = col;

          const classesToResolve = new Set<string>();
          if (info.visualContext) {
            info.visualContext.parentEffects.forEach((fx: ParentVisualEffect) => {
              fx.classList.forEach(cls => classesToResolve.add(cls));
            });
          }
          if (info.classList) {
            info.classList.forEach((cls: string) => classesToResolve.add(cls));
          }
          const classListParam = Array.from(classesToResolve).join(",");

          const staticContextUrl = `http://127.0.0.1:${getCompanionPort()}/static-context?file=${encodeURIComponent(info.fileName)}&line=${line}&column=${col}&tagName=${encodeURIComponent(info.componentName || info.tagName || "")}&classList=${encodeURIComponent(classListParam)}`;
          
          fetch(staticContextUrl)
            .then(res => res.json())
            .then(staticData => {
              if (staticData && this.currentElement === target) {
                info.staticMetadata = staticData;
                this.currentSourceInfo = info;
                if (this.controller.isUIVisible()) {
                  this.renderTooltip(e);
                }
              }
            })
            .catch(err => console.warn("[HoverSource] Static context fetch failed:", err));
        }
      })
      .catch(err => console.warn("[HoverSource] Background line validation failed:", err));
  }

  private getShortcutLabel(shortcut: any): string {
    if (!shortcut) return "";
    const parts = [];
    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.altKey) parts.push("Alt");
    if (shortcut.shiftKey) parts.push("Shift");
    parts.push(shortcut.key.toUpperCase());
    return parts.join("+");
  }

  private renderMinimalTooltip(
    element: HTMLElement,
    info: any,
    labels: TooltipLabels
  ): string {
    const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel } = labels;
    const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Detailed | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
    const hintHtml = hintText.split("|").map(part => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");

    let vueHint = "";
    if (info.framework === "Vue" && !info.lineNumber) {
      vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
    }

    return `
      <div class="hoversource-title" style="${this.isFrozen ? 'color: #f59e0b;' : ''}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? ' [FROZEN]' : ''}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? 'background: #78350f; color: #fde68a;' : ''}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
          ${info.fileName.split('/').pop().split('\\').pop()}${info.lineNumber ? `:${info.lineNumber}` : ""}
        </span>
      </div>
      ${vueHint}
      <div class="hoversource-shortcut-hint">
        ${hintHtml}
      </div>
    `;
  }

  private renderBasicStats(element: HTMLElement, info: any, computed: CSSStyleDeclaration): string {
    const width = element.offsetWidth || element.clientWidth;
    const height = element.offsetHeight || element.clientHeight;
    const color = computed.color;
    const bgColor = computed.backgroundColor;

    const tagName = element.tagName.toLowerCase();
    const classList = Array.from(element.classList).filter((c: string) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
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
        selectorHtml += ` ➔ ${originParts.join(" ")}`;
      }
    }

    return `
      <div class="hoversource-title" style="${this.isFrozen ? 'color: #f59e0b;' : ''}">
        <span>${info.componentName || element.tagName.toLowerCase()}${this.isFrozen ? ' [FROZEN]' : ''}</span>
        <span class="hoversource-framework" style="${this.isFrozen ? 'background: #78350f; color: #fde68a;' : ''}">${info.framework}</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Element: </span>
        ${selectorHtml}
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">File: </span>
        <span class="hoversource-link" onclick="globalThis.__HoverSourceOpen__('${info.fileName}', ${info.lineNumber || 1}, ${info.columnNumber || 1}, '${info.tagName || ""}', '${(info.classList || []).join(",")}')">
          ${info.fileName.split('/').pop().split('\\').pop()}${info.lineNumber ? `:${info.lineNumber}` : ""}
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
  }

  private renderVisualDetails(shadow: string | null, animation: string | null, info: any): string {
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
      const constraints = Object.entries(info.visualContext.layoutConstraints)
        .map(([prop, val]) => `${prop}: ${val}`)
        .join(", ");
      html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Layout: </span>
          <span class="hoversource-value">${constraints}</span>
        </div>
      `;
    }
    return html;
  }

  private renderParentEffects(info: any): string {
    if (!info.visualContext || info.visualContext.parentEffects.length === 0) {
      return "";
    }
    const effectsHtml = info.visualContext.parentEffects
      .map((fx: ParentVisualEffect, idx: number) => {
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
        const isVisual = fx.property === "mask-image" || fx.property === "clip-path" || fx.property.startsWith("overflow");
        const cursorStyle = isVisual ? "cursor: pointer;" : "cursor: default;";
        const hoverClass = isVisual ? " hoversource-parent-item" : "";
        return `<div class="hoversource-stack-item${hoverClass}" data-index="${idx}" style="${cursorStyle}">${fx.tagName}${classStr}${originLabel} ➔ ${fx.property}: ${fx.value}</div>`;
      })
      .join("");

    return `
      <div class="hoversource-section">
        <span class="hoversource-label">Parent Styles: </span>
        <div class="hoversource-stack">
          ${effectsHtml}
        </div>
      </div>
    `;
  }

  private renderStaticMetadata(info: any): string {
    if (!info.staticMetadata) return "";
    let html = "";
    if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
      const commentsHtml = info.staticMetadata.comments
        .map((c: string) => `<div class="hoversource-stack-item" style="color: #6b7280; font-style: italic;">${c}</div>`)
        .join("");
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
      const attrs = Object.entries(info.staticMetadata.rawAttributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      html += `
        <div class="hoversource-section">
          <span class="hoversource-label">Source Attributes: </span>
          <span class="hoversource-value">${attrs}</span>
        </div>
      `;
    }
    return html;
  }

  private renderDetailedTooltip(
    element: HTMLElement,
    info: any,
    labels: TooltipLabels
  ): string {
    const { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel } = labels;
    const computed = globalThis.getComputedStyle(element);
    const shadow = computed.boxShadow;
    const animation = computed.animationName === "none" ? null : `${computed.animationName} ${computed.animationDuration}`;

    const stack: string[] = [];
    let current: HTMLElement | null = element;
    while (current && stack.length < 5) {
      const elInfo = this.resolver.resolve(current);
      if (elInfo?.componentName) {
        stack.push(elInfo.componentName);
      } else {
        const classStr = current.className && typeof current.className === 'string' ? `.${Array.from(current.classList).join(".")}` : "";
        stack.push(`${current.tagName.toLowerCase()}${classStr}`);
      }
      current = current.parentElement;
    }

    let html = this.renderBasicStats(element, info, computed);
    html += this.renderVisualDetails(shadow, animation, info);
    html += this.renderParentEffects(info);
    html += this.renderStaticMetadata(info);

    const hintText = `Press ${copyLabel} to copy | ${copyAllLabel} to copy all | ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze"} | ${minimalLabel} for Minimal | ${dbLabel} for Config | ${modeLabel} to Switch Mode`;
    const hintHtml = hintText.split("|").map(part => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");

    let vueHint = "";
    if (info.framework === "Vue" && !info.lineNumber) {
      vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
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
      ${vueHint}
      <div class="hoversource-shortcut-hint">
        ${hintHtml}
      </div>
    `;

    return html;
  }

  private renderTooltip(e: PointerEvent) {
    if (!this.currentElement || !this.currentSourceInfo) return;
    const element = this.currentElement;
    const info = this.currentSourceInfo;
    const config = this.controller.getConfig();
    const shortcuts = config?.shortcuts;

    const copyLabel = this.getShortcutLabel(shortcuts?.copyMetadata) || "[C]";
    const copyAllLabel = this.getShortcutLabel(shortcuts?.copyAllLayers || { key: "c", altKey: true, ctrlKey: false, shiftKey: true }) || "[Alt+Shift+C]";
    const minimalLabel = this.getShortcutLabel(shortcuts?.toggleMinimal) || "[M]";
    const freezeLabel = this.getShortcutLabel(shortcuts?.toggleFreeze) || "[F]";
    const dbLabel = this.getShortcutLabel(shortcuts?.openDashboard) || "[Alt+D]";
    const modeLabel = this.getShortcutLabel(shortcuts?.toggleMode) || "[Alt+X]";

    // Build layer column (always rendered, even for a single layer)
    const topLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2z" /></svg>`;
    const chevronLayerSvg = `<svg viewBox="64 60 512 260" width="18" height="9" style="display:block"><path class="hs-layer-shape" d="M112.1 154.4L276.4 230.3C304.1 243.1 336 243.1 363.7 230.3L528 154.4L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L112.1 154.4z" /></svg>`;
    const layerDots = this.layerStack.map((el, i) => {
      const isActive = i === this.activeLayerIndex;
      const tag = el.tagName.toLowerCase();
      const cls = Array.from(el.classList)
        .filter((c: string) => !c.startsWith("hoversource") && !c.startsWith("hs-"))
        .slice(0, 2).join(".");
      const label = cls ? `${tag}.${cls}` : tag;
      const zIndex = this.layerStack.length - i;
      const svgContent = i === 0 ? topLayerSvg : chevronLayerSvg;
      return `<div class="hs-layer-dot${isActive ? " hs-layer-dot--active" : ""}" style="z-index: ${zIndex}" title="Layer ${i + 1}: ${label}">${svgContent}</div>`;
    }).join("");
    const scrollHint = (() => {
      const m = this.layerScrollModifiers;
      const parts: string[] = [];
      if (m.ctrlKey) parts.push('Ctrl');
      if (m.altKey) parts.push('Alt');
      if (m.shiftKey) parts.push('Shift');
      parts.push('Scroll');
      return parts.join('+');
    })();
    const layerHint = this.layerStack.length > 1 ? `<div class="hs-layer-hint">${scrollHint}</div>` : "";
    const layerColumnHtml = `<div class="hs-layer-column">${layerDots}${layerHint}</div>`;

    const labels: TooltipLabels = { copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel };

    const innerHtml = this.minimalMode
      ? this.renderMinimalTooltip(element, info, labels)
      : this.renderDetailedTooltip(element, info, labels);

    const html = `<div class="hs-tooltip-content-wrapper"><div style="flex:1;min-width:0">${innerHtml}</div>${layerColumnHtml}</div>`;
    this.controller.drawTooltip(html, e);

    const tooltipBox = (this.controller as any).tooltipBox as HTMLElement | null;
    if (tooltipBox) {
      const parentItems = tooltipBox.querySelectorAll(".hoversource-parent-item");
      
      const drawDefaultHighlights = () => {
        this.controller.clearParentHighlights();
        parentItems.forEach((item) => {
          const idxStr = (item as HTMLElement).dataset?.index ?? item.getAttribute("data-index");
          if (idxStr !== null && idxStr !== undefined) {
            const idx = Number.parseInt(idxStr, 10);
            const fx = info.visualContext?.parentEffects[idx];
            const shouldHighlight = fx?.element && (fx.property === "mask-image" || fx.property === "clip-path");
            if (shouldHighlight) {
              const rowRect = item.getBoundingClientRect();
              this.controller.drawParentHighlight(fx, rowRect);
              item.classList.add("hs-parent-active");
            } else {
              item.classList.remove("hs-parent-active");
            }
          }
        });
      };

      // Draw defaults on initial render
      drawDefaultHighlights();

      parentItems.forEach((item) => {
        item.addEventListener("mouseenter", () => {
          const idxStr = (item as HTMLElement).dataset?.index ?? item.getAttribute("data-index");
          if (idxStr !== null && idxStr !== undefined) {
            const idx = Number.parseInt(idxStr, 10);
            const fx = info.visualContext?.parentEffects[idx];
            if (fx?.element) {
              const rowRect = item.getBoundingClientRect();
              
              // Clear active class from all rows
              parentItems.forEach(el => el.classList.remove("hs-parent-active"));
              // Add to this row
              item.classList.add("hs-parent-active");

              this.controller.clearParentHighlights();
              this.controller.drawParentHighlight(fx, rowRect);
            }
          }
        });
        item.addEventListener("mouseleave", () => {
          drawDefaultHighlights();
        });
      });
    }
  }

  private formatSelectorLabel(tagName: string, classList: string[], classOrigins: Record<string, any> | undefined): string {
    const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
    const elementSelector = `${tagName}${classStr}`;
    let label = `\`${elementSelector}\``;
    if (classOrigins) {
      const originList: string[] = [];
      for (const cls of classList) {
        const origin = classOrigins[cls];
        if (origin) {
          originList.push(`[Source: \`${origin.file}\` (Line: \`${origin.line}\`, Column: \`${origin.column}\`)]`);
        }
      }
      if (originList.length > 0) {
        label += ` ➔ ${originList.join(" ")}`;
      }
    }
    return label;
  }

  private formatParentStyles(parentEffects: ParentVisualEffect[], classOrigins: Record<string, any> | undefined): string {
    return parentEffects
      .map((fx: ParentVisualEffect) => {
        const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
        let originLabel = "";
        if (classOrigins) {
          for (const cls of fx.classList) {
            const origin = classOrigins[cls];
            if (origin) {
              originLabel = ` ➔ [Source: \`${origin.file}\` (Line: ${origin.line}, Column: ${origin.column})]`;
              break;
            }
          }
        }
        return `  - \`${fx.tagName}${classStr}\` ➔ \`${fx.property}: ${fx.value}\`${originLabel}`;
      })
      .join("\n");
  }

  private formatLayoutConstraints(layoutConstraints: Record<string, any>): string {
    return Object.entries(layoutConstraints)
      .map(([k, v]) => `  - \`${k}: ${v}\``)
      .join("\n");
  }

  private formatSourceComments(comments: string[]): string {
    return comments
      .map((c: string) => `  - \`${c}\``)
      .join("\n");
  }

  private formatSourceAttributes(rawAttributes: Record<string, any>): string {
    return Object.entries(rawAttributes)
      .map(([k, v]) => `  - \`${k}="${v}"\``)
      .join("\n");
  }

  private formatElementMetadata(element: HTMLElement, info: any): string {
    const computed = globalThis.getComputedStyle(element);
    
    const data = {
      framework: info.framework,
      component: info.componentName || element.tagName.toLowerCase(),
      file: info.fileName,
      line: info.lineNumber,
      column: info.columnNumber,
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
    const classList = Array.from(element.classList).filter((c: string) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
    const selectorLabel = this.formatSelectorLabel(tagName, classList, info.staticMetadata?.classOrigins);

    const directionStr = data.styles.display === "flex" ? `(direction: ${data.styles.flexDirection})` : "";
    let text = `* **Component**: \`${data.component}\`
* **Element**: ${selectorLabel}
* **File Path**: \`${data.file || "Unknown"}\`${data.line ? ` (Line: ${data.line}, Column: ${data.column})` : ""}
* **Framework**: ${data.framework}
* **Dimensions**: ${data.dimensions}
* **Key Styles**:
  - Color: \`${data.styles.color}\`
  - Background: \`${data.styles.backgroundColor}\`
  - Box Shadow: \`${data.styles.boxShadow}\`
  - Margin: \`${data.styles.margin}\` | Padding: \`${data.styles.padding}\`
  - Display: \`${data.styles.display}\` ${directionStr}`;

    if (info.visualContext && info.visualContext.parentEffects.length > 0) {
      const parentList = this.formatParentStyles(info.visualContext.parentEffects, info.staticMetadata?.classOrigins);
      text += `\n* **Parent Styles**:\n${parentList}`;
    }

    if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
      const layoutList = this.formatLayoutConstraints(info.visualContext.layoutConstraints);
      text += `\n* **Layout Constraints**:\n${layoutList}`;
    }

    if (info.staticMetadata) {
      if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
        const commentList = this.formatSourceComments(info.staticMetadata.comments);
        text += `\n* **Source Comments**:\n${commentList}`;
      }
      if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
        const attrList = this.formatSourceAttributes(info.staticMetadata.rawAttributes);
        text += `\n* **Source Attributes**:\n${attrList}`;
      }
    }

    return text;
  }

  private copyMetadata() {
    if (!this.currentSourceInfo || !this.currentElement) return;
    const text = `### HoverSource Component Metadata\n` + this.formatElementMetadata(this.currentElement, this.currentSourceInfo);
    this.controller.copyToClipboard(text);
  }

  private formatMinifiedHtmlNode(node: Node, indent: string): string {
    if (node.nodeType === 3) { // Text node
      const text = node.nodeValue?.trim();
      return text ? `${indent}...` : "";
    }
    
    if (node.nodeType === 1) { // Element node
      const elNode = node as HTMLElement;
      const tagName = elNode.tagName.toLowerCase();
      
      // Gather attributes
      const attrs: string[] = [];
      if (elNode.id) {
        attrs.push(`id="${elNode.id}"`);
      }
      if (elNode.className && typeof elNode.className === 'string') {
        const classes = Array.from(elNode.classList).filter(c => !c.startsWith("hoversource") && !c.startsWith("hs-"));
        if (classes.length > 0) {
          attrs.push(`class="${classes.join(' ')}"`);
        }
      }
      
      if (elNode.getAttribute("href")) {
        attrs.push(`href="${elNode.getAttribute("href")}"`);
      }
      
      const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
      const children = Array.from(elNode.childNodes);
      
      if (children.length === 0) {
        return `${indent}<${tagName}${attrStr}></${tagName}>`;
      }
      
      const childStrings = children
        .map(c => this.formatMinifiedHtmlNode(c, indent + "  "))
        .filter(s => s !== "");
        
      if (childStrings.length === 0) {
        return `${indent}<${tagName}${attrStr}></${tagName}>`;
      }
      
      return `${indent}<${tagName}${attrStr}>\n${childStrings.join("\n")}\n${indent}</${tagName}>`;
    }
    
    return "";
  }

  private getMinifiedHTML(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    
    // Remove HoverSource containers or elements if any inside the clone
    const hsEls = clone.querySelectorAll('.hoversource-container, [class^="hs-"]');
    hsEls.forEach(e => e.remove());

    return this.formatMinifiedHtmlNode(clone, "");
  }

  private getTargetHTMLToCopy(el: HTMLElement): HTMLElement {
    const parent = el.parentElement;
    if (parent && parent !== document.body && parent !== document.documentElement) {
      const parentInfo = this.resolver.resolve(parent);
      const isParentCustomComponent = !!parentInfo?.componentName && parentInfo.framework !== "Unknown";
      
      if (!isParentCustomComponent && parent.children.length <= 5) {
        const leafTags = ["input", "button", "img", "svg", "span", "i", "a", "label"];
        if (leafTags.includes(el.tagName.toLowerCase()) || el.children.length === 0) {
          return parent;
        }
      }
    }
    return el;
  }

  private copyAllLayers() {
    if (this.layerStack.length === 0) return;
    
    let text = `### HoverSource Component Metadata\n`;
    text += `Found ${this.layerStack.length} layer(s), ordered from leaf (Layer 1) to root:\n\n`;
    
    this.layerStack.forEach((el, index) => {
      let info: any;
      if (el === this.currentElement && this.currentSourceInfo) {
        info = this.currentSourceInfo;
      } else {
        info = this.resolver.resolve(el) || {
          componentName: el.tagName.toLowerCase(),
          tagName: el.tagName.toLowerCase(),
          framework: "Unknown",
          fileName: "",
          lineNumber: 0,
          columnNumber: 0,
          classList: Array.from(el.classList),
          visualContext: null,
          staticMetadata: null
        };
        info.visualContext = inspectVisualContext(el);
      }
      
      const layerNum = index + 1;
      const totalLayers = this.layerStack.length;
      text += `#### Layer ${layerNum}/${totalLayers}: \`${info.componentName || el.tagName.toLowerCase()}\` (${el.tagName.toLowerCase()})\n`;
      text += this.formatElementMetadata(el, info) + "\n\n";
    });
    
    const activeEl = this.layerStack[this.activeLayerIndex] || this.layerStack[0];
    if (activeEl) {
      const targetElToCopy = this.getTargetHTMLToCopy(activeEl);
      const label = targetElToCopy === activeEl ? `Layer ${this.activeLayerIndex + 1}` : `Layer ${this.activeLayerIndex + 1} with siblings`;
      text += `### Target Element HTML Structure (${label})\n`;
      text += `\`\`\`html\n${this.getMinifiedHTML(targetElToCopy)}\n\`\`\`\n`;
    }
    
    this.controller.copyToClipboard(text.trim());
  }
}
