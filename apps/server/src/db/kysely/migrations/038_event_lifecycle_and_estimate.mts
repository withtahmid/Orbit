import { Kysely, sql } from "kysely";

/**
 * Event lifecycle + expense estimation:
 *   - status            : 'active' (default) | 'closed'. Closed events are
 *                         hidden from the transaction-entry picker but
 *                         remain in analytics, lists, and historical
 *                         filters. Reopenable.
 *   - estimated_amount  : optional expense budget. Null = no estimate.
 *   - closed_at         : set when status flips to 'closed', cleared on
 *                         reopen. Used for "Closed Mar 14" subtitles.
 *
 * Stored as text + CHECK rather than a pg enum so adding 'archived' later
 * is a one-line constraint update.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("events")
        .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
        .addColumn("estimated_amount", sql`numeric(14, 2)`)
        .addColumn("closed_at", "timestamptz")
        .execute();

    await sql`
        ALTER TABLE events
        ADD CONSTRAINT events_status_check
        CHECK (status IN ('active', 'closed'))
    `.execute(db);

    await sql`
        ALTER TABLE events
        ADD CONSTRAINT events_estimated_amount_check
        CHECK (estimated_amount IS NULL OR estimated_amount >= 0)
    `.execute(db);

    /* Hot read path: the transaction-entry picker filters by
       status = 'active' on every open. Partial index keeps that lookup
       cheap regardless of how many old closed events accumulate. */
    await sql`
        CREATE INDEX idx_events_space_status_active
        ON events (space_id, start_time DESC)
        WHERE status = 'active'
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_events_space_status_active`.execute(db);
    await sql`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_estimated_amount_check`.execute(
        db
    );
    await sql`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check`.execute(db);
    await db.schema.alterTable("events").dropColumn("closed_at").execute();
    await db.schema.alterTable("events").dropColumn("estimated_amount").execute();
    await db.schema.alterTable("events").dropColumn("status").execute();
};
