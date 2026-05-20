import { Kysely, sql } from "kysely";

/**
 * Fold goals into the envelope model.
 *
 * A "goal" is just a `cadence='none'` envelope with an optional target. Adds
 * `target_amount` and `target_date` to `envelops`, then drops the separate
 * `plans` and `plan_allocations` tables. Triggers and balance tables for
 * plans were already retired in migration 026, so nothing else needs cleanup.
 *
 * No data is migrated: production has no `plans` rows yet, and dev seeds
 * recreate everything from scratch. `down` therefore intentionally throws —
 * faithfully reconstituting the dropped subtree (migrations 0016, 0017, 020,
 * 022, 023, 025, 027, 040) would be busywork with no caller.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelops")
        .addColumn("target_amount", "numeric(20, 2)")
        .addColumn("target_date", "date")
        .execute();

    await sql`DROP TABLE IF EXISTS plan_allocations`.execute(db);
    await sql`DROP TABLE IF EXISTS plans`.execute(db);
};

export const down = async (_db: Kysely<any>): Promise<void> => {
    throw new Error(
        "irreversible: 046 dropped the plans subtree without data preservation"
    );
};
