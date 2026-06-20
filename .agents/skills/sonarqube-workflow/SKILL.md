---
name: sonarqube-workflow
description: SonarQube and SonarCloud unified workflow. Analyze, refactor, and verify code quality. Use when checking SonarQube/SonarCloud issues, running code quality scans, or fixing complexity/security issues.
---

# SonarQube & SonarCloud Unified Workflow

Use this skill to optimize analyzing, batch-fixing, and verifying SonarQube/SonarCloud code quality issues with minimal token overhead and waiting cycles.

## Quick start

Execute the PowerShell helper scripts bundled with this skill to start containers and run scans:

```powershell
# 1. Start Postgres and SonarQube containers
.agents/skills/sonarqube-workflow/scripts/start-sonar.ps1

# 2. Run scanner (auto-detects project key, prompts/reads token)
.agents/skills/sonarqube-workflow/scripts/run-scanner.ps1 -Token "YOUR_TOKEN"
```

## Workflows

### Clean-Code Action Checklist

* [ ] **Refresh Search Index First**: If files were recently changed locally or in git, update the jCodeMunch index *before* performing any searches:
  - Call `jcodemunch:index_folder` with `path` and `use_ai_summaries=false` (incremental update).
* [ ] **Batch-Retrieve Open Issues**: Query all open issues for the target component/file in one step using `sonarqube:search_sonar_issues_in_projects` with `issueStatuses=["OPEN"]`. Do NOT query them one-by-one.
* [ ] **Batch-Refactor Violations**:
  - Solve multiple related smells (negated conditions, optional chaining, redundant types) in the target file at once.
  - For surgical search-and-replace, always use `patchitright:patch_file`.
* [ ] **Verify Locally First**: Run all local unit tests (e.g. `npx vitest run` or `npm test`) *before* executing the Sonar scanner. Fix any logic errors immediately.
* [ ] **Run local scan**: Execute the local scan command using the PowerShell helper to update the SonarQube database.
* [ ] **Safe PR Flow**: Before creating or merging pull requests, clear env variables: `$env:GITHUB_TOKEN=$null` to avoid GitHub CLI conflicts.

## Advanced features

For detailed properties, configurations, common Sonar violations, and MCP tool quick-reference tables (so you do not have to read JSON schemas), see:
* [REFERENCE.md](REFERENCE.md)
* Script: [start-sonar.ps1](scripts/start-sonar.ps1)
* Script: [run-scanner.ps1](scripts/run-scanner.ps1)
