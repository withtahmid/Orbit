---
name: envelope-color-contrast-custom-hex
description: Envelope color drives chart marks (glass/bars/velocity/pace) and comes from a palette + FREE custom-hex input, so dark/desaturated colors can drop chart marks below WCAG 3:1
metadata:
  type: reference
---

Envelope colors come from `ENTITY_COLORS` (lib/entityStyle.ts, ~45 hexes) selected via `ColorPicker`
(components/shared/ColorPicker.tsx), which ALSO has a free custom-hex text input accepting any 3/6/8-digit
hex. So an envelope color is NOT guaranteed to be from the "curated, AA-passing" list — a user can set
near-black (#202020) or any low-contrast value.

BudgetDetailPage themes many chart marks to `envelope.color`: the pace line, monthly bars ("Spent"/"this year"
series), and VelocityViz bars (incl. `color-mix(color 55%, --fg-3)` and `color-mix(color 65%, transparent)`
blends). Approx WCAG contrast vs the dark card (~#151a1a): palette darks like slate-600 #475569 give the
"This month" bar ~2.3:1 (below 3:1); a custom near-black collapses to ~1.1:1 (mark effectively invisible).

**Not a blocker in practice:** every chart mark on this page is paired with a directly-rendered numeric value
label (ed-vbar-val, tooltip rows, foot text), so color is decorative, not the sole information carrier — it
does not fail WCAG 1.4.1 (use of color). The comment in entityStyle.ts claiming the palette is "hand-picked
to pass WCAG AA on the dark card background" is optimistic for the -600 darks and untrue for custom hex.

**How to apply:** Don't flag the color-mix theming as a regression — the labels carry the data. If asked to
harden it, the fix is either a minimum-luminance floor when blending against dark bg, or dropping the custom
hex input. This is app-wide (glass/avatar/lists all use envelope.color), not specific to this diff.
