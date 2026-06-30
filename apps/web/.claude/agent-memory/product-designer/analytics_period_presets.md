---
name: analytics-period-presets
description: How analytics period presets work, two-selector mechanics divergence, and per-view default conventions
metadata:
  type: project
---

Analytics views pick a time window via named presets in `lib/dates.ts` (`PeriodPresetId`, `PERIOD_LABELS`, `resolvePeriod`). URL-backed via `usePeriod`.

Two distinct selectors with DIFFERENT mechanics for the same labels:
- `PeriodSelector` (Select dropdown) — uses NAMED presets ordered by `PRESET_ORDER`. Named `last-30-days` is a ROLLING window (re-rolls daily, shareable `?period=last-30-days`).
- `PeriodChip` → wraps `DateRangePicker`. Its convenience preset buttons (incl. a "Last 30 days" button) all commit via `onApply` → `setCustom(s,e)`, which freezes an ABSOLUTE `custom` range and labels it as a date span, NOT "Last 30 days".
- Consequence: picking "Last 30 days" in the dropdown (rolling) vs the picker button (frozen snapshot) gives different persistence + label. This is a known conceptual leak — flag if it spreads.

Preset window math: `last-30-days` is rolling (`addDays(now,-29)`→`endOfDay(now)`). All multi-month presets (`last-3/6/12-months`, `last-month`) are calendar-aligned (`startOfMonth`-based). So a rolling preset's bucket boundaries won't align with a calendar preset's.

Per-view default convention (as of 2026-06):
- Budget-style views default to `this-month`: Priority, Categories, Anomalies, Envelopes.
- Balance History defaults to `last-30-days` (intentional outlier — trend view wants rolling).
- Suggested future convention if parity is wanted: trend-style views (BalanceHistory/Trends/CashFlow) rolling default; budget-style views `this-month`.

**Why:** User added `last-30-days` as Balance History default and to global `PRESET_ORDER` on the analytics-update branch.
**How to apply:** When a new preset is added to the shared `PRESET_ORDER`, it appears in the dropdown on EVERY page using `PeriodSelector` — prefer page-local ordering over mutating the shared constant unless all pages want it. Verify personal `/s/me` twins inherit the same per-view defaults.
