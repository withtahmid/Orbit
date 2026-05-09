import { Kysely, sql } from "kysely";

/**
 * Add `archived` to envelops. Soft-retire envelopes — they vanish from
 * default lists and can't accept new transactions/categories, but their
 * historical data (allocations, transactions via categories) stays
 * intact so past-month analytics keep rendering correctly.
 *
 * The partial index is sized for the hot read path: every list/utilization
 * query in the app filters by space and (mostly) by `archived = false`.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelops")
        .addColumn("archived", "boolean", (col) =>
            col.notNull().defaultTo(false)
        )
        .execute();

    await sql`
        CREATE INDEX idx_envelops_active
        ON envelops (space_id)
        WHERE archived = false
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_envelops_active`.execute(db);
    await db.schema.alterTable("envelops").dropColumn("archived").execute();
};
