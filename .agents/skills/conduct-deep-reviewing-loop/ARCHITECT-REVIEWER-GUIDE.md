# Architect Reviewer Guide

Audits whether the Directive Artifact (DA) specifies sound structural, boundary, and data-model architecture.

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, declared `Upstream` DAs, this guide, and matching §3 subdocuments. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Capture (`<review_dir>/sandbox/Architect/Findings.md`)**: To prevent lost-in-the-middle drift across large epics, immediately append each discovered defect (ticket/file location, defect, referenced symbols, symmetrical sites) as lightweight notes while reading. NEVER write prematurely to `<review_dir>/reports/Architect.md`.
  - **Synthesis & Forward Simulation**: After scanning the entire DA end-to-end, review `Findings.md` to reconcile cross-ticket interactions, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state to catch 2nd-order defects. Report all blocking defects in one pass directly to `<review_dir>/reports/Architect.md` via your native file-writing tool (NEVER write helper `.js`/`.py` scripts in `sandbox/Architect/` to generate or edit reports).
- **Lineage & Boundary Alignment**: Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` in `Context.md`:
  - `Upstream` (`Implemented` or `Unimplemented`): Adhere strictly to upstream types/schemas/seams; reject spec drift and reject duplicating upstream scope.
  - `Downstream`: Expose clean extension seams without coupling to downstream logic.
- **Fix Pre-Verification**:
  - **Verification Proof (`Evidence | Placement & Impact`)**: Verify on disk (or in upstream/target DA declarations) that every referenced symbol, type, or target file path exists and avoids export collisions (`Evidence`), and verify that the fix is placed at the highest-leverage, minimum-debt seam for the product's long-term maintainability/extensibility while updating callers/callees, module DAGs, and `Verification Plan` symmetrically (`Placement & Impact`).
  - **Zero-Loss Specification**: Provide concrete type/interface signatures or diffs where prose would drift; omit synthetic code blocks when declarative criteria are already deterministic.
- **Miss-Probability Gate (Headless AI Implementer Baseline)**:
  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  For in-scope defects (excluding optional non-blocking suggestions), classify as **Suggestion Only** if and only if both conditions hold:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, classify as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Mandatory Audit Checklist

1. **Current-State Ground-Truth, Placement Altitude & Long-Term Leverage**: Do the DA's stated current-state assumptions (live module logic, claimed code duplications, missing seams, and component locations) still match live code on disk (rejecting stale tasks that duplicate or clobber already-implemented hooks/abstractions)? Is the change placed at the highest-leverage layer/seam for the product's long-term maintainability, extensibility, debuggability, and updatability (not just a narrow local patch for today's ticket), using the minimum-complexity, minimum-tech-debt mechanism that achieves the objective cleanly without speculative indirection?
2. **Collection Topology**: Do hot paths and collections ($>50$ items) use optimal structures (`Map`, `Set`, `Ring Buffer`, `Trie`) instead of $O(N)$ linear array scans or `Array.shift()` sliding windows?
3. **State Normalization & Single Source of Truth**: Are relational entities stored normalized by ID (`byId`/`allIds`), with derived state computed via pure selectors rather than duplicated in stores?
4. **Illegal State Elimination**: Are mutually exclusive lifecycles modeled via Discriminated Unions / ADTs rather than multi-boolean flag soup?
5. **Ingress Parsing Membrane & Fail-Fast Core**: Are untrusted external payloads and persisted user/client state from prior installed versions (`localStorage`, `%APPDATA%`/`~/.config` JSON) parsed or migrated ($V_1 \to V_2$) at ingress/bootstrap boundaries ("Parse, Don't Validate", Postel's Law strictly at external boundaries) into immutable Value Objects / branded types, while internal domain pipelines fail fast on invariant violations without raw `Record<string, any>`, heuristic property sniffing (`if ('x' in obj)`), or cascading fallbacks (`a ?? b ?? c`)?
6. **Parameter Seams, Governance Decoupling & Utility Placement**: Are operational policies (timeouts, `AbortSignal`, buffer limits) injected as caller parameters down the call chain (never hardcoded leaf constants), operational watchdogs decoupled from domain codecs/parsers, and extracted domain-agnostic utilities (`watchdogs`, `retry`) placed at common ancestor scope (`src/utils/`, `src/common/`) without introducing speculative plugin registries or multi-tenant layers?
7. **Bootstrap Lifecycle Isolation**: Are schema migrations and config validation isolated to startup bootstrap rather than scattered as runtime fallback shims?
8. **Frontend Composition Seams**: Are presentational views pure, using compound components/slots instead of $>5$ boolean layout props, with global `window`/`document` listeners isolated in root providers?
9. **Module Cohesion & Strategy Decomposition**: Are polymorphic strategies, formats, or domain variants isolated in dedicated sibling modules rather than bundled into a monolithic file or inlined directly into coordinating facades and package entrypoints?
10. **Brownfield Parity, Product-First Precedence & Decommissioning Seams**: Under `Change Mode: BROWNFIELD`, follow Product-First Precedence (`User/PRD Directive > Existing Product Patterns & initial intended UXUI > Guide Defaults`), ensuring refactors and bug/tech-debt fixes converge toward `initial intended UXUI` rather than drifting from it. For every `[DELETE]` or replaced module/controller/binder, verify 100% of exported capabilities, cross-cutting runtime seams (i18n/localization bindings, theme/shortcut listeners, IPC/event subscriptions), and consumed/rendered data fields map 1-to-1 to replacement seams in `[NEW]`/`[MODIFY]` deliverables (with `Replaces: <legacy-file-path(s)>` cited on `[NEW]` replacements, or omissions explicitly declared `INTENTIONALLY_CHANGED`).

## 3. Domain Subdocuments Routing Table

Read every subdocument whose trigger matches the target DA using your native file-reading tool:

| Target Subsystem Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Domain Entities & Value Objects** | DA defines domain models, identifiers, monetary/unit quantities, or external payload ingress | [`ARCH-DATA-DOMAIN-ENTITIES.md`](ARCH-DATA-DOMAIN-ENTITIES.md) |
| **State Normalization & Collections** | DA defines in-memory state stores, caches, async lifecycle states, or collection lookups/buffers | [`ARCH-DATA-STATE-NORMALIZATION.md`](ARCH-DATA-STATE-NORMALIZATION.md) |
| **Monolith & Governance Seams** | DA modifies module boundaries, cross-package APIs, timeouts/watchdogs, feature toggles, or startup bootstrap | [`ARCH-MONOLITH-SEAMS.md`](ARCH-MONOLITH-SEAMS.md) |
| **Frontend Component Composition** | DA introduces or modifies UI components, layout containers, hooks, or global DOM/window listeners | [`ARCH-FRONTEND-COMPOSITION.md`](ARCH-FRONTEND-COMPOSITION.md) |
| **Preparatory Refactoring ($S \to B$)** | DA modifies legacy/tangled modules, high-complexity functions, or lacks structural/config/migration seams | [`ARCH-PREPARATORY-REFACTORING.md`](ARCH-PREPARATORY-REFACTORING.md) |
| **Distributed State & Sagas** | DA touches multi-node consensus, distributed locks, fencing tokens, or multi-step sagas | [`ARCH-DISTRIBUTED-STATE.md`](ARCH-DISTRIBUTED-STATE.md) |
| **Event-Driven & Messaging** | DA touches message brokers, event streams, pub/sub, transactional outboxes, or DLQs | [`ARCH-EVENT-DRIVEN.md`](ARCH-EVENT-DRIVEN.md) |
| **Library, SDK & Package Architecture** | DA designs or modifies a reusable library, SDK, plugin, or shared monorepo package | [`ARCH-LIBRARY-SDK.md`](ARCH-LIBRARY-SDK.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Architect.md`, then notify Host via `send_message`:
- `STATUS: PASS`: Zero Blocking Defects under §2 checklist and loaded §3 subdocuments.
- `STATUS: REVISIONS NEEDED`: One or more Blocking Defects exist under §2 checklist or loaded §3 subdocuments.
- `STATUS: INFEASIBLE`: Core premise violates hard platform/technical constraints (overrides fixable defects as overall status).

```markdown
### Review Evaluation: Architect

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready structural remediation specifying: (1) exact interface/type/code blocks, (2) all parallel branches & symmetrical producer/consumer sites across PRD/tickets, (3) any [NEW]/[MODIFY]/[DELETE] file manifest or Blocked-by updates, and (4) synchronized test & Acceptance Criteria updates>
   - **Why This Would Be Missed**: <Why headless AI implementation silently misses this or why symptom does not reveal generalized fix>
   - **Proof**: `Evidence:` <verified codebase/upstream `file:line` and symbol, or non-colliding target path> | `Placement & Impact:` <why this layer/seam is the highest-leverage, minimum-debt root fix (not a local band-aid) + affected callers/DAG/tickets, or `Local-only` for isolated leaf fixes>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical proof and codebase/platform evidence of hard constraint>
   - **Alternative Architectural Paths**: <Viable architectural pivot options>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Architect_Gated_Issues.md`, read it, execute ONE action below directly on `<review_dir>/reports/Architect.md`, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `Architect.md` in-place to supply verified `Proof` (`Evidence` and `Placement & Impact`), symmetrical boundary endpoints, or harmonized section assertions (if converting an ungrounded impasse to fixable, update status to `STATUS: REVISIONS NEEDED`).
2. **Remove**: Edit `Architect.md` in-place to remove the invalid/false-positive issue and update `- **Status**:` (`STATUS: PASS` if 0 blocking issues remain, else `STATUS: REVISIONS NEEDED`).
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Architect_Explain.md` with deeper/differing codebase evidence AND update `Architect.md` in-place with the substantiated proofs. NEVER repeat stale arguments; if re-gated as stale, refine or remove.
