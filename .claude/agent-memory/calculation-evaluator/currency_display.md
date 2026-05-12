---
name: Currency display correctness
description: Watch for accidental $$ rendered literally in JSX
type: feedback
---

When JSX has a literal `$` next to a template expression like `${value.toFixed(2)}`, React renders it as a string — i.e. `$$123.45` reaches the DOM, not `$123.45`. JSX doesn't interpolate `$` like template literals do.

**Why:** Originally found twice in ReckoningPage.tsx. The `wrap` branch (May 2026) is a wholesale pass removing all hardcoded `$` literals from the web app — every analytics/envelope/plan/reckoning view strips `$` prefixes in favor of bare numeric output. Likely prep for multi-currency. The canonical formatter `lib/money.formatMoney` already returns symbol-free strings.

**How to apply:**
- After the `wrap` branch lands, residual literal `$` in `.tsx` views is itself a bug — it'd mean a manual edit was missed. Grep `\$[^{a-zA-Z0-9_]` in `.tsx` to find them, excluding regex anchors and code comments.
- The `$$` typo class is unlikely now since there are very few literal `$` left, but the rule still holds: JSX doesn't interpolate `$` like template literals.
