# HoverSource

You are a VibeCoder? Ever tried to describe a UI element with human language then see your agent **burn your quota just to figure out what on Earth you are talking about, then fix the wrong thing**?

You are a Senior who knows what `Ctrl + Shift + I` is to copy the right thing and give it to your Agent, **but you feel pathetic spending your life doing that**?

I cured the curse. Hover on what you want the AI to change, press `Alt + C`, then `Ctrl + V`.

## Features

- **Dual Interaction Modes**:
  - **Inspector Mode**: Hover over components to view layout boundaries, selector paths, and file deep-links. Copies `HoverSource Component Metadata` with `Alt + C`.
  - **Design Mode (`Alt + X` to toggle)**: Drag a targeting crosshair to snap against horizontal/vertical edges and measure pixel-perfect offsets. Copies `HoverSource Design Placement Metadata` with `Alt + C`.
- **Copy AI-Ready Metadata (`Alt + C` / `Alt + Shift + C`)**: Copies a structured Markdown block to your clipboard — component name, exact file path with line/column, computed styles, parent visual effects with CSS source locations, layout constraints, JSDoc comments, and raw JSX attributes (or snapping offsets and absolute CSS anchors in Design Mode). Pressing **`Alt + Shift + C`** copies the metadata of all ancestor layers under the cursor plus a minified structural HTML skeleton of the target element, providing the AI with layout and nesting context.
- **Freeze State (`Alt + P`)**: Locks dynamic elements (like tooltips, popovers, or dropdowns) in place so you can hover and capture them without them disappearing.
- **Toggle Overlay (`Alt + H`)**: Show or hide the developer overlay bounding box and floating spec card.
- **Deep-linking (Click filename)**: Instantly opens the file in your preferred editor (VS Code or Cursor) at the exact line number.
- **Source Line Correction**: Silently checks and corrects compiler-shifted line numbers in the background.
- **Layered Element Navigation (`Alt + Shift + Scroll`)**: Cycle through overlapping DOM elements under the cursor using a scroll combination, showing a clean 2D overlapping layer stack in the tooltip to easily target parent/child elements. Customize shortcuts in the dashboard.
- **Element Selector & CSS Source Location**: Captures the exact HTML tag and classes of the hovered element, along with the specific line and file of their CSS definition. This includes support for CSS Preprocessors (Sass, SCSS, Less) with nested selectors, and CSS Modules (auto-resolving hashed class names back to their source definitions).

## Benchmark: Human Language vs. HoverSource Metadata

To measure the efficiency gains, we ran benchmarks with an AI coding agent (Gemini 3.5 Flash) performing style modification tasks in a dry-run environment (benchmarked and logged using [chronicle-mcp](https://github.com/loerei/chronicle-mcp) via the `js-tiktoken` tokenizer). We compared a pure natural language instruction (simulating a user who does not know the codebase) against the same instruction paired with the HoverSource Component Metadata.

The benchmarks were performed on two public open-source projects of different scales:
1. **[Cal.com (cal.diy)](https://github.com/calcom/cal.diy)**: A giant enterprise-level monorepo (~7,700 source files, multiple apps/packages).
2. **[YumeShelf](https://github.com/loerei/YumeShelf)**: A medium-sized desktop Electron application (~200 source files).

---

### Benchmark 1: Cal.com Monorepo (Giant Enterprise Codebase)
* **Task**: Modify the hover style of the `'destructive'` variant of the main UI Button component (change background hover class to `hover:bg-red-50` and border hover class to `hover:border-red-500`).
* **Metadata provided**: Component: `Button`, Element: `button.bg-default.text-error`, File Path: `packages/ui/components/button/Button.tsx` (L122, C7).
* **Full Session Logs**: [Pure Natural Language Log](benchmark-logs/calcom-natural-language.md) | [Metadata Assisted Log](benchmark-logs/calcom-metadata.md)

| Metric | Pure Natural Language | Guided by HoverSource Metadata | Performance Delta |
| :--- | :---: | :---: | :---: |
| **Agent Steps** | 69 | 9 | **-87.0%** |
| **Tool Calls** | 33 | 3 | **-90.9%** |
| **Execution Time** | 106s | 13s | **-87.7%** (8x faster) |
| **Cumulative Input Tokens** | 499,995 | 6,908 | **-98.6%** (72.3x fewer tokens) |
| **Peak Context Window** | 27,749 | 2,850 | **-89.7%** |

---

### Benchmark 2: YumeShelf (Medium Codebase)
* **Task**: Modify the hover state of the favorite star button on the game card (change background to `rgba(255, 215, 0, 0.12)` and color to `#ffd700` on hover).
* **Metadata provided**: Element: `div.fav-btn`, File Path: `src/renderer/game-cards.ts` (L41), Source CSS: `src/styles/game-cards.css` (L267).
* **Full Session Logs**: [Pure Natural Language Log](benchmark-logs/yumeshelf-natural-language.md) | [Metadata Assisted Log](benchmark-logs/yumeshelf-metadata.md)

| Metric | Pure Natural Language | Guided by HoverSource Metadata | Performance Delta |
| :--- | :---: | :---: | :---: |
| **Agent Steps** | 19 | 11 | **-42.1%** |
| **Tool Calls** | 8 | 4 | **-50.0%** |
| **Execution Time** | 22s | 11s | **-50.0%** |
| **Cumulative Input Tokens** | 65,379 | 13,033 | **-80.1%** |
| **Peak Context Window** | 11,167 | 4,338 | **-61.2%** |

---

### Why HoverSource scales with codebase complexity
* **Zero Search & Exploration Overhead**: In YumeShelf, the natural language agent had to scan directories and run global searches (`grep`) to locate the card and CSS files. In Cal.com's monorepo, this overhead exploded. The agent had to list multiple directories, inspect packages, and evaluate ambiguous components across different packages (such as `packages/ui` vs `packages/coss-ui`) just to find the active Button code. Guided by HoverSource, the agent went straight to the exact target line in a single turn.
* **Context Preservation**: By bypassing global searches and file listings, HoverSource keeps the agent's context window extremely clean, leading to a **98.6% reduction in token consumption** on Cal.com (from half a million tokens to just under 7k). This directly translates to lower API costs and faster responses.


## Modes of Operation

HoverSource runs in two distinct interaction modes depending on your task. You can toggle between them at any time by pressing **`Alt + X`**.

### 1. Inspector Mode (Default)
Ideal for debugging, modifying, or refactoring existing elements.
- Hovering elements highlights their layout bounding box and opens a floating card containing file paths, component names, CSS locations, and layout context.
- Pressing **`Alt + C`** copies **Component Metadata** (see [Clipboard Output](#clipboard-output)).

### 2. Design Mode
Ideal for positioning new UI elements (cards, badges, modals, tooltips) relative to existing elements.
- Activates a drag-and-drop targeting crosshair.
- Snaps the crosshair horizontally or vertically against nearby element boundaries (edges or center axes) to measure precise offsets (`dX`, `dY`).
- Pressing **`Alt + C`** copies **Design Placement Metadata** containing:
  - Exact target and snap anchor selectors.
  - Pixel-perfect offsets and boundaries.
  - Pre-computed absolute position CSS block (`top`, `left`, `white-space`).
  - Structural guidance for AI agents to decide on DOM insertion and flex/grid adjustments.

## Framework Support Matrix

HoverSource supports resolving metadata for multiple frontend frameworks at different levels of depth depending on what information is exposed by the framework's development mode:

| Metadata Field | React (Non-Invasive / Invasive) | Vue (Non-Invasive / **Invasive**) | Svelte (Non-Invasive) | Angular (Non-Invasive / **Invasive**) | SolidJS (Non-Invasive) | Preact (Non-Invasive) | Astro (Non-Invasive) | Vanilla / Fallback |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Component Name** | Resolved | Resolved | Resolved | Resolved | Resolved | Resolved | Resolved | Fallback (DOM tag) |
| **File Path** | Resolved | Resolved | Resolved | None / **Resolved**\* | Resolved | Resolved | Resolved | None |
| **Line Number** | Resolved | None / **Resolved**\* | Resolved | None / **Resolved**\* | Resolved | Resolved | Resolved | None |
| **Column Number** | Resolved | None / **Resolved**\* | Resolved | None / **Resolved**\* | Resolved | Resolved | Resolved | None |
| **Tag Name & Classes** | Resolved | Resolved | Resolved | Resolved | Resolved | Resolved | Resolved | Resolved |

\* *Note: Vue and Angular require compile-time template tagging (Invasive mode via `hs install --vue` or `hs install --angular`) to expose line/column locations (and file path for Angular). Other frameworks resolve them out-of-the-box in development mode (Non-Invasive).*

---

## Proxy & Security Transport Matrix

When utilizing HoverSource in Web Application Proxy Mode (`hs --target=<url>`), the reverse proxy employs dedicated routing and headers interception layers to handle modern browser restrictions:

| Feature / Capability | Supported | Details |
| :--- | :---: | :--- |
| **HTTP Upstream Proxying** | **Yes** | Standard port forwarding with dynamic script injection. |
| **HTTPS Upstream Proxying** | **Yes** | Automatically switches transport agents and generates local self-signed SSL certificates when targeting secure (`https://`) dev servers. |
| **CSP Headers Stripping** | **Yes** | Automatically strips `content-security-policy` and `content-security-policy-report-only` headers from upstream HTML and static assets. |
| **Same-Origin Iframe Routing** | **Yes** | Redirects `/hoversource/*` client assets to the local companion server. Keeps script execution same-origin inside iframes to bypass isolation policies. |
| **Dev Server Health Polling** | **Yes** | Actively polls target upstream servers before binding the proxy port, with graceful retry logic and CLI warning indicators. |
| **Port Conflict Resolution** | **Yes** | Detects occupied debugging ports (`9222`) or companion ports (`7300`), prompts the user, or terminates conflicting processes automatically. |
| **HTTP/2 or HTTP/3 Upgrading** | **No** | The reverse proxy runs on Node's standard HTTP/HTTPS (`HTTP/1.1`) stack. It automatically downgrades upstream connection protocols to `HTTP/1.1` and does not support multiplexing. |
| **Subresource Integrity (SRI) Rewriting** | **Yes** | Strips `integrity` attributes from script and link tags in HTML responses to prevent browsers from blocking modified resources. |
| **Preloaded HSTS Domains** | **No** | For target domains that have HSTS preloaded in the browser, the self-signed SSL certificates generated locally will be blocked without the option to add a certificate exception. |
| **WebSocket Secure (WSS) Tunneling** | **No** | Does not tunnel secure WebSocket upgrade events over HTTPS proxying, which can break dynamic Hot Module Replacement (HMR) connections. |
| **Cookie Domain & Secure Rewriting** | **Yes** | Strips the `Domain` attribute in `Set-Cookie` response headers to scope cookies to `localhost`, and strips the `Secure` flag if the proxy is running over HTTP. |
| **On-the-fly Decompression** | **Yes** | Decodes `gzip`, `deflate`, and `br` compressed HTML responses from upstream on-the-fly to allow script injection before returning the uncompressed response to the browser. |

---

## Limitations & Workarounds

HoverSource relies on active development environment metadata and browser debug protocols. The following scenarios are unsupported out-of-the-box and require manual configuration or fallback mechanisms:

| Scenario / Environment | Supported | Details / Resolution |
| :--- | :---: | :--- |
| **Docker / Containerized Dev** | **No (Manual)** | Local loopback connections (`127.0.0.1`) are isolated inside containers. You must map container ports (proxy, companion) to the host and bind the host address to `0.0.0.0`. |
| **Non-Electron WebView Apps** | **No (Manual)** | Frameworks like Tauri (Rust) or WebView2 (.NET) do not auto-expose debugging ports. You must build in debug mode, launch the app manually to open the CDP port, and connect HoverSource to it. |
| **Production / Minified Builds** | **No** | Production bundles strip component fiber references, AST structures, and source maps. HoverSource will fall back to raw DOM element tagging without line/column resolution. |

## Clipboard Output

When you press `Alt + C` on any hovered element, HoverSource copies a Markdown block to your clipboard. All sections below the first five fields are conditional — they appear only when the relevant data exists.

### Always present

```markdown
### HoverSource Component Metadata
* **Component**: `ChatThreadView`
* **Element**: `button.persona-card__action-button` ➔ [Source: `workspace.css` (Line: 60, Column: 1)]
* **File Path**: `D:/Projects/MyApp/src/features/chat/ChatThreadView.tsx` (Line: 659, Column: 5)
* **Framework**: React
* **Dimensions**: 1485x1044
* **Key Styles**:
  - Color: `rgb(255, 255, 255)`
  - Background: `rgba(0, 0, 0, 0)`
  - Box Shadow: `none`
  - Margin: `0px` | Padding: `20px 44px 26px`
  - Display: `flex` (direction: column)
```

### Parent Styles *(when ancestors carry visual effects)*

HoverSource walks the ancestor chain of the hovered element and collects any of these properties from each ancestor:

`mask-image` · `-webkit-mask-image` · `opacity` · `filter` · `backdrop-filter` · `overflow-x` · `overflow-y` · `position: sticky` · `position: fixed`

When a class from an ancestor is found in the project's CSS/SCSS/Less files (including CSS Modules), the output includes a direct link to the source file and line:

```markdown
* **Parent Styles**:
  - `div.chat-thread__body` ➔ `mask-image: linear-gradient(rgba(0,0,0,0) 0%, rgb(0,0,0) 10px)` ➔ [Source: `workspace.css` (Line: 793, Column: 3)]
  - `div.chat-thread__body` ➔ `overflow-y: hidden`
  - `section.chat-thread` ➔ `overflow-y: hidden`
  - `main.home-stage` ➔ `overflow-y: hidden`
```

This lets an AI agent patch the exact CSS rule in one step, without grepping the codebase.

### Layout Constraints *(when the element or its context has layout-affecting properties)*

```markdown
* **Layout Constraints**:
  - `flex: 1 1 0%`
  - `min-height: 0`
  - `overflow: hidden`
```

### Source Comments *(when JSDoc or inline comments precede the element in source)*

```markdown
* **Source Comments**:
  - `Renders the scrollable message list for the active chat thread.`
  - `@param messages - ordered list of ChatMessage objects`
```

### Source Attributes *(when the element carries non-style JSX attributes)*

```markdown
* **Source Attributes**:
  - `data-testid="chat-thread-body"`
  - `aria-label="Message list"`
  - `role="log"`
```

### Full example

```markdown
### HoverSource Component Metadata
* **Component**: `ChatThreadView`
* **File Path**: `D:/Projects/MyApp/src/features/chat/ChatThreadView.tsx` (Line: 659, Column: 5)
* **Framework**: React
* **Dimensions**: 1485x1044
* **Key Styles**:
  - Color: `rgb(255, 255, 255)`
  - Background: `rgba(0, 0, 0, 0)`
  - Box Shadow: `none`
  - Margin: `0px` | Padding: `20px 44px 26px`
  - Display: `flex` (direction: column)
* **Parent Styles**:
  - `div.chat-thread__body` ➔ `mask-image: linear-gradient(rgba(0,0,0,0) 0%, rgb(0,0,0) 10px)` ➔ [Source: `workspace.css` (Line: 793, Column: 3)]
  - `div.chat-thread__body` ➔ `overflow-y: hidden`
  - `section.chat-thread` ➔ `overflow-y: hidden`
* **Layout Constraints**:
  - `flex: 1 1 0%`
  - `min-height: 0`
* **Source Comments**:
  - `Renders the scrollable message list for the active chat thread.`
* **Source Attributes**:
  - `data-testid="chat-thread-body"`
```

### Multi-Layer Output (`Alt + Shift + C`)

Pressing **`Alt + Shift + C`** generates a combined Markdown document listing all resolved component layers under the cursor (ordered from leaf to root), ending with a minified structural HTML tree of the target leaf element:

```markdown
### HoverSource Component Metadata
Found 3 layer(s), ordered from leaf (Layer 1) to root:

#### Layer 1/3: `div` (div)
* **Component**: `div`
* **Element**: `div.game-card.favorited`
* **File Path**: `src/components/GameCard.tsx` (Line: 12, Column: 4)
* **Framework**: React
* **Dimensions**: 213x252
* **Key Styles**:
  - Color: `rgb(255, 255, 255)`
  - Background: `rgb(42, 42, 42)`
  - Box Shadow: `rgba(255, 215, 0, 0.15) 0px 6px 25px 0px`
  - Margin: `0px` | Padding: `20px`
  - Display: `flex` (direction: column)
* **Layout Constraints**:
  - `position: relative`
  - `display: flex`

#### Layer 2/3: `div` (div)
...

#### Layer 3/3: `div` (div)
...

### Target Element HTML Structure (Layer 1)
```html
<div class="game-card favorited">
  <div class="game-icon">
    <svg></svg>
  </div>
  <div class="game-status">
    ...
  </div>
</div>
```
```

### Design Placement Metadata (Design Mode)

When in Design Mode, pressing `Alt + C` copies a design layout specification block directing the AI on how to position a new element relative to existing elements:

```markdown
### HoverSource Design Placement Metadata
* **Component**: `Card`
* **Element**: `div#login-card.card`
* **File Path**: `packages/overlay-core/prototype/index.html` (Line: 122, Column: 5)
* **Framework**: Vanilla
* **Horizontal Anchor**:
  - Selector: `div#login-card.card`
  - Boundary: `Right-Edge`
  - Crosshair distance from boundary (NOT a CSS value): `+123px` (Free)
* **Vertical Anchor**:
  - Selector: `div#login-card.card`
  - Boundary: `Top-Edge`
  - Crosshair distance from boundary (NOT a CSS value): `+40px` (Free)

#### Layout Context (auto-resolved at runtime)
* **Positioned Ancestor**: none found within 8 levels — CSS rules may need `position: relative` added to a parent
* **Anchor Element**: `div#login-card.card` (display: block)
* **Direct Parent of Anchor**: `div.sandbox-container` (display: flex)
* **USE THIS CSS** (do not use the distance values above as CSS — use this block):
```css
position: absolute;
  left: calc(100% + 123px);
  top: 40px;
  white-space: nowrap;
```
* **Source Files to Examine**:
- [index.html](file:///D:/Projects/HoverSource/packages/overlay-core/prototype/index.html#L122)

#### For the AI Agent
The CSS above assumes the new element will be a direct child of the Positioned Ancestor.
You must determine the actual DOM insertion point by examining the source files above.
The following is NOT resolved automatically and requires your judgment:
- **DOM insertion point**: where in the JSX/template tree the new element belongs (sibling of anchor, child of a wrapper, inside a portal, etc.)
- **Whether `position: absolute` is appropriate**: if the anchor or its parent is a flex/grid container, a flex/grid child approach may be more appropriate
- **Whether the Positioned Ancestor has `position: relative` in source**: verify it is not conditionally applied

Suggested layout insertion (heuristic only):
* Target DOM Parent: `div#login-card.card` (same as anchor)
```

## HoverSource in the wild

### See how fast your Agents will understand
<p align="center">
  <img src="assets/Screenshot%201.png" alt="HoverSource UI Metadata" width="48%">
  <img src="assets/Screenshot%204.png" alt="AI Agent Explaining Metadata" width="48%">
</p>

### Inspector Overlay & Tooltip
<p align="center">
  <img src="assets/Screenshot%203.png" alt="HoverSource Inspector Tooltip" width="80%">
</p>

### Configuration Dashboard
<p align="center">
  <img src="assets/Screenshot%202.png" alt="HoverSource Configuration Dashboard" width="80%">
</p>



## Install HoverSource

Clone, build, and install the `hs` command globally:

```bash
git clone https://github.com/loerei/HoverSource.git
cd HoverSource && npm install && npm run build
npm install -g ./packages/cli
```

The `hs` command is now available anywhere in your terminal.

## Run It With Your Project

Open a terminal in the root of your project and run:

```bash
hs start
```

That's it. HoverSource reads your `package.json`, detects what kind of project you have, starts it, and attaches automatically. If a previous HoverSource session is still running, it shuts it down cleanly before taking over.

`hs start` maps to `npm run start`. You can use any script name:

```bash
hs dev     # runs npm run dev
hs serve   # runs npm run serve
```

---

### Web app — explicit mode (Vite, CRA, Next.js, ...)

If your dev server is already running, attach HoverSource with a proxy:

```bash
hs --target=http://localhost:5173
```

HoverSource opens your app in your default browser automatically. Hover any element and press `Alt+C`.

---

### Explicit exec

```bash
hs --exec="npm run start"
```

## Prerequisites for Electron Apps

For `HoverSource` to inject the overlay into an Electron application, you **must** enable the Chrome DevTools Protocol (CDP) debugging interface in your application's main process.

Add the following to your main process (e.g., `src/main.ts`) **before** the `app.whenReady()` or `app.on('ready')` event is fired:

```typescript
import { app } from 'electron';

// Enable remote debugging port for HoverSource injection
app.commandLine.appendSwitch('remote-debugging-port', '9222');

app.whenReady().then(() => {
  // ... your app setup
});
```

Ensure the port specified (`9222`) matches the `--debug-port` flag passed to `hs` if you override the default.

---

### Optional flags

| Flag | Default | Description |
|---|---|---|
| `--port=N` | auto | Companion server port |
| `--proxy-port=N` | target port + 1 | Proxy port (web mode) |
| `--debug-port=N` | `9222` | CDP debug port (Electron mode) |
| `--dashboard` / `-d` | off | Open config dashboard on start |

## License

MIT
