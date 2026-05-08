import { Kysely, sql } from "kysely";

/**
 * Adds a `borrowed_link_id` column on `envelop_allocations` to pair the two
 * rows that make up a "borrow from next month" action: a `+amount` row in
 * the current period and a `-amount` row in the next period of the same
 * envelope. Both rows share the same group UUID so the UI can show
 * "borrowed from May 2026" on the next month's view.
 *
 * Plain UUID column (not a self-FK) — both rows share the same value, so
 * the column groups them rather than pointing at one specific partner row.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelop_allocations")
        .addColumn("borrowed_link_id", "uuid")
        .execute();

    await sql`
        CREATE INDEX idx_envelop_allocations_borrow_link
        ON envelop_allocations (borrowed_link_id)
        WHERE borrowed_link_id IS NOT NULL
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_envelop_allocations_borrow_link`.execute(db);
    await db.schema
        .alterTable("envelop_allocations")
        .dropColumn("borrowed_link_id")
        .execute();
};
