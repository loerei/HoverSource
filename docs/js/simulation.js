// Input templates
const withHsTemplate = `HoverSource Component Metadata:
- Component: Kbar
- Element: button.todesktop:hover:!bg-transparent.group.flex.rounded-md...
- File Path: [project]/apps/web/modules/shell/Kbar.tsx (Line: 371, Column: 7)
- Framework: React
- Dimensions: 32x32
- Key Styles: bg: rgb(64, 64, 64), color: rgb(250, 250, 250), padding: 8px
- Parent Styles: 10 containers detected (div.flex, header.todesktop, div.flex, aside.fixed...)
- Layout Constraints: display: flex

Instruction:
The quick search search bar trigger button in the sidebar (looks like a search icon or shortcut key) has a neutral background that blends in too much. Let's make it look more like a distinct button by adding a subtle border and making the hover background lighter.`;

const fileOnlyTemplate = `In apps/web/modules/shell/Kbar.tsx, style the quick search/kbar trigger button so it looks more like a distinct button. Add a subtle border, a light hover background, and increase its horizontal padding on desktop screens.`;

const noContextTemplate = `The quick search search bar trigger button in the sidebar (looks like a search icon or shortcut key) has a neutral background that blends in too much. Let's make it look more like a distinct button by adding a subtle border and making the hover background lighter.`;

// Tab C (With HoverSource) Sequence
async function runWithHsSimulation(ctx) {
  try {
    ctx.updateStats(1, 500, '0.2s');
    await ctx.write(`<span class="text-zinc-500">system$</span> initializing session b1adcb8c-82a0-46c8-bdcb-c7e7704413c0...`, 'system');
    await ctx.sleep(400);
    await ctx.write(`<span class="text-brand-blue">user$</span> hs-agent --task "Styling search button in Kbar module" --metadata-clipboard`, 'system');
    await ctx.sleep(300);

    // Render parsed prompt
    await ctx.write(`<div class="bg-zinc-900/40 p-2.5 rounded border border-zinc-800 text-[10px] text-zinc-400 space-y-1">
      <div class="text-zinc-300 font-mono text-[9.5px] leading-relaxed">
        <span class="text-zinc-500 font-bold">Instruction:</span> "The quick search search bar trigger button in the sidebar (looks like a search icon or shortcut key) has a neutral background that blends in too much..."
      </div>
      <div class="text-brand-blue font-semibold mt-1">HoverSource Component Metadata:</div>
      <div class="pl-2 border-l border-zinc-700 space-y-0.5 text-[9px] text-zinc-500 max-h-24 overflow-y-auto terminal-scroll">
        <div>* Component: Kbar</div>
        <div>* Element: button.todesktop:hover:!bg-transparent.group.flex.rounded-md...</div>
        <div>* File Path: [project]/apps/web/modules/shell/Kbar.tsx (Line: 371, Column: 7)</div>
        <div>* Framework: React</div>
        <div>* Dimensions: 32x32</div>
        <div>* Key Styles: bg: rgb(64, 64, 64), color: rgb(250, 250, 250), padding: 8px</div>
        <div>* Parent Styles: 10 containers detected (div.flex, header.todesktop, div.flex, aside.fixed...)</div>
        <div>* Layout Constraints: display: flex</div>
      </div>
    </div>`);
    await ctx.sleep(800);

    // Step 2
    ctx.updateStats(2, 1200, '1.2s');
    await ctx.write(`[Step 2] Thinking: Locating the target element in workspace based on HoverSource metadata...`, 'thinking');
    await ctx.sleep(600);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> view_file(AbsolutePath="D:/Projects/cal.diy/apps/web/modules/shell/Kbar.tsx", StartLine=350, EndLine=400)`, 'system');
    await ctx.sleep(500);

    // Step 3
    ctx.updateStats(3, 4800, '3.4s');
    await ctx.write(`<span class="text-zinc-500">tool_response$</span> Completed successfully. Showing lines 350 to 400 of Kbar.tsx:`, 'system');
    await ctx.sleep(300);

    // Render Codeblock
    await ctx.write(`<div class="bg-zinc-950 p-2.5 rounded border border-zinc-900 font-mono text-[10px] text-zinc-400 leading-normal max-h-40 overflow-y-auto terminal-scroll space-y-0.5">
      <div><span class="text-zinc-700">350:</span>       &lt;/KBarPositioner&gt;</div>
      <div><span class="text-zinc-700">351:</span>     &lt;/KBarPortal&gt;</div>
      <div><span class="text-zinc-700">352:</span>   );</div>
      <div><span class="text-zinc-700">353:</span> };</div>
      <div><span class="text-zinc-700">354:</span> </div>
      <div><span class="text-zinc-700">355:</span> function getTooltipContent(): string {</div>
      <div><span class="text-zinc-700">356:</span>   if (isMac) return "⌘ + K";</div>
      <div><span class="text-zinc-700">357:</span>   return "CTRL + K";</div>
      <div><span class="text-zinc-700">358:</span> }</div>
      <div><span class="text-zinc-700">362:</span> const KBarTrigger = (): JSX.Element | null => {</div>
      <div><span class="text-zinc-700">363:</span>   const { query } = useKBar();</div>
      <div><span class="text-zinc-700">364:</span>   if (!query) return null;</div>
      <div><span class="text-zinc-700">365:</span>   return (</div>
      <div><span class="text-zinc-700">370:</span>     &lt;Tooltip side="right" content={getTooltipContent()}&gt;</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-brand-blue">371:</span>       &lt;button</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-zinc-700">372:</span>         color="minimal"</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-zinc-700">373:</span>         onClick={query.toggle}</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-zinc-700">374:</span>         className="todesktop:hover:!bg-transparent group flex rounded-md px-3 py-2 font-medium text-default text-sm transition hover:bg-subtle lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-zinc-700">375:</span>         &lt;SearchIcon className="h-4 w-4 shrink-0 text-inherit" /&gt;</div>
      <div class="bg-brand-blue/5 border-l-2 border-brand-blue pl-1"><span class="text-zinc-700">376:</span>       &lt;/button&gt;</div>
      <div><span class="text-zinc-700">377:</span>     &lt;/Tooltip&gt;</div>
      <div><span class="text-zinc-700">378:</span>   );</div>
      <div><span class="text-zinc-700">379:</span> };</div>
    </div>`);
    await ctx.sleep(1000);

    // Step 4
    ctx.updateStats(4, 5800, '5.8s');
    await ctx.write(`[Step 4] Thinking: Preparing the proposed diff to modify button styles...`, 'thinking');
    await ctx.sleep(500);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> send_message(Recipient="parent", Message="Proposed diff created.")`, 'system');
    await ctx.sleep(400);

    // Step 5
    ctx.updateStats(5, 6486, '8.2s');
    await ctx.write(`<span class="text-brand-blue">agent$</span> I have completed the analysis and prepared the proposed changes for the search button.`);
    await ctx.sleep(500);

    // Render Diff block with alert
    await ctx.write(`<div class="bg-zinc-950 rounded border border-zinc-900 overflow-hidden text-[10px]">
      <div class="bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 flex justify-between items-center text-[9px] text-zinc-500 font-mono">
        <span>PROPOSED PATCH</span>
        <span>Kbar.tsx</span>
      </div>
      <div class="p-2.5 font-mono space-y-0.5 leading-normal text-zinc-400">
        <div>@@ -371,6 +371,6 @@ const KBarTrigger = () => {</div>
        <div>       &lt;button</div>
        <div>         color="minimal"</div>
        <div>         onClick={query.toggle}</div>
        <div class="text-red-400 bg-red-950/30 px-1">-        className="todesktop:hover:!bg-transparent group flex rounded-md px-3 py-2 font-medium text-default text-sm transition hover:bg-subtle lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div class="text-green-400 bg-green-950/30 px-1">+        className="todesktop:hover:!bg-transparent group flex rounded-md border border-default px-3 py-2 font-medium text-default text-sm transition hover:bg-default lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div>         &lt;SearchIcon className="h-4 w-4 shrink-0 text-inherit" /&gt;</div>
      </div>
      <div class="p-2 border-t border-zinc-900 bg-zinc-900/30 flex justify-end">
        <button id="apply-patch-btn-${ctx.tabName}" class="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] px-3 py-1 rounded transition-colors active:scale-[0.97]">
          Apply Patch
        </button>
      </div>
    </div>
    <div class="text-emerald-400 border border-emerald-950/50 bg-emerald-950/20 p-2.5 rounded text-[10px] space-y-1 mt-2">
       <div class="font-bold flex items-center gap-1">
         <svg class="h-3.5 w-3.5 fill-current" viewBox="0 0 16 16"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72l-4.5 4.5a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L6.75 9.19l3.97-3.97a.75.75 0 111.06 1.06z"/></svg>
         <span>Efficiency Alert: Direct Access</span>
       </div>
       <div>HoverSource metadata pointed the agent directly to <strong>Kbar.tsx line 371</strong>. The agent spent only <strong>6,486 input tokens</strong> (5 steps). Cost: ~$0.02 (99% savings).</div>
     </div>`);

    // Add listener to the dynamically created Apply Patch button
    document.getElementById(`apply-patch-btn-${ctx.tabName}`).addEventListener('click', () => handleApplyPatch(ctx.tabName));
  } catch (err) {
    if (err.message === 'cancelled') return;
    throw err;
  }
}

// Tab B (File Path Only) Sequence
async function runFileOnlySimulation(ctx) {
  try {
    ctx.updateStats(1, 500, '0.2s');
    await ctx.write(`<span class="text-zinc-500">system$</span> initializing session c367ae2f-161c-4c80-bcfb-49bf5c255d81...`, 'system');
    await ctx.sleep(400);
    await ctx.write(`<span class="text-brand-blue">user$</span> hs-agent --task "Style the quick search/kbar trigger button" --file "apps/web/modules/shell/Kbar.tsx"`, 'system');
    await ctx.sleep(300);
    await ctx.write(`<div class="bg-zinc-900/40 p-2.5 rounded border border-zinc-800 text-[10px] text-zinc-400 space-y-1">
      <div class="text-zinc-300 font-mono text-[9.5px] leading-relaxed">
        <span class="text-zinc-500 font-bold">Instruction:</span> "In apps/web/modules/shell/Kbar.tsx, style the quick search/kbar trigger button so it looks more like a distinct button. Add a subtle border, a light hover background, and increase its horizontal padding on desktop screens."
      </div>
    </div>`);
    await ctx.sleep(600);

    // Step 2
    ctx.updateStats(2, 1200, '1.5s');
    await ctx.write(`[Step 2] Thinking: Target file locked at apps/web/modules/shell/Kbar.tsx. Opening file to locate the trigger component...`, 'thinking');
    await ctx.sleep(700);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> view_file(AbsolutePath="D:/Projects/cal.diy/apps/web/modules/shell/Kbar.tsx")`, 'system');
    await ctx.sleep(800);

    // Step 3
    ctx.updateStats(3, 23720, '5.4s');
    await ctx.write(`<span class="text-zinc-500">tool_response$</span> Completed successfully. Showing lines 1 to 480 of Kbar.tsx:`, 'system');
    await ctx.sleep(300);

    // Render Codeblock showing full file with truncation
    await ctx.write(`<div class="bg-zinc-950 p-2.5 rounded border border-zinc-900 font-mono text-[10px] text-zinc-400 leading-normal max-h-40 overflow-y-auto terminal-scroll space-y-0.5">
      <div><span class="text-zinc-700">1:</span> import { useSession } from "next-auth/react";</div>
      <div><span class="text-zinc-700">2:</span> import { appStoreMetadata } from "@calcom/app-store/appStoreMetaData";</div>
      <div><span class="text-zinc-500 pl-3">... [360 lines of configuration & kbar provider code omitted for preview] ...</span></div>
      <div><span class="text-zinc-700">362:</span> const KBarTrigger = (): JSX.Element | null => {</div>
      <div><span class="text-zinc-700">363:</span>   const { query } = useKBar();</div>
      <div><span class="text-zinc-700">364:</span>   if (!query) return null;</div>
      <div><span class="text-zinc-700">365:</span>   return (</div>
      <div><span class="text-zinc-700">370:</span>     &lt;Tooltip side="right" content={getTooltipContent()}&gt;</div>
      <div class="bg-brand-purple/5 border-l-2 border-brand-purple pl-1"><span class="text-brand-purple">371:</span>       &lt;button</div>
      <div class="bg-brand-purple/5 border-l-2 border-brand-purple pl-1"><span class="text-zinc-700">372:</span>         color="minimal"</div>
      <div class="bg-brand-purple/5 border-l-2 border-brand-purple pl-1"><span class="text-zinc-700">373:</span>         onClick={query.toggle}</div>
      <div class="bg-brand-purple/5 border-l-2 border-brand-purple pl-1"><span class="text-zinc-700">374:</span>         className="todesktop:hover:!bg-transparent group flex rounded-md px-3 py-2 font-medium text-default text-sm transition hover:bg-subtle lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
      <div><span class="text-zinc-500 pl-3">... [100 lines remaining omitted] ...</span></div>
    </div>`);
    await ctx.sleep(1000);

    // Step 4
    ctx.updateStats(4, 24200, '7.8s');
    await ctx.write(`[Step 4] Thinking: Target search button located inside Kbar.tsx at line 371. Preparing proposed diff...`, 'thinking');
    await ctx.sleep(650);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> send_message(Recipient="parent", Message="Proposed diff created.")`, 'system');
    await ctx.sleep(400);

    // Step 5
    ctx.updateStats(5, 24980, '10.2s');
    await ctx.write(`<span class="text-brand-blue">agent$</span> Target search button located inside Kbar.tsx. Proposing change (Step 5).`);
    await ctx.sleep(500);

    // Render Diff block with alert
    await ctx.write(`<div class="bg-zinc-950 rounded border border-zinc-900 overflow-hidden text-[10px]">
      <div class="bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 flex justify-between items-center text-[9px] text-zinc-500 font-mono">
        <span>PROPOSED PATCH</span>
        <span>Kbar.tsx</span>
      </div>
      <div class="p-2.5 font-mono space-y-0.5 leading-normal text-zinc-400">
        <div>@@ -371,6 +371,6 @@ const KBarTrigger = () => {</div>
        <div>       &lt;button</div>
        <div>         color="minimal"</div>
        <div>         onClick={query.toggle}</div>
        <div class="text-red-400 bg-red-950/30 px-1">-        className="todesktop:hover:!bg-transparent group flex rounded-md px-3 py-2 font-medium text-default text-sm transition hover:bg-subtle lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div class="text-green-400 bg-green-950/30 px-1">+        className="todesktop:hover:!bg-transparent group flex rounded-md border border-default px-3 py-2 font-medium text-default text-sm transition hover:bg-default lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div>         &lt;SearchIcon className="h-4 w-4 shrink-0 text-inherit" /&gt;</div>
      </div>
      <div class="p-2 border-t border-zinc-900 bg-zinc-900/30 flex justify-end">
        <button id="apply-patch-btn-${ctx.tabName}" class="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] px-3 py-1 rounded transition-colors active:scale-[0.97]">
          Apply Patch
        </button>
      </div>
    </div>
    <div class="text-purple-400 border border-purple-950/50 bg-purple-950/20 p-2.5 rounded text-[10px] space-y-1 mt-2">
       <div class="font-bold flex items-center gap-1 text-purple-400">
         <svg class="h-3.5 w-3.5 fill-current" viewBox="0 0 16 16"><path d="M8.22 1.75a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L9 3.56V11.5a.75.75 0 01-1.5 0V3.56L3.78 7.31a.75.75 0 01-1.06-1.06l4.5-4.5zM8 12.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V13a.75.75 0 01.75-.75z"/></svg>
         <span>Comparison Alert: File-Level Context</span>
       </div>
       <div>With target file path locked, the agent skipped folder exploration but had to read the <strong>entire 480-line Kbar.tsx file</strong>. Spent <strong>24,980 input tokens</strong> (5 steps) compared to just 6,486 tokens in HoverSource coordinate-guided access.</div>
     </div>`);

    // Add listener to the dynamically created Apply Patch button
    document.getElementById(`apply-patch-btn-${ctx.tabName}`).addEventListener('click', () => handleApplyPatch(ctx.tabName));
  } catch (err) {
    if (err.message === 'cancelled') return;
    throw err;
  }
}

// Tab A (No HoverSource) Sequence
async function runNoContextSimulation(ctx) {
  try {
    ctx.updateStats(1, 500, '0.2s');
    await ctx.write(`<span class="text-zinc-500">system$</span> initializing session a643bff0-85d0-48c0-98ac-25b74b50cc8e...`, 'system');
    await ctx.sleep(400);
    await ctx.write(`<span class="text-brand-blue">user$</span> hs-agent --task "Styling search button in sidebar"`, 'system');
    await ctx.sleep(300);
    await ctx.write(`<div class="bg-zinc-900/40 p-2.5 rounded border border-zinc-800 text-[10px] text-zinc-400 space-y-1">
      <div class="text-zinc-300 font-mono text-[9.5px] leading-relaxed">
        <span class="text-zinc-500 font-bold">Instruction:</span> "The quick search search bar trigger button in the sidebar (looks like a search icon or shortcut key) has a neutral background that blends in too much. Let's make it look more like a distinct button by adding a subtle border and making the hover background lighter."
      </div>
    </div>`);
    await ctx.sleep(600);

    // Step 2
    ctx.updateStats(2, 1500, '1.5s');
    await ctx.write(`[Step 2] Thinking: Searching for references to "search" or "sidebar" in codebase...`, 'thinking');
    await ctx.sleep(700);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> grep_search(Query="search", SearchPath="D:/Projects/cal.diy")`, 'system');
    await ctx.sleep(800);

    // Step 3
    ctx.updateStats(3, 18500, '4.2s');
    await ctx.write(`<span class="text-zinc-500">tool_response$</span> Completed. Found 1,248 matches across 142 files. Truncating display to first 4 results:`, 'system');
    await ctx.write(`<div class="text-[10px] text-zinc-500 pl-3">
      - apps/web/modules/shell/Kbar.tsx:L355<br>
      - packages/ui/components/Sidebar.tsx:L12<br>
      - packages/core/search/SearchIndex.ts:L42<br>
      - obsidian-vault/SKILL.md:L3
    </div>`);
    await ctx.sleep(800);

    // Step 4
    ctx.updateStats(4, 28000, '6.8s');
    await ctx.write(`[Step 4] Thinking: The search query returned too many generic results. Listing repository folders to locate visual packages...`, 'thinking');
    await ctx.sleep(600);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> list_dir(DirectoryPath="D:/Projects/cal.diy")`, 'system');
    await ctx.sleep(700);

    // Step 5
    ctx.updateStats(5, 34500, '8.9s');
    await ctx.write(`<span class="text-zinc-500">tool_response$</span> Completed. Directory structure contains 32 items (apps, packages, etc.).`, 'system');
    await ctx.sleep(600);

    // Step 6
    ctx.updateStats(6, 42000, '11.5s');
    await ctx.write(`[Step 6] Thinking: Listing packages to find UI components...`, 'thinking');
    await ctx.sleep(600);
    await ctx.write(`<span class="text-zinc-500">tool_call$</span> list_dir(DirectoryPath="D:/Projects/cal.diy/packages")`, 'system');
    await ctx.sleep(600);

    // Fast Loop simulation
    await ctx.write(`[Step 7] Thinking: Searching for "shortcut" or "search icon" inside packages/ui...`, 'thinking');
    await ctx.sleep(400);
    
    const loopContainer = document.createElement('div');
    loopContainer.className = 'text-zinc-500 space-y-1 pl-3';
    ctx.screen.appendChild(loopContainer);
    ctx.screen.scrollTop = ctx.screen.scrollHeight;

    // Stats scrolling loop animation (ticks up rapidly over 3 seconds)
    let stepsVal = 7;
    let tokensVal = 42000;
    let timeVal = 12;

    const itemsToLog = [
      'grep_search(Query="shortcut", SearchPath="D:/Projects/cal.diy/packages/ui") ➔ No results.',
      'grep_search(Query="SearchIcon", SearchPath="D:/Projects/cal.diy/apps/web") ➔ Found 52 matches.',
      'view_file(file="packages/ui/components/Sidebar.tsx") ➔ No styling matched.',
      'view_file(file="apps/web/modules/shell/Header.tsx") ➔ No button elements.',
      'view_file(file="apps/web/modules/shell/Navigation.tsx") ➔ Nav links only.',
      'view_file(file="apps/web/modules/shell/SidebarButton.tsx") ➔ Unrelated component.',
      'grep_search(Query="Kbar", SearchPath="D:/Projects/cal.diy") ➔ Found in 12 files.',
      'view_file(file="apps/web/modules/shell/Kbar.tsx") ➔ Match found at line 371.'
    ];

    for (let i = 0; i < itemsToLog.length; i++) {
      stepsVal += Math.floor(Math.random() * 8) + 4;
      tokensVal += Math.floor(Math.random() * 80000) + 40000;
      timeVal += Math.floor(Math.random() * 18) + 10;
      
      ctx.updateStats(stepsVal, tokensVal, `${timeVal}s`);
      
      ctx.check();
      const logLine = document.createElement('div');
      logLine.innerHTML = `➔ [Step ${stepsVal}] scanning: ${itemsToLog[i]}`;
      loopContainer.appendChild(logLine);
      ctx.screen.scrollTop = ctx.screen.scrollHeight;
      await ctx.sleep(350);
    }

    // Finish loop at task 5 natural limits
    ctx.updateStats(65, 651681, '142.0s');
    await ctx.write(`<span class="text-brand-blue">agent$</span> Target search button located inside Kbar.tsx. Proposing change (Step 65).`);
    await ctx.sleep(500);

    // Render Diff block with alert
    await ctx.write(`<div class="bg-zinc-950 rounded border border-zinc-900 overflow-hidden text-[10px]">
      <div class="bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 flex justify-between items-center text-[9px] text-zinc-500 font-mono">
        <span>PROPOSED PATCH</span>
        <span>Kbar.tsx</span>
      </div>
      <div class="p-2.5 font-mono space-y-0.5 leading-normal text-zinc-400">
        <div>@@ -371,6 +371,6 @@ const KBarTrigger = () => {</div>
        <div>       &lt;button</div>
        <div>         color="minimal"</div>
        <div>         onClick={query.toggle}</div>
        <div class="text-red-400 bg-red-950/30 px-1">-        className="todesktop:hover:!bg-transparent group flex rounded-md px-3 py-2 font-medium text-default text-sm transition hover:bg-subtle lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div class="text-green-400 bg-green-950/30 px-1">+        className="todesktop:hover:!bg-transparent group flex rounded-md border border-default px-3 py-2 font-medium text-default text-sm transition hover:bg-default lg:px-2 lg:hover:bg-emphasis lg:hover:text-emphasis"&gt;</div>
        <div>         &lt;SearchIcon className="h-4 w-4 shrink-0 text-inherit" /&gt;</div>
      </div>
      <div class="p-2 border-t border-zinc-900 bg-zinc-900/30 flex justify-end">
        <button id="apply-patch-btn-${ctx.tabName}" class="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] px-3 py-1 rounded transition-colors active:scale-[0.97]">
          Apply Patch
        </button>
      </div>
    </div>
    <div class="text-brand-amber border border-zinc-900 bg-brand-amber/5 p-2.5 rounded text-[10px] space-y-1 mt-2">
       <div class="font-bold flex items-center gap-1 text-brand-amber">
         <svg class="h-3.5 w-3.5 fill-current" viewBox="0 0 16 16"><path d="M8.22 1.75a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L9 3.56V11.5a.75.75 0 01-1.5 0V3.56L3.78 7.31a.75.75 0 01-1.06-1.06l4.5-4.5zM8 12.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V13a.75.75 0 01.75-.75z"/></svg>
         <span>Quota Alert: Exploration Overhead</span>
       </div>
       <div>Without HoverSource, the agent spent <strong>651,681 input tokens</strong> (65 steps) scanning folders and looking at 12 wrong files before finding the right line. Cost: ~$1.95.</div>
     </div>`);

    // Add listener to the dynamically created Apply Patch button
    document.getElementById(`apply-patch-btn-${ctx.tabName}`).addEventListener('click', () => handleApplyPatch(ctx.tabName));
  } catch (err) {
    if (err.message === 'cancelled') return;
    throw err;
  }
}
