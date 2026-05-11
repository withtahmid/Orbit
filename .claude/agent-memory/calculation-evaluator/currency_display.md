---
name: Currency display correctness
description: Watch for accidental $$ rendered literally in JSX
type: feedback
---

When JSX has a literal `$` next to a template expression like `${value.toFixed(2)}`, React renders it as a string — i.e. `$$123.45` reaches the DOM, not `$123.45`. JSX doesn't interpolate `$` like template literals do.

**Why:** Found twice in ReckoningPage.tsx (lines 381 and 404): `Adds $${item.overBy.toFixed(2)}` and `Accept that $${item.overBy.toFixed(2)}` both render with double dollar signs. The other helper text in the same file uses single `$` correctly.

**How to apply:**
- Grep new PRs for the pattern `\$\$\{` in `.tsx` files. It's almost never intentional.
- When auditing money display, scan for this typo alongside the formatting-precision checks.
