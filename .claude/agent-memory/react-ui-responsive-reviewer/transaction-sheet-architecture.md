---
name: transaction-sheet-architecture
description: How the New/Edit transaction sheets are composed (Sheet + OrbitDrawerShell + 4 tabbed forms, with shared NT_STYLES and the custom TransactionDatePicker popover).
metadata:
  type: project
---

The New + Edit transaction forms live in `apps/web/src/features/transactions/` and share quite a bit of CSS and primitives. Knowing the layering saves a lot of grep time on future reviews.

**Sheet structure:**
- Both sheets use shadcn `Sheet` (Radix Dialog) with `side="right"` and `sm:max-w-[520px]` override on `SheetContent`. Default `sheetVariants` says `sm:max-w-md` (384px); the `[520px]` override wins by virtue of being later in the merged className but the precedence is fragile.
- Inside the Sheet sits an `OrbitDrawerShell` (`@/components/orbit/OrbitModalShell.tsx`) — a flex-column with `.ods-head` / `.ods-body` (scroll region) / `.ods-foot` (sticky-by-being-last-flex-child).
- Save/Save-and-add-another buttons render in the `footer` slot of OrbitDrawerShell, so the form's mutation state must be lifted up via `onPendingChange` from each tab into the parent's `isSaving` state. `NewTransactionSheet` does this; `EditTransactionSheet` (as of this writing) does NOT — its Save button has no disabled/spinner during the update mutation.

**Shared CSS bundle (`NT_STYLES` exported from `NewTransactionSheet.tsx`):**
Edit sheet re-imports it via `import { NT_STYLES } from "./NewTransactionSheet"`. Includes `.nt-form`, `.nt-btn`, `.nt-btn-primary`, `.nt-swap`, `.nt-tabs`, `.nt-pin-btn`, `.nt-spinner`, `.nt-hint-row`, `.of-chip-actions`, `.nt-env-card/-row/-warn/...`, and `.nt-drift*`. Before NT_STYLES was mounted in edit, the Save button's Check icon stacked above text instead of inline — fixed by adding `<style>{NT_STYLES}</style>` inside the edit drawer shell.

**Date picker (`TransactionDatePicker.tsx`):**
- Replaced the native `<input type="datetime-local">`. Uses Radix Popover (`portal=true` by default) so the popover escapes the sheet's stacking context.
- Trigger styles are mounted inline in the trigger button via `<style>{TDP_STYLES}</style>`.
- Popover content styles are exported as `TDP_POPOVER_STYLES` and must be mounted by the **parent sheet** (because Radix portals the content outside the trigger's DOM subtree, so the trigger-local style wouldn't apply). Both NewTransactionSheet and EditTransactionSheet mount it once inside OrbitDrawerShell.
- The popover panel has `max-height: calc(100dvh - 32px); overflow-y: auto` on `.tdp-pop-inner` — but the Cancel/Apply footer is INSIDE the scroll region, so on a very short viewport the footer scrolls with the content rather than staying pinned. Inline comment acknowledges this is a v1 trade-off.
- Calendar day cells: `height: 32px` — below the 44px touch-target ideal but consistent with the rest of the editorial-dark UI density.

**PinControl (`PinControl.tsx`):**
- Tiny inline pill that sits in `OrbitField`'s `hint` slot (which renders inside `<span class="oms-field-hint">`).
- Height 20px — too small for AA (24px) and AAA (44px). The control is purely supplementary so it's a quality-of-life nit, not a critical block. Label collapses to icon-only at `@media (max-width: 420px)`.
- When the hint slot has both text AND PinControl, the parent label uses `.nt-hint-row` (inline-flex with 8px gap) to keep the text and pill on one line.

**FieldPin helper (lives in `NewTransactionSheet.tsx`):**
- Decides the pin state based on whether the field has a value and whether that value matches the pin. The `available` prop drops the control entirely on the personal space (`/s/me`), since pins are space-scoped and the personal space isn't a real space.
- Currently passed for account / envelop / event fields only.

**Envelope chip (`.of-chip-row` in OrbitForm.tsx):**
- Flex row with `[content][actions]`. `content` holds eyebrow + dot + name + meta; `actions` holds PinControl + Change button (added in this session).
- Has `min-height: 38px` but no `flex-wrap` — on a narrow viewport (~360px) the meta text starts wrapping inside the content section but the chip itself stays single-row, which is fine because `.of-chip-meta` has `text-overflow: ellipsis`.

**Personal space sentinel:**
`usePins(spaceId).isPersonal === (spaceId === "me")`. Pins are skipped entirely on the personal space — the query is disabled and FieldPin renders null. This is a load-bearing detail because the personal space uses the same `NewTransactionSheet` component.
