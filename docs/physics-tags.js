// Floating physics tags for Hero Section
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.getElementById('hero-section');
  if (!hero) {
    console.error("HoverSource Physics: #hero-section not found!");
    return;
  }

  // Create canvas container
  const canvas = document.createElement('div');
  canvas.id = 'floating-physics-canvas';
  canvas.className = 'absolute inset-0 pointer-events-none overflow-hidden z-0';
  hero.appendChild(canvas);
  console.log("HoverSource Physics: Canvas created.");

  const tagsData = [
    { text: "-94.5% Tokens", theme: "orange", size: "text-2xl" },
    { text: "-73.9% Steps", theme: "purple", size: "text-2xl" },
    { text: "O(1) Exploring Fee", theme: "blue", size: "text-xl" },
    { text: "Zero-invasive", theme: "blue", size: "text-2xl" },
    { text: "React", theme: "purple", size: "text-xl" },
    { text: "Next.js", theme: "blue", size: "text-xl" },
    { text: "Vue", theme: "orange", size: "text-lg" },
    { text: "Svelte", theme: "orange", size: "text-base" },
    { text: "Vite", theme: "blue", size: "text-lg" },
    { text: "Webpack", theme: "purple", size: "text-base" },
    { text: "CDP Debugger", theme: "blue", size: "text-sm" },
    { text: "Compiler Map", theme: "purple", size: "text-xs" },
    { text: "AST Parser", theme: "orange", size: "text-xs" },
    { text: "Source Map", theme: "blue", size: "text-sm" },
    { text: "App Proxy", theme: "purple", size: "text-[10px]" },
    { text: "Overlay Core", theme: "orange", size: "text-sm" }
  ];

  const tags = [];
  const header = hero.querySelector('header');
  let headerHeight = header ? header.offsetHeight : 80;

  // Setup tag elements
  tagsData.forEach((data) => {
    const el = document.createElement('div');
    
    // Start with opacity 0 to prevent flash/pile-up before layout calculation
    el.className = `absolute select-none cursor-grab active:cursor-grabbing font-mono font-bold tracking-wider pointer-events-auto opacity-0 ${data.size}`;
    el.innerText = data.text;
    
    // No CSS transitions to avoid conflicts with frame-rate updates
    el.style.transition = 'none';
    canvas.appendChild(el);

    // Initialize with rough random position
    const roughW = window.innerWidth || 1200;
    const roughH = window.innerHeight || 800;
    const roughX = Math.random() * (roughW - 150);
    const roughY = Math.random() * (roughH - 180) + 80;

    tags.push({
      element: el,
      text: data.text,
      theme: data.theme,
      x: roughX,
      y: roughY,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      width: 0,
      height: 0,
      glowIntensity: 0.0,
      targetGlowIntensity: 0.0,
      isDragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      lastMouseX: 0,
      lastMouseY: 0,
      lastMouseTime: 0,
      history: []
    });

    el.style.transform = `translate3d(${roughX}px, ${roughY}px, 0)`;
  });

  let containerWidth = canvas.clientWidth;
  let containerHeight = canvas.clientHeight;

  // Position tags randomly, avoiding the exact center initially and staying below header
  function positionTags() {
    containerWidth = canvas.clientWidth || window.innerWidth;
    containerHeight = canvas.clientHeight || window.innerHeight;
    headerHeight = header ? header.offsetHeight : 80;

    tags.forEach((tag) => {
      tag.width = tag.element.offsetWidth || 100;
      tag.height = tag.element.offsetHeight || 30;

      // Distribute in sections to avoid clustering in the center text area
      let posX = Math.random() * (containerWidth - tag.width);
      let posY = Math.random() * (containerHeight - tag.height - headerHeight) + headerHeight;

      const centerX = containerWidth / 2;
      const centerY = (containerHeight - headerHeight) / 2 + headerHeight;
      const marginX = containerWidth * 0.25;
      const marginY = containerHeight * 0.25;

      if (posX > centerX - marginX && posX < centerX + marginX &&
          posY > centerY - marginY && posY < centerY + marginY) {
        if (Math.random() > 0.5) {
          posX = posX < centerX ? posX - marginX : posX + marginX;
        } else {
          posY = posY < centerY ? posY - marginY : posY + marginY;
        }
      }

      // Clamp values
      tag.x = Math.max(0, Math.min(containerWidth - tag.width, posX));
      tag.y = Math.max(headerHeight, Math.min(containerHeight - tag.height, posY));
      
      tag.element.style.transform = `translate3d(${tag.x}px, ${tag.y}px, 0)`;
      
      // Reveal element smoothly after positioning
      tag.element.classList.remove('opacity-0');
    });
    console.log("HoverSource Physics: Tags positioned.");
  }

  // Initial layout delay to ensure offsets are computed correctly
  setTimeout(positionTags, 100);
  window.addEventListener('resize', positionTags);

  // Dragging event bindings
  tags.forEach(tag => {
    function startDrag(clientX, clientY) {
      tag.isDragging = true;
      tag.vx = 0;
      tag.vy = 0;
      
      const rect = tag.element.getBoundingClientRect();
      tag.dragOffsetX = clientX - rect.left;
      tag.dragOffsetY = clientY - rect.top;

      tag.lastMouseX = clientX;
      tag.lastMouseY = clientY;
      tag.lastMouseTime = Date.now();
      tag.history = [{ x: clientX, y: clientY, t: tag.lastMouseTime }];

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    }

    function onMouseMove(e) {
      if (!tag.isDragging) return;
      handleDragMove(e.clientX, e.clientY);
    }

    function onTouchMove(e) {
      if (!tag.isDragging) return;
      e.preventDefault(); // Stop page scrolling while dragging
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }

    function handleDragMove(clientX, clientY) {
      const now = Date.now();
      const rect = canvas.getBoundingClientRect();
      
      const newX = clientX - rect.left - tag.dragOffsetX;
      const newY = clientY - rect.top - tag.dragOffsetY;

      // Keep within boundaries during drag (respect header upper boundary)
      tag.x = Math.max(0, Math.min(containerWidth - tag.width, newX));
      tag.y = Math.max(headerHeight, Math.min(containerHeight - tag.height, newY));

      tag.element.style.transform = `translate3d(${tag.x}px, ${tag.y}px, 0)`;

      // Track history for momentum calculation (keep last 5 frames)
      tag.history.push({ x: clientX, y: clientY, t: now });
      if (tag.history.length > 5) tag.history.shift();
    }

    function endDrag() {
      if (!tag.isDragging) return;
      tag.isDragging = false;

      // Calculate throwing momentum
      if (tag.history.length >= 2) {
        const first = tag.history[0];
        const last = tag.history[tag.history.length - 1];
        const dt = (last.t - first.t) || 16; // Avoid division by zero
        
        // Calculate velocity (clamped to max speed of 5.0 for throwing)
        tag.vx = Math.max(-5.0, Math.min(5.0, ((last.x - first.x) / dt) * 16));
        tag.vy = Math.max(-5.0, Math.min(5.0, ((last.y - first.y) / dt) * 16));
      }

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    }

    function onMouseUp() { endDrag(); }
    function onTouchEnd() { endDrag(); }

    tag.element.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left click
      startDrag(e.clientX, e.clientY);
    });

    tag.element.addEventListener('touchstart', (e) => {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  });

  // Query static UI obstacles (H1 Title, Paragraph description, CTA Buttons container)
  const obstacles = [
    hero.querySelector('h1'),
    hero.querySelector('p'),
    hero.querySelector('.flex.items-center.justify-center.gap-4')
  ].filter(Boolean);

  // Physics animation loop
  function updatePhysics() {
    containerWidth = canvas.clientWidth || window.innerWidth;
    containerHeight = canvas.clientHeight || window.innerHeight;
    headerHeight = header ? header.offsetHeight : 80;

    const canvasRect = canvas.getBoundingClientRect();
    const obsCoords = obstacles.map(obs => {
      const rect = obs.getBoundingClientRect();
      return {
        left: rect.left - canvasRect.left,
        right: rect.right - canvasRect.left,
        top: rect.top - canvasRect.top,
        bottom: rect.bottom - canvasRect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top
      };
    });

    // 1. Resolve collisions with static obstacles (H1, Paragraph, CTA Buttons)
    tags.forEach(tag => {
      if (tag.isDragging) return;

      for (const obs of obsCoords) {
        // Bounding box centers
        const tagCenterX = tag.x + tag.width / 2;
        const tagCenterY = tag.y + tag.height / 2;
        const obsCenterX = (obs.left + obs.right) / 2;
        const obsCenterY = (obs.top + obs.bottom) / 2;

        // Added padding so tags stay slightly away from the text for readability
        const padding = 20;
        const halfWidths = (tag.width + obs.width) / 2 + padding;
        const halfHeights = (tag.height + obs.height) / 2 + padding;

        const dx = tagCenterX - obsCenterX;
        const dy = tagCenterY - obsCenterY;

        const overlapX = halfWidths - Math.abs(dx);
        const overlapY = halfHeights - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          // Push out in the direction of the shallowest overlap (softer bounce factor 0.4)
          if (overlapX < overlapY) {
            const pushX = dx > 0 ? overlapX : -overlapX;
            tag.x += pushX;
            tag.vx = dx > 0 ? Math.abs(tag.vx) * 0.4 : -Math.abs(tag.vx) * 0.4;
          } else {
            const pushY = dy > 0 ? overlapY : -overlapY;
            tag.y += pushY;
            tag.vy = dy > 0 ? Math.abs(tag.vy) * 0.4 : -Math.abs(tag.vy) * 0.4;
          }
        }
      }
    });

    // 2. Calculate mutual repulsion forces to prevent overlapping
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const tagA = tags[i];
        const tagB = tags[j];

        // Centers
        const ax = tagA.x + tagA.width / 2;
        const ay = tagA.y + tagA.height / 2;
        const bx = tagB.x + tagB.width / 2;
        const by = tagB.y + tagB.height / 2;

        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;

        // Threshold distance for repulsion (combined radius + padding)
        const minDist = (tagA.width + tagB.width) / 2 + 25;
        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          
          // 1. Physical separation: Push coordinates apart immediately so they never overlap
          const sepX = nx * overlap * 0.5;
          const sepY = ny * overlap * 0.5;

          if (!tagA.isDragging) {
            tagA.x -= sepX;
            tagA.y -= sepY;
          }
          if (!tagB.isDragging) {
            tagB.x += sepX;
            tagB.y += sepY;
          }

          // 2. Velocity impulse: Bounce them apart dynamically (extremely soft push force 0.015)
          const force = overlap * 0.015;

          if (!tagA.isDragging) {
            tagA.vx -= nx * force;
            tagA.vy -= ny * force;
          }
          if (!tagB.isDragging) {
            tagB.vx += nx * force;
            tagB.vy += ny * force;
          }
        }
      }
    }

    tags.forEach(tag => {
      // If hovered or dragged, force maximum glow intensity
      const isHovered = tag.element.matches(':hover') || tag.isDragging;
      if (isHovered) {
        tag.targetGlowIntensity = 1.0;
        // Faster interpolation for instant hover response
        tag.glowIntensity += (1.0 - tag.glowIntensity) * 0.22;
      } else {
        // Natural smooth fade-out decay (0.988 for much longer lingering glow)
        tag.targetGlowIntensity *= 0.988;
        tag.glowIntensity += (tag.targetGlowIntensity - tag.glowIntensity) * 0.12;
      }

      if (!tag.isDragging) {
        // Update position by velocity
        tag.x += tag.vx;
        tag.y += tag.vy;

        // Apply air friction / damping
        tag.vx *= 0.985;
        tag.vy *= 0.985;

        // Subtle ambient drift force so they never stop completely
        tag.vx += (Math.random() - 0.5) * 0.04;
        tag.vy += (Math.random() - 0.5) * 0.04;

        // Ensure minimum drift speed so they never stop completely
        const minSpeed = 0.2; // Slow elegant drift (0.2)
        const currentSpeed = Math.hypot(tag.vx, tag.vy);
        if (currentSpeed < minSpeed) {
          const angle = currentSpeed > 0.01 ? Math.atan2(tag.vy, tag.vx) : Math.random() * Math.PI * 2;
          tag.vx = Math.cos(angle) * minSpeed;
          tag.vy = Math.sin(angle) * minSpeed;
        }

        // Speed limits
        const maxSpeed = 2.0; // Slow max speed cap (2.0)
        if (currentSpeed > maxSpeed) {
          tag.vx = (tag.vx / currentSpeed) * maxSpeed;
          tag.vy = (tag.vy / currentSpeed) * maxSpeed;
        }

        // Bounce with damping off container borders
        const restitution = 0.4; // Soft wall bounce (0.4)
        if (tag.x < 0) {
          tag.x = 0;
          tag.vx = Math.abs(tag.vx) * restitution;
        } else if (tag.x + tag.width > containerWidth) {
          tag.x = containerWidth - tag.width;
          tag.vx = -Math.abs(tag.vx) * restitution;
        }

        if (tag.y < headerHeight) {
          tag.y = headerHeight;
          tag.vy = Math.abs(tag.vy) * restitution;
        } else if (tag.y + tag.height > containerHeight) {
          tag.y = containerHeight - tag.height;
          tag.vy = -Math.abs(tag.vy) * restitution;
        }
      }

      // Render updated positions & inline color/opacity/glow filters
      const scale = 1.0 + 0.08 * tag.glowIntensity; // Scale factor 1.08 for pop-out
      const baseOpacity = 0.15; // Deeper faded state (0.15) for stronger contrast
      const maxOpacity = 1.0;
      const opacity = baseOpacity + (maxOpacity - baseOpacity) * tag.glowIntensity;

      let textColor;
      let shadowColor;
      
      // Maintain theme colors at all times, with stronger glow multiplier (0.95)
      if (tag.theme === "orange") {
        textColor = "rgb(245, 158, 11)"; // Amber-500
        shadowColor = `rgba(245, 158, 11, ${0.95 * tag.glowIntensity})`;
      } else if (tag.theme === "purple") {
        textColor = "rgb(168, 85, 247)"; // Purple-500
        shadowColor = `rgba(168, 85, 247, ${0.95 * tag.glowIntensity})`;
      } else {
        textColor = "rgb(59, 130, 246)"; // Blue-500
        shadowColor = `rgba(59, 130, 246, ${0.95 * tag.glowIntensity})`;
      }

      tag.element.style.color = textColor;
      tag.element.style.opacity = opacity;
      tag.element.style.filter = tag.glowIntensity > 0.05 ? `drop-shadow(0 0 12px ${shadowColor})` : 'none';
      tag.element.style.transform = `translate3d(${tag.x}px, ${tag.y}px, 0) scale(${scale})`;
    });

    requestAnimationFrame(updatePhysics);
  }

  // Trigger glowing waves from a random tag
  let lastGlowTag = null;

  function triggerWave() {
    // Exclude currently dragged or hovered tags as sources
    const eligibleTags = tags.filter(tag => !tag.isDragging && !tag.element.matches(':hover') && tag !== lastGlowTag);
    if (eligibleTags.length === 0) {
      setTimeout(triggerWave, 1000);
      return;
    }

    const randomTag = eligibleTags[Math.floor(Math.random() * eligibleTags.length)];
    lastGlowTag = randomTag;

    // Calculate distance from this source to all other tags
    const sx = randomTag.x + randomTag.width / 2;
    const sy = randomTag.y + randomTag.height / 2;

    const sortedNeighbors = tags
      .filter(t => t !== randomTag)
      .map(t => {
        const tx = t.x + t.width / 2;
        const ty = t.y + t.height / 2;
        return { tag: t, dist: Math.hypot(tx - sx, ty - sy) };
      })
      .sort((a, b) => a.dist - b.dist);

    // 1. Instantly light up the source tag to 100% (same as hover)
    randomTag.targetGlowIntensity = 1.0;
    console.log("HoverSource Physics: Wave triggered from", randomTag.text);

    // 2. Propagate to neighbors by order of distance (discrete steps)
    const maxHops = Math.min(sortedNeighbors.length, 5); // Glow up to 5 closest neighbors
    for (let i = 0; i < maxHops; i++) {
      const neighbor = sortedNeighbors[i].tag;
      const hopIndex = i + 1; // 1 to 5
      
      // Calculate peak glow for this neighbor based on index:
      // index 1: 0.82, index 2: 0.64, index 3: 0.46, index 4: 0.28, index 5: 0.10
      const peakGlow = Math.max(0, 1.0 - hopIndex * 0.18);
      const delay = hopIndex * 130; // 130ms delay per hop

      setTimeout(() => {
        // Only trigger if not currently manipulated by user
        if (!neighbor.element.matches(':hover') && !neighbor.isDragging) {
          neighbor.targetGlowIntensity = Math.max(neighbor.targetGlowIntensity, peakGlow);
        }
      }, delay);
    }

    // Schedule next wave pulse in 2.5 seconds
    setTimeout(triggerWave, 2500);
  }

  // Start wave pulses after 2 seconds
  setTimeout(triggerWave, 2000);

  // Start physics loop
  requestAnimationFrame(updatePhysics);
});
