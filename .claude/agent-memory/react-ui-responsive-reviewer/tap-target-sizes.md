---
name: tap-target-sizes
description: Default heights for app/orbit-design buttons are below the 44px mobile touch-target minimum. Repeated finding on Orbit pages.
metadata:
  type: project
---

In apps/web, common button heights sit below the 44px iOS/Android touch-target minimum:

- shadcn `<Button>` default size: `h-9` = 36px; `sm` = 32px; `icon` = 36px.
- `.od-btn` (orbit-design): 36px; `.od-btn-sm` 30px; `.od-btn-lg` 44px (compliant).
- `.ai-btn` (AcceptInvitePage): 40px.
- `.plan-row-input` (PlanMonthPage): 34px.
- Table action icon buttons (`size-7` / `size-8`): 28–32px.

**Why:** the design system was built for desktop-first feel — most of the app is mid-density.

**How to apply:** Don't flag every 36px button as critical — that would mean every page is broken. Flag tap-target issues when:
1. The control sits in the topbar/sticky header (likely tapped mid-scroll on mobile).
2. The control is a destructive action (revoke invite, delete) — harder to undo from a misshit.
3. The control is in a row of similarly small siblings under ~8mm apart.
4. Multiple icon-only buttons with `size-7`/`size-8` cluster together in a mobile-visible table column.

For new code, prefer `.od-btn-lg` / shadcn `size="lg"` on mobile-visible CTAs, or add a `min-h-[44px]` Tailwind override.
