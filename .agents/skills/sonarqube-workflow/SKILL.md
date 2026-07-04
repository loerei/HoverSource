---
name: sonarqube-workflow
description: >
  Query, inspect, and retrieve code quality issues, duplications, and Quality Gate metrics using SonarQube and SonarCloud MCP servers. Use when checking SonarCloud/SonarQube issues, querying open bugs/smells, or checking Quality Gate/duplication status.
---

# SonarQube & SonarCloud MCP Tooling Guide

Use SonarCloud / SonarQube MCP tools to retrieve details about project issues, quality gates, and code duplications.

## Quick start

### 1. Find Project Key
If the project key is unknown, search your organization's projects first:
* Call `sonarcloud:search_my_sonarqube_projects` or `sonarqube:search_my_sonarqube_projects`.

### 2. Search Issues
Find all open issues for a project or specific pull request:
* Call `sonarcloud:search_sonar_issues_in_projects` with `projectKeys=["<projectKey>"]` and `issueStatuses=["OPEN"]`.
* If inspecting a Pull Request, add the `pullRequest` (ID string) argument.

### 3. Retrieve Duplications
Search for files containing duplicated blocks, and extract precise line ranges:
* Call `sonarcloud:search_duplicated_files` with `projectKey="<projectKey>"`.
* Call `sonarcloud:get_duplications` with `key="<fileKey>"` and optional `pullRequest="<pullRequest>"`.

## Tool Usage Workflows

### Quality Gate Status Verification
Check the remote Quality Gate metrics (duplication %, coverage, vulnerabilities):
* Call `sonarcloud:get_project_quality_gate_status` with `projectKey="<projectKey>"` (or include `pullRequest`).

### Detail Issue Code Inspection
Look up the exact rules or component metrics:
* Call `sonarcloud:show_rule` with `key="<ruleKey>"` to get explanation details.
* Call `sonarcloud:get_component_measures` with `component="<fileKey>"` and `metricKeys=["duplicated_lines_density", "security_rating"]`.
