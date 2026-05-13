---
name: money-variant-muted-contrast
description: MoneyDisplay variant="muted" uses Tailwind's text-muted-foreground (global HSL theme), which is NOT scoped to .orbit-design — fails contrast on brand-colored surfaces.
metadata:
  type: feedback
---

`<Money variant="muted" />` resolves to Tailwind class `text-muted-foreground` (see `apps/web/src/components/shared/MoneyDisplay.tsx` around the variant ladder). That token is defined by the app's global HSL theme, **not** by the `.orbit-design` scope in `apps/web/src/styles/orbit-design.css`.

**Why:** the orbit-design scope redefines `--fg/--fg-3/--brand/...` but does **not** redefine `--muted-foreground`. So `variant="muted"` Money inherits the app's default muted gray regardless of the surrounding orbit-design surface. On `--brand` (light emerald-jade `oklch(72% 0.14 165)`) the digits go light-on-light and become hard to read.

**How to apply:** flag any `<Money variant="muted">` placed on a non-dark surface inside `.orbit-design` — primary buttons (`.od-btn-primary` background `--brand`), brand chips, light status pills. Recommend dropping `variant="muted"` and letting the digits inherit the parent's foreground (e.g. `--brand-fg` on primary buttons), or explicitly setting color via CSS instead of the muted variant.

Related: [[orbit-design-scoping]].
