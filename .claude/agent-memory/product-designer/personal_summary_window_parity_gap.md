---
name: personal-summary-window-parity-gap
description: personal/summary envelope window hardcoded to current month while analytics/spaceSummary honors requested periodStart — twin parity break
metadata:
  type: project
---

`personal/summary.mts` (the `/s/me` twin of `analytics.spaceSummary`) accepts `periodStart`/`periodEnd` in its input and aggregates real envelopes across all member spaces (`e.space_id = ANY(memberSpaces)`), but its monthly envelope window is hardcoded to `DATE_TRUNC('month', NOW())` — it does NOT honor the requested window.

As of branch `budget-bug-fix-2`, `spaceSummary` was moved to honor `${input.periodStart}`/`${input.periodEnd}` for the envelope window; its personal twin was left on NOW(). So a non-current-month request yields the current month on `/s/me` but the viewed month in a regular space.

**Why:** violates the canonical "every analytics procedure has a personal twin kept in lockstep" rule (CLAUDE.md router tree). Recurrence of the pattern in [[period_start_tz_read_write_asymmetry]] — read-side window changes not propagated to the twin.
**How to apply:** any change to `spaceSummary`'s period/window handling must be mirrored in `personal/summary.mts`. When reviewing budget-window edits, always diff the twin.
