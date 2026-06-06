# HoverSource

You are a VibeCoder? Ever tried to describe a UI element with human language then see your agent **burn your quota just to figure out what on Earth you are talking about, then fix the wrong thing**?

You are a Senior who knows what `Ctrl + Shift + I` is to copy the right thing and give it to your Agent, **but you feel pathetic spending your life doing that**?

I cured the curse. Hover on what you want the AI to change, press `Alt + C`, then `Ctrl + V`.

## Features

- **Copy AI-Ready Metadata (`Alt + C`)**: Copies a structured Markdown block to your clipboard — component name, exact file path with line/column, computed styles, parent visual effects with CSS source locations, layout constraints, JSDoc comments, and raw JSX attributes.
- **Freeze State (`Alt + P`)**: Locks dynamic elements (like tooltips, popovers, or dropdowns) in place so you can hover and capture them without them disappearing.
- **Toggle Overlay (`Alt + H`)**: Show or hide the developer overlay bounding box and floating spec card.
- **Deep-linking (Click filename)**: Instantly opens the file in your preferred editor (VS Code or Cursor) at the exact line number.
- **Source Line Correction**: Silently checks and corrects compiler-shifted line numbers in the background.
- **Layered Element Navigation (`Alt + Shift + Scroll`)**: Cycle through overlapping DOM elements under the cursor using a scroll combination, showing a clean 2D overlapping layer stack in the tooltip to easily target parent/child elements. Customize shortcuts in the dashboard.

## Clipboard Output

When you press `Alt + C` on any hovered element, HoverSource copies a Markdown block to your clipboard. All sections below the first five fields are conditional — they appear only when the relevant data exists.

### Always present

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
