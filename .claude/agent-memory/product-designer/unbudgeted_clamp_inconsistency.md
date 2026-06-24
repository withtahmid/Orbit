---
name: unbudgeted-clamp-is-correct
description: The GREATEST(0,...) held clamp is a load-bearing cash-conservation invariant, NOT a bug. The "allocate didn't move Unbudgeted" report is a UI/conceptual confusion.
metadata:
  type: project
---

Unbudgeted ("free to budget") = `spendable − envelopeHeld` where
`held = Σ GREATEST(0, allocated − consumed)` per envelope (the clamp). This
clamp is **correct and load-bearing** — documented in
`apps/server/src/procedures/analytics/CLAUDE.md` ("Held ... is
`GREATEST(0, allocated − consumed)` ... `spaceSummary` and
`resolveSpaceUnallocated` must produce the same held number").

**Why the clamp must stay (cash conservation):** you cannot hold negative cash.
When an envelope overspends, that cash ALREADY left the accounts, so `spendable`
(and net worth W) already dropped to absorb it. Held floors at 0. The invariant:
    Unbudgeted = spendable − Σ max(0, remaining)   →   Unbudgeted ≤ spendable ≤ W
Removing the clamp (signed held) credits already-gone money back into the pool
and pushes Unbudgeted ABOVE net worth — impossible. Verified on real cloned
Family Budget data 2026-06-24: signed held gave Unbudgeted > W; clamped gave
143328.30 ≤ W 192688.21. ✓

**The original "bug" was NOT a bug.** User reported: allocated 605.49 to an
already-overspent envelope, its "over" shrank but Unbudgeted stayed 605.49.
That is CORRECT: covering past overspend is pure relabeling and frees no current
cash. I initially "fixed" it by dropping the clamp — that OVERSHOT (pushed
Unbudgeted above net worth) and was reverted. The real problem is
conceptual/display.

**The real fix (UI, 2026-06-24):** in `BudgetsPage.tsx` envelope card, overspent
state shows "over · already spent" + a note: "Already spent from your accounts.
Adding budget here covers it on paper but won't change your Unbudgeted pool." In
`EnvelopeAllocateDialog.tsx`, when allocating into an already-overspent envelope,
an inline warning shows how much of the entered amount just covers past overspend
(and thus won't move Unbudgeted).

**How to apply:** NEVER remove the `GREATEST(0,...)` held clamp — it is a hard
invariant, not cosmetic. When a user is confused that allocating didn't move
free-to-budget, the answer is UI framing ("already spent"), not a formula change.
See also [[anomaly_pattern_sign_conventions]] — but note this is the opposite
lesson: here the clamp is RIGHT and the signed version is wrong.
