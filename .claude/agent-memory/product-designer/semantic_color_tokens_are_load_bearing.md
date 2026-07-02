---
name: semantic-color-tokens-are-load-bearing
description: --transfer(blue)/--income/--expense/--brand are meaning-carrying across the app; reusing them decoratively on a new surface leaks semantics.
metadata:
  type: project
---

Several Orbit color tokens carry a fixed, app-wide *meaning* — not just a palette slot — so reusing one decoratively on a new surface creates a conceptual leak a user will misread.

Confirmed meanings (verified 2026-07-02):
- `--transfer` (blue, oklch 72% 0.10 230) = **transfer transaction**. Used as the "Transfer" type color/label in `MoneyDisplay.tsx`, `NewTransactionSheet`, `EditTransactionSheet`, `OverviewPage`, `TransactionsPage` ("Transfer" chip literally `{color: var(--transfer), label: "Transfer"}`).
- `--income` green = money in / good / under; `--expense` red = money out / over / alarm; `--warn` amber = caution; `--gold` = goal/save.
- `--brand` teal is `oklch 72% 0.14 165` — **identical hue to `--ent-1`**. Envelope/entity identity colors come from `ENTITY_COLORS` via `ColorPicker` (has full Blues/Purples groups) or a custom hex, so an envelope's OWN color can equal `--transfer` (blue), `--ent-4` (violet 290), or `--brand`/`--ent-1` (teal).

**Why:** The BudgetDetailPage Velocity redesign (envelop-details-fix branch) recolored "Last month" = `--transfer` blue and "Typical" = `--ent-4` violet purely to look less gray. That (a) leaks transfer-semantics onto an envelope page and (b) collides with the envelope's own identity color when the user picked blue/violet — both series then read as the same thing on one screen.

**How to apply:** When theming a NEW multi-series chart, prefer tints/opacities of the entity's own `color` (current = saturated, reference/past = faded), the grammar the Monthly-spend YoY mode already uses (`--brand` solid vs `--fg-3` faded). Do NOT borrow `--transfer`/`--income`/`--expense`/`--warn`/`--gold` for a series unless the series genuinely means transfer/income/expense/caution/goal. Treat "the chart looks boring/gray" as a request to tint toward the identity color, not to pull semantic tokens. Related: [[free_pool_term_fragmentation]] (same class of drift, in copy instead of color).
