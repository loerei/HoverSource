import { setupVanillaMonkeyPatch } from "./vanillaPatch.js";
setupVanillaMonkeyPatch();

import { InspectorAdapter } from "./modes/InspectorAdapter.js";
import { DesignAdapter } from "./modes/DesignAdapter.js";
import { OverlayController, InteractionMode } from "./modes/types.js";
import { ParentVisualEffect } from "@hoversource/source-resolver";

function getCompanionBaseUrl() {
  const isProxy = (globalThis as any).__HOVERSOURCE_PROXY__ === true;
  if (isProxy) {
    return "/hoversource";
  }
  const port = (globalThis as any).__HOVERSOURCE_PORT__ ?? 7300;
  return `http://127.0.0.1:${port}`;
}

class OverlayEngine implements OverlayController {
  private config: any = null;
  private container: HTMLDivElement | null = null;
  private outlineBox: HTMLDivElement | null = null;
  private tooltipBox: HTMLDivElement | null = null;
  private filterPanel: HTMLDivElement | null = null;
  private isFilterPanelVisible = false;
  private currentMetadataTypeIndex = 0;
  private parentHighlightElements: Element[] = [];
  
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
    this.createUI();
    this.initStyles();
    this.initShortcuts();

    this.activeMode.activate(this);
    
    globalThis.addEventListener("pointerover", this.handlePointerOver, { capture: true });
    globalThis.addEventListener("pointermove", this.handlePointerMove, { capture: true });
    globalThis.addEventListener("scroll", this.handleScroll, { capture: true, passive: true });

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
      const res = await fetch(`${getCompanionBaseUrl()}/config`);
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
    const isLightTheme =
      this.config?.theme === "light" ||
      (this.config?.theme === "system" && !globalThis.matchMedia("(prefers-color-scheme: dark)").matches);

    const colors = isLightTheme
      ? {
          tooltipBg: "rgba(255, 255, 255, 0.96)",
          tooltipBorder: "rgba(0, 0, 0, 0.15)",
          tooltipText: "#1f2937",
          borderSep: "rgba(0, 0, 0, 0.1)",
          labelColor: "#6b7280",
          stackText: "#374151",
          stackBg: "rgba(0, 0, 0, 0.05)",
          layerShapeFill: "#e5e7eb",
          layerShapeStroke: "rgba(0,0,0,0.35)",
          layerShapeHoverFill: "#d1d5db",
          layerShapeHoverStroke: "rgba(0,0,0,0.6)",
          layerHintColor: "#9ca3af"
        }
      : {
          tooltipBg: "rgba(18, 18, 18, 0.95)",
          tooltipBorder: "rgba(255, 255, 255, 0.15)",
          tooltipText: "#f3f4f6",
          borderSep: "rgba(255, 255, 255, 0.1)",
          labelColor: "#9ca3af",
          stackText: "#e5e7eb",
          stackBg: "rgba(255, 255, 255, 0.05)",
          layerShapeFill: "#262626",
          layerShapeStroke: "rgba(255,255,255,0.5)",
          layerShapeHoverFill: "#3f3f46",
          layerShapeHoverStroke: "rgba(255,255,255,0.7)",
          layerHintColor: "#6b7280"
        };

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
        z-index: 1000001;
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
      .hoversource-parent-item:hover {
        background: rgba(168, 85, 247, 0.15) !important;
        color: #c084fc !important;
      }
      .hoversource-parent-item.hs-parent-active {
        background: rgba(168, 85, 247, 0.25) !important;
        border: 1px dashed #c084fc !important;
        color: #ffffff !important;
        border-radius: 4px;
        padding-left: 6px;
        transition: all 0.15s ease;
      }
      .hoversource-tooltip {
        position: absolute;
        background: ${colors.tooltipBg};
        backdrop-filter: blur(8px);
        border: 1px solid ${colors.tooltipBorder};
        color: ${colors.tooltipText};
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
        border-bottom: 1px solid ${colors.borderSep};
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
      .hoversource-label { color: ${colors.labelColor}; font-weight: 500; }
      .hoversource-value { font-family: monospace; color: #10b981; word-break: break-all; }
      .hoversource-link { color: #2563eb; text-decoration: underline; cursor: pointer; }
      .hoversource-link:hover { color: #3b82f6; }
      .hoversource-stack { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
      .hoversource-stack-item {
        font-family: monospace;
        color: ${colors.stackText};
        background: ${colors.stackBg};
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
        fill: ${colors.layerShapeFill};
        stroke: ${colors.layerShapeStroke};
        stroke-width: 1.5;
        transition: fill 0.12s, stroke 0.12s;
      }
      .hs-layer-dot:hover .hs-layer-shape {
        fill: ${colors.layerShapeHoverFill};
        stroke: ${colors.layerShapeHoverStroke};
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
        color: ${colors.layerHintColor};
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
        border-top: 1px dashed ${colors.borderSep};
        padding-top: 4px;
      }
      .hoversource-config-panel {
        position: fixed;
        width: 280px;
        background: ${colors.tooltipBg};
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(59, 130, 246, 0.3)" : "rgba(37, 99, 235, 0.3)"};
        color: ${colors.tooltipText};
        padding: 10px 12px;
        border-radius: 8px;
        box-shadow: 0 0 12px ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(59, 130, 246, 0.2)" : "rgba(37, 99, 235, 0.2)"}, 0 8px 20px -5px rgba(0, 0, 0, 0.5);
        z-index: 1000000;
        user-select: none;
        box-sizing: border-box;
        pointer-events: auto;
      }
      .hoversource-config-panel .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        border-bottom: 1px solid ${colors.borderSep};
        padding-bottom: 4px;
        cursor: move;
      }
      .hoversource-config-panel .nav-btn {
        background: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)"};
        border: 1px solid ${colors.borderSep};
        color: ${colors.tooltipText};
        cursor: pointer;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 3px;
        transition: all 0.2s ease;
      }
      .hoversource-config-panel .nav-btn:hover {
        background: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)"};
      }
      .hoversource-config-panel .title {
        font-weight: 700;
        font-size: 11.5px;
        color: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "#3b82f6" : "#2563eb"};
        text-shadow: 0 0 6px ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(59, 130, 246, 0.4)" : "rgba(37, 99, 235, 0.4)"};
        letter-spacing: 0.02em;
      }
      .hoversource-config-panel table {
        width: 100%;
        border-collapse: collapse;
      }
      .hoversource-config-panel tr {
        transition: background-color 0.15s ease;
      }
      .hoversource-config-panel tr:hover {
        background-color: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)"};
      }
      .hoversource-config-panel td {
        padding: 4px 0;
        font-size: 10.5px;
        vertical-align: middle;
      }
      .hoversource-config-panel td.label-col {
        color: ${colors.labelColor};
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hoversource-config-panel tr:hover td.label-col {
        color: ${colors.tooltipText};
      }
      .hoversource-config-panel td.check-col {
        text-align: right;
        width: 24px;
      }
      .hoversource-config-panel .icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "#3b82f6" : "#2563eb"};
        width: 12px;
        height: 12px;
        opacity: 0.75;
      }
      .hoversource-config-panel tr:hover .icon-wrapper {
        color: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "#60a5fa" : "#3b82f6"};
      }
      .hoversource-config-panel tr.hs-row-disabled {
        opacity: 0.5;
      }
      .hoversource-config-panel input[type="checkbox"] {
        cursor: pointer;
        accent-color: ${colors.tooltipBorder === "rgba(255, 255, 255, 0.15)" ? "#3b82f6" : "#2563eb"};
        width: 12px;
        height: 12px;
      }
    `;
    if (this.container) {
      this.container.appendChild(style);
    } else {
      document.head.appendChild(style);
    }
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

    this.filterPanel = document.createElement("div");
    this.filterPanel.className = "hoversource-config-panel";
    this.filterPanel.style.display = "none";
    this.container.appendChild(this.filterPanel);

    document.body.appendChild(this.container);
  }

  private ensureUI() {
    if (this.container && !document.body.contains(this.container)) {
      console.log("[HoverSource] Self-healing: Restored overlay container to DOM.");
      document.body.appendChild(this.container);
    }
  }

  private initShortcuts() {
    globalThis.addEventListener("keydown", this.handleKeyDown);
  }

  private handleModeShortcuts(e: KeyboardEvent, shortcuts: any) {
    const toggleModeShortcut = shortcuts.toggleMode ?? { key: "x", altKey: true, ctrlKey: false, shiftKey: false };

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
    } else if (this.matchShortcut(e, shortcuts.copyAllLayers ?? { key: "c", altKey: true, ctrlKey: false, shiftKey: true })) {
      e.preventDefault();
      this.activeMode.onShortcut('copyAllLayers');
    }
  }

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && e.ctrlKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.toggleFilterPanel();
      return;
    }

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

    this.handleModeShortcuts(e, shortcuts);
  };

  private toggleFilterPanel() {
    if (!this.filterPanel) return;
    this.isFilterPanelVisible = !this.isFilterPanelVisible;
    if (this.isFilterPanelVisible) {
      this.filterPanel.style.display = "block";
      // Restore position if saved
      const savedPos = this.config?.metadataFilter?.panelPosition;
      if (savedPos) {
        this.filterPanel.style.left = savedPos.x + "px";
        this.filterPanel.style.top = savedPos.y + "px";
        this.filterPanel.style.right = "auto";
      } else {
        // Default position: top right
        this.filterPanel.style.top = "100px";
        this.filterPanel.style.right = "40px";
        this.filterPanel.style.left = "auto";
      }
      this.renderFilterPanel();
    } else {
      this.filterPanel.style.display = "none";
    }
  }

  private renderFilterPanel() {
    if (!this.filterPanel) return;

    const metadataTypes = [
      { id: "component", name: "Component Metadata" },
      { id: "layer", name: "Layer Stack Metadata" },
      { id: "design", name: "Design Placement" }
    ];
    const activeType = metadataTypes[this.currentMetadataTypeIndex];

    const fieldsMap: Record<string, { key: string; label: string }[]> = {
      component: [
        { key: "componentName", label: "Component Name" },
        { key: "elementSelector", label: "Element Selector" },
        { key: "filePath", label: "File Path & Line" },
        { key: "framework", label: "Framework" },
        { key: "dimensions", label: "Dimensions" },
        { key: "keyStyles", label: "Key Styles" },
        { key: "parentStyles", label: "Parent Styles" },
        { key: "layoutConstraints", label: "Layout Constraints" },
        { key: "sourceComments", label: "Source Comments" },
        { key: "sourceAttributes", label: "Source Attributes" }
      ],
      layer: [
        { key: "layerSummary", label: "Layers Summary" },
        { key: "layer1", label: "Layer 1: Leaf" },
        { key: "layer2", label: "Layer 2: Parents" },
        { key: "htmlStructure", label: "HTML Structure Block" }
      ],
      design: [
        { key: "compInfo", label: "Component & Element" },
        { key: "horizontalAnchor", label: "Horizontal Anchor" },
        { key: "verticalAnchor", label: "Vertical Anchor" },
        { key: "layoutContext", label: "Layout Context" },
        { key: "suggestedCss", label: "Suggested CSS Block" },
        { key: "sourceFiles", label: "Source Files" },
        { key: "aiInstructions", label: "AI Instructions" }
      ]
    };

    const iconsMap: Record<string, string> = {
      componentName: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
      elementSelector: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 6h15m-1.875-10.5l-3.375 15m-1.5-15l-3.375 15" /></svg>`,
      filePath: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`,
      framework: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l8.97-8.97m-8.97 8.97L15 15M9 21l-3.75-3.75M5.25 17.25L13.5 9M18.75 5.25l-.323.323m0 0a1.875 1.875 0 11-2.652-2.652L16.1 3.25m2.652 2.652L19.5 5.25m-3.077-1.427L15.6 4.5m0 0l-1.5-1.5M16.1 3.25l-1.427 1.427m3.077 1.427l1.5 1.5" /></svg>`,
      dimensions: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v16.5m0-16.5h16.5m-16.5 0L19.5 19.5M19.5 3.75v16.5m0-16.5H3.75m15.75 15.75H3.75" /></svg>`,
      keyStyles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 00-2.225.016 9.778 9.778 0 00-2.524 1.307c-.152.1-.347.052-.44-.1a9.033 9.033 0 01-1.19-4.358 9 9 0 0117.189-3.674a5.006 5.006 0 00-.834-.055 3.99 3.99 0 00-2.827 1.172 5.006 5.006 0 00-1.172 2.827 3.99 3.99 0 001.172 2.827c.29.29.616.536.969.736a9.07 9.07 0 01-5.267 1.258c-.347-.008-.7-.04-1.045-.097z" /></svg>`,
      parentStyles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.999 5.999 0 00-5.414-5.74M6 18.72a9.094 9.094 0 01-3.741-.479 3 3 0 014.682-2.72m-.94 3.198l-.002.031c0 .225.012.447.038.666A11.944 11.944 0 0012 21c2.17 0 4.207-.576 5.963-1.584A6.062 6.062 0 0018 18.719m-12 0a5.999 5.999 0 015.414-5.74m0 0a3 3 0 110-6 3 3 0 010 6z" /></svg>`,
      layoutConstraints: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3 3m12 6V4.5M15 9h4.5M15 9l6-6M9 15v4.5M9 15H4.5M9 15l-6 6m12-6v4.5M15 15h4.5M15 15l6 6" /></svg>`,
      sourceComments: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>`,
      sourceAttributes: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.65 1.65 0 002.333 0l4.318-4.318a1.65 1.65 0 000-2.333L10.312 4.319a2.25 2.25 0 00-1.591-.659z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 7.5h.008v.008H6V7.5z" /></svg>`,
      
      layerSummary: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m11.142 0L21.75 12l-4.179-2.25M12 5.75L6.429 9.75 12 13.75l5.571-4L12 5.75zm0 8l-5.571 4L12 21.75l5.571-4-5.571-4z" /></svg>`,
      layer1: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" /></svg>`,
      layer2: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" /></svg>`,
      htmlStructure: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>`,

      compInfo: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>`,
      horizontalAnchor: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>`,
      verticalAnchor: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>`,
      layoutContext: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V7.125z" /></svg>`,
      suggestedCss: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
      sourceFiles: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>`,
      aiInstructions: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
    };

    const fields = fieldsMap[activeType.id] || [];

    let tableRowsHtml = "";
    fields.forEach((field) => {
      // Look up current filter value from config (default to true if not set)
      const filtersObj = this.config?.metadataFilter?.filters?.[activeType.id];
      const isChecked = filtersObj ? (filtersObj[field.key] !== false) : true;
      const svgIcon = iconsMap[field.key] || "";

      tableRowsHtml += `
        <tr class="${isChecked ? "" : "hs-row-disabled"}" style="cursor: pointer;">
          <td class="label-col">
            <span class="icon-wrapper">${svgIcon}</span>
            <span>${field.label}</span>
          </td>
          <td class="check-col">
            <input type="checkbox" data-type="${activeType.id}" data-field="${field.key}" ${isChecked ? "checked" : ""}>
          </td>
        </tr>
      `;
    });

    this.filterPanel.innerHTML = `
      <div class="header" id="hoversource-drag-header">
        <button class="nav-btn" id="hoversource-prev-btn">&lt;</button>
        <div class="title">${activeType.name}</div>
        <button class="nav-btn" id="hoversource-next-btn">&gt;</button>
      </div>
      <div class="table-container">
        <table>
          ${tableRowsHtml}
        </table>
      </div>
    `;

    // Hook events
    const prevBtn = this.filterPanel.querySelector("#hoversource-prev-btn");
    const nextBtn = this.filterPanel.querySelector("#hoversource-next-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex - 1 + metadataTypes.length) % metadataTypes.length;
        this.renderFilterPanel();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.currentMetadataTypeIndex = (this.currentMetadataTypeIndex + 1 + metadataTypes.length) % metadataTypes.length;
        this.renderFilterPanel();
      });
    }

    const rows = this.filterPanel.querySelectorAll("tr");
    rows.forEach((row: any) => {
      const cb = row.querySelector("input[type='checkbox']");
      if (!cb) return;

      row.addEventListener("click", (e: any) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
    });

    const checkboxes = this.filterPanel.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach((cb: any) => {
      cb.addEventListener("change", (e: any) => {
        const type = cb.dataset.type;
        const field = cb.dataset.field;
        const checked = cb.checked;

        const row = cb.closest("tr");
        if (row) {
          if (checked) {
            row.classList.remove("hs-row-disabled");
          } else {
            row.classList.add("hs-row-disabled");
          }
        }

        const delta = {
          metadataFilter: {
            filters: {
              [type]: {
                [field]: checked
              }
            }
          }
        };

        this.saveConfig(delta);
      });
    });

    this.makePanelDraggable();
  }

  private makePanelDraggable() {
    if (!this.filterPanel) return;
    const header = this.filterPanel.querySelector("#hoversource-drag-header") as HTMLDivElement;
    if (!header) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = (e: MouseEvent) => {
      if (e.target && ((e.target as HTMLElement).tagName.toLowerCase() === 'button' || (e.target as HTMLElement).closest('button'))) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = () => {
        document.onmouseup = null;
        document.onmousemove = null;
        
        // Save position on drag end
        if (this.filterPanel) {
          const delta = {
            metadataFilter: {
              panelPosition: {
                x: this.filterPanel.offsetLeft,
                y: this.filterPanel.offsetTop
              }
            }
          };
          this.saveConfig(delta);
        }
      };
      document.onmousemove = (ev: MouseEvent) => {
        ev.preventDefault();
        pos1 = pos3 - ev.clientX;
        pos2 = pos4 - ev.clientY;
        pos3 = ev.clientX;
        pos4 = ev.clientY;
        if (this.filterPanel) {
          this.filterPanel.style.top = (this.filterPanel.offsetTop - pos2) + "px";
          this.filterPanel.style.left = (this.filterPanel.offsetLeft - pos1) + "px";
          this.filterPanel.style.right = "auto";
        }
      };
    };
  }

  private switchMode() {
    this.activeMode.deactivate();
    this.activeMode = this.activeMode === this.inspectorMode ? this.designMode : this.inspectorMode;
    this.activeMode.activate(this);
  }

  private openDashboardInBrowser() {
    fetch(`${getCompanionBaseUrl()}/open-dashboard`)
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
    const codeMatch =
      e.code &&
      (e.code.toLowerCase() === targetKey ||
        e.code.toLowerCase() === `key${targetKey}` ||
        e.code.toLowerCase() === `digit${targetKey}`);

    return keyMatch || !!codeMatch;
  }

  private isTyping(e: KeyboardEvent): boolean {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable");
  }

  private readonly handlePointerOver = (e: PointerEvent) => {
    this.ensureUI();
    const target = e.target as HTMLElement | null;
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
    this.ensureUI();
    this.activeMode.onPointerMove(e);
    if (this.isFrozen) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  private readonly handleScroll = (e: Event) => {
    if (this.activeMode.onScroll) {
      this.activeMode.onScroll(e);
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

  private drawLeaderLine(subRect: { left: number, top: number, width: number, height: number }, rowRect: DOMRect): void {
    if (!this.container) return;
    // Start point: EXACT CENTER of the sub-border
    const x1 = subRect.left + subRect.width / 2;
    const y1 = subRect.top + subRect.height / 2;

    // Check if start point is inside the tooltip box to avoid drawing over it
    let isInsideTooltip = false;
    let tooltipRect: DOMRect | null = null;
    if (this.tooltipBox && this.tooltipBox.style.display !== "none") {
      tooltipRect = this.tooltipBox.getBoundingClientRect();
      if (
        x1 >= tooltipRect.left &&
        x1 <= tooltipRect.right &&
        y1 >= tooltipRect.top &&
        y1 <= tooltipRect.bottom
      ) {
        isInsideTooltip = true;
      }
    }

    if (!isInsideTooltip) {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "hoversource-parent-svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      this.container.appendChild(svg);
      this.parentHighlightElements.push(svg);

      // Determine termination edge based on relative horizontal position
      let rx = rowRect.left;
      if (tooltipRect && x1 > (tooltipRect.left + tooltipRect.width / 2)) {
        rx = rowRect.right;
      }

      // Tooltip row target point: vertical center of rowRect
      const ry = rowRect.top + rowRect.height / 2;

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

  public drawParentHighlight(fx: ParentVisualEffect, rowRect: DOMRect): void {
    if (!this.container || fx?.element?.nodeType !== 1) return;

    // Filter properties to only visual modifier/scrolling ones
    const prop = fx.property;
    const isVisualEffect = prop === "mask-image" || prop === "clip-path" || prop.startsWith("overflow");
    if (!isVisualEffect) return;

    const parentEl = fx.element;
    const rect = parentEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Calculate sub-border dimensions based on effect
    let subRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    if (prop === "mask-image") {
      const parsed = parseMaskGradient(fx.value, rect);
      if (parsed) subRect = parsed;
    } else if (prop === "clip-path") {
      const parsed = parseClipPathInset(fx.value, rect);
      if (parsed) subRect = parsed;
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
      this.drawLeaderLine(subRect, rowRect);
    }
  }

  public clearParentHighlights(): void {
    for (const el of this.parentHighlightElements) {
      el.remove();
    }
    this.parentHighlightElements = [];
  }

  public clear(): void {
    if (this.outlineBox) this.outlineBox.style.display = "none";
    if (this.tooltipBox) this.tooltipBox.style.display = "none";
    this.clearParentHighlights();
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
          hint.innerHTML = originalText;
        }, 1500);
      }
    }
  }

  public getConfig(): any { return this.config; }

  public async saveConfig(newConfig: any): Promise<void> {
    try {
      const res = await fetch(`${getCompanionBaseUrl()}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: newConfig,
          target: "local"
        })
      });
      const data = await res.json();
      if (data.success && data.config) {
        this.config = data.config;
      }
    } catch (e) {
      console.error("[HoverSource] Failed to save config", e);
    }
  }

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
  let url = `${getCompanionBaseUrl()}/open-in-ide?file=${encodeURIComponent(file)}&line=${line}&column=${col}`;
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

if (typeof document !== "undefined" && !(globalThis as any).__HoverSourceInitialized__) {
  (globalThis as any).__HoverSourceInitialized__ = true;
  OverlayEngine.launch();
  console.log("[HoverSource] Overlay injected.");
}

function calculateMaskBounds(direction: string, stopValue: number, stopUnit: string, rect: DOMRect) {
  let subLeft = rect.left;
  let subTop = rect.top;
  let subWidth = rect.width;
  let subHeight = rect.height;

  const rectBottom = (rect as any).bottom === undefined ? rect.top + rect.height : (rect as any).bottom;
  const rectRight = (rect as any).right === undefined ? rect.left + rect.width : (rect as any).right;

  if (direction === "to bottom") {
    const h = (stopUnit === "px") ? stopValue : rect.height * (stopValue / 100);
    subHeight = Math.min(h, rect.height);
  } else if (direction === "to top") {
    const h = (stopUnit === "px") ? stopValue : rect.height * (stopValue / 100);
    subHeight = Math.min(h, rect.height);
    subTop = rectBottom - subHeight;
  } else if (direction === "to right") {
    const w = (stopUnit === "px") ? stopValue : rect.width * (stopValue / 100);
    subWidth = Math.min(w, rect.width);
  } else if (direction === "to left") {
    const w = (stopUnit === "px") ? stopValue : rect.width * (stopValue / 100);
    subWidth = Math.min(w, rect.width);
    subLeft = rectRight - subWidth;
  }

  return { left: subLeft, top: subTop, width: subWidth, height: subHeight };
}

export function parseMaskGradient(value: string, rect: DOMRect) {
  if (!value?.includes("linear-gradient")) return null;
  const matches = Array.from(value.matchAll(/(\d{1,10}(?:\.\d{1,10})?)(px|%)/g));
  if (matches.length === 0) return null;

  let stopValue = 0;
  let stopUnit = "px";
  for (const m of matches) {
    const val = Number.parseFloat(m[1]);
    if (val > 0) {
      stopValue = val;
      stopUnit = m[2];
      break;
    }
  }

  if (stopValue === 0) return null;

  let direction = "to bottom";
  if (value.includes("to top")) direction = "to top";
  else if (value.includes("to right")) direction = "to right";
  else if (value.includes("to left")) direction = "to left";

  return calculateMaskBounds(direction, stopValue, stopUnit, rect);
}

export function parseClipPathInset(value: string, rect: DOMRect) {
  if (!value?.includes("inset(")) return null;
  const insetMatch = /inset\(([^)]+)\)/.exec(value);
  if (!insetMatch) return null;

  let content = insetMatch[1].split("round")[0].trim();
  const tokens = content.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return null;

  const parseVal = (token: string, size: number) => {
    const num = Number.parseFloat(token);
    if (Number.isNaN(num)) return 0;
    if (token.includes("%")) return size * (num / 100);
    return num;
  };

  let t = 0, r = 0, b = 0, l = 0;
  if (tokens.length === 1) {
    t = r = b = l = parseVal(tokens[0], Math.min(rect.width, rect.height));
  } else if (tokens.length === 2) {
    t = b = parseVal(tokens[0], rect.height);
    l = r = parseVal(tokens[1], rect.width);
  } else if (tokens.length === 3) {
    t = parseVal(tokens[0], rect.height);
    l = r = parseVal(tokens[1], rect.width);
    b = parseVal(tokens[2], rect.height);
  } else if (tokens.length >= 4) {
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