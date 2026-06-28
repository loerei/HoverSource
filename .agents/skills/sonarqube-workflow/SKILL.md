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
* [ ] **Verify Locally**: 
  - Run unit tests (e.g. `npm run test`) to ensure logic is correct.
  - Call the `sonarcloud:analyze_code_snippet` tool (or `sonarqube:analyze_code_snippet` if running locally) to scan the modified file content directly.
  - **Verification Loop**: If any issues are found, fix them and re-scan the file. Repeat until the file has 0 issues.
* [ ] **Trigger Cloud Analysis & Set Timer**:
  - Commit và push thay đổi để kích hoạt pipeline CI phân tích cloud.
  - Sử dụng công cụ `schedule` để cài đặt một timer (ví dụ: `DurationSeconds=180`) để tự động thức dậy kiểm tra trạng thái CI, tránh việc kết thúc lượt mà không hẹn giờ hoặc chạy vòng lặp kiểm tra liên tục.
* [ ] **Wait and Verify Quality Gate**: Wait for the remote analysis pipeline to complete, then query `sonarcloud:get_project_quality_gate_status` or `search_sonar_issues_in_projects`. Do NOT mark the task as complete until the Quality Gate returns Green and no open issues remain.
* [ ] **API/Authentication Failure stopping rule**: If an MCP tool returns an authentication, permission, or connection error, STOP immediately and ask the user for credentials.

### Automated Multi-Issue Resolve Workflow (Continuous Loop)

When receiving a prompt like "solve all issues from sonarqube, either fix the code or mark as safe":
1. **Branch Isolation**: Create a dedicated git branch (e.g., `fix/sonar-cleanup`) to isolate the changes.
2. **Issue Selection & Resolution**:
   - Query all open issues for the project/PR.
   - For each issue: either fix the code surgically using `patchitright:patch_file` or mark it as safe (e.g., adding `// NOSONAR` or appropriate suppress comments) according to project conventions.
3. **Continuous Push & Wait Loop**:
   - Commit and push the changes to the branch.
   - Call `schedule` to set a timer (e.g., `DurationSeconds=180`) to wake up and check the CI status.
   - Upon wakeup, query SonarQube/SonarCloud issues again.
   - If issues persist, repeat from step 2.
4. **Finalization**: Do NOT stop or consider the task complete until the Sonar Quality Gate is green and there are 0 open issues. Suggest creating a PR or merging once clean.

## Advanced features

See [REFERENCE.md](REFERENCE.md) for common Sonar violations list, CPD duplication fixes, and MCP API quick-reference tables.
