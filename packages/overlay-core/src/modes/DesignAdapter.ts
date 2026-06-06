import { InteractionMode, OverlayController, SemanticShortcut } from "./types.js";

export class DesignAdapter implements InteractionMode {
  public readonly id = "design";
  private controller!: OverlayController;
  private isFrozen = false;

  public activate(controller: OverlayController): void {
    this.controller = controller;
    console.log("[HoverSource] Activated Design Mode");
  }

  public deactivate(): void {
    this.controller.clear();
    if (this.isFrozen) {
      this.isFrozen = false;
      this.controller.setFreezeMode(false);
    }
  }

  public onPointerOver(event: PointerEvent, target: HTMLElement): void {
    if (this.isFrozen) return;

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

  public onPointerMove(event: PointerEvent): void {
    if (this.isFrozen) return;
    this.controller.drawTooltip("", event);
  }

  public onShortcut(command: SemanticShortcut): void {
    if (command === 'toggleFreeze') {
      this.isFrozen = !this.isFrozen;
      this.controller.setFreezeMode(this.isFrozen);
      console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
    }
  }

  public onConfigUpdate(newConfig: any): void {
    // Handle live config changes if needed
  }

  public onUIVisibilityChanged(visible: boolean): void {
    // Placeholder
  }
}
