// Floating physics tags for Hero Section
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.getElementById('hero-section');
  if (!hero) return;

  // Create canvas container
  const canvas = document.createElement('div');
  canvas.id = 'floating-physics-canvas';
  canvas.className = 'absolute inset-0 pointer-events-none overflow-hidden z-0';
  hero.appendChild(canvas);

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
  const themeClasses = {
    orange: "text-amber-500/25 hover:text-amber-400 hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]",
    purple: "text-purple-500/25 hover:text-purple-400 hover:drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]",
    blue: "text-blue-500/25 hover:text-blue-400 hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]"
  };

  const activeClasses = {
    orange: ["text-amber-400", "scale-105", "drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]"],
    purple: ["text-purple-400", "scale-105", "drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]"],
    blue: ["text-blue-400", "scale-105", "drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]"]
  };

  const inactiveClasses = {
    orange: ["text-amber-500/25"],
    purple: ["text-purple-500/25"],
    blue: ["text-blue-500/25"]
  };

  const header = hero.querySelector('header');
  let headerHeight = header ? header.offsetHeight : 80;

  // Setup tag elements
  tagsData.forEach((data) => {
    const el = document.createElement('div');
    
    // Start with opacity 0 to prevent flash/pile-up before layout calculation
    el.className = `absolute select-none cursor-grab active:cursor-grabbing font-mono font-bold tracking-wider pointer-events-auto transition-all duration-300 hover:scale-105 opacity-0 ${data.size}`;
    for (const cls of themeClasses[data.theme].split(' ')) {
      el.classList.add(cls);
    }
    el.innerText = data.text;
    canvas.appendChild(el);

    // Initialize with rough random position to prevent starting at 0,0
    const roughW = window.innerWidth || 1200;
    const roughH = window.innerHeight || 800;
    const roughX = Math.random() * (roughW - 150);
    const roughY = Math.random() * (roughH - 180) + 80;

    tags.push({
      element: el,
      text: data.text,
      x: roughX,
      y: roughY,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      width: 0,
      height: 0,
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

      tag.element.style.transition = 'none';

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
      
      tag.element.style.transition = 'color 0.3s ease, text-shadow 0.3s ease, filter 0.3s ease, transform 0.3s ease';

      // Calculate throwing momentum
      if (tag.history.length >= 2) {
        const first = tag.history[0];
        const last = tag.history[tag.history.length - 1];
        const dt = (last.t - first.t) || 16; // Avoid division by zero
        
        // Calculate velocity (clamped to max speed of 18)
        tag.vx = Math.max(-18, Math.min(18, ((last.x - first.x) / dt) * 16));
        tag.vy = Math.max(-18, Math.min(18, ((last.y - first.y) / dt) * 16));
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

    // 0. Resolve collisions with static obstacles (H1, Paragraph, CTA Buttons)
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
          // Push out in the direction of the shallowest overlap
          if (overlapX < overlapY) {
            const pushX = dx > 0 ? overlapX : -overlapX;
            tag.x += pushX;
            tag.vx = dx > 0 ? Math.abs(tag.vx) * 0.8 : -Math.abs(tag.vx) * 0.8;
          } else {
            const pushY = dy > 0 ? overlapY : -overlapY;
            tag.y += pushY;
            tag.vy = dy > 0 ? Math.abs(tag.vy) * 0.8 : -Math.abs(tag.vy) * 0.8;
          }
        }
      }
    });

    // 1. Calculate mutual repulsion forces to prevent overlapping
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

          // 2. Velocity impulse: Bounce them apart dynamically (increased force coefficient to 0.12)
          const force = overlap * 0.12;

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
      if (tag.isDragging) return;

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
      const minSpeed = 0.35;
      const currentSpeed = Math.hypot(tag.vx, tag.vy);
      if (currentSpeed < minSpeed) {
        const angle = currentSpeed > 0.01 ? Math.atan2(tag.vy, tag.vx) : Math.random() * Math.PI * 2;
        tag.vx = Math.cos(angle) * minSpeed;
        tag.vy = Math.sin(angle) * minSpeed;
      }

      // Speed limits
      const maxSpeed = 12.0;
      if (currentSpeed > maxSpeed) {
        tag.vx = (tag.vx / currentSpeed) * maxSpeed;
        tag.vy = (tag.vy / currentSpeed) * maxSpeed;
      }

      // Bounce with damping off container borders (respect header height as top border)
      const restitution = 0.85; // Bounciness factor
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

      // Render updated positions
      tag.element.style.transform = `translate3d(${tag.x}px, ${tag.y}px, 0)`;
    });

    requestAnimationFrame(updatePhysics);
  }

  // Ambient Twinkling Glow effect (at most 1 tag glowing programmatically at a time)
  let activeGlowTag = null;

  function runAmbientGlow() {
    // 1. Deactivate current glowing tag if any
    if (activeGlowTag) {
      const data = tagsData.find(d => d.text === activeGlowTag.text);
      const activeCls = activeClasses[data.theme];
      const inactiveCls = inactiveClasses[data.theme];

      activeCls.forEach(cls => activeGlowTag.element.classList.remove(cls));
      inactiveCls.forEach(cls => activeGlowTag.element.classList.add(cls));
      activeGlowTag = null;
    }

    // 2. Randomly select a new tag, excluding currently dragged tag
    const eligibleTags = tags.filter(tag => !tag.isDragging);
    if (eligibleTags.length === 0) {
      setTimeout(runAmbientGlow, 1000);
      return;
    }

    const randomTag = eligibleTags[Math.floor(Math.random() * eligibleTags.length)];
    const data = tagsData.find(d => d.text === randomTag.text);
    
    // 3. Activate new tag
    const activeCls = activeClasses[data.theme];
    const inactiveCls = inactiveClasses[data.theme];
    
    inactiveCls.forEach(cls => randomTag.element.classList.remove(cls));
    activeCls.forEach(cls => randomTag.element.classList.add(cls));
    activeGlowTag = randomTag;

    // 4. Schedule deactivation and next glow pulse
    // Duration: 1800ms glowing, next pulse starts after 2800ms (1000ms pause)
    const glowDuration = 1800;
    const interval = 2800;

    setTimeout(() => {
      if (activeGlowTag === randomTag) {
        activeCls.forEach(cls => randomTag.element.classList.remove(cls));
        inactiveCls.forEach(cls => randomTag.element.classList.add(cls));
        activeGlowTag = null;
      }
    }, glowDuration);

    setTimeout(runAmbientGlow, interval);
  }

  // Start ambient glow after 2 seconds
  setTimeout(runAmbientGlow, 2000);

  // Start physics loop
  requestAnimationFrame(updatePhysics);
});
