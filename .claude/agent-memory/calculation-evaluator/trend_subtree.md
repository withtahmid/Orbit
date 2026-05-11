---
name: Trend cur/prev rule for category trees
description: When showing per-row trend in a tree, cur and prev must use the same level (leaf vs subtree)
type: feedback
---

In tree-display rows (Categories page, similar hierarchical reports), parents and leaves expose two amount fields: `spent_total` (direct rows only) and `subtree_spent` (rolled-up). If the display shows `subtree_spent` for parents and `spent_total` for leaves, the trend % computation must use the SAME field choice for both `cur` and `prev` — otherwise parent rows compare leaf-only this-period to leaf-only last-period while displaying subtree totals.

**Why:** CategoriesPage line ~484 currently does `cur = node.spent_total` for the trend, while displaying `node.subtree_spent` for depth=0. A category with $0 direct spend but $1000 subtree spend will always show trend = 0% even when the subtree changed dramatically.

**How to apply:**
- For any tree-display calc, build the prev-period map for BOTH leaf and subtree levels (mirror buildTree), and use the level that matches the displayed cur.
- This same pattern likely applies to other rollup views — check before assuming a single map.
