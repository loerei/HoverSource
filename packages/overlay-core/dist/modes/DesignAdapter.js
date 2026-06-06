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
        // Just re-position the tooltip
        // In the real design mode, this might calculate relative positions to nearby flex/grid boundaries
        this.controller.drawTooltip("", event); // We can pass empty string if the engine caches the HTML, but let's just ignore for now since engine positions it.
        // Actually, drawTooltip replaces the content. The engine's positionTooltip can just be called if we pass the same html, or we rely on the engine to position automatically on mousemove.
    }
    onShortcut(command) {
        if (command === 'toggleFreeze') {
            this.isFrozen = !this.isFrozen;
            this.controller.setFreezeMode(this.isFrozen);
            console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
            // Re-trigger a highlight render to change border color
            if (this.isFrozen) {
                // We'd ideally re-render the highlight here, but target is lost unless we track it
            }
        }
    }
    onConfigUpdate(newConfig) {
        // Handle live config changes if needed
    }
    onUIVisibilityChanged(visible) {
        // Placeholder
    }
}
