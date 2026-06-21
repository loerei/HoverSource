---
name: sonarcloud-ci-setup
description: Configure, integrate, and optimize SonarCloud CI-based analysis workflows via GitHub Actions. Use when setting up SonarCloud scanning, configuring workflows, or optimizing Sonar projects for automated pull request checks.
---

# SonarCloud CI Setup

Use this skill to configure, integrate, and optimize SonarCloud CI-based analysis workflows via GitHub Actions.

## Quick start

To integrate SonarCloud scanning into GitHub Actions:

1. Setup `sonar-project.properties` in project root.
2. Setup GitHub Actions workflow `.github/workflows/sonarcloud.yml`.
3. Disable "Automatic Analysis" in SonarCloud Administration.
4. Set GitHub Secret `SONAR_TOKEN`.

## Workflows

### Setup & Optimization Checklist

* [ ] **Configure Project Properties**: Create `sonar-project.properties`. Ensure `sonar.sources` and exclusions are set to prevent false-positive duplication checks (e.g. excluding test and build files).
* [ ] **Write Optimized Workflow**: Create `.github/workflows/sonarcloud.yml`.
  - **Branch Trigger**: Ensure the branch trigger (e.g. `main` or `master`) matches the repository's default branch.
  - **Static Analysis (Fast)**: Do NOT install dependencies (`npm ci` / `yarn install`). Only run checkout (`fetch-depth: 0`) and SonarSource scan action.
  - **Coverage Analysis**: If coverage is required, use Node caching (`cache: 'npm'`) to speed up setup.
* [ ] **Deactivate Autoscan**: In SonarCloud console -> **Administration** -> **Analysis Method**, toggle OFF **Automatic Analysis**.
* [ ] **Verify Checks**: Clear sandbox token (`$env:GITHUB_TOKEN=$null`) before using GitHub CLI `gh pr checks` to verify the Quality Gate passes.

## Advanced features

For template configurations, properties files, and PR check validation details, see [REFERENCE.md](REFERENCE.md).
