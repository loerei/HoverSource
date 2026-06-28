# HoverSource Benchmark Logs

This directory contains execution logs, benchmark reports, and visualization charts comparing the performance of an AI coding agent under three prompting strategies.

## Benchmark Methodology

We evaluate the performance of an AI coding agent (Gemini 3.5 Flash) on style modification and minor layout tasks across three distinct prompting variants:

1. **Prompt A: Pure Natural Language (No Context)**
   * Describes the visual goal in natural language. No file paths, CSS selectors, or component locations are provided.
2. **Prompt B: Manual Context**
   * Specifies target file paths and component names, representing manual developer input. Exact element coordinates and CSS selectors are omitted.
3. **Prompt C: HoverSource Metadata**
   * Pairs the natural language instruction with the structured component metadata block exported by HoverSource. This includes exact selectors, file paths, layout constraints, dimensions, and parent styles.

---

## Directory Structure

```
benchmark-logs/
├── README.md                  # This file (overview)
├── generate_chart.py          # Python script to compile and plot metrics
├── calcom/                    # Benchmark 1: Cal.com Monorepo (~7,700 source files)
│   ├── calcom-benchmark.md    # Consolidated summary and task-by-task breakdown
│   ├── calcom-benchmark-chart.png # Visualization comparing time and tokens
│   └── logs/                  # Agent transcripts (Tasks 1-10)
└── yumeshelf/                 # Benchmark 2: YumeShelf Electron App (~200 source files)
    ├── yumeshelf-benchmark.md # Consolidated summary and task-by-task breakdown
    ├── yumeshelf-benchmark-chart.png # Visualization comparing time and tokens
    └── logs/                  # Agent transcripts (Tasks 11-15)
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

## Analysis: Prompting Methodology & Code Quality

### Context Comparison
* **Prompt B (Manual Context):** Relies on high-level file and component naming, leaving exact CSS selectors and DOM structures for the agent to find.
* **Prompt C (HoverSource Metadata):** Provides exact file paths, line numbers, specific CSS selectors, bounding boxes, parent styles, and layout constraints.

### Performance Analysis
1. **Execution Time:**
   * **Cal.com (Large Monorepo):** Prompt C completed tasks in **16.4s** on average, compared to **44.2s** for Prompt B.
   * **YumeShelf (Medium Codebase):** Prompt C took **24.8s** on average, compared to **38.8s** for Prompt B.
   * *Observation:* Providing specific selectors and source lines bypassed search phases and component hierarchy traversals, reducing latency.
2. **Token Consumption:**
   * In larger codebases, Prompt C reduced peak context usage. In smaller codebases or simple tasks, Prompt B was more token-efficient (e.g., YumeShelf Task 15 required **5s** and **10k tokens** for B, compared to **14s** and **48k tokens** for C). This is due to the baseline token overhead introduced by the structured metadata block.

### Impact on Code Quality & Architecture
The type of context provided influenced the architectural decisions made by the agent:
* **Prompt B Side-Effects (Task 11 & 14):** When Prompt B specified a TypeScript controller file (e.g., `stack-cards.ts`), the agent resolved styling changes programmatically in JavaScript using inline styles and DOM event listeners (`onmouseover`, `onmouseout`). This bypassed the project's styling conventions.
* **Prompt C Resolution:** When Prompt C provided the exact stylesheet path and class selector, the agent modified the native CSS rule in the stylesheet directly, maintaining the separation between logical controller code and presentation styles.
