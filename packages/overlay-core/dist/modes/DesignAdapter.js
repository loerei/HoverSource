import { SourceResolver } from "@hoversource/source-resolver";
function getCompanionPort() {
    return window.__HOVERSOURCE_PORT__ ?? 3000;
}
export class DesignAdapter {
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
        // Spawn at the center of the window
        this.crosshairX = window.innerWidth / 2;
        this.crosshairY = window.innerHeight / 2;
        this.lastMouseX = this.crosshairX;
        this.lastMouseY = this.crosshairY;
        // Create SVG overlay
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
            // Create horizontal badge
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
            // Create vertical badge
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
        // Try finding snap elements at the spawn position
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
        // Ignore global hover events - snapping and anchoring is driven solely by dragging
    }
    onPointerMove(event) {
        // Reposition tooltip content relative to active mouse cursor (standard experience)
        if (!this.isDragging && this.targetElement) {
            this.controller.drawTooltip("", event);
        }
    }
    updateTargetAtPosition(x, y) {
        const container = this.controller.container;
        const elements = document.elementsFromPoint(x, y);
        let target = elements.find(el => {
            if (el === document.documentElement || el === document.body)
                return false;
            if (container && (el === container || container.contains(el)))
                return false;
            return true;
        });
        if (!target) {
            target = this.anchorHElement || this.anchorVElement || undefined;
        }
        if (target) {
            this.targetElement = target;
            this.targetRect = target.getBoundingClientRect();
        }
        else {
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
        // Create a full-screen blocker to prevent click/hover on application underlying layout
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
        }
        else {
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
        // Select H-Anchor
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
                }
                else if (mouseY > rect.bottom) {
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
        // Select V-Anchor
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
                }
                else if (mouseX > rect.right) {
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
        // Assign Snapping and Offsets
        if (bestH) {
            this.anchorHElement = bestH.element;
            this.snapBoundaryH = bestH.boundary;
            if (bestH.distance < 15) {
                if (!this.isSnappedH) {
                    this.isSnappedH = true;
                    this.snapX = bestH.value;
                    this.snapMouseX = mouseX;
                    this.dX = 0; // Reset nudge on new snap
                }
            }
            else {
                this.isSnappedH = false;
                this.snapX = mouseX;
            }
        }
        else {
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
                    this.dY = 0; // Reset nudge on new snap
                }
            }
            else {
                this.isSnappedV = false;
                this.snapY = mouseY;
            }
        }
        else {
            this.anchorVElement = null;
            this.snapBoundaryV = null;
            this.isSnappedV = false;
        }
    }
    updateVisuals() {
        if (!this.svgOverlay || !this.controller.isUIVisible())
            return;
        // Clear SVG overlay
        this.svgOverlay.innerHTML = "";
        if (this.badgeElementH)
            this.badgeElementH.style.display = "none";
        if (this.badgeElementV)
            this.badgeElementV.style.display = "none";
        // Highlight target element if present
        if (this.targetElement) {
            this.controller.drawHighlight(this.targetElement, this.isFrozen);
        }
        // Compute active placement dot coordinates
        const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
        const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
        const dotAbsX = dotViewportX + globalThis.scrollX;
        const dotAbsY = dotViewportY + globalThis.scrollY;
        const svgNS = "http://www.w3.org/2000/svg";
        // Highlight H-Anchor and V-Anchor elements via SVG dashed box
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
        // Draw horizontal guide relative to H-Anchor
        const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
        if (this.anchorHElement && rectH) {
            const rectAbsLeft = rectH.left + globalThis.scrollX;
            const rectAbsRight = rectH.right + globalThis.scrollX;
            const rectAbsCenterX = rectAbsLeft + rectH.width / 2;
            let anchorX = rectAbsLeft;
            if (this.snapBoundaryH === "Right-Edge") {
                anchorX = rectAbsRight;
            }
            else if (this.snapBoundaryH === "Center-Axis") {
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
        // Draw vertical guide relative to V-Anchor
        const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
        if (this.anchorVElement && rectV) {
            const rectAbsTop = rectV.top + globalThis.scrollY;
            const rectAbsBottom = rectV.bottom + globalThis.scrollY;
            const rectAbsCenterY = rectAbsTop + rectV.height / 2;
            let anchorY = rectAbsTop;
            if (this.snapBoundaryV === "Bottom-Edge") {
                anchorY = rectAbsBottom;
            }
            else if (this.snapBoundaryV === "Center-Axis") {
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
        // Draw placement crosshair
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
        // Draw larger invisible drag handle target to ease click interactions
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
        // Calculate active placement coordinates
        const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
        const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
        // Calculate H and V offsets
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
        const hStatus = this.anchorHElement ? `<span style="color: #10b981; font-weight:bold;">${selectorH} @ ${this.snapBoundaryH || 'None'} (${offsetH >= 0 ? '+' : ''}${offsetH}px)</span>` : "<span style=\"color: #6b7280;\">No Anchor</span>";
        const vStatus = this.anchorVElement ? `<span style="color: #10b981; font-weight:bold;">${selectorV} @ ${this.snapBoundaryV || 'None'} (${offsetV >= 0 ? '+' : ''}${offsetV}px)</span>` : "<span style=\"color: #6b7280;\">No Anchor</span>";
        const fileBase = info.fileName
            ? info.fileName.split('/').pop()?.split('\\').pop() || "unknown"
            : "unknown";
        const hintText = `Drag the Crosshair to position | Press ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze & Nudge"} | ${copyLabel} to Copy Design Metadata | ${modeLabel} to Switch Mode`;
        const hintHtml = hintText.split("|").map(part => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
        const html = `
      <div class="hoversource-title" style="color: #10b981;">
        <span>Design Mode ${this.isFrozen ? "[FROZEN]" : ""}</span>
        <span class="hoversource-framework" style="background: #064e3b; color: #34d399;">Active</span>
      </div>
      <div class="hoversource-section">
        <span class="hoversource-label">Anchor Element: </span>
        <span class="hoversource-value">${this.targetElement.tagName.toLowerCase()}${this.targetElement.id ? '#' + this.targetElement.id : ""}${this.targetElement.classList.length > 0 ? '.' + Array.from(this.targetElement.classList).filter(c => !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".") : ""}</span>
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
        if (command === 'toggleFreeze') {
            this.isFrozen = !this.isFrozen;
            this.controller.setFreezeMode(this.isFrozen);
            console.log(`[HoverSource] Design Mode Freeze: ${this.isFrozen}`);
            this.updateVisuals();
            this.renderTooltip({ clientX: this.lastMouseX, clientY: this.lastMouseY });
        }
        else if (command === 'copyMetadata') {
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
        // Calculate active placement coordinates
        const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
        const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
        // Calculate H and V offsets
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
        const cssRules = getSuggestedCSS(this.snapBoundaryH, this.snapBoundaryV, offsetH, offsetV, commonParent, dotViewportX, dotViewportY, this.anchorHElement, this.anchorVElement);
        const isHAndVSame = this.anchorHElement && this.anchorHElement === this.anchorVElement;
        const tagName = this.targetElement.tagName.toLowerCase();
        const classList = Array.from(this.targetElement.classList).filter(c => !c.startsWith("hoversource") && !c.startsWith("hs-"));
        const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
        const idStr = this.targetElement.id ? `#${this.targetElement.id}` : "";
        const selector = `${tagName}${idStr}${classStr}`;
        // --- Variation E: Tier 2 — Layout Context (auto-resolved) ---
        const anchorForContext = this.anchorHElement || this.anchorVElement || this.targetElement;
        const ancestors = this.resolver.resolveAncestors(anchorForContext, 8);
        // Anchor element's own computed display — key for insertion strategy
        let anchorElementDisplay = "";
        let anchorDisplayNote = null;
        if (anchorForContext) {
            try {
                const anchorComp = globalThis.getComputedStyle(anchorForContext);
                const d = anchorComp.display || "block";
                if (d === "flex" || d === "inline-flex") {
                    anchorElementDisplay = `${d} (flex-direction: ${anchorComp.flexDirection})`;
                    anchorDisplayNote = `Anchor element is a flex container. If inserting a new child into it, a flex child approach (e.g. margin-left: auto) may be more appropriate than position: absolute.`;
                }
                else if (d === "grid" || d === "inline-grid") {
                    anchorElementDisplay = d;
                    anchorDisplayNote = `Anchor element is a grid container. If inserting a new child into it, a grid child approach may be more appropriate than position: absolute.`;
                }
                else {
                    anchorElementDisplay = d;
                }
            }
            catch { /* skip */ }
        }
        // Find nearest positioned ancestor (first with position !== static)
        const positionedAncestor = ancestors.find(a => a.position !== "static") ?? null;
        // Direct parent is always ancestors[0]
        const directParent = ancestors[0] ?? null;
        // Collect unique source files from resolved ancestors (exclude duplicates and anchor file)
        const anchorFile = info.fileName || "";
        const seenFiles = new Set([anchorFile]);
        const relatedFiles = anchorFile ? [`\`${anchorFile}\` (Line: ${info.lineNumber || 1}) — anchor component`] : [];
        for (const anc of ancestors) {
            if (anc.fileName && !seenFiles.has(anc.fileName)) {
                seenFiles.add(anc.fileName);
                const label = anc.componentName ? ` — \`${anc.componentName}\`` : "";
                relatedFiles.push(`\`${anc.fileName}\` (Line: ${anc.lineNumber || 1})${label}`);
            }
        }
        // Build layout context section
        const posAncLine = positionedAncestor
            ? `\`${positionedAncestor.selector}\` (position: ${positionedAncestor.position})`
                + (positionedAncestor.fileName ? `, source: \`${positionedAncestor.fileName}\`:${positionedAncestor.lineNumber || 1}` : ", source unresolved (no fiber)")
            : "none found within 8 levels — CSS rules may need `position: relative` added to a parent";
        const directParentLine = directParent
            ? `\`${directParent.selector}\` (display: ${directParent.display})`
                + (directParent.layoutProps
                    ? "\n  - " + Object.entries(directParent.layoutProps)
                        .filter(([, v]) => v && v !== "normal" && v !== "0px")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" | ")
                    : "")
            : "unresolved";
        // Note: if direct parent is flex/grid, inserting with position:absolute requires a positioned ancestor
        const parentDisplay = directParent?.display ?? "";
        const layoutWarning = (parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid")
            ? `Direct parent is a ${parentDisplay} container. Inserting as a ${parentDisplay.startsWith("grid") ? "grid" : "flex"} child or with position: absolute are both options — verify which fits the component layout.`
            : null;
        const filesSection = relatedFiles.length > 0
            ? relatedFiles.map(f => `  - ${f}`).join("\n")
            : "  - No source files resolved (fiber not available — non-React or production build)";
        const text = `
### HoverSource Design Placement Metadata
* **Component**: \`${info.componentName || tagName}\`
* **Element**: \`${selector}\`
* **File Path**: \`${info.fileName || "unknown"}\` (Line: ${info.lineNumber || 1}, Column: ${info.columnNumber || 1})
* **Framework**: ${info.framework}
* **Horizontal Anchor**:
  - Selector: \`${selectorH}\`
  - Boundary: \`${this.snapBoundaryH || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetH >= 0 ? "+" : ""}${offsetH}px\` (${this.isSnappedH ? 'Snapped' : 'Free'})
* **Vertical Anchor**:
  - Selector: \`${selectorV}\`
  - Boundary: \`${this.snapBoundaryV || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetV >= 0 ? "+" : ""}${offsetV}px\` (${this.isSnappedV ? 'Snapped' : 'Free'})

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${posAncLine}
* **Anchor Element**: \`${getSelector(anchorForContext)}\` (display: ${anchorElementDisplay || "block"})
${anchorDisplayNote ? `  - ${anchorDisplayNote}\n` : ""}\
* **Direct Parent of Anchor**: ${directParentLine}
${layoutWarning ? `* ${layoutWarning}\n` : ""}\
* **USE THIS CSS** (do not use the distance values above as CSS — use this block):
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
* Target DOM Parent: \`${isHAndVSame ? selectorH : parentSelector}\` (${isHAndVSame ? 'same as anchor' : 'common ancestor of H and V anchors'})
`.trim();
        this.controller.copyToClipboard(text);
    }
    onConfigUpdate(newConfig) {
        // Handle live config changes if needed
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
}
export function findNearestSnapPoint(x, y, rect) {
    const leftVal = rect.left;
    const rightVal = rect.right;
    const hCenterVal = rect.left + rect.width / 2;
    const topVal = rect.top;
    const bottomVal = rect.bottom;
    const vCenterVal = rect.top + rect.height / 2;
    // Horizontal candidates
    const hCandidates = [
        { boundary: "Left-Edge", value: leftVal },
        { boundary: "Right-Edge", value: rightVal },
        { boundary: "Center-Axis", value: hCenterVal }
    ];
    let nearestH = hCandidates[0];
    let minHDist = Math.abs(x - nearestH.value);
    for (let i = 1; i < hCandidates.length; i++) {
        const dist = Math.abs(x - hCandidates[i].value);
        if (dist < minHDist) {
            minHDist = dist;
            nearestH = hCandidates[i];
        }
    }
    // Vertical candidates
    const vCandidates = [
        { boundary: "Top-Edge", value: topVal },
        { boundary: "Bottom-Edge", value: bottomVal },
        { boundary: "Center-Axis", value: vCenterVal }
    ];
    let nearestV = vCandidates[0];
    let minVDist = Math.abs(y - nearestV.value);
    for (let i = 1; i < vCandidates.length; i++) {
        const dist = Math.abs(y - vCandidates[i].value);
        if (dist < minVDist) {
            minVDist = dist;
            nearestV = vCandidates[i];
        }
    }
    return {
        horizontal: {
            boundary: nearestH.boundary,
            offset: x - nearestH.value,
            distance: minHDist,
            value: nearestH.value
        },
        vertical: {
            boundary: nearestV.boundary,
            offset: y - nearestV.value,
            distance: minVDist,
            value: nearestV.value
        }
    };
}
export function shouldReleaseSnap(mouseX, mouseY, snapMouseX, snapMouseY, deadzone) {
    const distX = Math.abs(mouseX - snapMouseX);
    const distY = Math.abs(mouseY - snapMouseY);
    return distX > deadzone || distY > deadzone;
}
export function calculateNudge(key, shiftKey, currentDx, currentDy) {
    const step = shiftKey ? 8 : 1;
    let dX = currentDx;
    let dY = currentDy;
    if (key === "ArrowLeft") {
        dX -= step;
    }
    else if (key === "ArrowRight") {
        dX += step;
    }
    else if (key === "ArrowUp") {
        dY -= step;
    }
    else if (key === "ArrowDown") {
        dY += step;
    }
    return { dX, dY };
}
export function getLayoutRules(boundaryH, boundaryV, dX, dY) {
    const rules = ["position: absolute;"];
    let transformX = "";
    let transformY = "";
    // Horizontal rules
    if (boundaryH === "Left-Edge") {
        if (dX >= 0) {
            rules.push(`left: ${dX}px;`);
        }
        else {
            rules.push(`right: calc(100% + ${Math.abs(dX)}px);`);
        }
    }
    else if (boundaryH === "Right-Edge") {
        if (dX >= 0) {
            rules.push(`left: calc(100% + ${dX}px);`);
        }
        else {
            rules.push(`right: ${Math.abs(dX)}px;`);
        }
    }
    else if (boundaryH === "Center-Axis") {
        if (dX === 0) {
            rules.push(`left: 50%;`);
        }
        else {
            rules.push(`left: calc(50% + ${dX}px);`);
        }
        transformX = "translateX(-50%)";
    }
    // Vertical rules
    if (boundaryV === "Top-Edge") {
        if (dY >= 0) {
            rules.push(`top: ${dY}px;`);
        }
        else {
            rules.push(`bottom: calc(100% + ${Math.abs(dY)}px);`);
        }
    }
    else if (boundaryV === "Bottom-Edge") {
        if (dY >= 0) {
            rules.push(`top: calc(100% + ${dY}px);`);
        }
        else {
            rules.push(`bottom: ${Math.abs(dY)}px;`);
        }
    }
    else if (boundaryV === "Center-Axis") {
        if (dY === 0) {
            rules.push(`top: 50%;`);
        }
        else {
            rules.push(`top: calc(50% + ${dY}px);`);
        }
        transformY = "translateY(-50%)";
    }
    // Handle combined transform
    if (transformX && transformY) {
        rules.push("transform: translate(-50%, -50%);");
    }
    else if (transformX) {
        rules.push(`transform: ${transformX};`);
    }
    else if (transformY) {
        rules.push(`transform: ${transformY};`);
    }
    return rules.join("\n");
}
export function findCommonAncestor(el1, el2) {
    if (!el1 || !el2)
        return typeof document !== "undefined" ? document.body : (el1 || el2 || {});
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
export function getSelector(el) {
    if (!el)
        return "";
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList).filter(c => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
    const classStr = classes ? `.${classes}` : "";
    return `${tag}${id}${classStr}`;
}
export function getSuggestedCSS(boundaryH, boundaryV, offsetH, offsetV, parentContainer, activeX, activeY, anchorH, anchorV) {
    const rules = ["position: absolute;"];
    let transformX = "";
    let transformY = "";
    if (anchorH && anchorH === anchorV) {
        // Horizontal positioning
        if (boundaryH === "Left-Edge") {
            if (offsetH >= 0) {
                rules.push(`  left: ${offsetH}px;`);
            }
            else {
                rules.push(`  right: calc(100% + ${Math.abs(offsetH)}px);`);
            }
        }
        else if (boundaryH === "Right-Edge") {
            if (offsetH >= 0) {
                rules.push(`  left: calc(100% + ${offsetH}px);`);
            }
            else {
                rules.push(`  right: ${Math.abs(offsetH)}px;`);
            }
        }
        else if (boundaryH === "Center-Axis") {
            if (offsetH === 0) {
                rules.push(`  left: 50%;`);
            }
            else {
                rules.push(`  left: calc(50% + ${offsetH}px);`);
            }
            transformX = "translateX(-50%)";
        }
        // Vertical positioning
        if (boundaryV === "Top-Edge") {
            if (offsetV >= 0) {
                rules.push(`  top: ${offsetV}px;`);
            }
            else {
                rules.push(`  bottom: calc(100% + ${Math.abs(offsetV)}px);`);
            }
        }
        else if (boundaryV === "Bottom-Edge") {
            if (offsetV >= 0) {
                rules.push(`  top: calc(100% + ${offsetV}px);`);
            }
            else {
                rules.push(`  bottom: ${Math.abs(offsetV)}px;`);
            }
        }
        else if (boundaryV === "Center-Axis") {
            if (offsetV === 0) {
                rules.push(`  top: 50%;`);
            }
            else {
                rules.push(`  top: calc(50% + ${offsetV}px);`);
            }
            transformY = "translateY(-50%)";
        }
        // Combined transform
        if (transformX && transformY) {
            rules.push("  transform: translate(-50%, -50%);");
        }
        else if (transformX) {
            rules.push(`  transform: ${transformX};`);
        }
        else if (transformY) {
            rules.push(`  transform: ${transformY};`);
        }
        rules.push(`  white-space: nowrap;`);
    }
    else {
        // Different anchors, use percentages relative to common parent
        const parentRect = parentContainer.getBoundingClientRect();
        const relX = activeX - parentRect.left;
        const relY = activeY - parentRect.top;
        const pctX = Math.round((relX / parentRect.width) * 100);
        const pctY = Math.round((relY / parentRect.height) * 100);
        rules.push(`  left: ${pctX}%;`);
        rules.push(`  top: ${pctY}%;`);
        rules.push(`  white-space: nowrap;`);
    }
    return rules.join("\n");
}
