import { SourceResolver } from "@hoversource/source-resolver";
import { inspectVisualContext } from "../inspector.js";
function getCompanionPort() {
    return globalThis.__HOVERSOURCE_PORT__ ?? 3000;
}
export class InspectorAdapter {
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
        this.layerStack = rawStack.filter(el => {
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
            const outside = event.clientX < rect.left ||
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
        }
    }
    onShortcut(command) {
        if (command === 'toggleFreeze') {
            this.isFrozen = !this.isFrozen;
            this.controller.setFreezeMode(this.isFrozen);
            console.log(`[HoverSource] Freeze: ${this.isFrozen}`);
            this.renderTooltip({ clientX: 0, clientY: 0 });
        }
        else if (command === 'toggleMinimal') {
            this.minimalMode = !this.minimalMode;
            console.log(`[HoverSource] Minimal Mode: ${this.minimalMode}`);
            this.renderTooltip({ clientX: 0, clientY: 0 });
        }
        else if (command === 'copyMetadata') {
            this.copyMetadata();
        }
        else if (command === 'copyAllLayers') {
            this.copyAllLayers();
        }
    }
    onConfigUpdate(newConfig) {
        this.minimalMode = !!newConfig.minimalModeByDefault;
        const newEnabled = newConfig.layerPickerEnabled !== false;
        if (newEnabled !== this.layerPickerEnabled) {
            this.layerPickerEnabled = newEnabled;
            if (newEnabled) {
                window.addEventListener("wheel", this.handleAltScroll, { capture: true, passive: false });
            }
            else {
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
                const classesToResolve = new Set();
                if (info.visualContext) {
                    info.visualContext.parentEffects.forEach((fx) => {
                        fx.classList.forEach(cls => classesToResolve.add(cls));
                    });
                }
                if (info.classList) {
                    info.classList.forEach((cls) => classesToResolve.add(cls));
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
    renderMinimalTooltip(element, info, copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel) {
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
    renderParentEffects(info) {
        if (!info.visualContext || info.visualContext.parentEffects.length === 0) {
            return "";
        }
        const effectsHtml = info.visualContext.parentEffects
            .map((fx) => {
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
            return `<div class="hoversource-stack-item">${fx.tagName}${classStr}${originLabel} ➔ ${fx.property}: ${fx.value}</div>`;
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
    renderStaticMetadata(info) {
        if (!info.staticMetadata)
            return "";
        let html = "";
        if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
            const commentsHtml = info.staticMetadata.comments
                .map((c) => `<div class="hoversource-stack-item" style="color: #6b7280; font-style: italic;">${c}</div>`)
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
    renderDetailedTooltip(element, info, copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel) {
        const computed = globalThis.getComputedStyle(element);
        const shadow = computed.boxShadow;
        const animation = computed.animationName === "none" ? null : `${computed.animationName} ${computed.animationDuration}`;
        const stack = [];
        let current = element;
        while (current && stack.length < 5) {
            const elInfo = this.resolver.resolve(current);
            if (elInfo?.componentName) {
                stack.push(elInfo.componentName);
            }
            else {
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
    renderTooltip(e) {
        if (!this.currentElement || !this.currentSourceInfo)
            return;
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
                .filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"))
                .slice(0, 2).join(".");
            const label = cls ? `${tag}.${cls}` : tag;
            const zIndex = this.layerStack.length - i;
            const svgContent = i === 0 ? topLayerSvg : chevronLayerSvg;
            return `<div class="hs-layer-dot${isActive ? " hs-layer-dot--active" : ""}" style="z-index: ${zIndex}" title="Layer ${i + 1}: ${label}">${svgContent}</div>`;
        }).join("");
        const scrollHint = (() => {
            const m = this.layerScrollModifiers;
            const parts = [];
            if (m.ctrlKey)
                parts.push('Ctrl');
            if (m.altKey)
                parts.push('Alt');
            if (m.shiftKey)
                parts.push('Shift');
            parts.push('Scroll');
            return parts.join('+');
        })();
        const layerHint = this.layerStack.length > 1 ? `<div class="hs-layer-hint">${scrollHint}</div>` : "";
        const layerColumnHtml = `<div class="hs-layer-column">${layerDots}${layerHint}</div>`;
        const innerHtml = this.minimalMode
            ? this.renderMinimalTooltip(element, info, copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel)
            : this.renderDetailedTooltip(element, info, copyLabel, copyAllLabel, freezeLabel, minimalLabel, dbLabel, modeLabel);
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
                label += ` ➔ ${originList.join(" ")}`;
            }
        }
        return label;
    }
    formatParentStyles(parentEffects, classOrigins) {
        return parentEffects
            .map((fx) => {
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
    formatLayoutConstraints(layoutConstraints) {
        return Object.entries(layoutConstraints)
            .map(([k, v]) => `  - \`${k}: ${v}\``)
            .join("\n");
    }
    formatSourceComments(comments) {
        return comments
            .map((c) => `  - \`${c}\``)
            .join("\n");
    }
    formatSourceAttributes(rawAttributes) {
        return Object.entries(rawAttributes)
            .map(([k, v]) => `  - \`${k}="${v}"\``)
            .join("\n");
    }
    formatElementMetadata(element, info) {
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
        const classList = Array.from(element.classList).filter((c) => !c.startsWith("hoversource") && !c.startsWith("hs-"));
        const selectorLabel = this.formatSelectorLabel(tagName, classList, info.staticMetadata?.classOrigins);
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
  - Display: \`${data.styles.display}\` ${data.styles.display === "flex" ? `(direction: ${data.styles.flexDirection})` : ""}`;
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
    copyMetadata() {
        if (!this.currentSourceInfo || !this.currentElement)
            return;
        const text = `### HoverSource Component Metadata\n` + this.formatElementMetadata(this.currentElement, this.currentSourceInfo);
        this.controller.copyToClipboard(text);
    }
    copyAllLayers() {
        if (this.layerStack.length === 0)
            return;
        let text = `### HoverSource Component Metadata\n`;
        text += `Found ${this.layerStack.length} layer(s), ordered from leaf (Layer 1) to root:\n\n`;
        this.layerStack.forEach((el, index) => {
            let info;
            if (el === this.currentElement && this.currentSourceInfo) {
                info = this.currentSourceInfo;
            }
            else {
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
        this.controller.copyToClipboard(text.trim());
    }
}
