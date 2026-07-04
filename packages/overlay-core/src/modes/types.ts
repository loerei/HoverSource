export type SemanticShortcut = 'copyMetadata' | 'toggleFreeze' | 'toggleMinimal' | 'copyAllLayers';

export interface OverlayController {
  /** Renders a highlighted box over a specific element */
  drawHighlight(target: HTMLElement, isFrozen: boolean): void;

  /** Renders secondary outline frame and leader line callout for a single parent effect */
  drawParentHighlight(effect: any, rowRect?: DOMRect): void;

  /** Clears any active parent highlight overlays and leader lines */
  clearParentHighlights(): void;
  
  /** Renders a tooltip near the pointer */
  drawTooltip(html: string, pointerEvent: PointerEvent): void;
  
  /** Hides the highlight and tooltip */
  clear(): void;
  
  /** Copies text to clipboard and flashes a success message in the tooltip */
  copyToClipboard(text: string): Promise<void>;
  
  /** Gets the active configuration */
  getConfig(): any;

  /** Saves configuration changes back to the project */
  saveConfig(newConfig: any): Promise<void>;
  
  /** Tells the engine to freeze or unfreeze global pointer events */
  setFreezeMode(frozen: boolean): void;

  /** Gets whether the UI is currently visible (so adapters can skip heavy DOM queries) */
  isUIVisible(): boolean;
}

export interface InteractionMode {
  readonly id: string;
  
  /** Called when the mode is selected by the engine */
  activate(controller: OverlayController): void;
  
  /** Called when the mode is deactivated */
  deactivate(): void;
  
  /** Routed from global pointerover */
  onPointerOver(event: PointerEvent, target: HTMLElement): void;
  
  /** Routed from global pointermove */
  onPointerMove(event: PointerEvent): void;
  
  /** Routed from global keydown when a semantic shortcut matches */
  onShortcut(command: SemanticShortcut): void;
  
  /** Routed when live config is updated */
  onConfigUpdate(newConfig: any): void;

  /** Routed when UI visibility is toggled */
  onUIVisibilityChanged(visible: boolean): void;
}
