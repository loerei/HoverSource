# Sonar Remediation Reference & Rule Cookbook

## 1. CLI & API Reference (`sonarqube-cli`)

All commands use the `sonar` binary directly (authenticated via `sonar auth login` in OS Keychain; no Docker or MCP container required).

| Task | `sonar` CLI Command |
| :--- | :--- |
| **Auth Check** | `sonar auth status` |
| **Quality Gate + Breakdown** | `sonar quality-gate status [--branch <name> \| --pull-request <id>] --format json` |
| **List Issues** | `sonar list issues -p <key> --statuses OPEN [--branch <name> \| --pull-request <id>] [--file '<relPath>'] [--new-code] --format json` |
| **Search Filtered Issues** | `sonar api get "/api/issues/search?componentKeys=<key>&statuses=OPEN[&pullRequest=<id>][&types=BUG,VULNERABILITY]&ps=100"` |
| **Component Measures** | `sonar api get "/api/measures/component?component=<key>&metricKeys=<keys>[&pullRequest=<id>]"` |
| **Duplications** | `sonar api get "/api/duplications/show?key=<key>:<relPath>[&pullRequest=<id>]"` |
| **Security Hotspots** | `sonar api get "/api/hotspots/search?projectKey=<key>&status=TO_REVIEW[&pullRequest=<id>]"` |
| **Rule Details** | `sonar api get "/api/rules/show?key=<ruleKey>"` |
| **Transition Issue** | `sonar api post "/api/issues/do_transition" --data '{"issue":"<issueKey>","transition":"accept\|falsepositive","comment":"<reason>"}'` |

## 2. Rule Remediation Matrix

Before calling `sonar api post "/api/issues/do_transition"` to transition `"accept"` or `"falsepositive"`, MUST verify the exact issue key with `sonar quality-gate status`, `sonar list issues`, or `sonar api get "/api/issues/search?..."` (`statuses=OPEN`).

| Rule Keys & Category | Action & Rationale |
| :--- | :--- |
| `S3776` (Cognitive Complexity) | Transition `accept`. NEVER split functions solely for `S3776`; structural splits require `improve-codebase-architecture`. |
| `S2004` (Function Nesting) | Transition `accept`. Deep nesting in UI/search/event closures is intentional design. |
| `S8786` (Path Regex Backtracking) | Transition `accept`. Filesystem path/filename lengths are OS-bounded (260 Windows / 4096 POSIX); no practical ReDoS risk. |
| `S7744` (Defensive Object Spreads) | Transition `accept`. `{ ...(obj \|\| {}) }` guards against null/undefined at IPC, JSON config, and storage boundaries. |
| `S7784` (Plain JSON Clone vs Proxy) | Transition `accept` (or use shallow loop). `structuredClone` throws `DataCloneError` on Proxies and keeps prototypes/non-enumerable keys instead of pure JSON. |
| `css:S7924` (Theme / Contrast) | Transition `accept`. Brand theme tokens override generic WCAG checks. |
| `Web:S7039` (CSP `style-src 'unsafe-inline'`) | Transition `accept` when required by inline style attributes (`@tanstack/react-virtual`, React `style={}`) and `script-src 'self'` stays locked. |
| `tssecurity:S8475` (Browser Storage) | Transition `accept` on `localStorage` persistence and schema migration boundaries (`Boundary Invariance`). |
| `S1082` (Non-Interactive Click) | Remove dead no-op `onClick`; transition `accept` on backdrop/row-padding click delegates when keyboard handling lives on the inner control or dialog. |
| `S2245` (Temp Filename PRNG) | Replace `Math.random()` temp path suffix with `crypto.randomBytes(6).toString('hex')` where `node:crypto` is available. |
| `S1854`, `S1481`, `S6582`, `S6606`, `S7780`, `S7758`, `S6594`, `S4666`, `S1874` | Fix code using the patterns in Sections 3-7 below. |

## 3. Preemptive Inspection Checklist (Pre-Scan)

- **JS/TS**: Replace nested ternaries with helpers or blocks; prefer positive conditions when natural; mark React component prop interfaces `Readonly<Props>`; handle floating promises with `.catch()` rather than `void`.
- **Cross-Language**: Remove unused imports and dead non-contract variables; do not split functions solely for complexity metrics.

## 4. Contract-Aware Dead Code (`S1854`, `S1481`)

When Sonar flags an unused variable near a return literal, NEVER alter returned object keys or domain types just to consume the variable.

```typescript
// BAD: Replaces top-level Order reference with child LineItem to consume unused variable,
// dropping top-level order.status and breaking callers.
const primaryItem = order.primaryItem ?? selectPrimaryItem(items);
return { status: order.status, primaryItem: primaryItem };

// GOOD: Assign property onto domain object if missing and keep top-level contract intact.
if (!order.primaryItem) {
    order.primaryItem = selectPrimaryItem(items);
}
return { status: order.status, items, primaryItem: order };
```

## 5. Unused Functions & Dynamic References (`S1172`, `S1481`, `S1854`)

1. Run impact analysis (`find_references` / symbol search) to trace static callers.
2. Check for dynamic string registrations (`ipcMain.handle`, `ipcRenderer.invoke`, REST route strings, config hooks).
3. If dynamically invoked or externally exported, verify the issue key (`statuses=OPEN`) and transition `"accept"` or `"falsepositive"`.

## 6. JS/TS Refactoring Patterns

```typescript
// S6582 Optional Chaining
// BAD:  if (payload && payload.id) { ... }
// GOOD: if (payload?.id) { ... }

// S6606 Nullish Coalescing (preserves empty string and 0)
// BAD:  const title = config.title || 'Default';
// GOOD: const title = config.title ?? 'Default';

// S7780 Raw String Templates
// BAD:  const regex = new RegExp(`[\\x20-\\x7e]{${min},}`, 'g');
// GOOD: const regex = new RegExp(String.raw`[\x20-\x7e]{${min},}`, 'g');

// S7758 Code Point Inspection
// BAD:  const charCode = str.charCodeAt(i);
// GOOD: const codePoint = str.codePointAt(i) ?? 0;

// S6594 RegExp Execution
// BAD:  const match = line.match(/^\[(.+?)\]$/);
// GOOD: const match = /^\[(.+?)\]$/.exec(line);

// S3735 Void Operator Removal
// BAD:  function logDebug(msg) { void msg; }
// GOOD: function logDebug(_msg) { /* no-op */ }
```

## 7. CSS Patterns

```css
/* css:S4666 Merge duplicate selectors */
/* BAD:  .item { padding: 12px; } .item { position: relative; } */
.item { position: relative; padding: 12px; }

/* css:S1874 Replace deprecated word-break: break-word */
.tooltip { overflow-wrap: break-word; }
```
