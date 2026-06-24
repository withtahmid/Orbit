---
name: personal-space-unallocated-misframe
description: The personal-space `unallocated` number is mathematically defined but UX-misframed; design recommendation is "Across N spaces" tile, not deletion or rename.
metadata:
  type: project
---

`personal.summary` returns the same `unallocated` / `isOverAllocated` shape
as `analytics.spaceSummary` (`apps/server/src/procedures/personal/summary.mts:308`).
The number is defined as `spendableBalance − envelopeRemaining`
(plans were dropped in the plan-envelope merge) against the caller's
owned-account slice across every member space.

**The misframe:** on `/s/me` the user has NO mutation surface to act on
this number — envelopes only mutate on real spaces. As of 2026-06-24
(budget-bug-fix), OverviewPage DOES gate the Unallocated tile (line ~589),
the over-allocation banner (line ~497), AND the Budget-month CTA chip
(line ~403) behind `!isPersonal` — good. The remaining leak: the
"Allocation map" donut renders on personal too (`ov-trio-2`, line ~647)
and still injects an unlabeled "Unallocated" slice from
`summary.data?.unallocated` (line ~326), whose "Details →" link opens
AllocationsView — which is NOT personal-aware ("your budget", "you've
committed more than you hold").

Made sharper 2026-06-24: `personal.summary` now computes held using
SPACE-WIDE consumed (subtracts co-members' spend), summed across member
spaces. So the leaked personal `unallocated` now means "my spendable minus
the whole household's envelope commitments" with zero framing. Recommend
suppressing the donut slice + details link on personal, or labeling held
as space-wide and branching AllocationsView copy on `space.isPersonal`.

**Why:** Personal is a viewer surface (`myRole: "viewer"` forced via
`CurrentSpaceProvider.tsx:54`). Any "free to act on" affordance is wrong
here by construction. See [[overview-reconciliation-identity]] for the
canonical math.

**How to apply:** When designing personal-space surfaces, audit every
"free / unbudgeted / available" callout for an implied action. If the
action only exists on a real space, either (a) reframe the callout as a
report ("My slice / Across N spaces") with no action, or (b) provide a
deep link to the specific real space where the action lives. Never copy
the real-space affordance verbatim.

The recommended fill for the personal Position slot that used to hold
"Unallocated" is an **"Across N spaces · M owned accounts"** stat tile
sourced from `personal.summary.memberSpacesCount` / `.ownedAccountsCount`
plus the existing `personal.spaceBreakdown` for the per-space list. The
over-allocated banner is suppressed on personal entirely.
