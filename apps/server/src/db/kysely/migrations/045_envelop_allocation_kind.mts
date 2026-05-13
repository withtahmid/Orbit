import { Kysely, sql } from "kysely";

/**
 * Promote `envelop_allocations` to a typed ledger.
 *
 * Adds two columns:
 *   - `kind`         — the type of the entry. Today every row is a plain
 *                      allocate or a borrow link; the broader product
 *                      direction calls for `cover` (envelope→envelope
 *                      reallocation), `reckon` (closing entry), and
 *                      `restructure` (rename / cadence change recorded
 *                      against history). This column is the seam.
 *   - `effective_at` — when the entry should be considered *active* for
 *                      analytics, distinct from `created_at` (when the
 *                      row was written). Lets us backdate a reconciliation
 *                      or restructure event so historical periods keep
 *                      reading correctly. NULL means "same as
 *                      `created_at`" (the default for `kind='allocate'`
 *                      rows).
 *
 * Backfill:
 *   - rows with `borrowed_link_id IS NOT NULL` → `kind = 'borrow'`
 *   - everything else → `kind = 'allocate'` (the column default)
 *   - `effective_at` left NULL on every existing row; analytics readers
 *     COALESCE to `created_at` so today's behavior is preserved.
 *
 * No procedure or UI changes in this PR; this migration is purely
 * additive and reversible.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelop_allocations")
        .addColumn("kind", "text", (col) =>
            col.notNull().defaultTo("allocate")
        )
        .addColumn("effective_at", sql`timestamptz`)
        .execute();

    await sql`
        ALTER TABLE envelop_allocations
        ADD CONSTRAINT envelop_allocations_kind_check
        CHECK (kind IN (
            'allocate',
            'borrow',
            'cover',
            'reckon',
            'restructure'
        ))
    `.execute(db);

    await sql`
        UPDATE envelop_allocations
        SET kind = 'borrow'
        WHERE borrowed_link_id IS NOT NULL
    `.execute(db);

    /* Partial index for the analytics readers that will soon filter by
       kind. Tiny — most rows are 'allocate' which is the default and
       hits without a predicate anyway. */
    await sql`
        CREATE INDEX envelop_allocations_kind_idx
        ON envelop_allocations (kind)
        WHERE kind <> 'allocate'
    `.execute(db);
};

/**
 * Round-trip safety note for future contributors:
 *
 * Today this `down` is idempotent against a re-`up` because every existing
 * `kind='borrow'` row is recoverable from `borrowed_link_id IS NOT NULL`
 * (the only non-default value at the time of this migration). Once any
 * procedure writes `kind='cover' | 'reckon' | 'restructure'`, this
 * `down` becomes **destructive** — those rows lose their kind on the way
 * down and re-up as `kind='allocate'` with no recovery path. If you need
 * to roll this back after later kinds exist, write a preserving migration
 * that snapshots `(id, kind, effective_at)` to a side table before
 * dropping the columns.
 */
export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS envelop_allocations_kind_idx`.execute(db);
    await sql`
        ALTER TABLE envelop_allocations
        DROP CONSTRAINT IF EXISTS envelop_allocations_kind_check
    `.execute(db);
    await db.schema
        .alterTable("envelop_allocations")
        .dropColumn("effective_at")
        .dropColumn("kind")
        .execute();
};
