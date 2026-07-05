// State Management
let activeTab = 'with-hs';
let currentSimulationId = 0;

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
const mockOverlay = document.getElementById('hoversource-mock-overlay');
const specCard = document.getElementById('hoversource-spec-card');
const sendBtn = document.getElementById('send-btn');
const pseudoInput = document.getElementById('pseudo-input');
const instructionTooltip = document.getElementById('instruction-tooltip');

const tabWithHs = document.getElementById('tab-with-hs');
const tabFileOnly = document.getElementById('tab-file-only');
const tabNoContext = document.getElementById('tab-no-context');

const statSteps = document.getElementById('stat-steps');
const statTokens = document.getElementById('stat-tokens');
const statTime = document.getElementById('stat-time');

// DOM Elements - Benchmark Slider
const benchmarkSlider = document.getElementById('benchmark-slider');
const sliderGroupLabel = document.getElementById('slider-group-label');
const benchSteps = document.getElementById('bench-steps');
const benchTokens = document.getElementById('bench-tokens');
const benchCost = document.getElementById('bench-cost');
const barTokenFill = document.getElementById('bar-token-fill');
const barTokenPercent = document.getElementById('bar-token-percent');
const barTimeFill = document.getElementById('bar-time-fill');
const barTimeVal = document.getElementById('bar-time-val');

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

// Hover Interaction Simulator
searchTriggerBtn.addEventListener('mouseenter', (e) => {
  mockOverlay.classList.remove('hidden');
  
  // Position HoverSource floating card near the button
  const rect = searchTriggerBtn.getBoundingClientRect();
  specCard.style.top = `${rect.bottom + 8}px`;
  specCard.style.left = `${rect.left - 100}px`;
  specCard.classList.remove('hidden');
});

searchTriggerBtn.addEventListener('mouseleave', () => {
  mockOverlay.classList.add('hidden');
  specCard.classList.add('hidden');
});

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

// Benchmark Slider Data & Logic
const sliderData = [
  {
    label: 'Group A: No Context',
    steps: '65',
    tokens: '651,681',
    cost: '$1.95',
    tokenPercent: '100%',
    tokenWidth: '100%',
    timeVal: '142.0s',
    timeWidth: '100%',
    colorClass: 'text-brand-amber'
  },
  {
    label: 'Group B: File Path Only',
    steps: '5',
    tokens: '24,980',
    cost: '$0.07',
    tokenPercent: '3.8%',
    tokenWidth: '3.8%',
    timeVal: '10.2s',
    timeWidth: '7.2%',
    colorClass: 'text-brand-purple'
  },
  {
    label: 'Group C: With HoverSource (Recommended)',
    steps: '5',
    tokens: '6,486',
    cost: '$0.02',
    tokenPercent: '0.9%',
    tokenWidth: '0.99%',
    timeVal: '8.2s',
    timeWidth: '5.7%',
    colorClass: 'text-brand-blue'
  }
];

if (benchmarkSlider) {
  benchmarkSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    const data = sliderData[val];

    sliderGroupLabel.innerText = data.label;
    sliderGroupLabel.className = `text-xs font-bold font-mono text-center pt-2 ${data.colorClass}`;

    benchSteps.innerText = data.steps;
    benchTokens.innerText = data.tokens;
    benchCost.innerText = data.cost;

    barTokenPercent.innerText = data.tokenPercent;
    barTokenPercent.className = data.colorClass;
    barTokenFill.style.width = data.tokenWidth;
    barTokenFill.className = `h-full transition-all duration-500 ${val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue'}`;

    barTimeVal.innerText = data.timeVal;
    barTimeVal.className = `transition-all duration-500 ${val === 0 ? 'text-brand-amber' : val === 1 ? 'text-brand-purple' : 'text-brand-blue'}`;
    barTimeFill.style.width = data.timeWidth;
    barTimeFill.className = `h-full transition-all duration-500 ${val === 0 ? 'bg-brand-amber' : val === 1 ? 'bg-brand-purple' : 'bg-brand-blue'}`;
  });
}

// Bento Keyboard key active simulation
if (keyC) {
  setInterval(() => {
    keyC.classList.toggle('key-active-glow');
  }, 1500);
}
