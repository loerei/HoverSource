# Design Mode Prototype — Session Notes

**Question answered:** What metadata format gives an AI agent enough information to place a UI element at the correct DOM position, with correct CSS, such that the element flows with the DOM on resize?

**Date:** 2026-06-11

---

## Verdict

**Variation E — adopted as the production Design Mode metadata format.**

Condition: works correctly when the crosshair is placed **inside** a positioned ancestor. Fails (element clips off-screen on resize) when the crosshair is placed outside all positioned ancestors — this is a CSS positioning limitation, not a tool limitation.

---

## What was tested

| Test | Metadata | Result | Root cause |
|---|---|---|---|
| 1 — Badge outside card | `Offset (dX): -264px` | ❌ Flies off screen | Agent used raw distance value as CSS `left` |
| 2 — Tooltip to right of card | `⚑ USE THIS CSS: calc(100% + 123px)` | ❌ Clips on narrow viewport | Crosshair was outside card; no positioned ancestor → element must go outside card's layout bounds |
| 3 — Shield icon inside card | `⚑ USE THIS CSS: left: 93%; top: 10%` | ✅ Tracks with card on resize | Positioned ancestor found (`#login-card`); percentage CSS scales with container |

---

## Key findings

1. **Raw distance values (dX/dY) must not look like CSS values.** Original label `Offset (dX): -264px` caused agents to copy-paste into `left: -264px`. Fixed by renaming to `Crosshair distance from boundary (NOT a CSS value)`.

2. **CSS block must be clearly authoritative.** `Suggested CSS` was treated as optional. `⚑ USE THIS CSS` caused agents to use it verbatim.

3. **Positioned ancestor resolution is the key signal.** When `Positioned Ancestor: none found` — the crosshair is outside all positioned containers and the output CSS will not be responsive. This is a constraint to communicate clearly to users.

4. **`getComputedStyle`-based layout context (Tier 2) works across all frameworks** — not React-specific. Fiber-based source file resolution degrades gracefully to "source unresolved" for non-React or prod builds.

---

## What Variation E outputs (3 tiers)

- **Tier 1**: Anchor selectors, snap boundaries, crosshair distances (labeled as non-CSS), suggested CSS block
- **Tier 2**: Positioned ancestor (selector + position + source file if fiber available), direct parent display/layout props, ⚠ flex/grid warning, source files list
- **Tier 3**: Static agent instruction block — what to look up, what NOT to auto-apply, insertion point judgment

---

## Test site

`index.html` + `rao_prototype.js` are kept as a live test sandbox.

Open `index.html?variant=E` in a browser to use the prototype with Variation E metadata output.

Variants A–D remain in `rao_prototype.js` for historical reference.
