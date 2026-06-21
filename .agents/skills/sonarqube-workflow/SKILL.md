---
name: sonarqube-workflow
description: SonarQube and SonarCloud unified workflow. Fetch and resolve code quality issues using MCP tools. Use when checking SonarCloud/SonarQube issues or fixing quality gate violations.
---

# SonarQube & SonarCloud Unified Workflow

Fetch and resolve SonarCloud/SonarQube issues using MCP tools directly.

## Quick start

Fetch open issues for a project (e.g. `loerei_HoverSource`):
1. Call `sonarcloud:search_sonar_issues_in_projects` with `projects=["loerei_HoverSource"]` and `issueStatuses=["OPEN"]`.
2. For active PRs, also include the `pullRequestId`.

## Workflows

### Setup & CI Detection

* [ ] **Detect SonarQube Cloud CI Setup**:
  - If the project does not yet have SonarQube Cloud's CI-based analysis configured, suggest running `/sonarcloud-ci-setup` to configure the GitHub Actions workflow pipeline.
  - Suggest and guide the user to disable **Automatic Analysis** in the SonarCloud console (under **Administration** -> **Analysis Method**, toggle off **Automatic Analysis**) to avoid conflicting analyses.

### Clean-Code Action Checklist

* [ ] **Refresh Search Index**: Update the jCodeMunch index before searching files:
  - Call `jcodemunch:index_folder` with `path` and `use_ai_summaries=false`.
* [ ] **Batch-Retrieve Issues**: Query all open issues for the target file in one call using `sonarcloud:search_sonar_issues_in_projects` with `issueStatuses=["OPEN"]`.
* [ ] **Batch-Refactor Violations**:
  - Solve multiple related smells in the target file at once.
  - For surgical search-and-replace, always use `patchitright:patch_file` (strict snake_case parameters).
* [ ] **Verify Locally**: Run unit tests (e.g. `npx vitest run`) to ensure logic is correct.
* [ ] **Trigger Cloud Analysis**: Commit and push changes to trigger the cloud analysis pipeline.
* [ ] **Wait and Verify Quality Gate**: Wait for the remote analysis pipeline to complete, then query `sonarcloud:get_project_quality_gate_status` or `search_sonar_issues_in_projects`. Do NOT mark the task as complete until the Quality Gate returns Green and no open issues remain.
* [ ] **API/Authentication Failure stopping rule**: If an MCP tool returns an authentication, permission, or connection error, STOP immediately and ask the user for credentials.

## Advanced features

See [REFERENCE.md](REFERENCE.md) for common Sonar violations list, CPD duplication fixes, and MCP API quick-reference tables.
