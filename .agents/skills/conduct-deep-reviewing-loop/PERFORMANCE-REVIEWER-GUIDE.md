# Performance Reviewer Guide

Audits algorithmic complexity, runtime event-loop/IPC throughput, query efficiency, memory bounds, and rendering scale in the Directive Artifact (DA).

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, declared `Upstream` DAs, this guide, and matching §3 subdocuments. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Capture (`<review_dir>/sandbox/Performance/Findings.md`)**: To prevent lost-in-the-middle drift across large epics, immediately append each discovered algorithmic bottleneck, blocking I/O call, N+1 query, unbounded cache/buffer, or rigid timeout (ticket/file location, defect, referenced symbols, hot-path trigger) as lightweight notes while reading. NEVER write prematurely to `<review_dir>/reports/Performance.md`.
  - **Synthesis & Forward Simulation**: After scanning the entire DA end-to-end, review `Findings.md` to reconcile cross-ticket data volumes and throughput bottlenecks, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state. Report all performance and memory defects in one pass directly to `<review_dir>/reports/Performance.md` via your native file-writing tool (reserve `sandbox/Performance/` scripts strictly for Empirical Verification benchmarks, never for generating or editing reports).
- **Workload Grounding & Lineage Alignment**:
  - Ground critiques in actual workload scale and target architecture (Local/Desktop/CLI vs. Cloud Backend vs. Web Frontend). Do NOT demand multi-threaded workers, complex trees, or distributed caches for tiny static payloads ($<1\text{KB}$ or $<50$ items) on cold paths.
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md` to align memory ceilings, stream backpressure, and batch sizes with `Upstream` DAs.
- **Empirical Verification (`<review_dir>/sandbox/Performance/`)**:
  - Author inline benchmark scripts in `<review_dir>/sandbox/Performance/bench_<name>.*` comparing proposed logic against baseline across realistic scale ($N = 10^4 \dots 10^5$, large payloads, or regex stress inputs) under a 15s timeout (monitor/kill hung tasks via `manage_task`). NEVER modify repository source files.
- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced APIs, indexes, and target locations exist and that producer/consumer boundaries are updated symmetrically.

  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  For in-scope defects (excluding optional non-blocking suggestions), classify as **Suggestion Only** if and only if both conditions hold:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, classify as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Mandatory Audit Checklist

1. **Algorithmic & Collection Complexity**: Are nested $O(N^2)$ loops, repeated linear scans over $>50$ items, `Array.shift()` queues, and catastrophic backtracking regexes (ReDoS) eliminated on hot paths?
2. **Event Loop, IPC & Local Runtime Throughput**: Are synchronous I/O/crypto/compression calls banned from active event loops, large IPC bridge payloads batched/streamed, and embedded SQLite writes wrapped in single transactions (`db.transaction`) under `WAL` mode?
3. **Database & Network I/O Efficiency**: Are queries backed by covering indexes, N+1 ORM loops replaced with batch/join prefetches, and large result sets paginated via keyset cursors?
4. **Stream Backpressure & Memory Bounds**: Are fast producers throttled to slow consumers, in-memory caches bounded with LRU/TTL eviction, and event listeners/timers cleaned up on teardown?
5. **Viewport Virtualization & Rolling Inactivity Timeouts**: Are large UI lists ($>100$ items) virtualized, and do long-running pipelines use rolling inactivity detection instead of rigid wall-clock timeouts?

## 3. Domain Subdocuments Routing Table

Read every subdocument whose trigger matches the target DA using your native file-reading tool:

| Target Subsystem Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Local Runtime, IPC & Embedded SQLite** | DA runs on Node/Desktop/CLI/Local runtimes, uses Electron/Tauri/Worker IPC, embedded SQLite, regexes, or in-memory caches | [`PERF-LOCAL-RUNTIME.md`](PERF-LOCAL-RUNTIME.md) |
| **Backend Database & Connection Pools** | DA executes relational/NoSQL queries, ORM relations, pagination, or server connection pooling | [`PERF-BACKEND-DATABASE.md`](PERF-BACKEND-DATABASE.md) |
| **Frontend DOM & Virtualization** | DA renders UI component trees, dynamic lists, or DOM layout measurements | [`PERF-FRONTEND-DOM.md`](PERF-FRONTEND-DOM.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Performance.md`, then notify Host via `send_message`:
- `STATUS: PASS`: Zero Blocking Defects under §2 checklist and loaded §3 subdocuments.
- `STATUS: REVISIONS NEEDED`: One or more Blocking Defects exist under §2 checklist or loaded §3 subdocuments.
- `STATUS: INFEASIBLE`: Throughput/latency requirement violates physical or platform ceilings (overrides fixable defects as overall status).

```markdown
### Review Evaluation: Performance

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready performance remediation specifying: (1) exact $O(1)$/batching/indexing/bounding code blocks and numeric thresholds, (2) all parallel hot-path branches & symmetrical sites, (3) any [NEW]/[MODIFY]/[DELETE] file manifest updates, and (4) synchronized test & Acceptance Criteria updates>
   - **Why This Would Be Missed**: <Why small-fixture headless CI tests miss this bottleneck or leak>
   - **Proof**: `Evidence:` <verified codebase symbol/schema `file:line`, or `<review_dir>/sandbox/Performance/` benchmark delta> | `Placement & Impact:` <why this hot-path/batching/indexing seam is the highest-leverage, minimum-complexity fix + affected callers/tickets, or `Local-only` for isolated leaf fixes>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical benchmark trace demonstrating platform ceiling>
   - **Alternative Architectural Paths**: <Viable pivot options>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Performance_Gated_Issues.md`, read it, execute ONE action below directly on `<review_dir>/reports/Performance.md`, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `Performance.md` in-place to supply verified `Proof` (`Evidence` and `Placement & Impact`), benchmark evidence, or symmetrical boundary updates.
2. **Remove**: Edit `Performance.md` in-place to remove speculative micro-optimizations on cold/tiny paths and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Performance_Explain.md` with deeper codebase/sandbox benchmark proof AND update `Performance.md` in-place. NEVER repeat stale arguments.
