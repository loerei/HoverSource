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
  if (searchTriggerBtn) {
    if (tabStates[activeTab].patchApplied) {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
    } else {
      searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
    }
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

  if (searchTriggerBtn) {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-all duration-200';
    searchTriggerBtn.classList.remove('border', 'border-zinc-700', 'ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
  }
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
const mockMetadata = {
  PostHeaderPfp: {
    component: "PostHeaderAvatar",
    element: "img.post_header_avatar ➔ [feed.css:62]",
    file: "PostHeaderAvatar.tsx:10",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostHeaderAvatar.tsx",
    size: "24px × 24px",
    color: "rgba(255, 255, 255, 1)",
    background: "rgba(0, 0, 0, 0)",
    layout: "border-radius: 50%",
    parentStyles: [
      { tag: "div.post_header_container", css: "[feed.css:14]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "PostHeaderAvatar",
      "PostHeader",
      "PostCard",
      "FeedLayout",
      "div"
    ]
  },
  PostHeaderUsername: {
    component: "PostHeaderUsername",
    element: "span.post_header_username ➔ [feed.css:66]",
    file: "PostHeaderUsername.tsx:8",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostHeaderUsername.tsx",
    size: "72px × 12px",
    color: "rgb(212, 212, 216)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: inline",
    parentStyles: [
      { tag: "div.post_header_container", css: "[feed.css:14]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "PostHeaderUsername",
      "PostHeader",
      "PostCard",
      "FeedLayout",
      "div"
    ]
  },
  PostHeaderMoreOptions: {
    component: "PostHeaderMoreButton",
    element: "button.more_options_btn ➔ [feed.css:70]",
    file: "PostHeaderMoreButton.tsx:12",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostHeaderMoreButton.tsx",
    size: "18px × 18px",
    color: "rgb(113, 113, 122)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: inline-block",
    parentStyles: [
      { tag: "div.post_header_container", css: "[feed.css:14]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "PostHeaderMoreButton",
      "PostHeader",
      "PostCard",
      "FeedLayout",
      "div"
    ]
  },
  Sidebar: {
    component: "Sidebar",
    element: "aside.left_sidebar ➔ [sidebar.css:1]",
    file: "Sidebar.tsx:1",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/Sidebar.tsx",
    size: "70px × 550px",
    color: "rgb(255, 255, 255)",
    background: "rgb(0, 0, 0)",
    layout: "display: flex (direction: column)",
    parentStyles: [
      { tag: "div.app_layout", css: "[layout.css:1]", style: "display: flex" }
    ],
    stack: [
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  AppBackground: {
    component: "AppBackground",
    element: "main.feed_container ➔ [feed.css:12]",
    file: "AppLayout.tsx:12",
    path: "D:/Projects/InstagramClone/src/components/Layout/AppLayout.tsx",
    size: "320px × 550px",
    color: "rgb(255, 255, 255)",
    background: "rgb(0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "div.app_layout", css: "[layout.css:1]", style: "display: flex" }
    ],
    stack: [
      "AppBackground",
      "AppLayout",
      "div"
    ]
  },
  LikeButton: {
    component: "LikeButton",
    element: "svg.like_button ➔ [feed.css:120]",
    file: "LikeButton.tsx:28",
    path: "D:/Projects/InstagramClone/src/features/feed/components/LikeButton.tsx",
    size: "20px × 20px",
    color: "rgb(239, 68, 68)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: inline-block",
    parentStyles: [
      { tag: "div.post_actions_row", css: "[feed.css:10]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "LikeButton",
      "PostActionButtons",
      "PostCard",
      "FeedList",
      "div"
    ]
  },
  CommentButton: {
    component: "CommentButton",
    element: "svg.comment_button ➔ [feed.css:124]",
    file: "CommentButton.tsx:15",
    path: "D:/Projects/InstagramClone/src/features/feed/components/CommentButton.tsx",
    size: "20px × 20px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: inline-block",
    parentStyles: [
      { tag: "div.post_actions_row", css: "[feed.css:10]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "CommentButton",
      "PostActionButtons",
      "PostCard",
      "FeedList",
      "div"
    ]
  },
  BookmarkButton: {
    component: "BookmarkButton",
    element: "svg.bookmark_button ➔ [feed.css:130]",
    file: "BookmarkButton.tsx:22",
    path: "D:/Projects/InstagramClone/src/features/feed/components/BookmarkButton.tsx",
    size: "20px × 20px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: inline-block",
    parentStyles: [
      { tag: "div.post_actions_row", css: "[feed.css:10]", style: "display: flex" },
      { tag: "article.post_card", css: "[feed.css:42]", style: "display: flex" }
    ],
    stack: [
      "BookmarkButton",
      "PostActionButtons",
      "PostCard",
      "FeedList",
      "div"
    ]
  },
  InstagramLogo: {
    component: "Logo",
    element: "div.instagram_logo ➔ [navbar.css:12]",
    file: "Logo.tsx:12",
    path: "D:/Projects/InstagramClone/src/components/Navbar/Logo.tsx",
    size: "100px × 29px",
    color: "rgb(245, 245, 245)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: block",
    parentStyles: [
      { tag: "div.sidebar_header", css: "[sidebar.css:12]", style: "padding: 24px 12px" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "width: 244px" }
    ],
    stack: [
      "Logo",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  HomeButton: {
    component: "SidebarItem",
    element: "a.nav_link.active ➔ [sidebar.css:42]",
    file: "SidebarItem.tsx:42",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/SidebarItem.tsx",
    size: "220px × 48px",
    color: "rgb(245, 245, 245)",
    background: "rgba(255, 255, 255, 0.08)",
    layout: "display: flex",
    parentStyles: [
      { tag: "nav.navigation_links", css: "[sidebar.css:32]", style: "display: flex" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "display: flex" }
    ],
    stack: [
      "SidebarItem",
      "Navigation",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  SearchButton: {
    component: "SidebarItem",
    element: "a.nav_link ➔ [sidebar.css:42]",
    file: "SidebarItem.tsx:42",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/SidebarItem.tsx",
    size: "220px × 48px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "nav.navigation_links", css: "[sidebar.css:32]", style: "display: flex" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "display: flex" }
    ],
    stack: [
      "SidebarItem",
      "Navigation",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  MessagesButton: {
    component: "SidebarItem",
    element: "a.nav_link ➔ [sidebar.css:42]",
    file: "SidebarItem.tsx:42",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/SidebarItem.tsx",
    size: "220px × 48px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "nav.navigation_links", css: "[sidebar.css:32]", style: "display: flex" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "display: flex" }
    ],
    stack: [
      "SidebarItem",
      "Navigation",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  ExploreButton: {
    component: "SidebarItem",
    element: "a.nav_link ➔ [sidebar.css:42]",
    file: "SidebarItem.tsx:42",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/SidebarItem.tsx",
    size: "220px × 48px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "nav.navigation_links", css: "[sidebar.css:32]", style: "display: flex" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "display: flex" }
    ],
    stack: [
      "SidebarItem",
      "Navigation",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  CreateButton: {
    component: "SidebarItem",
    element: "a.nav_link ➔ [sidebar.css:42]",
    file: "SidebarItem.tsx:42",
    path: "D:/Projects/InstagramClone/src/components/Sidebar/SidebarItem.tsx",
    size: "220px × 48px",
    color: "rgb(168, 168, 168)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "nav.navigation_links", css: "[sidebar.css:32]", style: "display: flex" },
      { tag: "aside.left_sidebar", css: "[sidebar.css:1]", style: "display: flex" }
    ],
    stack: [
      "SidebarItem",
      "Navigation",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  ProfileBadge: {
    component: "ProfileAvatar",
    element: "div.profile_avatar_badge ➔ [navbar.css:88]",
    file: "ProfileAvatar.tsx:88",
    path: "D:/Projects/InstagramClone/src/components/Navbar/ProfileAvatar.tsx",
    size: "28px × 28px",
    color: "rgb(245, 245, 245)",
    background: "rgba(255, 255, 255, 0.1)",
    layout: "border-radius: 50%",
    parentStyles: [
      { tag: "div.sidebar_footer", css: "[sidebar.css:80]", style: "margin-top: auto" }
    ],
    stack: [
      "ProfileAvatar",
      "Sidebar",
      "AppLayout",
      "div"
    ]
  },
  StoriesTray: {
    component: "StoriesTray",
    element: "div.stories_tray ➔ [stories.css:5]",
    file: "StoriesTray.tsx:5",
    path: "D:/Projects/InstagramClone/src/features/stories/components/StoriesTray.tsx",
    size: "600px × 84px",
    color: "rgb(245, 245, 245)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "main.feed_container", css: "[feed.css:12]", style: "max-width: 600px" }
    ],
    stack: [
      "StoriesTray",
      "FeedLayout",
      "AppLayout",
      "div"
    ]
  },
  StoryAvatar: {
    component: "StoryAvatar",
    element: "div.story_avatar_ring ➔ [stories.css:18]",
    file: "StoryAvatar.tsx:18",
    path: "D:/Projects/InstagramClone/src/features/stories/components/StoryAvatar.tsx",
    size: "56px × 56px",
    color: "rgb(245, 245, 245)",
    background: "linear-gradient(45deg, #f09433, #dc2743, #bc1888)",
    layout: "border-radius: 50%",
    parentStyles: [
      { tag: "div.story_item", css: "[stories.css:12]", style: "display: flex" },
      { tag: "div.stories_tray", css: "[stories.css:5]", style: "display: flex" }
    ],
    stack: [
      "StoryAvatar",
      "StoryItem",
      "StoriesTray",
      "FeedLayout",
      "div"
    ]
  },
  PostCard: {
    component: "PostCard",
    element: "article.post_card ➔ [feed.css:42]",
    file: "PostCard.tsx:42",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostCard.tsx",
    size: "470px × 620px",
    color: "rgb(245, 245, 245)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex (direction: column)",
    parentStyles: [
      { tag: "div.feed_list", css: "[feed.css:32]", style: "display: flex" },
      { tag: "main.feed_container", css: "[feed.css:12]", style: "max-width: 600px" }
    ],
    stack: [
      "PostCard",
      "FeedList",
      "FeedLayout",
      "AppLayout",
      "div"
    ]
  },
  PostHeader: {
    component: "PostHeader",
    element: "div.post_header_container ➔ [feed.css:14]",
    file: "PostHeader.tsx:14",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostHeader.tsx",
    size: "470px × 56px",
    color: "rgb(245, 245, 245)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "article.post_card", css: "[feed.css:42]", style: "border-bottom: 1px solid #262626" }
    ],
    stack: [
      "PostHeader",
      "PostCard",
      "FeedList",
      "FeedLayout",
      "div"
    ]
  },
  PostContent: {
    component: "PostImage",
    element: "div.post_media_wrapper ➔ [feed.css:28]",
    file: "PostImage.tsx:28",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostImage.tsx",
    size: "470px × 470px",
    color: "rgb(0, 0, 0)",
    background: "rgb(10, 10, 10)",
    layout: "display: block",
    parentStyles: [
      { tag: "article.post_card", css: "[feed.css:42]", style: "border-bottom: 1px solid #262626" }
    ],
    stack: [
      "PostImage",
      "PostCard",
      "FeedList",
      "FeedLayout",
      "div"
    ]
  },
  PostActions: {
    component: "PostActionButtons",
    element: "div.post_actions_row ➔ [feed.css:10]",
    file: "PostActionButtons.tsx:10",
    path: "D:/Projects/InstagramClone/src/features/feed/components/PostActionButtons.tsx",
    size: "470px × 40px",
    color: "rgb(245, 245, 245)",
    background: "rgba(0, 0, 0, 0)",
    layout: "display: flex",
    parentStyles: [
      { tag: "article.post_card", css: "[feed.css:42]", style: "border-bottom: 1px solid #262626" }
    ],
    stack: [
      "PostActionButtons",
      "PostCard",
      "FeedList",
      "FeedLayout",
      "div"
    ]
  }
};

let currentlyInspectedElement = null;

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
  specCard.classList.add('hidden');
  if (hsTargetBorder) hsTargetBorder.classList.add('hidden');
}

// Keydown copy event (C or Alt+C)
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (currentlyInspectedElement && (key === 'c' || (e.altKey && key === 'c'))) {
    e.preventDefault();
    const targetName = currentlyInspectedElement.getAttribute('data-hs-component');
    const markdown = getMetadataMarkdown(targetName);
    navigator.clipboard.writeText(markdown).then(() => {
      const copyHint = specCard.querySelector('.copy-hint-text');
      if (copyHint) {
        copyHint.innerText = 'Copied to Clipboard!';
        copyHint.className = 'copy-hint-text text-green-400 font-bold text-[9px] animate-pulse';
        setTimeout(() => {
          copyHint.innerText = 'Press C to copy';
          copyHint.className = 'copy-hint-text text-zinc-500 text-[8px]';
        }, 1500);
      }
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
    });
  }
});

// Attach event listeners inside the sandbox canvas
if (mockBrowserCanvas) {
  mockBrowserCanvas.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-hs-component]');
    if (!target) return;

    currentlyInspectedElement = target;

    const targetName = target.getAttribute('data-hs-component');
    const metadata = mockMetadata[targetName];
    if (!metadata) return;

    // Populate specCard HTML dynamically matching screenshot
    specCard.innerHTML = `
      <div class="flex justify-between items-center border-b border-zinc-900 pb-2 mb-2">
        <div>
          <div class="text-brand-blue font-bold text-xs font-mono" id="spec-component-name">${metadata.component}</div>
          <div class="text-zinc-500 text-[8px] mt-0.5 font-mono" id="spec-element-name">Element: ${metadata.element}</div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[8px] bg-brand-blue/20 text-brand-blue font-bold px-1 py-0.5 rounded font-mono" id="spec-framework">REACT</span>
          <div class="flex flex-col items-center opacity-60">
            <svg class="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span class="text-[5px] text-zinc-600 mt-0.5 font-mono">Alt+Shift+Scroll</span>
          </div>
        </div>
      </div>
      <div class="space-y-1 text-[9px] text-zinc-300 font-mono">
        <div><span class="text-zinc-500 font-medium">File:</span> <span class="text-brand-blue underline cursor-pointer">${metadata.file}</span></div>
        <div><span class="text-zinc-500 font-medium">Path:</span> <span class="text-emerald-500">${metadata.path}</span></div>
        <div><span class="text-zinc-500 font-medium">Size:</span> <span>${metadata.size}</span></div>
        <div><span class="text-zinc-500 font-medium">Color:</span> <span class="text-emerald-400">${metadata.color}</span></div>
        <div><span class="text-zinc-500 font-medium">Background:</span> <span class="text-emerald-400">${metadata.background}</span></div>
        <div><span class="text-zinc-500 font-medium">Layout:</span> <span class="text-emerald-400">${metadata.layout}</span></div>
      </div>
      <div class="mt-2 font-mono">
        <div class="text-zinc-500 text-[8px] font-bold uppercase tracking-wider mb-1">Parent Styles:</div>
        <div class="border border-zinc-900 rounded overflow-hidden text-[8px] font-mono leading-normal bg-zinc-950/40 text-zinc-400 divide-y divide-zinc-900">
          ${metadata.parentStyles.map(p => `
            <div class="px-2 py-1 flex justify-between">
              <span>${p.tag} <span class="text-zinc-600">${p.css}</span></span>
              <span class="text-emerald-500">${p.style}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="mt-2 font-mono">
        <div class="text-zinc-500 text-[8px] font-bold uppercase tracking-wider mb-1">Stack:</div>
        <div class="border border-zinc-900 rounded overflow-hidden text-[8px] font-mono leading-normal bg-zinc-950/50 text-zinc-400 divide-y divide-zinc-900">
          ${metadata.stack.map(s => `
            <div class="px-2 py-0.5">${s}</div>
          `).join('')}
        </div>
      </div>
      <div class="copy-hint-text text-[8px] text-zinc-500 text-center pt-2 mt-2 border-t border-zinc-900 leading-normal font-mono">
        Press C to copy | Alt+Shift+C to copy all | Alt+P to Freeze | Alt+M for Minimal | Alt+S for Config | Alt+X to Switch Mode
      </div>
    `;

    specCard.classList.remove('hidden');

    const canvasRect = mockBrowserCanvas.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    if (hsTargetBorder) {
      hsTargetBorder.style.top = `${targetRect.top - canvasRect.top}px`;
      hsTargetBorder.style.left = `${targetRect.left - canvasRect.left}px`;
      hsTargetBorder.style.width = `${targetRect.width}px`;
      hsTargetBorder.style.height = `${targetRect.height}px`;
      hsTargetBorder.classList.remove('hidden');
    }

    // Position SpecCard next to the element
    specCard.style.top = `${targetRect.top}px`;
    specCard.style.left = `${targetRect.right + 12}px`;
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
  if (searchTriggerBtn) {
    searchTriggerBtn.className = 'flex items-center justify-center h-8 w-8 rounded text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200 shadow-sm';
    searchTriggerBtn.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
    
    setTimeout(() => {
      searchTriggerBtn.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-[#0b0b0d]');
    }, 1500);
  }

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
