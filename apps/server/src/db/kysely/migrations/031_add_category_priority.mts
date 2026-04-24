import { Kysely, sql } from "kysely";

/**
 * Priority tier on categories.
 *
 * Enables "essential / important / discretionary / luxury" reporting
 * at the most granular level users think about money: the category.
 * Children with NULL priority inherit from the nearest ancestor with
 * a non-NULL value — so you can tag "Groceries" as essential once and
 * only override the leaves that differ (e.g. premium imported cheese
 * as luxury). A root category with NULL priority bubbles up as
 * "unclassified" in analytics.
 *
 * Lives on the category (not the envelope) because a single envelope
 * can legitimately span tiers — groceries are mostly essential but
 * the occasional fancy splurge is luxury.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("expense_categories")
        .addColumn("priority", "text", (col) =>
            col.check(
                sql`priority IN ('essential','important','discretionary','luxury')`
            )
        )
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("expense_categories")
        .dropColumn("priority")
        .execute();
};
