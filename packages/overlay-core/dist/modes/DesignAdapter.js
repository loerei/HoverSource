import { SourceResolver } from "@hoversource/source-resolver";
function getCompanionPort() {
    return globalThis.__HOVERSOURCE_PORT__ ?? 7300;
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
    maxTraversalDepth = 32;
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
        this.maxTraversalDepth = controller.getConfig()?.maxTraversalDepth ?? 32;
        // Spawn at the center of the window
        this.crosshairX = globalThis.innerWidth / 2;
        this.crosshairY = globalThis.innerHeight / 2;
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
        globalThis.addEventListener("keydown", this.handleKeyDown, { capture: true });
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
        globalThis.removeEventListener("keydown", this.handleKeyDown, { capture: true });
        globalThis.removeEventListener("pointermove", this.handleDragMove, { capture: true });
        globalThis.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
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
        const target = elements.find(el => {
            if (el === document.documentElement || el === document.body)
                return false;
            if (container && (el === container || container.contains(el)))
                return false;
            return true;
        }) ?? this.anchorHElement ?? this.anchorVElement ?? undefined;
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
        globalThis.addEventListener("pointermove", this.handleDragMove, { capture: true });
        globalThis.addEventListener("pointerup", this.handleDragEnd, { capture: true });
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
        const HSconfig = this.controller.getConfig();
        const deSnapThreshold = HSconfig?.desnappingThreshold !== undefined ? HSconfig.desnappingThreshold : 15;
        if (this.isSnappedH || this.isSnappedV) {
            if (shouldReleaseSnap(newX, newY, this.snapMouseX, this.snapMouseY, deSnapThreshold)) {
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
        globalThis.removeEventListener("pointermove", this.handleDragMove, { capture: true });
        globalThis.removeEventListener("pointerup", this.handleDragEnd, { capture: true });
    };
    getSnapCandidates(mouseX, mouseY) {
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
        return candidates;
    }
    selectBestH(candidates, mouseX, mouseY) {
        let bestH = null;
        let minScoreH = Infinity;
        for (const cand of candidates) {
            const rect = cand.rect;
            const opts = [
                { boundary: "Left-Edge", value: rect.left },
                { boundary: "Right-Edge", value: rect.right },
                { boundary: "Center-Axis", value: rect.left + rect.width / 2 }
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
        return bestH;
    }
    selectBestV(candidates, mouseX, mouseY) {
        let bestV = null;
        let minScoreV = Infinity;
        for (const cand of candidates) {
            const rect = cand.rect;
            const opts = [
                { boundary: "Top-Edge", value: rect.top },
                { boundary: "Bottom-Edge", value: rect.bottom },
                { boundary: "Center-Axis", value: rect.top + rect.height / 2 }
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
        return bestV;
    }
    assignHorizontalSnap(bestH, mouseX) {
        const HSconfig = this.controller.getConfig();
        const snapThreshold = HSconfig?.snappingThreshold !== undefined ? HSconfig.snappingThreshold : 15;
        if (bestH) {
            this.anchorHElement = bestH.element;
            this.snapBoundaryH = bestH.boundary;
            if (bestH.distance < snapThreshold) {
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
    }
    assignVerticalSnap(bestV, mouseY) {
        const HSconfig = this.controller.getConfig();
        const snapThreshold = HSconfig?.snappingThreshold !== undefined ? HSconfig.snappingThreshold : 15;
        if (bestV) {
            this.anchorVElement = bestV.element;
            this.snapBoundaryV = bestV.boundary;
            if (bestV.distance < snapThreshold) {
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
    checkSnapping(mouseX, mouseY) {
        const candidates = this.getSnapCandidates(mouseX, mouseY);
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
        const bestH = this.selectBestH(candidates, mouseX, mouseY);
        // Select V-Anchor
        const bestV = this.selectBestV(candidates, mouseX, mouseY);
        // Assign Snapping and Offsets
        this.assignHorizontalSnap(bestH, mouseX);
        this.assignVerticalSnap(bestV, mouseY);
    }
    drawHorizontalGuide(svgNS, dotViewportX, dotAbsX, dotAbsY) {
        const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
        if (this.anchorHElement && rectH) {
            const rectAbsLeft = rectH.left;
            const rectAbsRight = rectH.right;
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
            const offsetH = Math.round(dotViewportX - anchorX);
            const displayOffsetH = offsetH >= 0 ? `+${offsetH}` : `${offsetH}`;
            if (this.badgeElementH) {
                this.badgeElementH.textContent = `${displayOffsetH}px`;
                this.badgeElementH.style.display = "block";
                this.badgeElementH.style.left = `${(anchorX + dotAbsX) / 2 - 20}px`;
                this.badgeElementH.style.top = `${dotAbsY - 20}px`;
            }
        }
    }
    drawVerticalGuide(svgNS, dotViewportY, dotAbsX, dotAbsY) {
        const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
        if (this.anchorVElement && rectV) {
            const rectAbsTop = rectV.top;
            const rectAbsBottom = rectV.bottom;
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
            const offsetV = Math.round(dotViewportY - anchorY);
            const displayOffsetV = offsetV >= 0 ? `+${offsetV}` : `${offsetV}`;
            if (this.badgeElementV) {
                this.badgeElementV.textContent = `${displayOffsetV}px`;
                this.badgeElementV.style.display = "block";
                this.badgeElementV.style.left = `${dotAbsX + 10}px`;
                this.badgeElementV.style.top = `${(anchorY + dotAbsY) / 2 - 8}px`;
            }
        }
    }
    drawCrosshairAndDragHandle(svgNS, dotAbsX, dotAbsY) {
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
        const dotAbsX = dotViewportX;
        const dotAbsY = dotViewportY;
        const svgNS = "http://www.w3.org/2000/svg";
        // Highlight H-Anchor and V-Anchor elements via SVG dashed box
        const drawAnchorOutline = (el, color) => {
            const rect = el.getBoundingClientRect();
            const box = document.createElementNS(svgNS, "rect");
            box.setAttribute("x", rect.left.toString());
            box.setAttribute("y", rect.top.toString());
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
        this.drawHorizontalGuide(svgNS, dotViewportX, dotAbsX, dotAbsY);
        // Draw vertical guide relative to V-Anchor
        this.drawVerticalGuide(svgNS, dotViewportY, dotAbsX, dotAbsY);
        // Draw placement crosshair & drag handle
        this.drawCrosshairAndDragHandle(svgNS, dotAbsX, dotAbsY);
    }
    getHorizontalOffset(dotViewportX) {
        const rectH = this.anchorHElement ? this.anchorHElement.getBoundingClientRect() : null;
        let valH = 0;
        if (rectH) {
            valH = rectH.left;
            if (this.snapBoundaryH === "Right-Edge")
                valH = rectH.right;
            else if (this.snapBoundaryH === "Center-Axis")
                valH = rectH.left + rectH.width / 2;
        }
        return Math.round(dotViewportX - valH);
    }
    getVerticalOffset(dotViewportY) {
        const rectV = this.anchorVElement ? this.anchorVElement.getBoundingClientRect() : null;
        let valV = 0;
        if (rectV) {
            valV = rectV.top;
            if (this.snapBoundaryV === "Bottom-Edge")
                valV = rectV.bottom;
            else if (this.snapBoundaryV === "Center-Axis")
                valV = rectV.top + rectV.height / 2;
        }
        return Math.round(dotViewportY - valV);
    }
    formatAnchorStatus(element, selector, boundary, offset) {
        if (!element)
            return `<span style="color: #6b7280;">No Anchor</span>`;
        const sign = offset >= 0 ? "+" : "";
        return `<span style="color: #10b981; font-weight:bold;">${selector} @ ${boundary || "None"} (${sign}${offset}px)</span>`;
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
        // Calculate H and V offsets using helpers
        const offsetH = this.getHorizontalOffset(dotViewportX);
        const offsetV = this.getVerticalOffset(dotViewportY);
        const selectorH = this.anchorHElement ? getSelector(this.anchorHElement) : "None";
        const selectorV = this.anchorVElement ? getSelector(this.anchorVElement) : "None";
        const hStatus = this.formatAnchorStatus(this.anchorHElement, selectorH, this.snapBoundaryH, offsetH);
        const vStatus = this.formatAnchorStatus(this.anchorVElement, selectorV, this.snapBoundaryV, offsetV);
        const fileBase = info.fileName
            ? info.fileName.split('/').pop()?.split('\\').pop() || "unknown"
            : "unknown";
        const hintText = `Drag the Crosshair to position | Press ${freezeLabel} to ${this.isFrozen ? "Unfreeze" : "Freeze & Nudge"} | ${copyLabel} to Copy Design Metadata | ${modeLabel} to Switch Mode`;
        const hintHtml = hintText.split("|").map(part => `<span style="white-space: nowrap;">${part.trim()}</span>`).join(" | ");
        let vueHint = "";
        if (info.framework === "Vue" && !info.lineNumber) {
            vueHint = `
        <div class="hoversource-section" style="font-style: italic; color: #10b981; font-size: 9px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Tip: Run 'hs install --vue' to enable line/column targeting.
        </div>
      `;
        }
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
        <span class="hoversource-value" style="color: #60a5fa;">${fileBase}${info.lineNumber ? `:${info.lineNumber}` : ""}</span>
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
      ${vueHint}
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
    getAnchorDisplayInfo(anchorForContext) {
        if (!anchorForContext) {
            return { display: "", note: null };
        }
        try {
            const anchorComp = globalThis.getComputedStyle(anchorForContext);
            const d = anchorComp.display || "block";
            if (d === "flex" || d === "inline-flex") {
                return {
                    display: `${d} (flex-direction: ${anchorComp.flexDirection})`,
                    note: `Anchor element is a flex container. If inserting a new child into it, a flex child approach (e.g. margin-left: auto) may be more appropriate than position: absolute.`
                };
            }
            else if (d === "grid" || d === "inline-grid") {
                return {
                    display: d,
                    note: `Anchor element is a grid container. If inserting a new child into it, a grid child approach may be more appropriate than position: absolute.`
                };
            }
            else {
                return { display: d, note: null };
            }
        }
        catch {
            return { display: "", note: null };
        }
    }
    getRelatedFilesList(anchorFile, anchorLine, ancestors) {
        const seenFiles = new Set([anchorFile]);
        const relatedFiles = anchorFile
            ? [`\`${anchorFile}\` (Line: ${anchorLine}) — anchor component`]
            : [];
        for (const anc of ancestors) {
            if (anc.fileName && !seenFiles.has(anc.fileName)) {
                seenFiles.add(anc.fileName);
                const label = anc.componentName ? ` — \`${anc.componentName}\`` : "";
                relatedFiles.push(`\`${anc.fileName}\` (Line: ${anc.lineNumber || 1})${label}`);
            }
        }
        return relatedFiles;
    }
    getPlacementAndRules(commonParent) {
        const dotViewportX = (this.isSnappedH ? this.snapX : this.crosshairX) + this.dX;
        const dotViewportY = (this.isSnappedV ? this.snapY : this.crosshairY) + this.dY;
        const offsetH = this.getHorizontalOffset(dotViewportX);
        const offsetV = this.getVerticalOffset(dotViewportY);
        const cssRules = getSuggestedCSS({
            boundaryH: this.snapBoundaryH,
            boundaryV: this.snapBoundaryV,
            offsetH,
            offsetV,
            parentContainer: commonParent,
            activeX: dotViewportX,
            activeY: dotViewportY,
            anchorH: this.anchorHElement,
            anchorV: this.anchorVElement
        });
        return { offsetH, offsetV, cssRules };
    }
    getTargetSelector() {
        if (!this.targetElement)
            return "";
        const tagName = this.targetElement.tagName.toLowerCase();
        const classList = Array.from(this.targetElement.classList).filter(c => !c.startsWith("hoversource") && !c.startsWith("hs-"));
        const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
        const idStr = this.targetElement.id ? `#${this.targetElement.id}` : "";
        return `${tagName}${idStr}${classStr}`;
    }
    buildMetadataText(p) {
        return `
### HoverSource Design Placement Metadata
* **Component**: \`${p.component}\`
* **Element**: \`${p.selector}\`
* **File Path**: \`${p.filePath}\`${p.line ? ` (Line: ${p.line}, Column: ${p.column})` : ""}
* **Framework**: ${p.framework}
* **Horizontal Anchor**:
  - Selector: \`${p.selectorH}\`
  - Boundary: \`${p.boundaryH}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signH}${p.offsetH}px\` (${p.isSnappedHText})
* **Vertical Anchor**:
  - Selector: \`${p.selectorV}\`
  - Boundary: \`${p.boundaryV}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${p.signV}${p.offsetV}px\` (${p.isSnappedVText})

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${p.posAncLine}
* **Anchor Element**: \`${p.anchorForContextSelector}\` (display: ${p.anchorElementDisplay})
${p.anchorNoteStr}\
* **Direct Parent of Anchor**: ${p.directParentLine}
${p.warningStr}\
* **USE THIS CSS** (do not use the distance values above as CSS — use this block):
\`\`\`css
${p.cssRules}
\`\`\`
* **Source Files to Examine**:
${p.filesSection}

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
* Target DOM Parent: \`${p.targetParentSelector}\` (${p.targetParentType})
`.trim();
    }
    getLayoutContextInfo(info, anchorForContext, ancestors) {
        const positionedAncestor = ancestors.find(a => a.position !== "static") ?? null;
        const directParent = ancestors[0] ?? null;
        const anchorFile = info.fileName || "";
        const relatedFiles = this.getRelatedFilesList(anchorFile, info.lineNumber || 1, ancestors);
        let posAncLine = "none found within 8 levels — CSS rules may need `position: relative` added to a parent";
        if (positionedAncestor) {
            const sourceInfo = positionedAncestor.fileName
                ? `, source: \`${positionedAncestor.fileName}\`:${positionedAncestor.lineNumber || 1}`
                : ", source unresolved (no fiber)";
            posAncLine = `\`${positionedAncestor.selector}\` (position: ${positionedAncestor.position})${sourceInfo}`;
        }
        let directParentLine = "unresolved";
        if (directParent) {
            let layoutPropsStr = "";
            if (directParent.layoutProps) {
                layoutPropsStr = "\n  - " + Object.entries(directParent.layoutProps)
                    .filter(([, v]) => v && v !== "normal" && v !== "0px")
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" | ");
            }
            directParentLine = `\`${directParent.selector}\` (display: ${directParent.display})${layoutPropsStr}`;
        }
        const parentDisplay = directParent?.display ?? "";
        let layoutWarning = null;
        const isParentFlexOrGrid = parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid";
        if (isParentFlexOrGrid) {
            const childType = parentDisplay.startsWith("grid") ? "grid" : "flex";
            layoutWarning = `Direct parent is a ${parentDisplay} container. Inserting as a ${childType} child or with position: absolute are both options — verify which fits the component layout.`;
        }
        const filesSection = relatedFiles.length > 0
            ? relatedFiles.map(f => `  - ${f}`).join("\n")
            : "  - No source files resolved (fiber not available — non-React or production build)";
        return { posAncLine, directParentLine, layoutWarning, filesSection };
    }
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
        const { offsetH, offsetV, cssRules } = this.getPlacementAndRules(commonParent);
        const isHAndVSame = this.anchorHElement && this.anchorHElement === this.anchorVElement;
        const selector = this.getTargetSelector();
        // --- Layout Context ---
        const anchorForContext = this.anchorHElement || this.anchorVElement || this.targetElement;
        const ancestors = this.resolver.resolveAncestors(anchorForContext, this.maxTraversalDepth);
        const anchorDisplayInfo = this.getAnchorDisplayInfo(anchorForContext);
        const anchorElementDisplay = anchorDisplayInfo.display;
        const anchorDisplayNote = anchorDisplayInfo.note;
        const contextInfo = this.getLayoutContextInfo(info, anchorForContext, ancestors);
        const signH = offsetH >= 0 ? "+" : "";
        const isSnappedHText = this.isSnappedH ? "Snapped" : "Free";
        const signV = offsetV >= 0 ? "+" : "";
        const isSnappedVText = this.isSnappedV ? "Snapped" : "Free";
        const targetParentSelector = isHAndVSame ? selectorH : parentSelector;
        const targetParentType = isHAndVSame ? "same as anchor" : "common ancestor of H and V anchors";
        const anchorNoteStr = anchorDisplayNote ? `  - ${anchorDisplayNote}\n` : "";
        const warningStr = contextInfo.layoutWarning ? `* ${contextInfo.layoutWarning}\n` : "";
        const text = this.buildMetadataText({
            component: info.componentName || this.targetElement.tagName.toLowerCase(),
            selector,
            filePath: info.fileName || "unknown",
            line: info.lineNumber,
            column: info.columnNumber,
            framework: info.framework,
            selectorH,
            boundaryH: this.snapBoundaryH || "None",
            signH,
            offsetH,
            isSnappedHText,
            selectorV,
            boundaryV: this.snapBoundaryV || "None",
            signV,
            offsetV,
            isSnappedVText,
            posAncLine: contextInfo.posAncLine,
            anchorForContextSelector: getSelector(anchorForContext),
            anchorElementDisplay: anchorElementDisplay || "block",
            anchorNoteStr,
            directParentLine: contextInfo.directParentLine,
            warningStr,
            cssRules,
            filesSection: contextInfo.filesSection,
            targetParentSelector,
            targetParentType
        });
        this.controller.copyToClipboard(text);
    }
    onConfigUpdate(newConfig) {
        this.maxTraversalDepth = newConfig.maxTraversalDepth ?? 32;
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
function findNearestBoundary(targetVal, candidates) {
    let nearest = candidates[0];
    let minDist = Math.abs(targetVal - nearest.value);
    for (let i = 1; i < candidates.length; i++) {
        const dist = Math.abs(targetVal - candidates[i].value);
        if (dist < minDist) {
            minDist = dist;
            nearest = candidates[i];
        }
    }
    return {
        boundary: nearest.boundary,
        value: nearest.value,
        distance: minDist,
        offset: targetVal - nearest.value
    };
}
export function findNearestSnapPoint(x, y, rect) {
    const hCandidates = [
        { boundary: "Left-Edge", value: rect.left },
        { boundary: "Right-Edge", value: rect.right },
        { boundary: "Center-Axis", value: rect.left + rect.width / 2 }
    ];
    const vCandidates = [
        { boundary: "Top-Edge", value: rect.top },
        { boundary: "Bottom-Edge", value: rect.bottom },
        { boundary: "Center-Axis", value: rect.top + rect.height / 2 }
    ];
    return {
        horizontal: findNearestBoundary(x, hCandidates),
        vertical: findNearestBoundary(y, vCandidates)
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
function getLayoutRulesH(boundaryH, dX, rules) {
    let transformX = "";
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
    return transformX;
}
function getLayoutRulesV(boundaryV, dY, rules) {
    let transformY = "";
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
    return transformY;
}
export function getLayoutRules(boundaryH, boundaryV, dX, dY) {
    const rules = ["position: absolute;"];
    const transformX = getLayoutRulesH(boundaryH, dX, rules);
    const transformY = getLayoutRulesV(boundaryV, dY, rules);
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
        return typeof document === "undefined" ? (el1 || el2 || {}) : document.body;
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
function getHorizontalPositionRules(boundaryH, offsetH, rules) {
    let transformX = "";
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
    return transformX;
}
function getVerticalPositionRules(boundaryV, offsetV, rules) {
    let transformY = "";
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
    return transformY;
}
export function getSuggestedCSS(params) {
    const { boundaryH, boundaryV, offsetH, offsetV, parentContainer, activeX, activeY, anchorH, anchorV } = params;
    const rules = ["position: absolute;"];
    if (anchorH && anchorH === anchorV) {
        const transformX = getHorizontalPositionRules(boundaryH, offsetH, rules);
        const transformY = getVerticalPositionRules(boundaryV, offsetV, rules);
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
        rules.push(`  left: ${pctX}%;`, `  top: ${pctY}%;`, `  white-space: nowrap;`);
    }
    return rules.join("\n");
}
