---
name: envelope-detail-rolling-gap
description: Envelope detail page (redesign) treats rolling envelopes with monthly framing; lifetime hero collides with this-month chart. Cadence is only monthly|none.
metadata:
  type: project
---

Envelope detail page redesign (`apps/web/src/pages/space/budgets/BudgetDetailPage.tsx`, reviewed 2026-07-01 on branch envelop-details-update).

Key structural fact: there is NO distinct "rolling" cadence in data. `envelopeUtilization.mts` returns cadence as only `"monthly" | "none"`. A "rolling" envelope = `cadence='none'` with no targetAmount; a "goal" = `cadence='none'` WITH targetAmount>0. The page synthesizes the three-way Monthly/Rolling/Goal label itself.

**Why it matters (recurring coherence trap):** The page reuses the monthly hero framing (Remaining/Spent/Allocated) for rolling, but for `cadence='none'` those fields are LIFETIME (allocated−consumed across all time, per envelopeUtilization.mts:149). Meanwhile the pace chart and "Where it went" are scoped to the current calendar month. So hero (lifetime) and chart (this-month) silently measure different windows on the same screen. This is the main confusion.

**How to apply:** When reviewing/planning budget UI, always check whether a component silently reuses monthly framing for `cadence='none'`. Rolling needs its own hero (Balance/Added/Spent), lifetime facts (runway = balance ÷ 3-mo avg spend is missing everywhere), and a seam sentence explaining hero=lifetime / chart=this-month.

Findings across the two reviews of this branch:
- P1 (rolling): lifetime hero vs this-month chart/donut with no seam (see above).
- P1 (philosophy): "Trending over" red pill + "at this rate you'll finish X over" projects failure from a noisy early-month run-rate — conflicts with analytics CLAUDE.md "show overspend, never block or nag." Gate the red pill on period-elapsed>=0.5 AND projected>total*1.1; keep the informative footer sentence. This is the highest-leverage philosophy call in the redesign.
- P2 (goals): "Saved" line is a synthesized straight line from a single `lifetimeFunded` SUM (no deposit history) but drawn solid+area = reads as measured trajectory. Make it a dashed guide + endpoint dot, drop area fill. Projection rate uses all-time (saved/daysSinceFirst), not recent behavior. Alternatively add a goal funding-history procedure and plot real allocation steps.
- P2 (zero-budget monthly with spend): `over` gates on total>0 so hero shows gold "Remaining" while glass `noBudgetSpent` path goes fully red — direct contradiction. Make hero/pill/glass agree; use neutral tone (not warn) for "No budget set" per no-nag rule.
- Root-category altitude for the donut is a deliberate, correct choice — keep.

FIXED since the earlier review (don't re-flag): past-month view now has an `isPast` branch (BudgetDetailPage.tsx:491) that swaps Projected-end/Days-left for %-of-budget/Left-over, and suppresses the "Today" marker via `showToday`. Month-step overflow bug is handled (steps from startOfMonth). Archived "Free trapped cash" affordance is good.

Confirms [[budgeting_overengineering_audit]] root cause and [[analytics_categories_classification_only]] windowing.
