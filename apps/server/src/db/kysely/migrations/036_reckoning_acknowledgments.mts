import { Kysely, sql } from "kysely";

/**
 * Track which past-month overspends a user has explicitly resolved.
 *
 * Each row marks: "user U, on space S, has acknowledged the reckoning
 * for envelope E for the period starting on P". Combined with the
 * `analytics.pendingReckoning` query, the dashboard knows which past
 * months still need attention.
 *
 * The PK on (space_id, envelop_id, user_id, period_start) enforces
 * "one ack per envelope per user per period" — re-acknowledging is a
 * harmless upsert no-op.
 *
 * Resolution kind is recorded for analytics / future "show me how I
 * resolved overspends last quarter" reports:
 *   - 'pulled'   — user pulled cover from another envelope.
 *   - 'borrowed' — user converted to next-month borrow.
 *   - 'absorbed' — user accepted the silent absorption.
 *
 * The resolution itself is performed via the existing transfer / borrow
 * / no-op procedures; this table just records the *acknowledgment* so
 * the dashboard banner can clear.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("reckoning_acknowledgments")
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("envelop_id", "uuid", (col) =>
            col.notNull().references("envelops.id").onDelete("cascade")
        )
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("period_start", "date", (col) => col.notNull())
        .addColumn("resolution", "text", (col) => col.notNull())
        .addColumn("acknowledged_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addPrimaryKeyConstraint("reckoning_acknowledgments_pk", [
            "space_id",
            "envelop_id",
            "user_id",
            "period_start",
        ])
        .execute();

    await sql`
        ALTER TABLE reckoning_acknowledgments
        ADD CONSTRAINT reckoning_acknowledgments_resolution_check
        CHECK (resolution IN ('pulled', 'borrowed', 'absorbed'))
    `.execute(db);

    await sql`
        CREATE INDEX idx_reckoning_acks_space_user
        ON reckoning_acknowledgments (space_id, user_id, period_start)
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_reckoning_acks_space_user`.execute(db);
    await db.schema.dropTable("reckoning_acknowledgments").execute();
};
