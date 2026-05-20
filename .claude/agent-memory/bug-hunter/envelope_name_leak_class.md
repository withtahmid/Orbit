---
name: envelope-name-leak-class
description: Several envelope-mutation procedures echo envelope name/cadence in error messages BEFORE calling resolveSpaceMembership — a class of cross-space probing leaks. transfer.mts fixed it but the pattern recurs.
metadata:
  type: feedback
---

RESOLVED on `rename-plan-goal` branch: `transfer.mts`, `createAllocation.mts`, and `borrowFromNextMonth.mts` all reorder content-aware guards AFTER `resolveSpaceMembership`. Cross-tenant envelope-name/cadence probing is closed for all known envelop-by-PK procedures.

Other procedures that select envelops by PK and were checked clean: `archive.mts`, `delete.mts`, `deleteAllocation.mts`, `listBorrows.mts`, `undoBorrow.mts`, `update.mts` (none echo content before membership). `expenseCategory/create.mts` echoes `envelop.name` but only after a `space_id === input.spaceId` match and after owner-membership is established on that space — no cross-tenant leak.

**How to apply:**
- For any procedure that takes an envelopId/spaceId-bearing UUID as input, the invariant is: NO row-content (name, cadence, archived, target_*) may appear in an error message until after `resolveSpaceMembership` has confirmed the caller belongs to that row's space.
- The cleanest shape is the one transfer.mts now uses: load envelope, then membership-check, then content-aware guards.
- archive/delete are already safe because they only echo "not found" / generic errors.

Related: [[resolve_space_membership]].
