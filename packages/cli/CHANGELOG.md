# hoversource

## 1.1.0

### Minor Changes

- fa126bd: Compact HoverSource clipboard metadata output losslessly across Inspector (`Alt+C`, `Alt+Shift+C`) and Design (`Alt+X`) modes by normalizing workspace-relative paths under a single `Root:` header, grouping `Parent Styles` per element, merging duplicate dimension and `overflow-x`/`overflow-y` lines, and deduplicating shared ancestor chains across layers.
- 1f1668c: Replace flat metadata filter defaults with preset-based `metadataFilter` configuration (`full`, `source-locate` default, `layout-styles`, `minimal`), `.hoversourcerc` schema v2 migration (`v1 -> v2`), repo-local and global custom filter presets (`hs config filter-preset`, `/filter-presets*`, and Dashboard controls), and `Ctrl+Alt+D` preset selection with automatic `Custom` detachment and inline `Save as Preset` (overwrite or new name, local/global fallback).
- 43e7735: Add Changesets monorepo versioning, automated npm/GitHub Release workflow, `.hoversourcerc` `schemaVersion` migration, `-V`/`--version`, non-blocking update notifier, and `hs update` command (alongside static scan-scoping and CLI help updates).

### Patch Changes

- 89ca262: Allow metadata filter preset routes and scoped global `metadataFilter` updates over the CDP bridge, add real-time SSE config synchronization to the web dashboard, and harden `Ctrl+Alt+D` UX (`Retry` action, repo-override notice, `×`/`Escape` close, viewport drag clamping, `<select>` shortcut safety, and theme-aware `<option>` styles).
- 9bedb6e: Prevent `$HOME` `.hoversourcerc` from overriding active named presets as a pseudo-local repo config, guard `$HOME` local writes/deletes, and suppress expected `ECONNREFUSED` CDP target query logs when no browser debug target is listening.
- ca3740c: Disable stale keep-alive socket reuse on reverse-proxy upstream requests, abort upstream requests on early client close, and format `AggregateError` details in proxy error logs.
- @hoversource/client-injector@1.1.0
  - @hoversource/companion-server@1.1.0
