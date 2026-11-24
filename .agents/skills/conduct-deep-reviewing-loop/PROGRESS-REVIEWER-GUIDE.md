# Progress Reviewer Guide

Audits whether the Directive Artifact (DA) establishes an incremental, dependency-ordered execution progression across phases, milestones, and tickets.

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, declared `Upstream` DAs, this guide, and matching §3 subdocuments. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Capture (`<review_dir>/sandbox/Progress/Findings.md`)**: To prevent lost-in-the-middle drift across large epics, immediately append each discovered WBS gap, dependency cycle, unsequenced step, or slicing defect (ticket/file location, defect, affected dependencies, proposed restructuring) as lightweight notes while reading. NEVER write prematurely to `<review_dir>/reports/Progress.md`.
  - **Synthesis & Forward Simulation**: After scanning the entire DA end-to-end, review `Findings.md` to reconcile cross-ticket execution ordering, eliminate false positives, group shared root causes, mentally apply all proposed transformations, and re-audit the projected ticket DAG. Report all WBS, sequencing, and slicing defects in one pass directly to `<review_dir>/reports/Progress.md` via your native file-writing tool (NEVER write helper `.js`/`.py` scripts in `sandbox/Progress/` to generate or edit reports).
- **Lineage & Operational Continuity Alignment**:
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md` so target tickets do not duplicate or invert `Upstream` milestones.
  - Read `## Operational Continuity` in `<review_dir>/Context.md` and enforce the matching phasing/slicing model:

| Operational Continuity Mode | Required Phasing & Verification Model |
| :--- | :--- |
| `CONTINUOUS_OPERATION` *(default: 24/7 live service)* | Enforce vertical tracer-bullet slicing (UI-to-DB), zero-downtime $N$ & $N+1$ compatibility, and expand-contract phasing at every ticket. |
| `NON_CONTINUOUS_OPERATION` *(tag `!NC`: offline upgrades/refactors, local/desktop/CLI apps, greenfield builds, or isolated rewrite branches)* | Permit horizontal foundation phasing during implementation; BAN throwaway UI mocks on early tickets and BAN 24/7 multi-deploy dual-write shims; enforce headless atomic testability on early tickets, sequential migration script staging ($S \to B$) when persistent schemas evolve, and full system cutover with bootable verification (including real-runtime render/CSP/computed-style smoke checks on UI epics) + legacy decommissioning at the terminal ticket. |
| `NON_CONTINUOUS_INTERMEDIATE` *(tag `!NC0` / `!NCI`: intermediate scaffolding)* | Enforce headless contract verification (unit tests, typecheck, export schemas) and downstream handoff integrity only. BAN demanding application bootability, UI rendering, migration runners, or runtime cutovers during OR after the epic. |

- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced modules, files, and tickets exist and boundary contracts remain symmetrical across split/reordered tickets.
  - Never flag syntax/type trivia in illustrative code snippets as blocking; demand an Acceptance Criterion instead.
  - **Observer Identity**: Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  - Classify as **Blocking Defect** only issues that silently cause delivery deadlocks, unverified big-bang integration accumulation, forward/circular dependencies, missing replacement/decommissioning lineage, or unexecutable slices for a headless AI implementer (include `Why This Would Be Missed`). If a ticket premise is impossible under platform bounds, return `STATUS: INFEASIBLE`.

## 2. Mandatory Audit Checklist & WBS Action Primitives

1. **Ticket Granularity & Atomic Checkboxes**: Is every ticket an independently verifiable slice, and is every `- [ ]` step a single-turn atomic modification followed by automated verification?
2. **Topological DAG Soundness**: Are ticket and step sequences strictly acyclic with zero forward dependencies (e.g. Ticket $N$ consuming APIs built in Ticket $N+2$)?
3. **Tidy First Isolation ($S \to B$)**: Are preparatory structural refactorings ($S$), config modernizations, and schema migration runner setups isolated into prerequisite steps/tickets before behavioral feature steps ($B$)?
4. **Plan Decomposition Threshold**: Does a single-file plan bundle 2+ discrete deliverables requiring staged sequential verification gates (requiring `DECOMPOSE_PLAN_TO_PRD_AND_TICKETS`), or is it a single cohesive deliverable verifiable in one test run (which MUST remain a single file)?
5. **Brownfield Replacement & Decommissioning Lineage**: Under `Change Mode: BROWNFIELD`, does every `[NEW]` deliverable replacing legacy code declare `Replaces: <legacy-file-path(s)>` in its ticket (so isolated ticket implementers inspect the exact legacy files on disk), and are `[DELETE]` decommissioning steps sequenced ONLY after 100% of the retired files' capabilities, cross-cutting binders (i18n/localization, shortcuts, theme), and data fields are wired in upstream tickets?

### Structured WBS Action Primitives
Formulate every blocking finding using one of these exact action tags:
- **Document-Level**: `DECOMPOSE_PLAN_TO_PRD_AND_TICKETS` (splits multi-gate single-file plan into `<epic_dir>/PRD.md` + `<epic_dir>/tickets/01-...md`).
- **Macro (PRD ↔ PRD)**: `MERGE_PRDS`, `SPLIT_PRD`, `REORDER_PHASES`.
- **Cross-Level (PRD ↔ Ticket)**: `EXTRACT_PRD_FROM_TICKETS`, `RELOCATE_TICKET`, `DEMOTE_PRD_TO_TICKET`.
- **Micro (Ticket ↔ Ticket)**: `SPLIT_TICKET_TRACER_BULLETS` (MUST use symmetrical **Hierarchical Dot Notation** `3.1, 3.2` or `3.2.1, 3.2.2`; **NEVER renumber downstream tickets** `04 -> 05`), `MERGE_TICKETS`, `REORDER_TICKETS`, `INJECT_SCAFFOLDING_TICKET`, `[IMPASSE]`.
- **Nano (Step ↔ Step inside Ticket)**: `SPLIT_STEP`, `REORDER_STEPS`, `EXTRACT_STEP_TO_TICKET`, `INJECT_VERIFICATION_STEP`, `ISOLATE_STEP_TIDYING`.

## 3. Domain Subdocuments Routing Table

Always load `PROG-COMMON-WBS.md` plus the subdocument matching `## Operational Continuity` in `Context.md` using your native file-reading tool:

| Target Operational Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Universal WBS Invariants** | Mandatory for all Progress audits | [`PROG-COMMON-WBS.md`](PROG-COMMON-WBS.md) |
| **24/7 Continuous Operation** | `Operational Continuity: CONTINUOUS_OPERATION` in `Context.md` | [`PROG-CONTINUOUS-OPERATION.md`](PROG-CONTINUOUS-OPERATION.md) |
| **Non-Continuous / Offline / Intermediate** | `NON_CONTINUOUS_OPERATION` (`!NC`) or `NON_CONTINUOUS_INTERMEDIATE` (`!NC0` / `!NCI`) in `Context.md` | [`PROG-NON-CONTINUOUS-OPERATION.md`](PROG-NON-CONTINUOUS-OPERATION.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Progress.md`, then notify Host via `send_message`:
- `STATUS: PASS`: Zero Blocking Defects under §2 checklist and loaded §3 subdocuments.
- `STATUS: REVISIONS NEEDED`: One or more Blocking Defects exist under §2 checklist or loaded §3 subdocuments.
- `STATUS: INFEASIBLE`: Core ticket/phase premise violates hard platform constraints (overrides fixable defects as overall status).

```markdown
### Review Evaluation: Progress

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable WBS Defects -->
1. **[<ACTION_NAME>] <Issue Title>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Target Destination**: `<Target_Files_or_New_PRD_Path>`
   - **Technical Rationale**: <Why restructuring is required for dependency soundness or continuity alignment>
   - **Why This Would Be Missed**: <Why headless AI implementation hits a deadlock, forward dependency, or big-bang failure>
   - **Required Transformation**: <Diff-ready WBS transformation specifying: (1) exact split/merged/reordered steps or tickets, (2) symmetrical interface, Blocked-by DAG, and [NEW]/[MODIFY]/[DELETE] file manifest updates across PRD and sibling tickets, and (3) synchronized Verification Command & Acceptance Criteria updates>
   - **Proof**: `Evidence:` <verified codebase/spec paths and non-colliding target locations> | `Placement & Impact:` <why this WBS restructuring/seam staging ($S \to B$) is the highest-leverage, minimum-debt sequence + proof that the resulting phase/ticket DAG is acyclic and verifiable>

<!-- For Infeasible WBS Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[IMPASSE] <Issue Title>**:
   - **Target Scope / Source**: `<Source_Files_or_Tickets>`
   - **Technical Rationale**: <Why the ticket/phase premise is impossible>
   - **Infeasibility Proof**: <Empirical proof of hard platform constraint>
   - **Alternative Architectural Paths**: <Viable pivot options>
   - **DAG Impact**: <Impact on milestone dependency DAG>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Progress_Gated_Issues.md`, read it, execute ONE action below directly on `<review_dir>/reports/Progress.md`, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `Progress.md` in-place to supply verified `Proof` (`Evidence` and `Placement & Impact`), symmetrical boundary updates, or harmonized section assertions.
2. **Remove**: Edit `Progress.md` in-place to remove the invalid/false-positive issue (e.g. demanding vertical slicing on `!NC` or decomposing a cohesive single-run plan) and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Progress_Explain.md` with deeper codebase dependency evidence AND update `Progress.md` in-place. NEVER repeat stale arguments.
