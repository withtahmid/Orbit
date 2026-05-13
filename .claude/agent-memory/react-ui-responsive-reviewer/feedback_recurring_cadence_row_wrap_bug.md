---
name: feedback-recurring-cadence-row-wrap-bug
description: Envelope card cadence rows tend to be non-wrapping spans; flag any new content appended there
metadata:
  type: feedback
---

The `env-card-cadence` and `env-list-row-cadence` containers in `apps/web/src/pages/space/envelopes/EnvelopesPage.tsx` are plain spans/divs without `flex-wrap`, and the separators between segments are literal `·` text characters inside JSX fragments rather than per-chip elements. Inline `<Money>` children cannot break internally, so adding a 3rd segment commonly overflows on mobile (~165px card at 375px viewport in 2-col grid).

**Why:** Repeatedly catching this pattern across reviews — drift suffix, lifetime-overrun suffix, etc. each added without making the row wrappable.

**How to apply:** When reviewing any addition to the envelope card cadence rows, recommend converting the container to `display: flex; flex-wrap: wrap; column-gap: 4px; row-gap: 2px` and replacing inline `·` text separators with structural children, so wrapping points exist between segments.
