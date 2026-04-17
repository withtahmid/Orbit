import { Kysely, sql } from "kysely";

/**
 * Add optional (account_id, period_start) to envelop_allocations and
 * plan_allocations. Both nullable on purpose:
 *   - account_id NULL  → unassigned pool (allocation is pinned to an envelope
 *                        but not to a specific account)
 *   - period_start NULL → "derive from created_at via the envelope's cadence"
 *                         (for cadence='none', period_start is irrelevant)
 *
 * Restrict on delete because a row in envelop_allocations / plan_allocations
 * materially reduces the account's unallocated balance — if the account
 * disappears we want that to fail loudly rather than silently orphaning the
 * tie.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelop_allocations")
        .addColumn("account_id", "uuid", (col) =>
            col.references("accounts.id").onDelete("restrict")
        )
        .addColumn("period_start", "date")
        .execute();

    await db.schema
        .alterTable("plan_allocations")
        .addColumn("account_id", "uuid", (col) =>
            col.references("accounts.id").onDelete("restrict")
        )
        .execute();

    await sql`
        CREATE INDEX idx_envelop_allocations_scope
        ON envelop_allocations (envelop_id, account_id, period_start)
    `.execute(db);

    await sql`
        CREATE INDEX idx_plan_allocations_scope
        ON plan_allocations (plan_id, account_id)
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_plan_allocations_scope`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_envelop_allocations_scope`.execute(db);

    await db.schema.alterTable("plan_allocations").dropColumn("account_id").execute();

    await db.schema
        .alterTable("envelop_allocations")
        .dropColumn("period_start")
        .execute();
    await db.schema.alterTable("envelop_allocations").dropColumn("account_id").execute();
};
