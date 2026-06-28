# HoverSource Benchmark Logs

This directory contains the detailed execution logs, benchmark reports, and visualization charts comparing the performance of AI coding agents under different instruction/prompting strategies.

## Benchmark Methodology

We evaluate the performance of an AI coding agent (Gemini 3.5 Flash) on style modification and minor layout tasks across three distinct prompting variants:

1. **Prompt A: Pure Natural Language (No Context)**
   * Simulates a developer who does not know the codebase. The prompt describes the visual goal in plain human language without mentioning specific files, classes, or coordinates.
2. **Prompt B: Senior Developer Context (Manual Search Helper)**
   * Simulates a senior developer pointing the agent to the right place. The prompt includes manual file paths and component names but leaves the exact element coordinates/CSS selectors open-ended.
3. **Prompt C: HoverSource Component Metadata (Automatic Clipboard)**
   * Pares the natural language instruction with the full structured **Component Metadata** block copied directly from the HoverSource inspector overlay (`Alt + C`). This block provides exact element selectors, file paths, dimensions, layout constraints, and parent/key styles.

---

## Directory Structure

```
benchmark-logs/
├── README.md                  # This file (overview)
├── generate_chart.py          # Python script to compile and plot metrics
├── calcom/                    # Benchmark 1: Cal.com Monorepo (~7,700 source files)
│   ├── calcom-benchmark.md    # Consolidated summary and task-by-task breakdown
│   ├── calcom-benchmark-chart.png # High-resolution line chart comparing time and tokens
│   └── logs/                  # Raw step-by-step agent transcripts (Tasks 1-10)
└── yumeshelf/                 # Benchmark 2: YumeShelf Electron App (~200 source files)
    ├── yumeshelf-benchmark.md # Consolidated summary and task-by-task breakdown
    ├── yumeshelf-benchmark-chart.png # High-resolution line chart comparing time and tokens
    └── logs/                  # Raw step-by-step agent transcripts (Tasks 11-15)
```

---

## Detailed Reports

To view the consolidated summaries, task goals, metric comparisons, and delta gains, refer to:

* **[Cal.com Monorepo Benchmark Report (10 Tasks)](calcom/calcom-benchmark.md)**
* **[YumeShelf Electron App Benchmark Report (5 Tasks)](yumeshelf/yumeshelf-benchmark.md)**

## Generating Charts

The visualization charts in the subdirectories are compiled and generated using the Matplotlib scripts:
* To generate Cal.com chart: `python benchmark-logs/generate_chart.py`
* To generate YumeShelf chart: Run the helper generation script `generate_yumeshelf_chart.py` located in the agent scratch directory.

---

## Deep Analysis: Prompting Methodology & Code Elegance

### Core Philosophy: Human Intuition (B) vs. Machine Precision (C)
* **Prompt B (Senior Dev Context):** Relies on human search context. The developer points the agent to a file path and component, leaving exact CSS selectors and DOM structures for the agent to find.
* **Prompt C (HoverSource Metadata):** Relies on automated precise context. The agent receives exact file paths, lines, specific CSS selectors, bounding boxes, parent styles, and layout constraints via the clipboard.

### Performance Dynamics
1. **Execution Time (Lower is Better):**
   * **Cal.com (Large Monorepo):** Prompt C completed tasks in **16.4s** on average, vs. **44.2s** for Prompt B (2.7x faster).
   * **YumeShelf (Medium Codebase):** Prompt C took **24.8s** vs. **38.8s** for Prompt B.
   * *Insight:* Direct styling coordinates eliminate the agent's exploratory "thought loops," significantly reducing generation latency.
2. **Token Efficiency vs. Cost Trade-offs:**
   * In massive codebases, Prompt C keeps the peak context window clean. However, in small/isolated codebases, Prompt B can be more token-efficient (e.g., YumeShelf Task 15 took **5s** / **10k tokens** for B vs. **14s** / **48k tokens** for C) because the dense metadata block introduces initial token overhead for simple fixes.

### Code Elegance & Architectural Integrity (The "Hidden" Advantage)
The most critical difference is how the agent behaves under each constraint:
* **Prompt B Side-Effects (Task 11 & 14):** By forcing the agent to modify a specific `.ts` file, the agent chose "brute-force" solutions. It injected programmatic JavaScript event listeners (`onmouseover`/`onmouseout`) to apply inline DOM styles, violating the separation of concerns.
* **Prompt C Architectural Fit:** Because Prompt C provides the exact CSS file path and class selector, the agent confidently targets the stylesheets (`game-cards.css` / `menus-tooltips.css`) to write clean, native CSS rules, keeping logic and presentation cleanly separated.

