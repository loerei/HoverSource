# HoverSource Repository Rules

## Versioning & Release (Changesets)

All 6 packages (`hoversource` and `@hoversource/*`) are version-locked in a `fixed` group in `.changeset/config.json`.

| Change Scope | Action |
| :--- | :--- |
| Any behavior, bugfix, or public CLI/API change under `packages/` | Add a `.changeset/<slug>.md` file (or run `pnpm changeset`) targeting `"hoversource"` before opening a PR. |
| Docs, CI, or test-only changes with no package release needed | Omit changeset or run `pnpm changeset add --empty`. |

### SemVer Bump Rules (Target `"hoversource"`)
- `patch`: Bug fixes, internal refactors, or test/perf fixes with no new CLI flags, config keys, or public API changes.
- `minor`: Backward-compatible new CLI flags/subcommands, `.hoversourcerc` fields, or overlay features.
- `major`: Breaking changes to CLI flags, `.hoversourcerc` schema without automatic migration, or exported package APIs.

### Hard Constraints
- **NEVER** manually bump `"version"` in `package.json` or write `CHANGELOG.md` by hand; `changesets` manages both on `"Version Packages"` PRs.
- **NEVER** run `npm publish` directly; internal dependencies use `"workspace:*"` and MUST be published via `pnpm release` (`.github/workflows/release.yml` on `main`).
- **Config Schema Changes**: When modifying `.hoversourcerc` keys or shapes in `packages/companion-server/src/configStore.ts`, increment `CURRENT_CONFIG_SCHEMA_VERSION` and add an idempotent migration step in `migrateConfigObject()` with backup-before-write coverage.
