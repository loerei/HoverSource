import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";
import { SourceResolver, ParentVisualEffect } from "@hoversource/source-resolver";
import { inspectVisualContext } from "../inspector.js";

function getCompanionPort(): number {
  return (window as any).__HOVERSOURCE_PORT__ ?? 3000;
}

export class InspectorAdapter implements InteractionMode {
  public readonly id = "inspector";
  private controller!: OverlayController;
  
  private resolver = new SourceResolver();
  private isFrozen = false;
  private minimalMode = false;
  
  private currentElement: HTMLElement | null = null;
  private currentSourceInfo: any = null;

  public activate(controller: OverlayController): void {
    this.controller = controller;
    const config = this.controller.getConfig();
    this.minimalMode = !!config?.minimalModeByDefault;
    console.log("[HoverSource] Activated Inspector Mode");
  }

  public deactivate(): void {
    this.controller.clear();
    this.currentElement = null;
    this.currentSourceInfo = null;
    if (this.isFrozen) {
      this.isFrozen = false;
      this.controller.setFreezeMode(false);
    }
  }

  public onPointerOver(event: PointerEvent, target: HTMLElement): void {
    const info = this.resolver.resolve(target);
    if (info) {
      info.visualContext = inspectVisualContext(target);
      this.currentElement = target;
      this.currentSourceInfo = info;
      
      if (this.controller.isUIVisible()) {
        this.controller.drawHighlight(target, this.isFrozen);
        this.renderTooltip(event);
      }

      this.fetchBackgroundValidation(info, target, event);
    } else {
      this.controller.clear();
      this.currentElement = null;
      this.currentSourceInfo = null;
    }
  }

  public onPointerMove(event: PointerEvent): void {
    // Tooltip should always follow the mouse
    if (this.currentElement && this.currentSourceInfo && this.controller.isUIVisible()) {
      this.controller.drawTooltip("", event);
    }
  }

  public onShortcut(command: SemanticShortcut): void {
    if (command === 'toggleMinimal') {
      this.minimalMode = !this.minimalMode;
      console.log(`[HoverSource] Minimalist Mode: ${this.minimalMode ? "enabled" : "disabled"}`);
      this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
    } else if (command === 'toggleFreeze') {
      this.isFrozen = !this.isFrozen;
      this.controller.setFreezeMode(this.isFrozen);
      console.log(`[HoverSource] Freeze Mode: ${this.isFrozen ? "enabled" : "disabled"}`);
      this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
    } else if (command === 'copyMetadata') {
      this.copyMetadata();
    }
  }

  public onConfigUpdate(newConfig: any): void {
    this.minimalMode = !!newConfig.minimalModeByDefault;
    this.renderTooltip({ clientX: 0, clientY: 0 } as PointerEvent);
  }

  public onUIVisibilityChanged(visible: boolean): void {
  }

  private fetchBackgroundValidation(info: any, target: HTMLElement, e: PointerEvent) {
    const validateUrl = `http://127.0.0.1:${getCompanionPort()}/validate-line?file=${encodeURIComponent(info.fileName)}&line=${info.lineNumber || 1}&column=${info.columnNumber || 1}&tagName=${encodeURIComponent(info.tagName || "")}&classList=${encodeURIComponent((info.classList || []).join(","))}`;
    
    fetch(validateUrl)
      .then(r => r.json())
      .then(data => {
        let line = info.lineNumber || 1;
        let col = info.columnNumber || 1;

        if (data && data.corrected) {
          line = data.corrected.line;
          col = data.corrected.column;
        }

        if (this.currentElement === target) {
          info.lineNumber = line;
          info.columnNumber = col;
          this.currentSourceInfo = info;
          if (this.controller.isUIVisible()) {
            this.renderTooltip(e);
          }

          const classesToResolve = new Set<string>(info.classList || []);
          if (info.visualContext) {
            info.visualContext.parentEffects.forEach((fx: any) => {
              fx.classList.forEach((cls: string) => classesToResolve.add(cls));
            });
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

  private renderTooltip(e: PointerEvent) {
    if (!this.currentElement || !this.currentSourceInfo) return;
    const element = this.currentElement;
    const info = this.currentSourceInfo;
    const config = this.controller.getConfig();
    const shortcuts = config?.shortcuts;

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

    let html = "";
    if (this.minimalMode) {
      html = `
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
          const classStr = current.className && typeof current.className === 'string' ? `.${Array.from(current.classList).join(".")}` : "";
          stack.push(`${current.tagName.toLowerCase()}${classStr}`);
        }
        current = current.parentElement;
      }

      html = `
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

      if (info.visualContext && info.visualContext.parentEffects.length > 0) {
        const effectsHtml = info.visualContext.parentEffects
          .map((fx: ParentVisualEffect) => {
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
        html += `
          <div class="hoversource-section">
            <span class="hoversource-label">Parent Styles: </span>
            <div class="hoversource-stack">
              ${effectsHtml}
            </div>
          </div>
        `;
      }

      if (info.staticMetadata) {
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
    }

    this.controller.drawTooltip(html, e);
  }

  private copyMetadata() {
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

    let text = `
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

    if (info.visualContext && info.visualContext.parentEffects.length > 0) {
      const parentList = info.visualContext.parentEffects
        .map((fx: ParentVisualEffect) => {
          const classStr = fx.classList.length > 0 ? `.${fx.classList.join(".")}` : "";
          
          let originLabel = "";
          if (info.staticMetadata?.classOrigins) {
            for (const cls of fx.classList) {
              const origin = info.staticMetadata.classOrigins[cls];
              if (origin) {
                originLabel = ` ➔ [Source: \`${origin.file}\` (Line: ${origin.line}, Column: ${origin.column})]`;
                break;
              }
            }
          }

          return `  - \`${fx.tagName}${classStr}\` ➔ \`${fx.property}: ${fx.value}\`${originLabel}`;
        })
        .join("\n");
      text += `\n* **Parent Styles**:\n${parentList}`;
    }

    if (info.visualContext && Object.keys(info.visualContext.layoutConstraints).length > 0) {
      const layoutList = Object.entries(info.visualContext.layoutConstraints)
        .map(([k, v]) => `  - \`${k}: ${v}\``)
        .join("\n");
      text += `\n* **Layout Constraints**:\n${layoutList}`;
    }

    if (info.staticMetadata) {
      if (info.staticMetadata.comments && info.staticMetadata.comments.length > 0) {
        const commentList = info.staticMetadata.comments
          .map((c: string) => `  - \`${c}\``)
          .join("\n");
        text += `\n* **Source Comments**:\n${commentList}`;
      }
      if (info.staticMetadata.rawAttributes && Object.keys(info.staticMetadata.rawAttributes).length > 0) {
        const attrList = Object.entries(info.staticMetadata.rawAttributes)
          .map(([k, v]) => `  - \`${k}="${v}"\``)
          .join("\n");
        text += `\n* **Source Attributes**:\n${attrList}`;
      }
    }

    this.controller.copyToClipboard(text);
  }
}
