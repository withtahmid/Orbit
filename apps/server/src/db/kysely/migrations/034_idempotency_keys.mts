import { Kysely, sql } from "kysely";

/**
 * Generic idempotency-key cache. Lets a mutation procedure detect that a
 * client has already submitted the same request (same `key`, same user,
 * same operation) and short-circuit by returning the cached response
 * instead of running the work twice.
 *
 * Why generic and not per-table:
 *   - Several mutations (transfer, borrow) write to multiple tables in
 *     one operation; a row-level idempotency column doesn't capture the
 *     whole operation cleanly.
 *   - Centralising it means new procedures opt in by importing the
 *     `withIdempotency` helper — no schema changes per feature.
 *
 * Race semantics:
 *   - The PRIMARY KEY on `key` makes "claim or fail" atomic. Two
 *     concurrent requests with the same key: one inserts, one violates
 *     the PK and re-reads to find the cached row.
 *   - Until the first request finishes and updates `response`, the cached
 *     row exists but `response` is NULL. A second request that arrives
 *     during that window throws CONFLICT — better than racing.
 *
 * Expiry:
 *   - 7 days is enough for "user double-clicked" / "browser retried" while
 *     keeping the table from growing unbounded. A periodic cleanup job
 *     can `DELETE FROM idempotency_keys WHERE expires_at < NOW()`.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("idempotency_keys")
        .addColumn("key", "uuid", (col) => col.primaryKey())
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("operation", "text", (col) => col.notNull())
        .addColumn("response", "jsonb")
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("expires_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW() + INTERVAL '7 days'`)
        )
        .execute();

    await sql`
        CREATE INDEX idx_idempotency_keys_expires
        ON idempotency_keys (expires_at)
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS idx_idempotency_keys_expires`.execute(db);
    await db.schema.dropTable("idempotency_keys").execute();
};
