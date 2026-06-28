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
