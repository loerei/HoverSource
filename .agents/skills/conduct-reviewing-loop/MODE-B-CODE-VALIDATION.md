# Mode B: Post-Implementation Coverage Validation Reference

> [!IMPORTANT]
> **Audience: MAIN AGENT ONLY.**  
> This document contains prompt synthesis templates and orchestration protocols for the Main Agent.  
> **NEVER** pass this file or its path under `Required Reading` to Subagent Reviewers. Subagents must be given [REVIEWER-CODE-VALIDATION.md](REVIEWER-CODE-VALIDATION.md) and [REVIEWER-ANTI-LAZINESS.md](REVIEWER-ANTI-LAZINESS.md).

Templates, checklist builders, and diff artifact protocols for validating codebase implementation against an approved plan or PRD/ticket set.

---

## 1. Mode B: Post-Implementation Coverage Validation Prompt Template

Use when creating `scratch/reviewer_prompt_v1.md` to audit actual code changes against an APPROVED spec (`implementation_plan.md`, or `PRD.md` + `tickets/*.md`):

```markdown
You are Implementation Coverage Validator #<N>. Audit the codebase implementation against the approved Specification.

### Audit Goal:
Verify that 100% of the features, safety guarantees, edge-case fixes, schema definitions, and `BROWNFIELD` parity boundaries (`## Intentional Deltas`) specified in the approved spec are accurately, completely, and correctly implemented in the real codebase — with zero unasked scope creep. Do NOT invent new requirements or alter the approved specification.

### Required Reading (MUST read using your file-reading or search tools):
1. Approved Specification: `<spec_path(s)>` (`implementation_plan.md`, or `PRD.md` + `tickets/*.md` — check `Change Mode`, `Reviewed-At-Commit`, `## Intentional Deltas`, and `Replaces:` lineage if present)
2. Diff Artifact(s): `<diff_path(s)>` (e.g. `<scratch_dir>/patch_changes.diff` or per-file `<scratch_dir>/diffs/*.diff`)
3. Key Codebase & Test Files: `<code_file_paths>`
4. Repository Guidelines: `AGENTS.md`
5. Reviewer Discipline & Output Protocol: `<skill_dir>/REVIEWER-CODE-VALIDATION.md`
6. Anti-Laziness Audit Criteria: `<skill_dir>/REVIEWER-ANTI-LAZINESS.md`
7. Task-Specific Domain Skills: `<task_domain_skill_paths>`

### Dynamic Coverage Verification Checklist:
1. **Spec Feature & Checkbox Coverage**: Does the codebase implement 100% of specified deliverables and mark completed `- [x]` items accurately against real code and tests?
2. **Brownfield Parity & Scope Creep Guard**: Under `BROWNFIELD`, are all unmentioned observable behaviors, contracts, `initial intended UXUI`, and legacy `Replaces:` / `[DELETE]` seams preserved cleanly with zero unauthorized edits outside `INTENTIONALLY_CHANGED`?
3. **Runtime & Verification Coverage**: Are acceptance criteria backed by passing automated tests, typechecks, and build checks (no skipped or tautological assertions)?
4. **Safety, Edge-Case & Transactional Guarantees**: Are rollback, cleanup, crash recovery, boundary checks, and cross-platform/encoding paths handled correctly?
5. **Domain Standards & Validation**: Are API/tool schemas, validation, state machines, and repository rules (`AGENTS.md`) satisfied?

*Evaluate strictly per `<skill_dir>/REVIEWER-CODE-VALIDATION.md` and `<skill_dir>/REVIEWER-ANTI-LAZINESS.md` (resolving `<skill_dir>` relative to the active skill location).*
```

---

## 2. Post-Implementation Coverage Validation Checklist (Main Agent Guidance)

When synthesizing the prompt checklist, ensure coverage across:

- [ ] 100% of spec targets, ticket deliverables/ACs, and verification checks verified in diff, target files, and test stdout
- [ ] Zero unasked scope creep or `BROWNFIELD` UXUI/contract drift outside `## Intentional Deltas` (`INTENTIONALLY_CHANGED`)
- [ ] Zero forbidden placeholder comments (`// ...`, `// TODO`, empty stubs) per [REVIEWER-ANTI-LAZINESS.md](REVIEWER-ANTI-LAZINESS.md)
- [ ] Adherence to task-specific domain skills (`<task_domain_skill_paths>`) and `AGENTS.md` verified
- [ ] Unit/integration tests added covering new edge cases specified in the spec
- [ ] Tool/API schemas and parameter contracts match spec definitions
- [ ] Rollback, cleanup, and error recovery verified in code
- [ ] Non-goals / `Out of Scope` exclusions preserved (explicitly untouched)

---

## 3. Mode B Diff Artifact & Immutable Spec Protocol

1. **Generate Diff Artifact(s)**: Resolve the base ref (`Reviewed-At-Commit` from `PRD.md` or `origin/<default-branch>`), capturing both committed and working tree edits:
   - **Standard (`patch_changes.diff`)**: Run `git diff <base-ref>` and save the untruncated patch to `<scratch_dir>/patch_changes.diff`.
   - **Large multi-file diff sharding**: When a single patch would overload context, export per-file diffs into `<scratch_dir>/diffs/` (via `git diff --name-only <base-ref>` + per-file `git diff`, or `export-diffs.js --update --json` if available) and supply the file list + targeted diff paths.
2. **Provide 3-Way Context**: Supply the subagent reviewer with:
   - Approved spec path(s) (`implementation_plan.md`, or `PRD.md` + `tickets/*.md`).
   - Diff artifact path(s).
   - Core codebase implementation and test files.
3. **Iterative Diff Regeneration**: In Mode B, after applying codebase fixes in iteration $N$, regenerate updated diff artifact(s) before spawning Reviewer $N+1$.
4. **Immutable Spec Principle**: In Mode B, the approved spec is treated as immutable. Reviewers must NOT request edits to the spec; any discrepancy between spec and code must be resolved by fixing the **codebase**.
