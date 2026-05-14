---
name: personal-space-unallocated-misframe
description: The personal-space `unallocated` number is mathematically defined but UX-misframed; design recommendation is "Across N spaces" tile, not deletion or rename.
metadata:
  type: project
---

`personal.summary` returns the same `unallocated` / `isOverAllocated` shape
as `analytics.spaceSummary` (`apps/server/src/procedures/personal/summary.mts:308`).
The number is defined as `spendableBalance − envelopeRemaining − planAllocated`
against the caller's owned-account slice across every member space.

**The misframe:** on `/s/me` the user has NO mutation surface to act on
this number — envelopes/plans only mutate on real spaces. So:
- Showing it as "Free to allocate" with the same chrome as a real space
  implies an action the user can't take.
- The over-allocated banner's remediation copy ("deallocate somewhere")
  is invalid on personal — the co-member who over-allocated lives in
  another space.
- The `unallocated` Plan-CTA chip is correctly hidden on personal
  (`OverviewPage.tsx:435`) — but the Unallocated tile and over-allocated
  banner are NOT.

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
