---
name: category-breakdown-semantics
description: How subtreeTotal vs directTotal work in the category analytics, and why summing root subtreeTotals never double-counts
metadata:
  type: project
---

The `categoryBreakdown` analytics (server `procedures/analytics/categoryBreakdown.mts`, web `pages/space/analytics/views/CategoriesView.tsx`) follow a strict forest model.

Fact: `expense_categories.parent_id` is a single nullable FK to `expense_categories.id` (migration 0012). So categories form a strict forest — each node has at most one parent and belongs to exactly ONE root's subtree.

**Why:** This is the load-bearing invariant for the analytics math.

**How to apply when auditing category aggregations:**
- `directTotal` = spend tagged directly to that category (one transaction → exactly one `expense_category_id`, summed once in the `spends` GROUP BY).
- `subtreeTotal` = directTotal of the category + all its descendants, via the recursive CTE `tree` that tags each spending category with its subtree root and filters `WHERE t.root = ec.id`.
- Summing `subtreeTotal` over ROOT categories only (`parentId === null`) = total expense spend, NO double-counting — each category is in exactly one root's subtree. Do NOT sum subtreeTotal over ALL categories (that double-counts every ancestor level).
- Subtree decomposition identity: `parent.subtreeTotal === parent.directTotal + Σ child.subtreeTotal` over immediate children (disjoint + exhaustive). This is why the "(direct)" donut pseudo-slice + child slices reconstruct the focused parent's total with no gap/overlap.

The CategoriesView donut previously grouped root subtreeTotals by envelopId at the top level; as of branch fix/balance-signed it shows root categories directly. Both top-level modes are arithmetically equivalent re: total (envelopes were just a regrouping of the same root sums). Verified correct 2026-06-02.
