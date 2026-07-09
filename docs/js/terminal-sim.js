// State Management
let activeTab = 'with-hs';
let activeRepo = 'calcom';

const tabStates = {
  'with-hs': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.',
    currentSimId: 0,
    timers: []
  },
  'file-only': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.',
    currentSimId: 0,
    timers: []
  },
  'no-context': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.',
    currentSimId: 0,
    timers: []
  }
};

// DOM Elements - Sandbox
const searchTriggerBtn = document.getElementById('search-trigger-btn');
const sendBtn = document.getElementById('send-btn');
const pseudoInput = document.getElementById('pseudo-input');
const instructionTooltip = document.getElementById('instruction-tooltip');

// DOM Elements - UI Sandbox Tab selectors
const tabWithHs = document.getElementById('tab-with-hs');
const tabFileOnly = document.getElementById('tab-file-only');
const tabNoContext = document.getElementById('tab-no-context');

const statSteps = document.getElementById('stat-steps');
const statTokens = document.getElementById('stat-tokens');
const statTime = document.getElementById('stat-time');

// DOM Elements - Benchmark Slider & Toggles
const benchmarkSlider = document.getElementById('benchmark-slider');
const sliderGroupLabel = document.getElementById('slider-group-label');
const toggleCalcom = document.getElementById('toggle-calcom');
const toggleYumeshelf = document.getElementById('toggle-yumeshelf');
const btnGroupA = document.getElementById('btn-group-a');
const btnGroupB = document.getElementById('btn-group-b');
const btnGroupC = document.getElementById('btn-group-c');

const benchSteps = document.getElementById('bench-steps');
const benchTokens = document.getElementById('bench-tokens');
const benchPeak = document.getElementById('bench-peak');
const benchTime = document.getElementById('bench-time');

const barTokenFill = document.getElementById('bar-token-fill');
const barTokenPercent = document.getElementById('bar-token-percent');
const barTimeFill = document.getElementById('bar-time-fill');
const barTimeVal = document.getElementById('bar-time-val');
const barPeakFill = document.getElementById('bar-peak-fill');
const barPeakVal = document.getElementById('bar-peak-val');

// DOM Elements - Bento
const keyC = document.getElementById('key-c');

let keyCBlinkInterval = null;

// Initialize inputs
function initInputs() {
  if (tabStates[activeTab].hasSent) {
    pseudoInput.value = '';
  } else {
    if (activeTab === 'with-hs') {
      pseudoInput.value = withHsTemplate;
    } else if (activeTab === 'file-only') {
      pseudoInput.value = fileOnlyTemplate;
    } else {
      pseudoInput.value = noContextTemplate;
    }
  }
}
initInputs();

function getActiveTerminalScreen() {
  return document.getElementById(`terminal-screen-${activeTab}`);
}

function switchTerminalScreen() {
  ['with-hs', 'file-only', 'no-context'].forEach(tab => {
    const screen = document.getElementById(`terminal-screen-${tab}`);
    if (screen) {
      if (tab === activeTab) {
        screen.classList.remove('hidden');
      } else {
        screen.classList.add('hidden');
      }
    }
  });
}

function restoreTabUI() {
  statSteps.innerText = tabStates[activeTab].steps;
  statTokens.innerText = tabStates[activeTab].tokens;
  statTime.innerText = tabStates[activeTab].time;

  instructionTooltip.innerHTML = tabStates[activeTab].tooltip;

  if (tabStates[activeTab].hasSent) {
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  if (searchTriggerBtn) {
    if (tabStates[activeTab].patchApplied) {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
    } else {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
    }
  }
}

function clearTabTimers(tabName) {
  tabStates[tabName].timers.forEach(timerId => clearTimeout(timerId));
  tabStates[tabName].timers = [];
}

function tabDelay(ms, tabName) {
  return new Promise(resolve => {
    const id = setTimeout(resolve, ms);
    tabStates[tabName].timers.push(id);
  });
}

function writeToScreen(screen, html, type = 'log') {
  const line = document.createElement('div');
  if (type === 'log') line.className = 'text-zinc-300';
  if (type === 'system') line.className = 'text-zinc-500';
  if (type === 'error') line.className = 'text-red-500';
  if (type === 'success') line.className = 'text-green-500';
  if (type === 'thinking') line.className = 'text-zinc-400 italic';
  
  line.innerHTML = html;
  if (screen) {
    screen.appendChild(line);
    screen.scrollTop = screen.scrollHeight;
  }
}

function updateTabStats(tabName, steps, tokens, timeStr) {
  tabStates[tabName].steps = steps;
  tabStates[tabName].tokens = typeof tokens === 'number' ? tokens.toLocaleString() : tokens;
  tabStates[tabName].time = timeStr;

  if (tabName === activeTab) {
    statSteps.innerText = tabStates[tabName].steps;
    statTokens.innerText = tabStates[tabName].tokens;
    statTime.innerText = tabStates[tabName].time;
  }
}

function resetTabSimulation(tabName) {
  clearTabTimers(tabName);
  const screen = document.getElementById(`terminal-screen-${tabName}`);
  if (screen) screen.innerHTML = '';
  
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'text-zinc-500 space-y-1';
  welcomeDiv.innerHTML = `
    <div>HoverSource CLI Agent v1.0.0</div>
    <div>Agent ready to receive instructions.</div>
  `;
  if (screen) screen.appendChild(welcomeDiv);

  tabStates[tabName].hasSent = true;
  tabStates[tabName].patchApplied = false;
  tabStates[tabName].steps = '0';
  tabStates[tabName].tokens = '0';
  tabStates[tabName].time = '0s';
  tabStates[tabName].tooltip = 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.';

  if (tabName === activeTab) {
    pseudoInput.value = '';
    statSteps.innerText = '0';
    statTokens.innerText = '0';
    statTime.innerText = '0s';
    instructionTooltip.innerHTML = tabStates[tabName].tooltip;

    if (searchTriggerBtn) {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
      searchTriggerBtn.classList.remove('border', 'border-zinc-700', 'ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
    }
  }
}

function createSimContext(tabName) {
  tabStates[tabName].currentSimId++;
  const simId = tabStates[tabName].currentSimId;
  const screen = document.getElementById(`terminal-screen-${tabName}`);
  
  const check = () => {
    if (simId !== tabStates[tabName].currentSimId) throw new Error('cancelled');
  };
  
  const write = async (html, type) => {
    check();
    writeToScreen(screen, html, type);
    await tabDelay(100, tabName);
    check();
  };
  
  const sleep = async (ms) => {
    check();
    await tabDelay(ms, tabName);
    check();
  };
  
  const stats = (steps, tokens, timeStr) => {
    updateTabStats(tabName, steps, tokens, timeStr);
  };
  
  return { tabName, simId, screen, check, write, sleep, updateStats: stats };
}

// Apply patch logic
function handleApplyPatch(tabName) {
  if (tabStates[tabName].patchApplied) return;
  tabStates[tabName].patchApplied = true;
  
  const applyBtn = document.getElementById(`apply-patch-btn-${tabName}`);
  if (!applyBtn) return;
  applyBtn.innerText = 'Applying...';
  applyBtn.disabled = true;

  setTimeout(() => {
    applyBtn.className = 'bg-zinc-800 text-zinc-500 font-mono text-[10px] px-3 py-1 rounded cursor-not-allowed';
    applyBtn.innerText = 'Patched';

    const screen = document.getElementById(`terminal-screen-${tabName}`);
    writeToScreen(screen, '[+] Changes successfully written to disk. Hot Module Replacement (HMR) triggered.', 'success');
    
    if (searchTriggerBtn && tabName === activeTab) {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
      searchTriggerBtn.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
      
      setTimeout(() => {
        searchTriggerBtn.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
      }, 1500);
    }

    tabStates[tabName].tooltip = '<span class="text-green-400 font-semibold">Success!</span> Hover the mock sidebar search button to view the changes.';
    if (tabName === activeTab) {
      instructionTooltip.innerHTML = tabStates[tabName].tooltip;
    }
  }, 600);
}

// Tab Switching Event Listeners
function handleTabSwitch(tabName, clickedTabEl, otherTabEl1, otherTabEl2) {
  if (activeTab === tabName) return;
  activeTab = tabName;

  clickedTabEl.className = 'flex-1 py-2 text-center border-b-2 border-brand-blue bg-[#0b0b0d]/50 text-zinc-100 font-semibold focus:outline-none';
  otherTabEl1.className = 'flex-1 py-2 text-center border-b-2 border-transparent hover:text-zinc-300 focus:outline-none';
  otherTabEl2.className = 'flex-1 py-2 text-center border-b-2 border-transparent hover:text-zinc-300 focus:outline-none';

  switchTerminalScreen();
  initInputs();
  restoreTabUI();
}

if (tabWithHs) tabWithHs.addEventListener('click', () => handleTabSwitch('with-hs', tabWithHs, tabFileOnly, tabNoContext));
if (tabFileOnly) tabFileOnly.addEventListener('click', () => handleTabSwitch('file-only', tabFileOnly, tabWithHs, tabNoContext));
if (tabNoContext) tabNoContext.addEventListener('click', () => handleTabSwitch('no-context', tabNoContext, tabWithHs, tabFileOnly));

// Terminal dispatcher
if (sendBtn) {
  sendBtn.addEventListener('click', () => {
    const tabName = activeTab;
    if (tabStates[tabName].hasSent) return;
    
    resetTabSimulation(tabName);
    
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const ctx = createSimContext(tabName);

    if (tabName === 'with-hs') {
      runWithHsSimulation(ctx);
    } else if (tabName === 'file-only') {
      runFileOnlySimulation(ctx);
    } else {
      runNoContextSimulation(ctx);
    }
  });
}

// Real-World Benchmark Dataset
const benchmarkData = {
  calcom: [
    {
      label: 'Group A: No Context',
      steps: '65.6',
      tokens: '651,681',
      peak: '28,257',
      time: '142.0s',
      tokenPercent: '100%',
      tokenWidth: '100%',
      peakWidth: '100%',
      timeWidth: '100%',
      colorClass: 'text-brand-amber'
    },
    {
      label: 'Group B: File Only',
      steps: '18.0',
      tokens: '37,858',
      peak: '7,372',
      time: '44.2s',
      tokenPercent: '5.8%',
      tokenWidth: '5.8%',
      peakWidth: '26.1%',
      timeWidth: '31.1%',
      colorClass: 'text-brand-purple'
    },
    {
      label: 'Group C: HoverSource',
      steps: '17.1',
      tokens: '35,733',
      peak: '6,486',
      time: '16.4s',
      tokenPercent: '5.4%',
      tokenWidth: '5.4%',
      peakWidth: '22.9%',
      timeWidth: '11.5%',
      colorClass: 'text-brand-blue'
    }
  ],
  yumeshelf: [
    {
      label: 'Group A: No Context',
      steps: '34.4',
      tokens: '118,354',
      peak: '14,140',
      time: '34.4s',
      tokenPercent: '100%',
      tokenWidth: '100%',
      peakWidth: '100%',
      timeWidth: '88.6%',
      colorClass: 'text-brand-amber'
    },
    {
      label: 'Group B: File Only',
      steps: '22.0',
      tokens: '44,382',
      peak: '8,589',
      time: '38.8s',
      tokenPercent: '37.5%',
      tokenWidth: '37.5%',
      peakWidth: '60.7%',
      timeWidth: '100%',
      colorClass: 'text-brand-purple'
    },
    {
      label: 'Group C: HoverSource',
      steps: '26.0',
      tokens: '61,255',
      peak: '9,984',
      time: '24.8s',
      tokenPercent: '51.7%',
      tokenWidth: '51.7%',
      peakWidth: '70.6%',
      timeWidth: '63.9%',
      colorClass: 'text-brand-blue'
    }
  ]
};

function updateBenchmarkUI() {
  if (!benchmarkSlider) return;
  const val = parseInt(benchmarkSlider.value, 10);
  const data = benchmarkData[activeRepo][val];

  sliderGroupLabel.innerText = data.label;
  sliderGroupLabel.className = `text-xs font-bold font-mono text-center pt-2 ${data.colorClass}`;

  benchSteps.innerText = data.steps;
  benchTokens.innerText = data.tokens;
  benchPeak.innerText = data.peak;
  benchTime.innerText = data.time;
  benchTime.className = `text-lg md:text-xl font-bold font-mono mt-1 ${data.colorClass}`;

  barTokenPercent.innerText = data.tokenPercent;
  barTokenPercent.className = data.colorClass;
  barTokenFill.style.width = data.tokenWidth;
  barTokenFill.className = `h-full transition-all duration-500 ${val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue'}`;

  if (barPeakVal && barPeakFill) {
    barPeakVal.innerText = data.peak;
    barPeakVal.className = `transition-all duration-500 ${val === 0 ? 'text-brand-amber' : val === 1 ? 'text-brand-purple' : 'text-brand-blue'}`;
    barPeakFill.style.width = data.peakWidth;
    barPeakFill.className = `h-full transition-all duration-500 ${val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue'}`;
  }

  barTimeVal.innerText = data.time;
  barTimeVal.className = `transition-all duration-500 ${val === 0 ? 'text-brand-amber' : val === 1 ? 'text-brand-purple' : 'text-brand-blue'}`;
  barTimeFill.style.width = data.timeWidth;
  barTimeFill.className = `h-full transition-all duration-500 ${val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue'}`;

  if (btnGroupA && btnGroupB && btnGroupC) {
    btnGroupA.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 0 ? 'text-brand-amber font-semibold' : 'text-zinc-500 font-normal'}`;
    btnGroupB.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 1 ? 'text-brand-purple font-semibold' : 'text-zinc-500 font-normal'}`;
    btnGroupC.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 2 ? 'text-brand-blue font-semibold' : 'text-zinc-500 font-normal'}`;
  }

  // Update custom slider visual position and color
  const handle = document.getElementById('custom-slider-handle');
  const progress = document.getElementById('custom-slider-progress');
  if (handle && progress) {
    const pct = val / 2;
    handle.style.transition = 'left 0.2s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.5s ease, box-shadow 0.5s ease';
    progress.style.transition = 'width 0.2s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.5s ease';
    
    handle.style.left = `${pct * 100}%`;
    progress.style.width = `${pct * 100}%`;
    
    const colorClass = val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue';
    const shadowClass = val === 0 ? 'shadow-brand-amber/30' : val === 1 ? 'shadow-brand-purple/30' : 'shadow-brand-blue/30';
    
    handle.className = `absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-lg cursor-grab active:cursor-grabbing ${colorClass} ${shadowClass}`;
    progress.className = `absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none ${colorClass}`;
  }
}

if (benchmarkSlider) {
  benchmarkSlider.addEventListener('input', updateBenchmarkUI);
}

if (btnGroupA && btnGroupB && btnGroupC && benchmarkSlider) {
  btnGroupA.addEventListener('click', () => {
    benchmarkSlider.value = 0;
    updateBenchmarkUI();
  });
  btnGroupB.addEventListener('click', () => {
    benchmarkSlider.value = 1;
    updateBenchmarkUI();
  });
  btnGroupC.addEventListener('click', () => {
    benchmarkSlider.value = 2;
    updateBenchmarkUI();
  });
}

// Custom Slider Dragging & Snapping Logic
function initCustomSlider() {
  const track = document.getElementById('custom-slider-track');
  const handle = document.getElementById('custom-slider-handle');
  const progress = document.getElementById('custom-slider-progress');
  if (!track || !handle || !progress || !benchmarkSlider) return;

  let isDragging = false;

  function updateSliderPosition(clientX) {
    const rect = track.getBoundingClientRect();
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));

    // Update visuals instantly during drag (no left/width transition, but keep smooth color transition)
    handle.style.transition = 'background-color 0.5s ease, box-shadow 0.5s ease';
    progress.style.transition = 'background-color 0.5s ease';
    handle.style.left = `${pct * 100}%`;
    progress.style.width = `${pct * 100}%`;

    // Determine nearest step (0, 1, 2)
    const val = Math.round(pct * 2);
    if (parseInt(benchmarkSlider.value, 10) !== val) {
      benchmarkSlider.value = val;
      updateBenchmarkUI();
    }
  }

  function onMouseDown(e) {
    isDragging = true;
    updateSliderPosition(e.clientX);
    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    updateSliderPosition(e.clientX);
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';

    // Snap to nearest step
    updateBenchmarkUI();

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  // Touch support for mobile devices
  function onTouchStart(e) {
    isDragging = true;
    updateSliderPosition(e.touches[0].clientX);

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    updateSliderPosition(e.touches[0].clientX);
  }

  function onTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    updateBenchmarkUI();

    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
  }

  track.addEventListener('mousedown', onMouseDown);
  track.addEventListener('touchstart', onTouchStart, { passive: true });
}

// Initialize Custom Slider
initCustomSlider();

// Codebase Toggle Listeners
if (toggleCalcom && toggleYumeshelf) {
  toggleCalcom.addEventListener('click', () => {
    if (activeRepo === 'calcom') return;
    activeRepo = 'calcom';
    toggleCalcom.className = 'flex-1 py-2 px-3 rounded-md text-left bg-zinc-800 text-white font-semibold focus:outline-none transition-all flex flex-col';
    toggleYumeshelf.className = 'flex-1 py-2 px-3 rounded-md text-left text-zinc-400 hover:text-zinc-200 focus:outline-none transition-all flex flex-col';
    updateBenchmarkUI();
  });

  toggleYumeshelf.addEventListener('click', () => {
    if (activeRepo === 'yumeshelf') return;
    activeRepo = 'yumeshelf';
    toggleYumeshelf.className = 'flex-1 py-2 px-3 rounded-md text-left bg-zinc-800 text-white font-semibold focus:outline-none transition-all flex flex-col';
    toggleCalcom.className = 'flex-1 py-2 px-3 rounded-md text-left text-zinc-400 hover:text-zinc-200 focus:outline-none transition-all flex flex-col';
    updateBenchmarkUI();
  });
}

// Bento Keyboard key active simulation (Self-cleaning to prevent Memory Leak)
if (keyC) {
  if (keyCBlinkInterval) clearInterval(keyCBlinkInterval);
  keyCBlinkInterval = setInterval(() => {
    keyC.classList.toggle('key-active-glow');
  }, 1500);
}

// Custom Easing Smooth Scroll Transition
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function customSmoothScroll(targetEl, duration = 1000) {
  const targetPos = targetEl.getBoundingClientRect().top + window.pageYOffset;
  const startPos = window.pageYOffset;
  const distance = targetPos - startPos;
  let startTime = null;

  document.documentElement.style.scrollSnapType = 'none';
  document.documentElement.style.scrollBehavior = 'auto';

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = easeInOutCubic(Math.min(timeElapsed / duration, 1));
    
    window.scrollTo(0, startPos + distance * progress);

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      document.documentElement.style.scrollSnapType = 'y mandatory';
      document.documentElement.style.scrollBehavior = '';
    }
  }
  requestAnimationFrame(animation);
}

// Intercept all anchor link clicks for custom eased transition
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      customSmoothScroll(targetEl, 900);
    }
  });
});

// Coordinate custom HUD Text Scrollbar active states with scroll observer
const hudItems = document.querySelectorAll('.nav-title-item');
const snapSections = document.querySelectorAll('.snap-section');

const hudObserverOptions = {
  root: null,
  rootMargin: '-50% 0px -50% 0px',
  threshold: 0
};

const hudObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const targetId = `#${entry.target.id}`;
      
      // Expand HUD navigation at Overview section, collapse elsewhere
      const hudContainer = document.querySelector('.hud-nav-container');
      if (hudContainer) {
        if (targetId === '#hero-section') {
          hudContainer.classList.add('hud-nav-expanded');
        } else {
          hudContainer.classList.remove('hud-nav-expanded');
        }
      }

      hudItems.forEach(item => {
        if (item.getAttribute('data-target') === targetId) {
          item.classList.add('active-nav-title');
        } else {
          item.classList.remove('active-nav-title');
        }
      });
    }
  });
}, hudObserverOptions);

snapSections.forEach(section => {
  if (section.id) hudObserver.observe(section);
});

// Bind custom smooth scrolling to HUD menu item clicks
hudItems.forEach(item => {
  item.addEventListener('click', function(e) {
    const targetId = this.getAttribute('data-target');
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      customSmoothScroll(targetEl, 900);
    }
  });
});

// Bind custom smooth scrolling to Header navigation links
document.querySelectorAll('header nav a').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      customSmoothScroll(targetEl, 900);
    }
  });
});

// Intercept desktop mouse wheel scroll and route to smooth section snap transitions
let isHudScrolling = false;
const hudSectionIds = ['#hero-section', '#ui-sandbox-section', '#cli-sandbox-section', '#bento-anchor', '#quickstart-section', '#benchmark-anchor'];

window.addEventListener('wheel', (e) => {
  // Only apply custom scrolling on desktop screens where the HUD is active
  if (window.innerWidth < 1024) return;

  // Do not intercept or block page zooming gestures (Ctrl + Scroll / Pinch-to-zoom)
  if (e.ctrlKey || e.metaKey) return;

  // Allow native scrolling inside scrollable mock containers (Instagram feed, terminals)
  if (e.target.closest('#mock-browser-canvas') || e.target.closest('.terminal-scroll')) {
    return;
  }

  e.preventDefault();
  if (isHudScrolling) return;

  const direction = e.deltaY > 0 ? 1 : -1;
  const activeItem = document.querySelector('.nav-title-item.active-nav-title');
  
  let currentIndex = 0;
  if (activeItem) {
    const currentId = activeItem.getAttribute('data-target');
    currentIndex = hudSectionIds.indexOf(currentId);
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < hudSectionIds.length) {
    const targetEl = document.querySelector(hudSectionIds[nextIndex]);
    if (targetEl) {
      isHudScrolling = true;
      customSmoothScroll(targetEl, 900);
      setTimeout(() => {
        isHudScrolling = false;
      }, 950);
    }
  }
}, { passive: false });

// Re-align scroll position to the active section on window resize (page zoom / viewport changes)
window.addEventListener('resize', () => {
  if (window.innerWidth < 1024) return; // Scroll snap is only active on desktop viewports

  const activeItem = document.querySelector('.nav-title-item.active-nav-title');
  if (activeItem) {
    const targetId = activeItem.getAttribute('data-target');
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      // Lock scroll position to target section offsetTop in real-time during zoom/resize
      window.scrollTo(0, targetEl.offsetTop);
    }
  }
});

// CLI Ticker Carousel Logic
function initCliTicker() {
  const track = document.getElementById('cli-ticker-track');
  if (!track) return;

  const subcommands = [
    'dev',
    'serve',
    'restart',
    '--target=http://localhost:3000',
    '--exec="npm run dev"',
    '--dashboard',
    '--port=7300',
    '--proxy-port=7301',
    '--debug-port=9222',
    '--auto-resolve',
    '--help'
  ];

  const itemsToRender = [...subcommands];
  const lastItem = itemsToRender[itemsToRender.length - 1];
  const firstItem = itemsToRender[0];
  const secondItem = itemsToRender[1];
  
  const finalItems = [lastItem, ...itemsToRender, firstItem, secondItem];
  
  track.innerHTML = finalItems.map((cmd, index) => {
    return `<div class="h-4 leading-4 text-[10.5px] font-mono transition-colors duration-300" style="height: 16px; line-height: 16px;" data-index="${index}">${cmd}</div>`;
  }).join('');

  let currentIndex = 1; // Starts at index 1 (which is the actual first item `dev`)
  const itemHeight = 16;

  function updateActiveState() {
    const divs = track.querySelectorAll('div');
    // Highlight both the active item and its clone to prevent transition flashing on jump
    const isLastClone = currentIndex === finalItems.length - 2;
    
    divs.forEach((div, idx) => {
      const isActive = idx === currentIndex || (isLastClone && idx === 1);
      if (isActive) {
        div.className = "h-4 leading-4 text-[10.5px] font-mono font-bold text-zinc-200 transition-colors duration-300";
      } else {
        div.className = "h-4 leading-4 text-[10.5px] font-mono text-zinc-600 transition-colors duration-300";
      }
    });
  }

  // Initial state
  track.style.transform = `translateY(-${(currentIndex - 1) * itemHeight}px)`;
  updateActiveState();

  setInterval(() => {
    currentIndex++;
    track.style.transition = 'transform 0.5s ease-out';
    track.style.transform = `translateY(-${(currentIndex - 1) * itemHeight}px)`;
    updateActiveState();

    // If we reached the clone of the first item at the end
    if (currentIndex === finalItems.length - 2) {
      setTimeout(() => {
        track.style.transition = 'none';
        currentIndex = 1;
        track.style.transform = `translateY(0px)`;
        updateActiveState();
      }, 500); // Wait for transition to finish
    }
  }, 2000);
}

initCliTicker();

// Copy to clipboard with micro-interaction feedback animation
window.copyToClipboard = function(text, buttonEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (buttonEl.classList.contains('copied-active')) return;
    buttonEl.classList.add('copied-active');

    const originalHTML = buttonEl.innerHTML;

    // Switch to active green checkmark icon
    buttonEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-green-400 transition-all duration-300 scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    `;

    // Create floating "copied!" text bubble
    const bubble = document.createElement('span');
    bubble.className = 'absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none transition-all duration-300 opacity-0 transform translate-y-1 z-50';
    bubble.innerText = 'copied!';
    
    const originalPos = buttonEl.style.position;
    if (getComputedStyle(buttonEl).position === 'static') {
      buttonEl.style.position = 'relative';
    }
    buttonEl.appendChild(bubble);

    // Trigger animate-in
    requestAnimationFrame(() => {
      bubble.classList.remove('opacity-0', 'translate-y-1');
      bubble.classList.add('opacity-100', 'translate-y-0');
    });

    // Reset back to original state after 1.2s
    setTimeout(() => {
      bubble.classList.remove('opacity-100', 'translate-y-0');
      bubble.classList.add('opacity-0', '-translate-y-1.5');
      
      setTimeout(() => {
        bubble.remove();
        buttonEl.innerHTML = originalHTML;
        buttonEl.classList.remove('copied-active');
        buttonEl.style.position = originalPos;
      }, 300);
    }, 1200);
  });
};
