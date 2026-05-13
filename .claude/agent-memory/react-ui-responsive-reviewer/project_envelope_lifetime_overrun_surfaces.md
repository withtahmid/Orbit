---
name: project-envelope-lifetime-overrun-surfaces
description: Lifetime overrun (rolling envelope net overspent) appears across three envelope surfaces; check all when reviewing related UI
metadata:
  type: project
---

Lifetime overrun for rolling envelopes (`env.lifetimeOverrun > 0`) is surfaced in four places that must stay visually consistent:

1. `apps/web/src/pages/space/envelopes/EnvelopesPage.tsx` `EnvelopeCard` — cadence row suffix "net overspent <Money>" in `var(--expense)` (~:728-743)
2. Same file, `EnvelopeListRow` — compact "net −<integer>" suffix (~:835-849)
3. `apps/web/src/pages/space/analytics/views/EnvelopesView.tsx` — uppercase mini-chip "net −<money>" (~:298-305)
4. `apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx` `HeroStat note` prop on the "Position" cell (~:344-348, component at :645-694)

**Why:** The math fix changed `isOver` from `remaining < 0` to `consumed > allocated + max(0, carryIn)`, so lifetime overrun is now a distinct concept from period-overspend and needs its own visual treatment everywhere it appears.

**How to apply:** When reviewing any one of these, check the others for consistency in phrasing ("net overspent" vs "net −"), color usage (`var(--expense)`), and whether tooltips have screen-reader-accessible equivalents (currently all four rely on `title=` which fails on touch and is unreliable in AT).
