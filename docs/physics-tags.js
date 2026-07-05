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
    { text: "-94.5% Tokens", theme: "orange" },
    { text: "-73.9% Steps", theme: "purple" },
    { text: "O(1) Exploring Fee", theme: "blue" },
    { text: "Zero-invasive", theme: "blue" },
    { text: "React", theme: "purple" },
    { text: "Next.js", theme: "blue" },
    { text: "Vue", theme: "orange" },
    { text: "Svelte", theme: "orange" },
    { text: "Vite", theme: "blue" },
    { text: "Webpack", theme: "purple" },
    { text: "CDP Debugger", theme: "blue" },
    { text: "Compiler Map", theme: "purple" },
    { text: "AST Parser", theme: "orange" },
    { text: "Source Map", theme: "blue" },
    { text: "App Proxy", theme: "purple" },
    { text: "Overlay Core", theme: "orange" }
  ];

  const tags = [];
  const themeClasses = {
    orange: "text-amber-500/25 hover:text-amber-400 hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]",
    purple: "text-purple-500/25 hover:text-purple-400 hover:drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]",
    blue: "text-blue-500/25 hover:text-blue-400 hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]"
  };

  const sizes = [
    "text-[10px]",
    "text-xs",
    "text-sm",
    "text-base",
    "text-lg",
    "text-xl",
    "text-2xl"
  ];

  // Setup tag elements
  tagsData.forEach((data, index) => {
    const el = document.createElement('div');
    const sizeClass = sizes[index % sizes.length];
    
    // Start with opacity 0 to prevent flash/pile-up before layout calculation
    el.className = `absolute select-none cursor-grab active:cursor-grabbing font-mono font-bold tracking-wider pointer-events-auto transition-all duration-300 hover:scale-105 opacity-0 ${sizeClass}`;
    themeClasses[data.theme].split(' ').forEach(cls => el.classList.add(cls));
    el.innerText = data.text;
    canvas.appendChild(el);

    // Initialize with rough random position to prevent starting at 0,0
    const roughW = window.innerWidth || 1200;
    const roughH = window.innerHeight || 800;
    const roughX = Math.random() * (roughW - 150);
    const roughY = Math.random() * (roughH - 100);

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

  // Position tags randomly, avoiding the exact center initially
  function positionTags() {
    containerWidth = canvas.clientWidth || window.innerWidth;
    containerHeight = canvas.clientHeight || window.innerHeight;

    tags.forEach((tag) => {
      tag.width = tag.element.offsetWidth || 100;
      tag.height = tag.element.offsetHeight || 30;

      // Distribute in sections to avoid clustering in the center text area
      let posX = Math.random() * (containerWidth - tag.width);
      let posY = Math.random() * (containerHeight - tag.height);

      const centerX = containerWidth / 2;
      const centerY = containerHeight / 2;
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
      tag.y = Math.max(0, Math.min(containerHeight - tag.height, posY));
      
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

      // Keep within boundaries during drag
      tag.x = Math.max(0, Math.min(containerWidth - tag.width, newX));
      tag.y = Math.max(0, Math.min(containerHeight - tag.height, newY));

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

  // Physics animation loop
  function updatePhysics() {
    containerWidth = canvas.clientWidth || window.innerWidth;
    containerHeight = canvas.clientHeight || window.innerHeight;

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
          const force = (minDist - dist) * 0.015; // Gentle pushing force
          const nx = dx / dist;
          const ny = dy / dist;

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

      // Bounce with damping off container borders
      const restitution = 0.85; // Bounciness factor
      if (tag.x < 0) {
        tag.x = 0;
        tag.vx = Math.abs(tag.vx) * restitution;
      } else if (tag.x + tag.width > containerWidth) {
        tag.x = containerWidth - tag.width;
        tag.vx = -Math.abs(tag.vx) * restitution;
      }

      if (tag.y < 0) {
        tag.y = 0;
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

  // Start physics loop
  requestAnimationFrame(updatePhysics);
});
