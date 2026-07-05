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
const specCard = document.getElementById('hoversource-spec-card');
const sendBtn = document.getElementById('send-btn');
const pseudoInput = document.getElementById('pseudo-input');
const instructionTooltip = document.getElementById('instruction-tooltip');

// DOM Elements - UI Sandbox Canvas
const modeTargetPin = document.getElementById('mode-target-pin');
const modeCursorTrack = document.getElementById('mode-cursor-track');
const uiInstructions = document.getElementById('ui-sandbox-instructions');
const mockBrowserCanvas = document.getElementById('mock-browser-canvas');
const hsTargetBorder = document.getElementById('hs-target-border');

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
    if (tab === activeTab) {
      screen.classList.remove('hidden');
    } else {
      screen.classList.add('hidden');
    }
  });
}

function restoreTabUI() {
  // Update Stats UI from state
  statSteps.innerText = tabStates[activeTab].steps;
  statTokens.innerText = tabStates[activeTab].tokens;
  statTime.innerText = tabStates[activeTab].time;

  // Restore tooltip message
  instructionTooltip.innerHTML = tabStates[activeTab].tooltip;

  // Send button disabled state
  if (tabStates[activeTab].hasSent) {
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  // Restore target search button style in Mock Sidebar
  if (tabStates[activeTab].patchApplied) {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
  } else {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
  }
}

function resetActiveTabSimulation() {
  // Clear terminal contents back to default welcome message
  const screen = getActiveTerminalScreen();
  screen.innerHTML = '';
  
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'text-zinc-500 space-y-1';
  welcomeDiv.innerHTML = `
    <div>HoverSource CLI Agent v1.0.0</div>
    <div>Agent ready to receive instructions.</div>
  `;
  screen.appendChild(welcomeDiv);

  // Reset state for active tab
  tabStates[activeTab].hasSent = true;
  tabStates[activeTab].patchApplied = false;
  tabStates[activeTab].steps = '0';
  tabStates[activeTab].tokens = '0';
  tabStates[activeTab].time = '0s';
  tabStates[activeTab].tooltip = 'Click <span class="text-zinc-300 font-semibold font-mono">Send to Agent</span> to process the task.';

  // Apply initial UI
  pseudoInput.value = '';
  statSteps.innerText = '0';
  statTokens.innerText = '0';
  statTime.innerText = '0s';
  instructionTooltip.innerHTML = tabStates[activeTab].tooltip;

  searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
  searchTriggerBtn.classList.remove('border', 'border-zinc-700', 'ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
}

function resetTerminal() {
  const activeScreen = getActiveTerminalScreen();
  activeScreen.innerHTML = '';
  
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'text-zinc-500 space-y-1';
  welcomeDiv.innerHTML = `
    <div>HoverSource CLI Agent v1.0.0</div>
    <div>Agent ready to receive instructions.</div>
  `;
  activeScreen.appendChild(welcomeDiv);

  statSteps.innerText = '0';
  statTokens.innerText = '0';
  statTime.innerText = '0s';
}

// Interactive UI Sandbox Inspector Logic
let activeHsMode = 'target-pin'; // 'target-pin' or 'cursor-track'

// Mode switching listeners
if (modeTargetPin && modeCursorTrack) {
  modeTargetPin.addEventListener('click', () => {
    if (activeHsMode === 'target-pin') return;
    activeHsMode = 'target-pin';
    modeTargetPin.className = 'flex-1 py-1.5 rounded-md text-center bg-zinc-800 text-white font-medium focus:outline-none transition-all';
    modeCursorTrack.className = 'flex-1 py-1.5 rounded-md text-center text-zinc-400 hover:text-zinc-200 focus:outline-none transition-all';
    uiInstructions.innerText = 'Hover over the search button or dashboard items. HoverSource highlights target bounds and pins metadata at fixed offsets.';
    resetInspectorVisuals();
  });

  modeCursorTrack.addEventListener('click', () => {
    if (activeHsMode === 'cursor-track') return;
    activeHsMode = 'cursor-track';
    modeCursorTrack.className = 'flex-1 py-1.5 rounded-md text-center bg-zinc-800 text-white font-medium focus:outline-none transition-all';
    modeTargetPin.className = 'flex-1 py-1.5 rounded-md text-center text-zinc-400 hover:text-zinc-200 focus:outline-none transition-all';
    uiInstructions.innerText = 'Move your cursor freely around the viewport canvas. The metadata card will follow your cursor and inspect elements dynamically.';
    resetInspectorVisuals();
  });
}

function resetInspectorVisuals() {
  specCard.classList.add('hidden');
  if (hsTargetBorder) hsTargetBorder.classList.add('hidden');
  // Remove cursor track hover styles from all elements
  document.querySelectorAll('#mock-browser-canvas [data-hs-component]').forEach(el => {
    el.classList.remove('hs-cursor-track-hover');
  });
}

let currentlyInspectedElement = null;

function getMetadataMarkdown(target) {
  if (!target) return "";
  const component = target.getAttribute('data-hs-component');
  const file = target.getAttribute('data-hs-file');
  const line = target.getAttribute('data-hs-line');
  const col = target.getAttribute('data-hs-col');
  const styles = target.getAttribute('data-hs-styles');
  const lang = target.getAttribute('data-hs-lang') || 'TSX';
  const tagName = target.tagName.toLowerCase();
  const idStr = target.id ? `#${target.id}` : '';
  const classList = Array.from(target.classList).filter(c => !c.startsWith('hs-') && c !== 'cursor-pointer');
  const classStr = classList.length > 0 ? `.${classList.join('.')}` : '';
  const selector = `${tagName}${idStr}${classStr}`;

  return `### HoverSource Component Metadata
* **Component**: \`${component}\`
* **Element**: \`${selector}\`
* **File Path**: \`${file}\` (Line: ${line}, Column: ${col})
* **Framework**: ${lang}
* **Key Styles**: ${styles}`;
}

// Attach keyboard copy shortcut Alt + C
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'c') {
    if (currentlyInspectedElement) {
      e.preventDefault();
      const markdown = getMetadataMarkdown(currentlyInspectedElement);
      navigator.clipboard.writeText(markdown).then(() => {
        // Show flash copy indicator in specCard
        const copyHint = specCard.querySelector('.copy-hint-text');
        if (copyHint) {
          copyHint.innerText = 'Copied to Clipboard!';
          copyHint.className = 'copy-hint-text text-green-400 font-bold text-[9px] animate-pulse';
          setTimeout(() => {
            copyHint.innerText = 'Press Alt + C to Copy';
            copyHint.className = 'copy-hint-text text-zinc-600 text-[8px]';
          }, 1500);
        }
      }).catch(err => {
        console.error('Clipboard copy failed:', err);
      });
    }
  }
});

// Attach hover listener to mockup canvas
if (mockBrowserCanvas) {
  // Delegate event handling for data-hs-component elements
  mockBrowserCanvas.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-hs-component]');
    if (!target) return;

    currentlyInspectedElement = target;

    // Retrieve metadata
    const component = target.getAttribute('data-hs-component');
    const file = target.getAttribute('data-hs-file');
    const line = target.getAttribute('data-hs-line');
    const col = target.getAttribute('data-hs-col');
    const styles = target.getAttribute('data-hs-styles');
    const lang = target.getAttribute('data-hs-lang') || 'TSX';

    // Populate specCard HTML dynamically
    specCard.innerHTML = `
      <div class="text-brand-blue font-bold border-b border-zinc-900 pb-1 flex justify-between">
        <span>Component: ${component}</span>
        <span class="text-zinc-600 text-[8px] bg-zinc-900 px-1 rounded">${lang}</span>
      </div>
      <div><span class="text-zinc-500">File:</span> <span class="text-emerald-500">${file}</span></div>
      <div><span class="text-zinc-500">Source Line:</span> Line ${line}, Col ${col}</div>
      <div class="border-t border-zinc-900 pt-1 mt-1">
        <span class="text-zinc-500">Styles:</span>
        <div class="text-[9px] text-zinc-400 pl-2">${styles}</div>
      </div>
      <div class="copy-hint-text text-[8px] text-zinc-600 text-right pt-1 border-t border-zinc-900">Press Alt + C to Copy</div>
    `;

    specCard.classList.remove('hidden');

    if (activeHsMode === 'target-pin') {
      // Pin mode: draw absolute border relative to mockup canvas container
      const canvasRect = mockBrowserCanvas.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      if (hsTargetBorder) {
        hsTargetBorder.style.top = `${targetRect.top - canvasRect.top}px`;
        hsTargetBorder.style.left = `${targetRect.left - canvasRect.left}px`;
        hsTargetBorder.style.width = `${targetRect.width}px`;
        hsTargetBorder.style.height = `${targetRect.height}px`;
        hsTargetBorder.classList.remove('hidden');
      }

      // Pin SpecCard nearby relative to viewport
      specCard.style.top = `${targetRect.bottom + 8}px`;
      specCard.style.left = `${targetRect.left}px`;
    } else {
      // Cursor tracking mode
      target.classList.add('hs-cursor-track-hover');
    }
  });

  mockBrowserCanvas.addEventListener('mousemove', (e) => {
    if (activeHsMode !== 'cursor-track') return;
    // SpecCard follows cursor with a slight offset
    specCard.style.top = `${e.clientY + 12}px`;
    specCard.style.left = `${e.clientX + 12}px`;
  });

  mockBrowserCanvas.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-hs-component]');
    if (!target) return;

    currentlyInspectedElement = null;
    resetInspectorVisuals();
  });
}

// Simulated typing/delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  activeScreen.appendChild(line);
  activeScreen.scrollTop = activeScreen.scrollHeight;
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
  
  // Visual validation feedback in the Sidebar Mockup
  searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
  searchTriggerBtn.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
  
  setTimeout(() => {
    searchTriggerBtn.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
  }, 1500);

  tabStates[activeTab].tooltip = '<span class="text-green-400 font-semibold">Success!</span> Try hovering the mock sidebar search button now to see the applied changes!';
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

tabWithHs.addEventListener('click', () => handleTabSwitch('with-hs', tabWithHs, tabFileOnly, tabNoContext));
tabFileOnly.addEventListener('click', () => handleTabSwitch('file-only', tabFileOnly, tabWithHs, tabNoContext));
tabNoContext.addEventListener('click', () => handleTabSwitch('no-context', tabNoContext, tabWithHs, tabFileOnly));

// Terminal dispatcher
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

// Real-World Benchmark Dataset (Cal.com Averages & YumeShelf Averages)
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
      peakWidth: '26.1%', // 7,372 / 28,257 = 26.1%
      timeWidth: '31.1%', // 44.2 / 142.0 = 31.1%
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
      peakWidth: '22.9%', // 6,486 / 28,257 = 22.9%
      timeWidth: '11.5%', // 16.4 / 142.0 = 11.5%
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
      timeWidth: '88.6%', // 34.4 / 38.8 = 88.6%
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
      peakWidth: '60.7%', // 8,589 / 14,140 = 60.7%
      timeWidth: '100%', // Max time for yumeshelf
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
      peakWidth: '70.6%', // 9,984 / 14,140 = 70.6%
      timeWidth: '63.9%', // 24.8 / 38.8 = 63.9%
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

  // Update group label active state styling
  if (btnGroupA && btnGroupB && btnGroupC) {
    btnGroupA.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 0 ? 'text-brand-amber font-semibold' : 'text-zinc-500 font-normal'}`;
    btnGroupB.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 1 ? 'text-brand-purple font-semibold' : 'text-zinc-500 font-normal'}`;
    btnGroupC.className = `hover:text-zinc-300 transition-colors focus:outline-none ${val === 2 ? 'text-brand-blue font-semibold' : 'text-zinc-500 font-normal'}`;
  }
}

if (benchmarkSlider) {
  benchmarkSlider.addEventListener('input', updateBenchmarkUI);
}

// Group Label Click Listeners
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

// Bento Keyboard key active simulation
if (keyC) {
  setInterval(() => {
    keyC.classList.toggle('key-active-glow');
  }, 1500);
}

// Custom Easing Smooth Scroll Transition (easeInOutCubic)
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function customSmoothScroll(targetEl, duration = 1000) {
  const targetPos = targetEl.getBoundingClientRect().top + window.pageYOffset;
  const startPos = window.pageYOffset;
  const distance = targetPos - startPos;
  let startTime = null;

  // Temporarily disable CSS scroll snapping and native smooth scrolling to avoid animation conflicts
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
      // Re-enable CSS scroll snapping once easing transition completes
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
      customSmoothScroll(targetEl, 900); // 900ms easing slide transition
    }
  });
});

// Coordinate custom HUD Text Scrollbar active states with scroll observer
const hudItems = document.querySelectorAll('.nav-title-item');
const snapSections = document.querySelectorAll('.snap-section');

const hudObserverOptions = {
  root: null,
  rootMargin: '-50% 0px -50% 0px', // Target when center of section crosses center of viewport
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
