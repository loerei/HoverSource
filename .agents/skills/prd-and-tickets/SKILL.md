---
name: prd-and-tickets
description: Use when creating, splitting, or reconciling local PRDs and dependency-ordered tickets from specs.
---

# PRD and Tickets

Synthesize conversation context and codebase understanding into one or more local Epic directories (`docs/specs/<NN>-<epic-slug>/PRD.md` and `tickets/<key>-<slug>.md`) ready for `conduct-deep-reviewing-loop`, `gitpublish-prd-and-tickets`, and `implement-with-subagents`.

## Workflow

1. **Explore Codebase & Seams**:
   - Inspect current modules, domain glossary vocabulary, and ADRs in the target area.
   - On brownfield tasks (features, refactors, or migrations touching existing surfaces), inventory existing stylesheets/selectors, cross-cutting runtime binders (i18n/localization, theme, shortcuts, IPC/event subscriptions, custom protocols/CSP), consumed data fields, and existing test cases so zero live capabilities are silently dropped.
   - Identify the highest existing testing seams (or propose minimal new high-level seams).
2. **Draft PRD Boundaries, Ticket Breakdown & Align with User**:
   - **Evaluate PRD boundaries first**: Do NOT force multi-part scope into a single PRD, even if the prompt uses singular phrasing or names a starting PRD number (e.g. `"create PRD <NN>"`), unless the user explicitly forbids splitting. Default to 1 cohesive PRD for single-cycle scope; when the requested scope spans substantial independent deliverables/subsystems or risks overloading one review/implementation cycle, evaluate `2+` PRDs per `## Multi-PRD Boundaries & Splitting` and propose the boundaries and numbering in your alignment report before slicing tickets or writing files.
   - Slice each Epic into dependency-ordered tickets (`01`, `02`, `03.1`, etc.):
     - **Vertical tracer-bullet slices (default)**: Cut a narrow, complete, verifiable path through every layer (schema/domain, IPC/API, UI, tests) sized to fit in a single context window. Put prefactoring tickets first ("Make the change easy, then make the easy change").
     - **Wide-refactor exception (`expand-contract`)**: When a mechanical change has a codebase-wide blast radius that cannot land green as a vertical slice, sequence it as: (1) *Expand* (add new alongside old), (2) *Migrate* in blast-radius batches (each batch blocked by Expand, keeping CI green), and (3) *Contract* (remove old form once zero callers remain, blocked by all Migrate batches).
   - Present the PRD boundaries (if `2+`), testing seams, and numbered ticket breakdown (`Key & Title`, `Blocked by`, `What it delivers`) to the user and confirm granularity and blocking edges before writing files.
3. **Write Local `PRD.md` and `tickets/*.md`**:
   - For each approved Epic, write `docs/specs/<NN>-<epic-slug>/PRD.md` and one file per ticket under `docs/specs/<NN>-<epic-slug>/tickets/<key>-<slug>.md` using the templates below.
   - **Dual-Layer Checkbox & In-Place File Anchors**: Every ticket MUST include valid GFM task-list checkboxes (`- [ ]`) on **both** `## What to Build` deliverables (`- [ ] 1. **<Deliverable Title>**:`) and `## Acceptance Criteria` items (`- [ ] <Criterion>`). Keep checkbox lines concise by listing target file links (`**[NEW|MODIFY|DELETE]** [file.ext](file:///...)`) on an indented `- **Files:**` sub-bullet directly under each deliverable; NEVER create a separate `## Target Files` section that duplicates `## What to Build`.
   - **Brownfield Equivalence & Unasked-Change Guard**: On brownfield or refactor tickets, frame replacement deliverables explicitly as `Replace <legacy> with <new> preserving initial intended UXUI` (and append `(Replaces: [legacy.ext](file:///...))` on `[NEW]` entries in `- **Files:**`) so the spec separates underlying implementation changes (DOM to VDOM, file relocation, state store) from invariant user-facing UXUI. Include the standing `Scope Guard` line in `## What to Build` forbidding unrequested edits, restyling, or removals.
   - **Prototype Snippet Rule**: Avoid fragile line numbers; inline concise decision-encoding snippets (state machines, schemas, type contracts, reducers) when they specify contracts more accurately than prose. In brownfield repositories, snippets MUST reuse verified CSS selectors, i18n/localization lookups, and DTO/state fields from disk — NEVER invent placeholder class names or hardcode sample English strings where an active i18n seam exists.
4. **Downstream Handoff**:
   - Do not publish directly from this skill. Hand off to `conduct-deep-reviewing-loop` for specification auditing or `gitpublish-prd-and-tickets` to sync `PRD.md` and `tickets/*.md` to GitHub Issues.

## Reconcile / Migrate Existing Specs

When invoked on an existing `<epic-dir>` (`docs/specs/<NN>-<epic-slug>/`):
1. **Resolve Baseline Commit**: Read `Reviewed-At-Commit` from `PRD.md`; if missing, run `git log -n 1 --format=%H -- <epic-dir>` (if empty/untracked, skip the `git log` range and inspect live files on disk directly in Step 2).
2. **Audit Drift & Live Ground Truth**: Run `git log --oneline <baseline>..HEAD -- <touched-paths>` and inspect live files on disk to verify that all referenced paths, symbols, contracts, dependencies, and ticket dependencies still hold against current codebase state (flagging any obsolete, already-implemented, or conflicting specs). If `PRD.md` declares a completed `Upstream Prerequisite`, also compare the downstream spec against (a) the upstream PRD's pre-review snapshot in its review-loop trace vault (`/tmp/deep-review-trace-<short_title>/00-initial-context/da-initial/`, falling back to git history if no trace vault exists), (b) the upstream PRD's final post-review state on disk, and (c) the live implemented code, adapting the downstream spec to the upstream's optimized architecture.
3. **Audit Template & Invariant Parity**: Diff `PRD.md` and `tickets/*.md` against `## Workflow` (step 3 invariants) and `## Templates`; automatically stage format migration updates wherever the existing spec omits or drifts from current requirements.
4. **Draft Update Plan -> Approve -> Apply**: If zero drift and zero format/brownfield gaps are found, report `"No updates needed"` with the verified baseline commit and stop without editing. Otherwise, present a compact per-file delta table (`File | Drift / Gap | Proposed Update`) and wait for approval before editing (unless explicit edit approval is active).

## Multi-PRD Boundaries & Splitting

When deciding whether a new scope should produce `2+` PRDs, or splitting an existing `<epic-dir>` via `!SPL`:
1. **Cohesion-First Cut Gate**: NEVER split solely by ticket count or file size, and do NOT fragment a small single-cycle scope into multiple PRDs unnecessarily. Split ONLY when the scope spans substantial independent deliverables/subsystems or risks overloading one review/implementation cycle AND a zero-coupling or light one-way dependency boundary exists where each resulting PRD is independently cohesive and optimizable on its own (e.g., independent vertical feature/bounded-context slices or strangler subsystem phases). NEVER freeze unreviewed downstream seams inside an upstream PRD; the upstream PRD MUST remain free to optimize independently during review.
2. **Cohesion Veto**: If every candidate cut splits tightly coupled logic or requires co-optimizing both parts together, keep as a single PRD (or refuse `!SPL`), report the coupled seams to the user, and stop without splitting.
3. **Propose -> Approve -> Apply**: Present the multi-PRD plan (`Epic | Scope | Cross-PRD Dependency`) and wait for approval before writing files (unless explicit edit approval is active). Name directories `docs/specs/<NN>-<slug>/`, `docs/specs/<NN+1>-<slug>/` when creating multiple PRDs during initial planning, or `docs/specs/<NN>.1-<slug>/`, `docs/specs/<NN>.2-<slug>/` (dot-numbered `.n`, never letter suffixes) when splitting an existing `<NN>` PRD, with cleanly numbered tickets in each. For any sequentially dependent downstream PRD, record `Upstream Prerequisite: <upstream-epic-dir>` in its `PRD.md` and remind the user to run `!REC <downstream-epic-dir>` after the upstream PRD completes review and implementation.

## Templates

### 1. `docs/specs/<NN>-<epic-slug>/PRD.md`

```markdown
# PRD: <Epic Title>

- **Change Mode:** `BROWNFIELD | GREENFIELD`
- **Reviewed-At-Commit:** `<HEAD SHA>`
- **Upstream Prerequisite:** `<upstream-epic-dir>` *(optional; include when sequentially dependent on a prior PRD)*

## Problem Statement
The user-facing or architectural problem and root causes.

## Solution
High-level architectural and user-facing solution.

## User Stories
1. As a <actor>, I want <capability>, so that <outcome>.

## Implementation Decisions
- Modules, interfaces, schemas, state invariants, and API contracts to build or modify.

## Intentional Deltas
> **Default Preserve (`BROWNFIELD`):** All existing observable behavior, contracts, and `initial intended UXUI` default to **PRESERVE**; only deltas explicitly listed below may change (omit section under `GREENFIELD`).
- **`INTENTIONALLY_CHANGED`**: <Explicit behavioral, visual, or contract deltas authorized by this PRD.>

## Testing Decisions
- Target seams, behavioral test philosophy, and prior art in the repository.

## Out of Scope
- Explicit non-goals and deferred work.

## Tickets
- `01` — <Title> (`tickets/01-<slug>.md`)
- `02` — <Title> (`tickets/02-<slug>.md`)
```

### 2. `docs/specs/<NN>-<epic-slug>/tickets/<key>-<slug>.md`

```markdown
# <Key> — <Ticket Title>

## Epic
PRD: <Epic Title>

## Status
ready-for-agent

## Blocked by
- `<upstream-key>` — <Upstream Title> (or `None — can start immediately`)

## What to Build
> **Scope Guard:** Implement only what is explicitly specified; preserve initial intended UXUI and all unmentioned existing behaviors. Do NOT alter, restyle, or remove anything unasked.

End-to-end behavior and concrete file/module deliverables for this slice. Every deliverable MUST start with a short GFM task-list checkbox (`- [ ] 1. **<Title>**:`) followed immediately by an indented `- **Files:**` sub-bullet anchoring its target file(s) (do NOT create a separate `## Target Files` section):

- [ ] 1. **<Deliverable / Module Title>**:
  - **Files:** **[NEW|MODIFY|DELETE]** [`src/path/to/file.ts`](file:///absolute/path/to/src/path/to/file.ts) *(if replacing legacy code: `(Replaces: [src/path/to/legacy.ts](file:///...))`)*
  - Contract, state transitions, and edge-case rules *(on brownfield replacements: `Replace <legacy> with <new> preserving initial intended UXUI`)*.
- [ ] 2. **<Test Suite Title>**:
  - **Files:** **[NEW|MODIFY|DELETE]** [`src/path/to/file.test.ts`](file:///absolute/path/to/src/path/to/file.test.ts)
  - Behavioral test cases and boundary assertions.

## Acceptance Criteria
- [ ] <Concrete, testable behavioral or structural assertion 1>
- [ ] <Concrete, testable behavioral or structural assertion 2>
- [ ] Execute automated verification command: `<test-and-typecheck-command>`.

## Verification Command
```bash
<test-and-typecheck-command>
```
```

## Domain Terms and Tag Commands

- **`!REC <path>` (Reconcile & Migrate Existing Specs)**: Audit an existing `<epic-dir>` against intervening commits, live code, and current spec templates/invariants, automatically flagging format migrations whenever schema or template drift is detected (Default: `none (requires path or active epic context)`; Timing: `Start-time`).
  - **Agent Action**:
    1. Run steps 1–4 of `## Reconcile / Migrate Existing Specs` against `<path>`.
    2. If zero drift or format/brownfield gaps are found, report `"No updates needed"` and stop; otherwise output the per-file Update Plan (`File | Drift / Gap | Proposed Update`, covering both code drift and template/brownfield format migrations) and stop for user approval unless explicit edit approval is active.
- **`!SPL <path>` (Split Oversized PRD)**: Evaluate and split an oversized `<epic-dir>` into independently cohesive PRDs per `## Multi-PRD Boundaries & Splitting`, refusing to split if high coupling triggers the Cohesion Veto (Default: `none (requires path or active epic context)`; Timing: `Start-time`).
  - **Agent Action**:
    1. Run `## Multi-PRD Boundaries & Splitting` against `<path>` (applying the Cohesion-First Cut Gate and Cohesion Veto).
    2. If no low-coupling cut exists, refuse to split, report the coupled seams, and stop; otherwise present the multi-PRD plan (`Epic | Scope | Cross-PRD Dependency`) and stop for user approval before writing files unless explicit edit approval is active.
