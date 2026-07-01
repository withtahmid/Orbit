---
name: permission-aware-empty-states
description: Budget empty-state CTAs say "Use Allocate above" but Allocate is owner/editor-only; viewers hit a dead end
metadata:
  type: feedback
---

Empty-state / next-step CTAs in the budget surfaces must be permission-aware. On BudgetDetailPage, empty states tell the user "Use Allocate above to set an amount", but every allocation control is wrapped in `<PermissionGate roles={["owner","editor"]}>`. A viewer-role member sees the instruction and an empty topbar — a dead-end CTA.

**Why:** Orbit spaces are multi-role (owner/editor/viewer). CTAs authored from the owner's POV silently break for viewers.

**How to apply:** Whenever writing an actionable empty-state string ("Use X above", "Click Add…"), check the role gating on the control it references. If the control is owner/editor-only, branch the copy so viewers get a neutral descriptive state ("No budget set yet") instead of an unreachable action. This is a recurring class, not a one-off — audit new empty states for it.
