import { sql, type RawBuilder } from "kysely";
import { z } from "zod";

/**
 * Shared Zod fields for the Spending Trends filter bar. Spread these
 * into each trends procedure's input object so the six procedures stay
 * in lock-step.
 *
 * Semantics (when an array is provided and non-empty):
 *   - `envelopeIds`: only transactions tagged with one of these envelopes.
 *     Excludes any transaction with `envelop_id IS NULL` (transfers,
 *     untagged expenses) — that's the user's mental model: "show me my
 *     Groceries envelope" should not include unrelated bare expenses.
 *   - `accountIds`: only transactions whose `source_account_id` is in
 *     the set. Matches the operational-mode definition of "money
 *     leaving this account."
 *   - `categoryIds`: expand to the full subtree (descendants included)
 *     and require `expense_category_id` to land in that set. Transfers
 *     have no category and are dropped when this filter is active.
 *
 * Empty arrays and missing values are equivalent — both mean "no
 * filter on this dimension."
 */
export const trendsFilterInputShape = {
    envelopeIds: z.array(z.string().uuid()).max(200).optional(),
    accountIds: z.array(z.string().uuid()).max(200).optional(),
    categoryIds: z.array(z.string().uuid()).max(200).optional(),
};

export type TrendsFilters = {
    envelopeIds?: string[];
    accountIds?: string[];
    categoryIds?: string[];
};

/**
 * Helper that returns an empty `sql\`\`` fragment when there is no
 * filter on the given dimension, so callers can interpolate
 * unconditionally without sprouting ternaries inside their queries.
 */
const EMPTY = sql``;

const hasItems = (arr: string[] | undefined): arr is string[] =>
    Array.isArray(arr) && arr.length > 0;

/**
 * Build the `selected_categories` recursive-CTE body for the supplied
 * roots, scoped to one or more spaces. Returns `null` when no category
 * filter is active.
 *
 * The recursion is bounded by `space_id` so a malicious or stale id
 * from another space can't pull foreign rows into the result, and so
 * the planner has a clean predicate to push down.
 *
 * Cycle guard: `expense_categories.parent_id` has no DB-side cycle
 * check, and the application-side `changeParent` mutation only forbids
 * `parent === self`. An A→B→A configuration would otherwise spin the
 * recursive query until the statement timeout fires. The `path` array
 * + `NOT (ec.id = ANY(path))` predicate refuses to revisit any node
 * already on the current recursion frontier — terminating at the
 * cycle without producing duplicate rows.
 */
export function buildSelectedCategoriesCTE(
    categoryIds: string[] | undefined,
    spaceIds: string[]
): RawBuilder<unknown> | null {
    if (!hasItems(categoryIds)) return null;
    return sql`
        SELECT id, ARRAY[id]::uuid[] AS path FROM expense_categories
        WHERE id = ANY(${categoryIds}::uuid[])
          AND space_id = ANY(${spaceIds}::uuid[])
        UNION ALL
        SELECT ec.id, sc.path || ec.id FROM expense_categories ec
        JOIN selected_categories sc ON ec.parent_id = sc.id
        WHERE ec.space_id = ANY(${spaceIds}::uuid[])
          AND NOT (ec.id = ANY(sc.path))
    `;
}

/** Wraps the CTE body in its `selected_categories AS (...)` declaration
 *  plus a trailing comma, ready to splice into a `WITH RECURSIVE` list.
 *  Returns an empty fragment when there's no category filter. */
export function selectedCategoriesCTEClause(
    categoryIds: string[] | undefined,
    spaceIds: string[]
): RawBuilder<unknown> {
    const body = buildSelectedCategoriesCTE(categoryIds, spaceIds);
    if (!body) return EMPTY;
    return sql`selected_categories AS (${body}),`;
}

/** `AND t.expense_category_id IN (SELECT id FROM selected_categories)`
 *  fragment — empty when no category filter. Drops transfers (no
 *  category) implicitly via the `IN` predicate. */
export function categoryFilterWhere(
    categoryIds: string[] | undefined
): RawBuilder<unknown> {
    if (!hasItems(categoryIds)) return EMPTY;
    return sql`AND t.expense_category_id IN (SELECT id FROM selected_categories)`;
}

/** `AND t.envelop_id = ANY(${ids})` fragment — empty when no envelope
 *  filter. Drops `envelop_id IS NULL` rows implicitly. */
export function envelopeFilterWhere(
    envelopeIds: string[] | undefined
): RawBuilder<unknown> {
    if (!hasItems(envelopeIds)) return EMPTY;
    return sql`AND t.envelop_id = ANY(${envelopeIds}::uuid[])`;
}

/** `AND account_id = ANY(${ids})` fragment for use inside the
 *  `scope_accounts` CTE — empty when no account filter. */
export function scopeAccountsFilter(
    accountIds: string[] | undefined
): RawBuilder<unknown> {
    if (!hasItems(accountIds)) return EMPTY;
    return sql`AND account_id = ANY(${accountIds}::uuid[])`;
}

/**
 * Intersect a JS array of owned/scoped account ids with an optional
 * user-supplied account filter. Used by personal-twin procedures that
 * pass account ids through `${owned}` rather than via a CTE.
 *
 * - Returns `owned` unchanged when no filter is active.
 * - Returns an empty array when the filter narrows to ids outside the
 *   owned set; callers MUST short-circuit on `[]` so they don't fire a
 *   query that would silently return everything (since `ANY('{}')` is
 *   always false but downstream OR'd `destination_account_id` predicates
 *   would still match unrelated rows).
 *
 * Empty-set policy is the caller's to choose, and the two valid choices
 * are equivalent in result:
 *   - Procedures with an OR'd `destination_account_id` branch (e.g.
 *     `personalSpendingHeatmap`) MUST early-return `[]` — see above.
 *   - Procedures whose ONLY account predicate is `source_account_id =
 *     ANY(${ids})` (e.g. `personalCategoryBreakdown`) may safely run the
 *     query: `ANY('{}')` is uniformly false, yielding zero spend (and,
 *     for the breakdown, every category at a zero total — the correct
 *     "nothing matched" view).
 */
export function intersectAccountIds(
    owned: string[],
    accountIds: string[] | undefined
): string[] {
    if (!hasItems(accountIds)) return owned;
    const allow = new Set(accountIds);
    return owned.filter((id) => allow.has(id));
}
