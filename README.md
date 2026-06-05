# HoverSource

You are a VibeCoder? Ever tried to describe a UI element with human language then see your agent **burn your quota just to figure out what on Earth you are talking about, then fix the wrong thing**?

You are a Senior who knows what `Ctrl + Shift + I` is to copy the right thing and give it to your Agent, **but you feel pathetic spending your life doing that**?

I cured the curse. Hover on what you want the AI to change, press `Alt + C`, then `Ctrl + V`.

## Features

- **Copy AI-Ready Metadata (`Alt + C`)**: Copies exact file paths, line/column numbers, DOM class lists, tag names, and key computed styles to your clipboard so your AI agent knows exactly what to edit.
- **Freeze State (`Alt + Q`)**: Locks dynamic elements (like tooltips, popovers, or dropdowns) in place so you can hover and capture them without them disappearing.
- **Toggle Overlay (`Alt + H`)**: Show or hide the developer overlay bounding box and floating spec card.
- **Deep-linking (Click filename)**: Instantly opens the file in your preferred editor (VS Code or Cursor) at the exact line number.
- **Source Line Correction**: Silently checks and corrects compiler-shifted line numbers in the background.

## Sample Clipboard Output

When you press `Alt + C` on any hovered element, HoverSource copies this exact Markdown block to your clipboard:

```markdown
### HoverSource Component Metadata
* **Component**: `PrimaryButton`
* **File Path**: `D:/Projects/MySaaSApp/src/components/ui/Button.tsx` (Line: 42, Column: 12)
* **Framework**: React
* **Dimensions**: 120x40
* **Key Styles**:
  - Color: `rgb(255, 255, 255)`
  - Background: `rgb(59, 130, 246)`
  - Box Shadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1)`
  - Margin: `8px` | Padding: `12px 24px`
  - Display: `flex` (direction: row)
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
