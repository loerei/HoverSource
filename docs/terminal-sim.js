// State Management
let activeTab = 'with-hs';
let currentSimulationId = 0;
let activeRepo = 'calcom';

const tabStates = {
  'with-hs': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.'
  },
  'file-only': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.'
  },
  'no-context': {
    hasSent: false,
    patchApplied: false,
    steps: '0',
    tokens: '0',
    time: '0s',
    tooltip: 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.'
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

// List to track active simulation timeouts to prevent leaks
let activeTimers = [];
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

function clearAllSimulationTimers() {
  activeTimers.forEach(timerId => clearTimeout(timerId));
  activeTimers = [];
}

function resetActiveTabSimulation() {
  clearAllSimulationTimers();
  const screen = getActiveTerminalScreen();
  if (screen) screen.innerHTML = '';
  
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'text-zinc-500 space-y-1';
  welcomeDiv.innerHTML = `
    <div>HoverSource CLI Agent v1.0.0</div>
    <div>Agent ready to receive instructions.</div>
  `;
  if (screen) screen.appendChild(welcomeDiv);

  tabStates[activeTab].hasSent = true;
  tabStates[activeTab].patchApplied = false;
  tabStates[activeTab].steps = '0';
  tabStates[activeTab].tokens = '0';
  tabStates[activeTab].time = '0s';
  tabStates[activeTab].tooltip = 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.';

  pseudoInput.value = '';
  statSteps.innerText = '0';
  statTokens.innerText = '0';
  statTime.innerText = '0s';
  instructionTooltip.innerHTML = tabStates[activeTab].tooltip;

  if (searchTriggerBtn) {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
    searchTriggerBtn.classList.remove('border', 'border-zinc-700', 'ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
  }
}

function delay(ms) {
  return new Promise(resolve => {
    const id = setTimeout(resolve, ms);
    activeTimers.push(id);
  });
}

async function writeTerminalLine(html, type = 'log') {
  const line = document.createElement('div');
  if (type === 'log') line.className = 'text-zinc-300';
  if (type === 'system') line.className = 'text-zinc-500';
  if (type === 'error') line.className = 'text-red-500';
  if (type === 'success') line.className = 'text-green-500';
  if (type === 'thinking') line.className = 'text-zinc-400 italic';
  
  line.innerHTML = html;
  const activeScreen = getActiveTerminalScreen();
  if (activeScreen) {
    activeScreen.appendChild(line);
    activeScreen.scrollTop = activeScreen.scrollHeight;
  }
  await delay(100);
}

function updateStats(steps, tokens, timeStr) {
  tabStates[activeTab].steps = steps;
  tabStates[activeTab].tokens = typeof tokens === 'number' ? tokens.toLocaleString() : tokens;
  tabStates[activeTab].time = timeStr;

  statSteps.innerText = tabStates[activeTab].steps;
  statTokens.innerText = tabStates[activeTab].tokens;
  statTime.innerText = tabStates[activeTab].time;
}

// Apply patch logic
async function handleApplyPatch() {
  if (tabStates[activeTab].patchApplied) return;
  tabStates[activeTab].patchApplied = true;
  
  const applyBtn = document.getElementById('apply-patch-btn');
  applyBtn.innerText = 'Applying...';
  applyBtn.disabled = true;

  await delay(600);
  applyBtn.className = 'bg-zinc-800 text-zinc-500 font-mono text-[10px] px-3 py-1 rounded cursor-not-allowed';
  applyBtn.innerText = 'Patched';

  await writeTerminalLine(`[+] Changes successfully written to disk. Hot Module Replacement (HMR) triggered.`, 'success');
  
  if (searchTriggerBtn) {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
    searchTriggerBtn.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
    
    const feedbackTimer = setTimeout(() => {
      searchTriggerBtn.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
    }, 1500);
    activeTimers.push(feedbackTimer);
  }

  tabStates[activeTab].tooltip = '<span class="text-green-400 font-semibold">Success!</span> Hover the mock sidebar search button to view the changes.';
  instructionTooltip.innerHTML = tabStates[activeTab].tooltip;
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
    if (tabStates[activeTab].hasSent) return;
    
    resetActiveTabSimulation();
    
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');

    currentSimulationId++;
    const simId = currentSimulationId;

    if (activeTab === 'with-hs') {
      runWithHsSimulation(simId);
    } else if (activeTab === 'file-only') {
      runFileOnlySimulation(simId);
    } else {
      runNoContextSimulation(simId);
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

// Intercept desktop mouse wheel scroll and route to smooth section snap transitions
let isHudScrolling = false;
const hudSectionIds = ['#hero-section', '#ui-sandbox-section', '#cli-sandbox-section', '#bento-anchor', '#benchmark-anchor'];

window.addEventListener('wheel', (e) => {
  // Only apply custom scrolling on desktop screens where the HUD is active
  if (window.innerWidth < 1024) return;

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
