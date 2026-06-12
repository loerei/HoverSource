# HoverSource

You are a VibeCoder? Ever tried to describe a UI element with human language then see your agent **burn your quota just to figure out what on Earth you are talking about, then fix the wrong thing**?

You are a Senior who knows what `Ctrl + Shift + I` is to copy the right thing and give it to your Agent, **but you feel pathetic spending your life doing that**?

I cured the curse. Hover on what you want the AI to change, press `Alt + C`, then `Ctrl + V`.

## Features

- **Dual Interaction Modes**:
  - **Inspector Mode**: Hover over components to view layout boundaries, selector paths, and file deep-links. Copies `HoverSource Component Metadata` with `Alt + C`.
  - **Design Mode (`Alt + X` to toggle)**: Drag a targeting crosshair to snap against horizontal/vertical edges and measure pixel-perfect offsets. Copies `HoverSource Design Placement Metadata` with `Alt + C`.
- **Copy AI-Ready Metadata (`Alt + C`)**: Copies a structured Markdown block to your clipboard — component name, exact file path with line/column, computed styles, parent visual effects with CSS source locations, layout constraints, JSDoc comments, and raw JSX attributes (or snapping offsets and absolute CSS anchors in Design Mode).
- **Freeze State (`Alt + P`)**: Locks dynamic elements (like tooltips, popovers, or dropdowns) in place so you can hover and capture them without them disappearing.
- **Toggle Overlay (`Alt + H`)**: Show or hide the developer overlay bounding box and floating spec card.
- **Deep-linking (Click filename)**: Instantly opens the file in your preferred editor (VS Code or Cursor) at the exact line number.
- **Source Line Correction**: Silently checks and corrects compiler-shifted line numbers in the background.
- **Layered Element Navigation (`Alt + Shift + Scroll`)**: Cycle through overlapping DOM elements under the cursor using a scroll combination, showing a clean 2D overlapping layer stack in the tooltip to easily target parent/child elements. Customize shortcuts in the dashboard.
- **Element Selector & CSS Source Location**: Captures the exact HTML tag and classes of the hovered element, along with the specific line and file of their CSS definition.

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

| Metadata Field | React | Vue (Non-Invasive / Invasive) | Svelte | Vanilla / Fallback |
| :--- | :--- | :--- | :--- | :--- |
| **Framework Label** | `React` | `Vue` | `Svelte` | `Vanilla` or `Unknown` |
| **Component Name** | Resolved (walks fiber owners) | Resolved (from component type `name` or `__name` / `data-v-inspector`) | Resolved (inferred from Svelte filename) | Fallback (defaults to HTML tag) |
| **File Path** | Resolved (from fiber `_debugSource.fileName`) | Resolved (from component `__file` attribute / `data-v-inspector`) | Resolved (from `__svelte_meta.loc.file`) | None |
| **Line Number** | Resolved (from fiber `_debugSource.lineNumber`) | None (Unresolved) / **Resolved** (from `data-v-inspector`)* | Resolved (from `__svelte_meta.loc.line` + 1) | None |
| **Column Number** | Resolved (from fiber `_debugSource.columnNumber`) | None (Unresolved) / **Resolved** (from `data-v-inspector`)* | Resolved (from `__svelte_meta.loc.column` + 1) | None |
| **Tag Name & Classes** | Resolved (DOM extraction) | Resolved (DOM extraction) | Resolved (DOM extraction) | Resolved (DOM extraction) |

\* *Note: Vue component instances in development mode do not expose line and column locations directly on DOM instances by default. Run `hs install --vue` to enable compile-time template line/column injection (Invasive mode). Without it, HoverSource defaults to Non-Invasive mode, hiding line/column coordinates and opening the file at line 1.*

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

When a class from an ancestor is found in the project's CSS/SCSS files, the output includes a direct link to the source file and line:

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
