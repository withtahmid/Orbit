---
name: envelope-detail-pace-and-goal
description: "BudgetDetailPage + EnvelopeSpendChart/PaceChart — pace-line and goal-projection math verified CORRECT (2026-07-01, envelop-details-update). paceAt agreement + capped-endpoint interpolation."
metadata:
  type: project
---

Envelope detail page pace/goal chart math (branch `envelop-details-update`), re-verified
2026-07-01 — all CORRECT.

**On-budget pace line (EnvelopeSpendChart.tsx).** `paceAt(i)=budget*(i+1)/daysInMonth`.
The drawn guide, the hover dot (`sy(paceAt(hoverIdx))`), and the tooltip "On-budget pace"
row ALL call the same `paceAt`, so they agree exactly. Endpoints: day 1 = budget/D, last
day = budget (not 0). Line is a straight segment between `paceAt(0)` and `paceAt(D-1)`;
since paceAt is linear in i, intermediate hover dots ride on the drawn segment. This was
the fix that was flagged for re-check — CONFIRMED correct.

**Goal projection (BudgetDetailPage.tsx, isGoal branch).**
`rate=trackable&&saved>0 ? saved/nowX : 0` (per-day, trackable=elapsedDays>=1).
`rawCompletionX = !reached && rate>0 ? target/rate : null` (uncapped).
`capX = max(targetX??0, nowX)*3`; `completionX = min(rawCompletionX, capX)`.
Projection endpoint y: `completionX>=rawCompletionX ? target : saved + (target-saved)*
((completionX-nowX)/(rawCompletionX-nowX))`.
- Capped-endpoint interpolation PRESERVES the true slope. Worked ex: nowX=100, saved=200,
  target=1000 → rate=2/day, rawCompletionX=500, capX=300, completionX=300, endpoint
  y=600. Slope (100,200)→(300,600) = 2/day = true slope. Correct.
- Denominator `rawCompletionX-nowX` is provably >0 whenever the interpolation branch runs
  (capX ≥ nowX*3 > nowX, and branch requires rawCompletionX>capX). No div-by-zero.
- `completionDate` uses UNCAPPED rawCompletionX — foot text states the true date. Correct.
- KPIs: perMonth=saved/(days/30), needed/mo=toGo/monthsToDeadline, %complete=round(
  saved/target*100), foot rate*30 — all consistent (perMonth == rate*30). Correct.

**Uncategorized donut wedge** = `round((consumed-categorized)*100)/100`, monthly only,
pushed only if >0.005. Non-negative by construction, no double-count (root subtreeTotal sum
is a strict forest), and catTotal===consumed so donut center reconciles with hero Spent —
this closes the gap noted in [[donut-uncategorized-gap]].
