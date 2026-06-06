export class DesignAdapter {
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
        if (command === 'toggleFreeze') {
            this.isFrozen = !this.isFrozen;
            this.controller.setFreezeMode(this.isFrozen);
            console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
        }
    }
    onConfigUpdate(newConfig) {
        // Handle live config changes if needed
    }
    onUIVisibilityChanged(visible) {
        // Placeholder
    }
}
