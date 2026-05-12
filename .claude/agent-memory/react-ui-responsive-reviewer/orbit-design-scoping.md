---
name: orbit-design-scoping
description: The editorial-dark token system in apps/web/src/styles/orbit-design.css is scoped under .orbit-design — pages using --bg/--fg/--brand/--line/etc must wrap their root in <div className="orbit-design ...">. Forgetting this renders the page invisible/colorless.
metadata:
  type: project
---

The Orbit web app's editorial-dark design tokens (`--bg`, `--fg`, `--fg-2..4`, `--brand`, `--brand-soft`, `--brand-glow`, `--line`, `--line-soft`, `--line-strong`, `--bg-elev-1..3`, `--income`, `--expense`, `--transfer`, `--warn`, `--gold`, `--ent-*`) live under the `.orbit-design { ... }` block, not on `:root`. Every primitive class in the same file (`.od-btn`, `.od-card`, `.od-input`, `.serif`, `.eyebrow`, `.display`) is also scoped via `.orbit-design .od-btn { ... }`.

**Why:** the rest of the app uses an HSL theme (shadcn defaults). Scoping prevents the two token systems from clashing.

**How to apply:** Any new full-page component that uses these tokens (typically via inline `<style>` strings like `INVITE_STYLES`, `DOCS_STYLES`, `OL_STYLES`) MUST wrap its root in `<div className="orbit-design ...">`. Check `LandingPage`, `DocsPage`, and `AuthShell` for the pattern. If you see a new page referencing `var(--bg)` etc. without `.orbit-design` on an ancestor, that page is broken — the custom properties resolve to nothing and the design collapses.

When auditing pages: search the file for `var(--bg`, `var(--fg`, `var(--brand`. If found, grep the same file for `orbit-design` — its absence is a critical bug.
