---
name: transactions-filter-strip-analytics-bar
description: TransactionsPage filter card now embeds the Tailwind-styled AnalyticsFilterBar inside an orbit-design .od-card — surface/height/label-casing mismatches to watch
metadata:
  type: project
---

TransactionsPage (`apps/web/src/pages/space/transactions/TransactionsPage.tsx`) filter strip has 3 stacked rows inside `.od-card.tx-filters`:
- row1 (`.tx-filter-row1`): search input + shared `<PeriodChip>` (from `components/shared/PeriodChip.tsx`).
- middle row: `<AnalyticsFilterBar className="tx-analytics-filter-bar">` (from `pages/space/analytics/components/AnalyticsFilterBar.tsx`) for Envelope/Account/Category multi-select. Now also carries `trailingChips`: `TxEventChip` (DropdownMenu, !isPersonal only), `TxAmountChip` (Popover, `w-64`, two raw `.od-input` min/max). (No-envelope chip was dropped in this rework.) Both trailing chips use `FILTER_CHIP_CLASS = "h-9 gap-1.5 px-2.5 text-sm sm:h-7 sm:text-[12px]"` + `FILTER_CHIP_ACTIVE = "border-warning/40 bg-warning/5 text-foreground"` — byte-identical to AnalyticsFilterBar's built-in ChipMultiSelect chips, so they match exactly (height/padding/active).
- row2 (`.tx-filter-row2`): type pill-bar (`.tx-typebar`, 26px cells) + `.tx-filter-count`.

`AnalyticsFilterBar` root is `-mt-1 flex flex-col gap-1.5` + passed className; `.tx-filters .tx-analytics-filter-bar { margin-top: 0 }` (specificity 0,2,0) correctly neutralizes the `-mt-1`.

**Why:** New/Edit tx filter redesign on branch `fix-transaction-filter` (uncommitted as of 2026-07). Single-select FilterChipPicker/PeriodChip local components were removed; env/acc/cat moved to URL-backed `useAnalyticsFilters` shared with analytics Spending views.

**Personal category chip (round 4):** AnalyticsFilterBar gained `personalCategories?: boolean` — TransactionsPage passes it so `/s/me` shows the Category chip (parity with regular spaces); analytics views (Trends/Heatmap/Categories) do NOT pass it, so their personal views stay chip-free. Data source is `trpc.personal.listCategories` (flat cross-space list). Caveat: `CategoryMultiSelect` builds ONE tree keyed on `parent_id` alone, but the server proc doc warns parent_id only makes sense within a space. UUID parent_ids don't collide cross-space so nesting is technically correct, but same-named categories across spaces render as indistinguishable top-level entries with no space label (UX ambiguity, not a layout/a11y break). Chip is otherwise byte-identical to space version.

**Balance column:** `showBalance` is now hardcoded `true` (always-on column, NOT gated on statement mode). `.tx-show-balance` always set on the card. Statement mode (`isStatementMode` = exactly one account selected) only changes rendering: hides the per-row account colour-dot and shows the `.tx-statement-note` banner. Grid track counts VERIFIED correct at all four variant × breakpoint combos incl. the 901-1280 nth-child(6)/(7) hide interplay. The nth-child hides target event(6)+by(7) in the non-personal DOM and by(6) in personal (7 reverted); Balance/actions indices (>=8) sit beyond the hidden range. Data rows have (tracks − 1) cells — the trailing action track is a deliberate empty gutter (pre-existing pattern, rows never render a trailing `tx-cell-actions` span). Mobile (<=900px) uses `.tx-mrow-balance` line, independent of the desktop grid.

**Balance rendering gotchas:** desktop `tx-cell-balance` inherits row `--fg` (readable); mobile `.tx-mrow-balance` sets `color: var(--fg-4)` (dimmest token) AND `Money variant="neutral"` emits `color:""` so it inherits `--fg-4` — dim, verify contrast. `Money` negative amounts always render red (`--expense`) regardless of variant, so an overdrawn balance auto-signals red (helpful). Colour-dot has `title` attr (desktop only) + From/To column names the account = non-colour cue present.

**How to apply / cross-system styling traps** (orbit-design CSS-var system vs Tailwind global theme):
- Global Tailwind semantic tokens (`--card` 9%, `--border`, `--muted-foreground`, `--warning`) ARE defined on `:root`, so they resolve inside `.orbit-design`. But they are a SEPARATE palette from orbit tokens (`--bg-elev-1` 17%, `--line`, `--fg-3`). See [[orbit-design-scoping]].
- Three different chip surfaces coexist in one card: PeriodChip = `bg-card` (9%), `.od-btn` = `--bg-elev-1` (17%), shadcn `outline` Button (the AnalyticsFilterBar multi-selects) = `bg-background` (5%, darkest). All on a card painted at `--bg-elev-1` (17%). Chips read at three different darknesses.
- Height mismatch by breakpoint: PeriodChip and shadcn buttons are `h-9` (36px) < 640px, but AnalyticsFilterBar chips shrink to `sm:h-7` (28px) >= 640px while PeriodChip stays `h-9` and `.od-btn`/typebar have their own heights. Rows don't align vertically at desktop.
- AnalyticsFilterBar hardcodes an uppercase "Filter" eyebrow label + its own `FilterSummaryLine`, duplicating the row2 active-chip/`.tx-filter-count` summary already present — two summary systems in one card.
- Label casing: AnalyticsFilterBar uses `text-muted-foreground` (global) for its eyebrow; orbit eyebrows use `--fg-3`. Close but not identical hue.
