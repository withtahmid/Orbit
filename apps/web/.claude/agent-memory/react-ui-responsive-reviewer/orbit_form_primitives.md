---
name: orbit-form-primitives
description: Orbit form primitives (OrbitField/Select/InfoPill) and the envelope chip + Add-details disclosure pattern used in NewTransactionSheet.
metadata:
  type: reference
---

Reusable form primitives live in `apps/web/src/components/orbit/OrbitForm.tsx` and `OrbitModalShell.tsx`:

- `OrbitField` — labeled wrapper (`label`, `required`, `hint` props)
- `OrbitSelect` — Radix-backed select; supports `disabled` (`.of-select-trigger:disabled` styles opacity)
- `OrbitInput` / `OrbitTextarea` / `OrbitAmountCard`
- `OrbitInfoPill` — banner with tone (`transfer`, `gold`, etc.)
- `OrbitDrawerShell` — sheet shell with header/footer slots, used by both new/edit transaction sheets

**Envelope chip pattern (NewTransactionSheet ExpenseForm):**
- After category is picked, render a compact chip row: "ENVELOPE ● {name} · {category default | overridden}" with a "Change" button on the right
- Clicking Change swaps the chip for an inline `OrbitSelect` + Cancel button
- Picking an envelope auto-collapses back to chip view
- The "overridden" label compares against `selectedCategory.default_envelop_id`

**Optional-fields disclosure:** Single "Add notes, location, or event" button toggles the wrapped block. Auto-opens if any wrapped field already has content (use a derived `optionalFieldsHaveContent` + effect that sets `showMore = true` once). In NEW it persists the open/closed state per space in localStorage; in EDIT it just initializes from content since editors usually want to see existing data.

**How to apply:** Mirror these patterns when building transaction-adjacent forms. Do not reach for new UI libraries; everything composes from the Orbit primitives + shadcn `Button`/`Sheet`.
