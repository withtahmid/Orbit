---
name: single-hue-value-scale-palette-edge
description: Single-hue value scales built from arbitrary envelope colors break at the palette's dark/light extremes; mix toward bg, not --fg-3.
metadata:
  type: feedback
---

When a chart encodes a time/value comparison as one hue at descending
"strength" (full → muted → outline) themed to `envelope.color`, verify the
ramp holds across the WHOLE `ENTITY_COLORS` palette, not just a typical
mid-tone. The palette (apps/web/src/lib/entityStyle.ts) spans very light
400-level tints AND dark neutrals (#475569 slate-600, #78716c stone-500,
#6b7280 gray-500).

Two recurring failure modes seen on BudgetDetailPage's VelocityViz:
- **Ramp inversion:** muting via `color-mix(color 55%, var(--fg-3))` blends
  toward a LIGHT mid-gray (--fg-3 = oklch 62%). For a dark base color this
  makes the "muted/older" bar LIGHTER than the full-strength "current" bar,
  flipping the intended hierarchy. Fix: mix toward `--bg-elev-1`/`--bg`
  (dimmer = older) so it holds regardless of base lightness.
- **Thin marks vanish:** an outline/dashed swatch at reduced opacity
  (`color-mix(color 65%, transparent)`) over the dark track disappears for
  dark base colors. Thin dashed lines have no area to survive on. Fix: full
  opacity for outline variants, or a light-stroke floor.

**Why:** The single-hue approach itself is correct (ties page to one identity,
avoids reusing semantic tokens) — see [[semantic-color-tokens-are-load-bearing]].
The bug is always the specific color-mix recipe at the palette extremes.

**How to apply:** Whenever reviewing a new single-hue value scale or
faded/outline swatch keyed off an entity color, mentally test it with
#475569 (darkest) and #22d3ee/#eab308 (lightest) before approving.
