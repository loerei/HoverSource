// Interactive UI Sandbox Inspector Logic
let currentlyInspectedElement = null;

// Cache Spec Card Elements
const specCardContainer = document.getElementById('hoversource-spec-card');
const specComponentName = document.getElementById('spec-component-name');
const specElementName = document.getElementById('spec-element-name');
const specFileLabel = document.getElementById('spec-file-label');
const specPathValue = document.getElementById('spec-path-value');
const specSizeValue = document.getElementById('spec-size-value');
const specColorValue = document.getElementById('spec-color-value');
const specBackgroundValue = document.getElementById('spec-background-value');
const specLayoutValue = document.getElementById('spec-layout-value');
const specParentStylesContainer = document.getElementById('spec-parent-styles-container');
const specStackContainer = document.getElementById('spec-stack-container');

function getMetadataMarkdown(targetName) {
  const metadata = mockMetadata[targetName];
  if (!metadata) return "";

  return `### HoverSource Component Metadata
* **Component**: \`${metadata.component}\`
* **Element**: \`${metadata.element}\`
* **File Path**: \`${metadata.path}\` (Line: ${metadata.file.split(':')[1]}, Column: 1)
* **Framework**: React
* **Key Styles**:
  - Color: \`${metadata.color}\`
  - Background: \`${metadata.background}\`
  - Size: \`${metadata.size}\`
  - Layout: \`${metadata.layout}\`
* **Parent Styles**:
${metadata.parentStyles.map(p => `  - \`${p.tag}\` ➔ \`${p.style}\` ➔ [Source: \`${p.css}\`]`).join('\n')}`;
}

function resetInspectorVisuals() {
  if (specCardContainer) specCardContainer.classList.add('hidden');
  const border = document.getElementById('hs-target-border');
  if (border) border.classList.add('hidden');
}

// Keydown copy event (C or Alt+C)
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (currentlyInspectedElement && (key === 'c' || (e.altKey && key === 'c'))) {
    e.preventDefault();
    const targetName = currentlyInspectedElement.getAttribute('data-hs-component');
    const markdown = getMetadataMarkdown(targetName);
    navigator.clipboard.writeText(markdown).then(() => {
      const copyHint = document.getElementById('spec-copy-hint');
      if (copyHint) {
        copyHint.innerText = 'Copied to Clipboard!';
        copyHint.className = 'copy-hint-text text-green-400 font-bold text-[9px] animate-pulse';
        setTimeout(() => {
          copyHint.innerText = 'Press C to copy | Alt+Shift+C to copy all | Alt+P to Freeze | Alt+M for Minimal | Alt+S for Config | Alt+X to Switch Mode';
          copyHint.className = 'copy-hint-text text-zinc-500 text-[8px]';
        }, 1500);
      }
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
    });
  }
});

// Attach event listeners inside the sandbox canvas
const canvasEl = document.getElementById('mock-browser-canvas');
if (canvasEl) {
  canvasEl.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-hs-component]');
    if (!target) return;

    currentlyInspectedElement = target;

    const targetName = target.getAttribute('data-hs-component');
    const metadata = mockMetadata[targetName];
    if (!metadata) return;

    // Fast DOM Cache Updates instead of innerHTML re-rendering
    if (specComponentName) specComponentName.innerText = metadata.component;
    if (specElementName) specElementName.innerText = `Element: ${metadata.element}`;
    if (specFileLabel) specFileLabel.innerText = metadata.file;
    if (specPathValue) specPathValue.innerText = metadata.path;
    if (specSizeValue) specSizeValue.innerText = metadata.size;
    if (specColorValue) specColorValue.innerText = metadata.color;
    if (specBackgroundValue) specBackgroundValue.innerText = metadata.background;
    if (specLayoutValue) specLayoutValue.innerText = metadata.layout;

    if (specParentStylesContainer) {
      specParentStylesContainer.innerHTML = metadata.parentStyles.map(p => `
        <div class="px-2 py-1 flex justify-between">
          <span>${p.tag} <span class="text-zinc-600">${p.css}</span></span>
          <span class="text-emerald-500">${p.style}</span>
        </div>
      `).join('');
    }

    if (specStackContainer) {
      specStackContainer.innerHTML = metadata.stack.map(s => `
        <div class="px-2 py-0.5">${s}</div>
      `).join('');
    }

    if (specCardContainer) specCardContainer.classList.remove('hidden');
    updateInspectorPositions();
  });

  canvasEl.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-hs-component]');
    if (!target) return;

    currentlyInspectedElement = null;
    resetInspectorVisuals();
  });

  // Keep target border and spec card aligned with elements when scrolling
  canvasEl.addEventListener('scroll', () => {
    if (currentlyInspectedElement) {
      updateInspectorPositions();
    }
  }, true);

  // Toggle Like heart active state on click
  canvasEl.addEventListener('click', (e) => {
    const likeBtn = e.target.closest('[data-hs-component="LikeButton"]');
    if (!likeBtn) return;

    const isLiked = likeBtn.getAttribute('data-liked') === 'true';
    if (isLiked) {
      likeBtn.setAttribute('data-liked', 'false');
      likeBtn.setAttribute('fill', 'none');
      likeBtn.setAttribute('stroke', 'currentColor');
      likeBtn.classList.remove('text-red-500');
      likeBtn.classList.add('text-zinc-400');
    } else {
      likeBtn.setAttribute('data-liked', 'true');
      likeBtn.setAttribute('fill', 'currentColor');
      likeBtn.setAttribute('stroke', 'none');
      likeBtn.classList.remove('text-zinc-400');
      likeBtn.classList.add('text-red-500');
    }
  });
}

function updateInspectorPositions() {
  const mockCanvas = document.getElementById('mock-browser-canvas');
  const targetBorder = document.getElementById('hs-target-border');
  
  if (!currentlyInspectedElement || !mockCanvas) return;
  
  const target = currentlyInspectedElement;
  const canvasRect = mockCanvas.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  // If target has scrolled completely out of view of the mock canvas, hide the inspector visuals
  if (targetRect.bottom < canvasRect.top || targetRect.top > canvasRect.bottom) {
    resetInspectorVisuals();
    return;
  }

  if (targetBorder) {
    targetBorder.style.top = `${targetRect.top - canvasRect.top}px`;
    targetBorder.style.left = `${targetRect.left - canvasRect.left}px`;
    targetBorder.style.width = `${targetRect.width}px`;
    targetBorder.style.height = `${targetRect.height}px`;
    targetBorder.classList.remove('hidden');
  }

  if (specCardContainer) {
    if (window.innerWidth >= 1024) {
      // Desktop: Position to the right of the target element
      specCardContainer.style.width = '390px';
      specCardContainer.style.top = `${targetRect.top}px`;
      specCardContainer.style.left = `${targetRect.right + 12}px`;
    } else {
      // Mobile/Tablet: Center horizontally relative to mock canvas, align vertically below/above target
      const width = Math.min(390, canvasRect.width - 24);
      specCardContainer.style.width = `${width}px`;

      // Center horizontally
      const left = canvasRect.left + (canvasRect.width - width) / 2;
      specCardContainer.style.left = `${left}px`;

      // Default to positioning below the target element
      const cardHeight = specCardContainer.offsetHeight || 220;
      let top = targetRect.bottom + 12;

      // Flip to above if it overflows the bottom edge of the mock browser viewport
      if (top + cardHeight > canvasRect.bottom) {
        top = targetRect.top - cardHeight - 12;
      }

      // Constrain/Clamp the vertical position strictly inside the mock canvas boundaries
      top = Math.max(canvasRect.top + 12, Math.min(canvasRect.bottom - cardHeight - 12, top));
      specCardContainer.style.top = `${top}px`;
    }
    specCardContainer.classList.remove('hidden');
  }
}
