// RAO (Relational Alignment and Offset) Prototype implementation
// Runs directly in browser for visual debugging and verification.

(function () {
  // Crosshair state
  let crosshairX = window.innerWidth / 2;
  let crosshairY = window.innerHeight / 2;
  let dX = 0;
  let dY = 0;
  let isSnappedH = false;
  let isSnappedV = false;
  let snapBoundaryH = null;
  let snapBoundaryV = null;
  let snapX = 0;
  let snapY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCrosshairX = 0;
  let dragStartCrosshairY = 0;
  let ratioX = 0.5;
  let ratioY = 0.5;
  let activeVariant = "B";

  // Selected Anchors
  let anchorHElement = null;
  let anchorVElement = null;

  // DOM Elements
  let svgOverlay = null;
  let badgeH = null;
  let badgeV = null;
  let crosshairEl = null;
  let panelEl = null;
  let latestMetadataText = "";

  // Initialize UI
  function init() {
    // Create SVG Overlay
    svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgOverlay.style.position = "fixed";
    svgOverlay.style.top = "0";
    svgOverlay.style.left = "0";
    svgOverlay.style.width = "100vw";
    svgOverlay.style.height = "100vh";
    svgOverlay.style.pointerEvents = "none";
    svgOverlay.style.zIndex = "9999";
    document.body.appendChild(svgOverlay);

    // Create Badges
    badgeH = document.createElement("div");
    styleBadge(badgeH);
    document.body.appendChild(badgeH);

    badgeV = document.createElement("div");
    styleBadge(badgeV);
    document.body.appendChild(badgeV);

    // Create Crosshair DOM Element
    crosshairEl = document.createElement("div");
    crosshairEl.style.position = "fixed";
    crosshairEl.style.width = "30px";
    crosshairEl.style.height = "30px";
    crosshairEl.style.transform = "translate(-50%, -50%)";
    crosshairEl.style.cursor = "move";
    crosshairEl.style.zIndex = "10000";
    crosshairEl.style.display = "flex";
    crosshairEl.style.alignItems = "center";
    crosshairEl.style.justifyContent = "center";

    // Visual crosshair inside
    crosshairEl.innerHTML = `
      <svg width="30" height="30" viewBox="0 0 30 30" style="overflow: visible;">
        <circle cx="15" cy="15" r="5" fill="none" stroke="#10b981" stroke-width="1.5" />
        <line x1="7" y1="15" x2="23" y2="15" stroke="#10b981" stroke-width="1.5" />
        <line x1="15" y1="7" x2="15" y2="23" stroke="#10b981" stroke-width="1.5" />
        <!-- Larger clickable area -->
        <circle cx="15" cy="15" r="15" fill="transparent" style="cursor: move;" />
      </svg>
    `;
    document.body.appendChild(crosshairEl);

    // Create Live Info Panel
    panelEl = document.createElement("div");
    panelEl.style.position = "fixed";
    panelEl.style.bottom = "20px";
    panelEl.style.right = "20px";
    panelEl.style.width = "420px";
    panelEl.style.backgroundColor = "rgba(15, 23, 42, 0.95)";
    panelEl.style.border = "1px solid #334155";
    panelEl.style.borderRadius = "8px";
    panelEl.style.padding = "16px";
    panelEl.style.color = "#f8fafc";
    panelEl.style.fontFamily = "monospace";
    panelEl.style.fontSize = "11px";
    panelEl.style.boxShadow = "0 10px 25px -5px rgba(0,0,0,0.5)";
    panelEl.style.zIndex = "10001";
    panelEl.style.maxHeight = "350px";
    panelEl.style.overflowY = "auto";
    document.body.appendChild(panelEl);

    // Parse Variant from URL param
    const urlParams = new URLSearchParams(window.location.search);
    activeVariant = urlParams.get("variant") || "E";
    if (!["A", "B", "C", "D", "E"].includes(activeVariant)) {
      activeVariant = "E";
    }

    // Build Switcher UI
    const switcher = document.createElement("div");
    switcher.style.position = "fixed";
    switcher.style.bottom = "20px";
    switcher.style.left = "50%";
    switcher.style.transform = "translateX(-50%)";
    switcher.style.display = "flex";
    switcher.style.alignItems = "center";
    switcher.style.gap = "12px";
    switcher.style.backgroundColor = "#1e293b";
    switcher.style.border = "1px solid #334155";
    switcher.style.borderRadius = "9999px";
    switcher.style.padding = "8px 16px";
    switcher.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.3)";
    switcher.style.zIndex = "10002";
    switcher.style.fontFamily = "system-ui, sans-serif";
    switcher.style.fontSize = "13px";
    switcher.style.color = "#f8fafc";
    switcher.style.userSelect = "none";

    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = "←";
    styleSwitcherBtn(prevBtn);
    prevBtn.addEventListener("click", () => toggleVariant("prev"));

    const label = document.createElement("span");
    label.style.fontWeight = "600";
    label.style.whiteSpace = "nowrap";
    const variantLabels = {
      "A": "Variant A — Static Coordinates",
      "B": "Variant B — Hybrid Relational Tracking",
      "C": "Variant C — Flow-Based DOM Insertion",
      "D": "Variant D — Smart Flow-Absolute Hybrid",
      "E": "Variant E — Layout Context + Agent Instructions"
    };
    label.textContent = variantLabels[activeVariant] || variantLabels["E"];

    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = "→";
    styleSwitcherBtn(nextBtn);
    nextBtn.addEventListener("click", () => toggleVariant("next"));

    switcher.appendChild(prevBtn);
    switcher.appendChild(label);
    switcher.appendChild(nextBtn);
    document.body.appendChild(switcher);

    function styleSwitcherBtn(btn) {
      btn.style.background = "#334155";
      btn.style.border = "none";
      btn.style.color = "#f8fafc";
      btn.style.borderRadius = "50%";
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.cursor = "pointer";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.fontSize = "12px";
      btn.style.transition = "background-color 0.2s";
      btn.addEventListener("mouseover", () => btn.style.background = "#475569");
      btn.addEventListener("mouseout", () => btn.style.background = "#334155");
    }



    // Event Listeners
    crosshairEl.addEventListener("pointerdown", startDrag);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    // Initial render & ratios
    runRAO(crosshairX, crosshairY);
    updateRatios();
    updateVisuals();
  }

    function toggleVariant(dir) {
      const variants = ["A", "B", "C", "D", "E"];
      let idx = variants.indexOf(activeVariant);
      if (dir === "prev") {
        idx = (idx - 1 + variants.length) % variants.length;
      } else {
        idx = (idx + 1) % variants.length;
      }
      const nextVariant = variants[idx];
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("variant", nextVariant);
      window.location.href = newUrl.toString();
    }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    } else {
      return new Promise((resolve, reject) => {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.top = "0";
          textArea.style.left = "0";
          textArea.style.position = "fixed";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const successful = document.execCommand("copy");
          document.body.removeChild(textArea);
          if (successful) {
            resolve();
          } else {
            reject(new Error("execCommand copy was unsuccessful"));
          }
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  function styleBadge(el) {
    el.style.position = "fixed";
    el.style.background = "#10b981";
    el.style.color = "#ffffff";
    el.style.padding = "2px 6px";
    el.style.borderRadius = "4px";
    el.style.fontSize = "10px";
    el.style.fontWeight = "bold";
    el.style.pointerEvents = "none";
    el.style.display = "none";
    el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    el.style.zIndex = "10002";
  }

  function updateRatios() {
    const activeViewportX = (isSnappedH ? snapX : crosshairX) + dX;
    const activeViewportY = (isSnappedV ? snapY : crosshairY) + dY;
    ratioX = activeViewportX / window.innerWidth;
    ratioY = activeViewportY / window.innerHeight;
  }

  function handleResize() {
    if (activeVariant === "B") {
      if (isSnappedH && anchorHElement) {
        const rectH = anchorHElement.getBoundingClientRect();
        let baseH = rectH.left;
        if (snapBoundaryH === "Right-Edge") baseH = rectH.right;
        else if (snapBoundaryH === "Center-Axis") baseH = rectH.left + rectH.width / 2;
        snapX = baseH;
        crosshairX = baseH;
      } else {
        crosshairX = ratioX * window.innerWidth;
      }

      if (isSnappedV && anchorVElement) {
        const rectV = anchorVElement.getBoundingClientRect();
        let baseV = rectV.top;
        if (snapBoundaryV === "Bottom-Edge") baseV = rectV.bottom;
        else if (snapBoundaryV === "Center-Axis") baseV = rectV.top + rectV.height / 2;
        snapY = baseV;
        crosshairY = baseV;
      } else {
        crosshairY = ratioY * window.innerHeight;
      }
    }
    updateVisuals();
  }

  // RAO Algorithm
  function runRAO(x, y) {
    const list = document.querySelectorAll('.card, .form-group, label, input, .btn, a, .grid-item, h1, p');
    const candidates = [];

    // 1. Candidate Discovery
    list.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Filter: only elements within 450px
      const distToCenterH = Math.min(Math.abs(rect.left - x), Math.abs(rect.right - x), Math.abs(rect.left + rect.width / 2 - x));
      const distToCenterV = Math.min(Math.abs(rect.top - y), Math.abs(rect.bottom - y), Math.abs(rect.top + rect.height / 2 - y));
      if (distToCenterH > 450 && distToCenterV > 450) return;

      candidates.push({ element: el, rect });
    });

    if (candidates.length === 0) {
      anchorHElement = null;
      anchorVElement = null;
      isSnappedH = false;
      isSnappedV = false;
      return;
    }

    // 2. Score & Select H-Anchor
    let bestH = null;
    let minScoreH = Infinity;

    candidates.forEach(cand => {
      const rect = cand.rect;
      const leftVal = rect.left;
      const rightVal = rect.right;
      const centerVal = rect.left + rect.width / 2;

      // Horizontal candidates
      const opts = [
        { boundary: "Left-Edge", value: leftVal },
        { boundary: "Right-Edge", value: rightVal },
        { boundary: "Center-Axis", value: centerVal }
      ];

      opts.forEach(opt => {
        const minDistH = Math.abs(x - opt.value);
        // Visual V-overlap distance
        let visualDistV = 0;
        if (y < rect.top) {
          visualDistV = rect.top - y;
        } else if (y > rect.bottom) {
          visualDistV = y - rect.bottom;
        }

        // Score formulation
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
      });
    });

    // 3. Score & Select V-Anchor
    let bestV = null;
    let minScoreV = Infinity;

    candidates.forEach(cand => {
      const rect = cand.rect;
      const topVal = rect.top;
      const bottomVal = rect.bottom;
      const centerVal = rect.top + rect.height / 2;

      const opts = [
        { boundary: "Top-Edge", value: topVal },
        { boundary: "Bottom-Edge", value: bottomVal },
        { boundary: "Center-Axis", value: centerVal }
      ];

      opts.forEach(opt => {
        const minDistV = Math.abs(y - opt.value);
        // Visual H-overlap distance
        let visualDistH = 0;
        if (x < rect.left) {
          visualDistH = rect.left - x;
        } else if (x > rect.right) {
          visualDistH = x - rect.right;
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
      });
    });

    // 4. Snapping & Offset Assignment
    if (bestH) {
      anchorHElement = bestH.element;
      snapBoundaryH = bestH.boundary;
      if (bestH.distance < 15) {
        isSnappedH = true;
        snapX = bestH.value;
      } else {
        isSnappedH = false;
        snapX = x;
      }
    } else {
      anchorHElement = null;
      isSnappedH = false;
    }

    if (bestV) {
      anchorVElement = bestV.element;
      snapBoundaryV = bestV.boundary;
      if (bestV.distance < 15) {
        isSnappedV = true;
        snapY = bestV.value;
      } else {
        isSnappedV = false;
        snapY = y;
      }
    } else {
      anchorVElement = null;
      isSnappedV = false;
    }
  }

  // Rendering smart guides and highlights
  function updateVisuals() {
    // Position Crosshair Element
    const activeViewportX = (isSnappedH ? snapX : crosshairX) + dX;
    const activeViewportY = (isSnappedV ? snapY : crosshairY) + dY;

    crosshairEl.style.left = `${activeViewportX}px`;
    crosshairEl.style.top = `${activeViewportY}px`;

    // Clear SVG overlay
    svgOverlay.innerHTML = "";
    badgeH.style.display = "none";
    badgeV.style.display = "none";

    const svgNS = "http://www.w3.org/2000/svg";

    // 1. Highlight H-Anchor Element
    if (anchorHElement) {
      drawAnchorOutline(anchorHElement, "rgba(16, 185, 129, 0.2)");
    }
    // 2. Highlight V-Anchor Element
    if (anchorVElement && anchorVElement !== anchorHElement) {
      drawAnchorOutline(anchorVElement, "rgba(59, 130, 246, 0.2)");
    }

    // 3. Draw Horizontal Guide Line & Badge
    if (anchorHElement) {
      const rect = anchorHElement.getBoundingClientRect();
      let anchorVal = rect.left;
      if (snapBoundaryH === "Right-Edge") anchorVal = rect.right;
      else if (snapBoundaryH === "Center-Axis") anchorVal = rect.left + rect.width / 2;

      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", anchorVal.toString());
      line.setAttribute("y1", activeViewportY.toString());
      line.setAttribute("x2", activeViewportX.toString());
      line.setAttribute("y2", activeViewportY.toString());
      line.setAttribute("stroke", "#10b981");
      line.setAttribute("stroke-dasharray", "4");
      line.setAttribute("stroke-width", "1.5");
      svgOverlay.appendChild(line);

      const valOffset = Math.round(activeViewportX - anchorVal);
      badgeH.textContent = `${valOffset >= 0 ? "+" : ""}${valOffset}px`;
      badgeH.style.display = "block";
      badgeH.style.left = `${(anchorVal + activeViewportX) / 2 - 20}px`;
      badgeH.style.top = `${activeViewportY - 20}px`;
    }

    // 4. Draw Vertical Guide Line & Badge
    if (anchorVElement) {
      const rect = anchorVElement.getBoundingClientRect();
      let anchorVal = rect.top;
      if (snapBoundaryV === "Bottom-Edge") anchorVal = rect.bottom;
      else if (snapBoundaryV === "Center-Axis") anchorVal = rect.top + rect.height / 2;

      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", activeViewportX.toString());
      line.setAttribute("y1", anchorVal.toString());
      line.setAttribute("x2", activeViewportX.toString());
      line.setAttribute("y2", activeViewportY.toString());
      line.setAttribute("stroke", "#10b981");
      line.setAttribute("stroke-dasharray", "4");
      line.setAttribute("stroke-width", "1.5");
      svgOverlay.appendChild(line);

      const valOffset = Math.round(activeViewportY - anchorVal);
      badgeV.textContent = `${valOffset >= 0 ? "+" : ""}${valOffset}px`;
      badgeV.style.display = "block";
      badgeV.style.left = `${activeViewportX + 10}px`;
      badgeV.style.top = `${(anchorVal + activeViewportY) / 2 - 8}px`;
    }

    // Update Live Info Panel Content
    updatePanel(activeViewportX, activeViewportY);
  }

  function drawAnchorOutline(el, fillColor) {
    const rect = el.getBoundingClientRect();
    const svgNS = "http://www.w3.org/2000/svg";
    const box = document.createElementNS(svgNS, "rect");
    box.setAttribute("x", rect.left.toString());
    box.setAttribute("y", rect.top.toString());
    box.setAttribute("width", rect.width.toString());
    box.setAttribute("height", rect.height.toString());
    box.setAttribute("fill", fillColor);
    box.setAttribute("stroke", "#10b981");
    box.setAttribute("stroke-width", "1");
    box.setAttribute("stroke-dasharray", "2");
    svgOverlay.appendChild(box);
  }

  // Find Nearest Common Ancestor
  function findCommonAncestor(el1, el2) {
    if (!el1 || !el2) return document.body;
    const path = [];
    let curr = el1;
    while (curr) {
      path.push(curr);
      curr = curr.parentElement;
    }
    curr = el2;
    while (curr) {
      if (path.includes(curr)) return curr;
      curr = curr.parentElement;
    }
    return document.body;
  }

  /**
   * Variation E helper: walk DOM from element upward, collect display/position/
   * layout props for each ancestor. No fiber — pure getComputedStyle.
   * Returns array from closest (index 0) to furthest.
   */
  function resolveAncestors(element, maxDepth) {
    maxDepth = maxDepth || 8;
    const results = [];
    let current = element ? element.parentElement : null;
    let depth = 0;

    while (current && current !== document.documentElement && depth < maxDepth) {
      try {
        const comp = window.getComputedStyle(current);
        const display = comp.display || "block";
        const position = comp.position || "static";
        const tag = current.tagName.toLowerCase();
        const id = current.id ? "#" + current.id : "";
        const classes = Array.from(current.classList)
          .filter(function(c) { return c && !c.startsWith("hoversource") && !c.startsWith("hs-"); })
          .join(".");
        const selector = tag + id + (classes ? "." + classes : "");

        const info = { selector: selector, display: display, position: position };

        if (display === "flex" || display === "inline-flex") {
          info.layoutProps = {
            "flex-direction": comp.flexDirection,
            "justify-content": comp.justifyContent,
            "align-items": comp.alignItems,
            "gap": comp.gap,
            "flex-wrap": comp.flexWrap
          };
        } else if (display === "grid" || display === "inline-grid") {
          info.layoutProps = {
            "grid-template-columns": comp.gridTemplateColumns,
            "grid-template-rows": comp.gridTemplateRows,
            "gap": comp.gap
          };
        }

        results.push(info);
      } catch(e) { /* skip detached */ }

      current = current.parentElement;
      depth++;
    }
    return results;
  }

  // Generate CSS Layout Rules
  function getSuggestedCSS(boundaryH, boundaryV, offsetH, offsetV, parentContainer, activeX, activeY, anchorH, anchorV) {
    const rules = [`position: absolute;`];
    let transformX = "";
    let transformY = "";

    if (anchorH && anchorH === anchorV) {
      // Horizontal positioning
      if (boundaryH === "Left-Edge") {
        if (offsetH >= 0) {
          rules.push(`  left: ${offsetH}px;`);
        } else {
          rules.push(`  right: calc(100% + ${Math.abs(offsetH)}px);`);
        }
      } else if (boundaryH === "Right-Edge") {
        if (offsetH >= 0) {
          rules.push(`  left: calc(100% + ${offsetH}px);`);
        } else {
          rules.push(`  right: ${Math.abs(offsetH)}px;`);
        }
      } else if (boundaryH === "Center-Axis") {
        if (offsetH === 0) {
          rules.push(`  left: 50%;`);
        } else {
          rules.push(`  left: calc(50% + ${offsetH}px);`);
        }
        transformX = "translateX(-50%)";
      }

      // Vertical positioning
      if (boundaryV === "Top-Edge") {
        if (offsetV >= 0) {
          rules.push(`  top: ${offsetV}px;`);
        } else {
          rules.push(`  bottom: calc(100% + ${Math.abs(offsetV)}px);`);
        }
      } else if (boundaryV === "Bottom-Edge") {
        if (offsetV >= 0) {
          rules.push(`  top: calc(100% + ${offsetV}px);`);
        } else {
          rules.push(`  bottom: ${Math.abs(offsetV)}px;`);
        }
      } else if (boundaryV === "Center-Axis") {
        if (offsetV === 0) {
          rules.push(`  top: 50%;`);
        } else {
          rules.push(`  top: calc(50% + ${offsetV}px);`);
        }
        transformY = "translateY(-50%)";
      }

      // Combined transform
      if (transformX && transformY) {
        rules.push("  transform: translate(-50%, -50%);");
      } else if (transformX) {
        rules.push(`  transform: ${transformX};`);
      } else if (transformY) {
        rules.push(`  transform: ${transformY};`);
      }
      rules.push(`  white-space: nowrap;`);
    } else {
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

  // Render Panel content (Markdown specs)
  function updatePanel(activeX, activeY) {
    const selectorH = anchorHElement ? getSelector(anchorHElement) : "None";
    const selectorV = anchorVElement ? getSelector(anchorVElement) : "None";

    const commonParent = findCommonAncestor(anchorHElement, anchorVElement);
    const parentSelector = getSelector(commonParent);

    const rectH = anchorHElement ? anchorHElement.getBoundingClientRect() : null;
    let valH = rectH ? rectH.left : 0;
    if (snapBoundaryH === "Right-Edge") valH = rectH.right;
    else if (snapBoundaryH === "Center-Axis") valH = rectH.left + rectH.width/2;
    const offsetH = Math.round(activeX - valH);

    const rectV = anchorVElement ? anchorVElement.getBoundingClientRect() : null;
    let valV = rectV ? rectV.top : 0;
    if (snapBoundaryV === "Bottom-Edge") valV = rectV.bottom;
    else if (snapBoundaryV === "Center-Axis") valV = rectV.top + rectV.height/2;
    const offsetV = Math.round(activeY - valV);

    const cssRules = getSuggestedCSS(snapBoundaryH, snapBoundaryV, offsetH, offsetV, commonParent, activeX, activeY, anchorHElement, anchorVElement);
    const isHAndVSame = anchorHElement && anchorHElement === anchorVElement;

    const targetElement = anchorHElement || anchorVElement || document.querySelector("h1");
    const tagName = targetElement ? targetElement.tagName.toLowerCase() : "h1";
    const classList = targetElement ? Array.from(targetElement.classList).filter(c => !c.startsWith("hoversource") && !c.startsWith("hs-")) : [];
    const classStr = classList.length > 0 ? `.${classList.join(".")}` : "";
    const idStr = (targetElement && targetElement.id) ? `#${targetElement.id}` : "";
    const selector = `${tagName}${idStr}${classStr}`;

    let component = "h1";
    let file = "packages/overlay-core/prototype/index.html";
    let line = 114;
    let col = 7;
    if (targetElement) {
      if (targetElement.id === "login-card") {
        component = "Card";
        line = 122;
        col = 5;
      } else if (targetElement.id === "email-input") {
        component = "Input";
        line = 126;
        col = 9;
      } else if (targetElement.id === "password-input") {
        component = "Input";
        line = 130;
        col = 9;
      } else if (targetElement.id === "login-button") {
        component = "Button";
        line = 133;
        col = 9;
      } else if (targetElement.classList.contains("grid-item")) {
        component = "GridItem";
        line = 140;
        col = 7;
      }
    }

    if (activeVariant === "D") {
      let action = "Append-Child";
      let spacingOffset = 0;
      let direction = "inside";

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const x = activeX;
        const y = activeY;

        if (x < rect.left) {
          action = "Insert-Sibling-Before";
          spacingOffset = Math.round(rect.left - x);
          direction = "left";
        } else if (x > rect.right) {
          action = "Insert-Sibling-After";
          spacingOffset = Math.round(x - rect.right);
          direction = "right";
        } else if (y < rect.top) {
          action = "Insert-Sibling-Before";
          spacingOffset = Math.round(rect.top - y);
          direction = "top";
        } else if (y > rect.bottom) {
          action = "Insert-Sibling-After";
          spacingOffset = Math.round(y - rect.bottom);
          direction = "bottom";
        } else {
          if (x - rect.left < rect.right - x) {
            action = "Prepend-Child";
            direction = "inside-left";
          } else {
            action = "Append-Child";
            direction = "inside-right";
          }
          spacingOffset = 0;
        }
      }

      let isParentFlexRow = false;
      let isParentFlexCol = true;
      const parent = targetElement ? targetElement.parentElement : null;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === "flex") {
          isParentFlexRow = parentStyle.flexDirection === "row" || parentStyle.flexDirection === "";
          isParentFlexCol = parentStyle.flexDirection === "column";
        } else if (parentStyle.display === "grid") {
          const gridTemplateCols = parentStyle.gridTemplateColumns;
          isParentFlexRow = gridTemplateCols && gridTemplateCols.split(" ").length > 1;
          isParentFlexCol = !isParentFlexRow;
        }
      }

      let strategy = "Flow-Sibling";
      let htmlMod = "";
      let cssRules = "";

      if ((direction === "left" || direction === "right") && isParentFlexCol) {
        strategy = "Relative-Absolute (Neo-Anchored)";
        action = "Append-Child (Positioned Absolute)";
        htmlMod = `<${tagName} style="position: relative;">\n  ...\n</${tagName}> -> <${tagName} style="position: relative;">\n  ...\n  <span style="position: absolute; ...">🐱</span>\n</${tagName}>`;
        
        const sideRule = direction === "left" ? `right: calc(100% + ${spacingOffset}px);` : `left: calc(100% + ${spacingOffset}px);`;
        cssRules = `position: absolute;\n${sideRule}\ntop: 50%;\ntransform: translateY(-50%);\nwhite-space: nowrap;`;
      } else {
        strategy = "DOM-Flow";
        if (action === "Insert-Sibling-After") {
          htmlMod = `<${tagName}>...</${tagName}> -> <${tagName}>...</${tagName}>\n[NewElement]`;
          if (direction === "right") {
            cssRules = `margin-left: ${spacingOffset}px;\ndisplay: inline-block;\nvertical-align: middle;`;
          } else {
            cssRules = `margin-top: ${spacingOffset}px;\ndisplay: block;`;
          }
        } else if (action === "Insert-Sibling-Before") {
          htmlMod = `<${tagName}>...</${tagName}> -> [NewElement]\n<${tagName}>...</${tagName}>`;
          if (direction === "left") {
            cssRules = `margin-right: ${spacingOffset}px;\ndisplay: inline-block;\nvertical-align: middle;`;
          } else {
            cssRules = `margin-bottom: ${spacingOffset}px;\ndisplay: block;`;
          }
        } else {
          htmlMod = `<${tagName}>\n  ...\n</${tagName}> -> <${tagName}>\n  ...\n  [NewElement]\n</${tagName}>`;
          cssRules = `/* Positioned inside flow of parent */\ndisplay: inline-block;`;
        }

        if (parent) {
          const parentStyle = window.getComputedStyle(parent);
          if (parentStyle.display === "flex" || parentStyle.display === "grid") {
            cssRules = `/* Parent is ${parentStyle.display} - element flows naturally */\nmargin: 8px; /* adjust spacing if needed */`;
          }
        }
      }

      latestMetadataText = `
### HoverSource Design Placement Metadata
* **Component**: \`${component}\`
* **Element**: \`${selector}\`
* **File Path**: \`${file}\` (Line: ${line}, Column: ${col})
* **Framework**: Vanilla
* **DOM Placement Strategy**:
  - **Reference Anchor**: \`${selector}\`
  - **Strategy Type**: \`${strategy}\`
  - **Insertion Action**: \`${action}\`
  - **Spacing Offset**: \`${spacingOffset}px\`
* **Suggested Layout Insertion**:
  - **HTML Modification**:
\`\`\`html
${htmlMod}
\`\`\`
  - **Suggested CSS Rules**:
\`\`\`css
${cssRules}
\`\`\`
`.trim();
    } else if (activeVariant === "C") {
      let action = "Append-Child";
      let spacingOffset = 0;
      let direction = "inside";

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const x = activeX;
        const y = activeY;

        if (x < rect.left) {
          action = "Insert-Sibling-Before";
          spacingOffset = Math.round(rect.left - x);
          direction = "left";
        } else if (x > rect.right) {
          action = "Insert-Sibling-After";
          spacingOffset = Math.round(x - rect.right);
          direction = "right";
        } else if (y < rect.top) {
          action = "Insert-Sibling-Before";
          spacingOffset = Math.round(rect.top - y);
          direction = "top";
        } else if (y > rect.bottom) {
          action = "Insert-Sibling-After";
          spacingOffset = Math.round(y - rect.bottom);
          direction = "bottom";
        } else {
          if (x - rect.left < rect.right - x) {
            action = "Prepend-Child";
            direction = "inside-left";
          } else {
            action = "Append-Child";
            direction = "inside-right";
          }
          spacingOffset = 0;
        }
      }

      let htmlMod = "";
      let cssRules = "";

      if (action === "Insert-Sibling-After") {
        htmlMod = `<${tagName}>...</${tagName}> -> <${tagName}>...</${tagName}>\n[NewElement]`;
        if (direction === "right") {
          cssRules = `margin-left: ${spacingOffset}px;\ndisplay: inline-block;\nvertical-align: middle;`;
        } else {
          cssRules = `margin-top: ${spacingOffset}px;\ndisplay: block;`;
        }
      } else if (action === "Insert-Sibling-Before") {
        htmlMod = `<${tagName}>...</${tagName}> -> [NewElement]\n<${tagName}>...</${tagName}>`;
        if (direction === "left") {
          cssRules = `margin-right: ${spacingOffset}px;\ndisplay: inline-block;\nvertical-align: middle;`;
        } else {
          cssRules = `margin-bottom: ${spacingOffset}px;\ndisplay: block;`;
        }
      } else if (action === "Append-Child") {
        htmlMod = `<${tagName}>\n  ...\n</${tagName}> -> <${tagName}>\n  ...\n  [NewElement]\n</${tagName}>`;
        cssRules = `/* Positioned inside flow of parent */\ndisplay: inline-block;`;
      } else if (action === "Prepend-Child") {
        htmlMod = `<${tagName}>\n  ...\n</${tagName}> -> <${tagName}>\n  [NewElement]\n  ...\n</${tagName}>`;
        cssRules = `/* Positioned inside flow of parent */\ndisplay: inline-block;`;
      }

      const parent = targetElement ? targetElement.parentElement : null;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === "flex" || parentStyle.display === "grid") {
          cssRules = `/* Parent is ${parentStyle.display} - element flows naturally */\nmargin: 8px; /* adjust spacing if needed */`;
        }
      }

      latestMetadataText = `
### HoverSource Design Placement Metadata
* **Component**: \`${component}\`
* **Element**: \`${selector}\`
* **File Path**: \`${file}\` (Line: ${line}, Column: ${col})
* **Framework**: Vanilla
* **DOM Placement Strategy**:
  - **Reference Anchor**: \`${selector}\`
  - **Insertion Action**: \`${action}\`
  - **Spacing Offset**: \`${spacingOffset}px\`
* **Suggested Layout Insertion**:
  - **HTML Modification**:
\`\`\`html
${htmlMod}
\`\`\`
  - **Suggested CSS Rules**:
\`\`\`css
${cssRules}
\`\`\`
`.trim();
    } else if (activeVariant === "E") {
      // Tier 2: Layout Context (auto-resolved via DOM)
      const anchorForContext = anchorHElement || anchorVElement || targetElement;
      const ancestors = resolveAncestors(anchorForContext, 8);

      const positionedAncestor = ancestors.find(function(a) { return a.position !== "static"; }) || null;
      const directParent = ancestors[0] || null;

      // Anchor element's own display
      let anchorElementDisplay = "block";
      let anchorDisplayNote = null;
      if (anchorForContext) {
        try {
          const anchorComp = window.getComputedStyle(anchorForContext);
          const d = anchorComp.display || "block";
          if (d === "flex" || d === "inline-flex") {
            anchorElementDisplay = d + " (flex-direction: " + anchorComp.flexDirection + ")";
            anchorDisplayNote = "Anchor element is a flex container. If inserting a new child into it, a flex child approach (e.g. margin-left: auto) may be more appropriate than position: absolute.";
          } else if (d === "grid" || d === "inline-grid") {
            anchorElementDisplay = d;
            anchorDisplayNote = "Anchor element is a grid container. If inserting a new child into it, a grid child approach may be more appropriate than position: absolute.";
          } else {
            anchorElementDisplay = d;
          }
        } catch(e) { /* skip */ }
      }

      // Build positioned ancestor line
      const posAncLine = positionedAncestor
        ? "`" + positionedAncestor.selector + "` (position: " + positionedAncestor.position + "), source unresolved (Vanilla HTML prototype)"
        : "none found within 8 levels — CSS rules may need `position: relative` added to a parent";

      // Build direct parent line with layout props
      let directParentLine = "unresolved";
      if (directParent) {
        directParentLine = "`" + directParent.selector + "` (display: " + directParent.display + ")";
        if (directParent.layoutProps) {
          const props = Object.entries(directParent.layoutProps)
            .filter(function(kv) { return kv[1] && kv[1] !== "normal" && kv[1] !== "0px"; })
            .map(function(kv) { return kv[0] + ": " + kv[1]; })
            .join(" | ");
          if (props) directParentLine += "\n  - " + props;
        }
      }

      // Layout note: if direct parent is flex/grid
      const parentDisplay = directParent ? directParent.display : "";
      const layoutWarning = (parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid")
        ? "Direct parent is a " + parentDisplay + " container. Inserting as a " + (parentDisplay.startsWith("grid") ? "grid" : "flex") + " child or with position: absolute are both options — verify which fits the component layout."
        : null;

      const anchorSelector = getSelector(anchorForContext);

      latestMetadataText = `
### HoverSource Design Placement Metadata
* **Component**: \`${component}\`
* **Element**: \`${selector}\`
* **File Path**: \`${file}\` (Line: ${line}, Column: ${col})
* **Framework**: Vanilla
* **Horizontal Anchor**:
  - Selector: \`${selectorH}\`
  - Boundary: \`${snapBoundaryH || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetH >= 0 ? "+" : ""}${offsetH}px\` (${isSnappedH ? 'Snapped' : 'Free'})
* **Vertical Anchor**:
  - Selector: \`${selectorV}\`
  - Boundary: \`${snapBoundaryV || "None"}\`
  - Crosshair distance from boundary (NOT a CSS value): \`${offsetV >= 0 ? "+" : ""}${offsetV}px\` (${isSnappedV ? 'Snapped' : 'Free'})

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: ${posAncLine}
* **Anchor Element**: \`${anchorSelector}\` (display: ${anchorElementDisplay})
${anchorDisplayNote ? "  - " + anchorDisplayNote + "\n" : ""}\
* **Direct Parent of Anchor**: ${directParentLine}
${layoutWarning ? "* " + layoutWarning + "\n" : ""}\
* **USE THIS CSS** (do not use the distance values above as CSS — use this block):
\`\`\`css
${cssRules}
\`\`\`
* **Source Files to Examine**:
  - \`${file}\` (Line: ${line}) — anchor element (Vanilla HTML, no fiber)

#### For the AI Agent
The CSS above assumes the new element will be a direct child of the Positioned Ancestor.
You must determine the actual DOM insertion point by examining the source files above.
The following is NOT resolved automatically and requires your judgment:
- **DOM insertion point**: where in the HTML/JSX tree the new element belongs
- **Whether \`position: absolute\` is appropriate**: if the anchor or its parent is a flex/grid
  container, a flex/grid child approach may be more appropriate
- **Whether the Positioned Ancestor has \`position: relative\` in source**: verify
  it is not conditionally applied

Suggested layout insertion (heuristic only):
* Target DOM Parent: \`${isHAndVSame ? selectorH : parentSelector}\` (${isHAndVSame ? 'same as anchor' : 'common ancestor of H and V anchors'})
`.trim();
    } else {
      latestMetadataText = `
### HoverSource Design Placement Metadata
* **Component**: \`${component}\`
* **Element**: \`${selector}\`
* **File Path**: \`${file}\` (Line: ${line}, Column: ${col})
* **Framework**: Vanilla
* **Horizontal Anchor**:
  - Selector: \`${selectorH}\`
  - Boundary: \`${snapBoundaryH || "None"}\`
  - Offset (dX): \`${offsetH >= 0 ? "+" : ""}${offsetH}px\` (${isSnappedH ? 'Snapped' : 'Free'})
* **Vertical Anchor**:
  - Selector: \`${selectorV}\`
  - Boundary: \`${snapBoundaryV || "None"}\`
  - Offset (dY): \`${offsetV >= 0 ? "+" : ""}${offsetV}px\` (${isSnappedV ? 'Snapped' : 'Free'})
* **Suggested Layout Insertion**:
  - Target DOM Parent: \`${isHAndVSame ? selectorH : parentSelector}\` (${isHAndVSame ? 'Anchor Element' : 'Common Ancestor'})
  - Target CSS Rules:
\`\`\`css
${cssRules}
\`\`\`
`.trim();
    }

    panelEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 8px; color: #10b981;">
        <span>RAO PROTOTYPE LIVE METADATA</span>
        <button id="copy-metadata-btn" style="background: #10b981; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; transition: background 0.2s;">
          Copy (Alt+C)
        </button>
      </div>
      <div style="white-space: pre-wrap; word-break: break-all;">${latestMetadataText}</div>
    `;

    const copyBtn = panelEl.querySelector("#copy-metadata-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyToClipboard(latestMetadataText).then(() => {
          console.log("[HoverSource] Copied design metadata to clipboard via button!");
          const originalText = copyBtn.textContent;
          copyBtn.textContent = "COPIED! ✓";
          copyBtn.style.background = "#34d399";
          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = "#10b981";
          }, 1500);
        }).catch(err => {
          console.error("[HoverSource] Failed to copy via button: ", err);
        });
      });
    }
  }

  function getSelector(el) {
    if (!el) return "";
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList).filter(c => c && !c.startsWith("hoversource") && !c.startsWith("hs-")).join(".");
    const classStr = classes ? `.${classes}` : "";
    return `${tag}${id}${classStr}`;
  }

  // Drag Handlers
  function startDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCrosshairX = crosshairX;
    dragStartCrosshairY = crosshairY;

    // Blocker overlay to intercept all events
    const blocker = document.createElement("div");
    blocker.setAttribute("id", "rao-drag-blocker");
    blocker.style.position = "fixed";
    blocker.style.top = "0";
    blocker.style.left = "0";
    blocker.style.width = "100vw";
    blocker.style.height = "100vh";
    blocker.style.pointerEvents = "auto";
    blocker.style.cursor = "grabbing";
    blocker.style.zIndex = "9998";
    document.body.appendChild(blocker);

    function onDragMove(ev) {
      if (!isDragging) return;
      const deltaX = ev.clientX - dragStartX;
      const deltaY = ev.clientY - dragStartY;

      const newX = dragStartCrosshairX + deltaX;
      const newY = dragStartCrosshairY + deltaY;

      // Run RAO at proposed coordinate
      runRAO(newX, newY);

      // Lock coordinates if snapped, otherwise free
      crosshairX = isSnappedH ? snapX : newX;
      crosshairY = isSnappedV ? snapY : newY;

      // Reset keyboard nudging when dragging
      dX = 0;
      dY = 0;

      updateRatios();
      updateVisuals();
    }

    function onDragEnd(ev) {
      isDragging = false;
      blocker.remove();
      window.removeEventListener("pointermove", onDragMove, { capture: true });
      window.removeEventListener("pointerup", onDragEnd, { capture: true });
    }

    window.addEventListener("pointermove", onDragMove, { capture: true });
    window.addEventListener("pointerup", onDragEnd, { capture: true });
  }

  // Keyboard Handler for Nudging and Copying
  function handleKeyDown(e) {
    // Check typing bypass
    const activeEl = document.activeElement;
    if (activeEl) {
      const tag = activeEl.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || activeEl.hasAttribute("contenteditable")) {
        return;
      }
    }

    // Alt + C: Copy Metadata
    if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(latestMetadataText).then(() => {
        console.log("[HoverSource] Copied design metadata to clipboard!");
        // Temporary feedback on the panel title
        const titleEl = panelEl.querySelector("div");
        if (titleEl) {
          const originalText = titleEl.textContent;
          titleEl.textContent = "COPIED TO CLIPBOARD! ✓";
          titleEl.style.color = "#34d399";
          setTimeout(() => {
            titleEl.textContent = originalText;
            titleEl.style.color = "#10b981";
          }, 1500);
        }
      }).catch(err => {
        console.error("[HoverSource] Failed to copy: ", err);
      });
      return;
    }

    // Alt + Arrow keys: Cycle variants
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      toggleVariant("prev");
      return;
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      toggleVariant("next");
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    const step = e.shiftKey ? 8 : 1;

    if (e.key === "ArrowLeft") dX -= step;
    else if (e.key === "ArrowRight") dX += step;
    else if (e.key === "ArrowUp") dY -= step;
    else if (e.key === "ArrowDown") dY += step;

    updateRatios();
    updateVisuals();
  }

  // Self start
  init();
})();
