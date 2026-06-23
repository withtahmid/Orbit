import { Kysely, sql } from "kysely";

/**
 * Simplify the budgeting model.
 *
 * The allocation ledger is collapsed from an append-only, on-read,
 * timestamped ledger into **one absolute row per (envelope, month)** for
 * monthly envelopes and **one lifetime row** (period_start NULL) for
 * rolling/goal envelopes. With that, the supporting machinery is removed:
 *
 *   - Borrowing-from-next-month: the linked +/- borrow rows are dropped.
 *     Borrowed money was never really there, so the current month simply
 *     reads as overspent (now fine) and next month is no longer penalised.
 *   - The typed-ledger seam (`kind`, `effective_at`) and the borrow link
 *     (`borrowed_link_id`) are removed — we are deliberately not pursuing
 *     the typed-ledger direction.
 *   - Per-account allocation (`account_id`) is dropped: allocations are
 *     space-wide. Existing per-account rows sum into the space-wide row.
 *   - Carry-over (`carry_policy`, `carry_over`) is removed: monthly
 *     envelopes reset each period; rolling/goal envelopes keep going.
 *   - Strict budget mode (`spaces.budget_mode`) and the reckoning
 *     acknowledgment table are removed — overspend is shown in analytics,
 *     never blocked or nagged.
 *
 * Per-allocation history and attribution are intentionally lost; the
 * collapsed row keeps the last writer's `created_by`.
 *
 * `down` restores the schema structurally (NOT the lost data).
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    // 1. Drop borrow rows (both the +current and −next legs).
    await sql`DELETE FROM envelop_allocations WHERE kind = 'borrow'`.execute(db);

    // 2. Collapse to one row per (envelop_id, effective_month). Monthly
    //    envelopes key on their month; rolling/goal collapse to a single
    //    NULL-period row. amount = SUM; created_by = latest writer.
    await sql`
        CREATE TEMP TABLE _alloc_collapsed ON COMMIT DROP AS
        WITH eff AS (
            SELECT
                a.envelop_id,
                a.amount,
                a.created_at,
                a.created_by,
                CASE WHEN e.cadence = 'monthly'
                    THEN COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date)
                    ELSE NULL
                END AS eff_period
            FROM envelop_allocations a
            JOIN envelops e ON e.id = a.envelop_id
        ),
        sums AS (
            SELECT envelop_id, eff_period,
                   SUM(amount) AS amount,
                   MAX(created_at) AS created_at
            FROM eff
            GROUP BY envelop_id, eff_period
        ),
        last_writer AS (
            SELECT DISTINCT ON (envelop_id, eff_period)
                   envelop_id, eff_period, created_by
            FROM eff
            ORDER BY envelop_id, eff_period, created_at DESC
        )
        SELECT
            s.envelop_id,
            s.eff_period AS period_start,
            s.amount,
            s.created_at,
            lw.created_by
        FROM sums s
        JOIN last_writer lw
          ON lw.envelop_id = s.envelop_id
         AND lw.eff_period IS NOT DISTINCT FROM s.eff_period
    `.execute(db);

    await sql`DELETE FROM envelop_allocations`.execute(db);

    await sql`
        INSERT INTO envelop_allocations (envelop_id, amount, period_start, created_at, created_by)
        SELECT envelop_id, amount, period_start, created_at, created_by
        FROM _alloc_collapsed
    `.execute(db);

    // 3. Drop the now-dead allocation columns + their indexes/constraints.
    await sql`DROP INDEX IF EXISTS envelop_allocations_kind_idx`.execute(db);
    await sql`ALTER TABLE envelop_allocations DROP CONSTRAINT IF EXISTS envelop_allocations_kind_check`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_envelop_allocations_borrow_link`.execute(db);
    await db.schema
        .alterTable("envelop_allocations")
        .dropColumn("account_id")
        .dropColumn("kind")
        .dropColumn("effective_at")
        .dropColumn("borrowed_link_id")
        .execute();

    // 4. One row per (envelope, period). NULLS NOT DISTINCT so the single
    //    NULL-period row for rolling/goal envelopes is also unique.
    await sql`
        CREATE UNIQUE INDEX envelop_allocations_envelop_period_uq
        ON envelop_allocations (envelop_id, period_start) NULLS NOT DISTINCT
    `.execute(db);

    // 5. Drop carry-over from envelops.
    await sql`ALTER TABLE envelops DROP CONSTRAINT IF EXISTS envelops_carry_policy_check`.execute(db);
    await db.schema
        .alterTable("envelops")
        .dropColumn("carry_policy")
        .dropColumn("carry_over")
        .execute();

    // 6. Drop strict budget mode from spaces.
    await sql`ALTER TABLE spaces DROP CONSTRAINT IF EXISTS spaces_budget_mode_check`.execute(db);
    await db.schema.alterTable("spaces").dropColumn("budget_mode").execute();

    // 7. Drop the reckoning acknowledgments table.
    await sql`DROP INDEX IF EXISTS idx_reckoning_acks_space_user`.execute(db);
    await db.schema.dropTable("reckoning_acknowledgments").ifExists().execute();
};

/**
 * Structural rollback only — the dropped ledger history, per-account
 * allocations, carry policies, budget modes, and acknowledgments are NOT
 * recoverable. Re-adds columns/tables so a re-`up` finds the expected shape.
 */
export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS envelop_allocations_envelop_period_uq`.execute(db);

    await db.schema
        .alterTable("envelop_allocations")
        .addColumn("account_id", "uuid", (col) =>
            col.references("accounts.id").onDelete("set null")
        )
        .addColumn("kind", "text", (col) => col.notNull().defaultTo("allocate"))
        .addColumn("effective_at", sql`timestamptz`)
        .addColumn("borrowed_link_id", "uuid")
        .execute();

    await sql`
        ALTER TABLE envelop_allocations
        ADD CONSTRAINT envelop_allocations_kind_check
        CHECK (kind IN ('allocate', 'borrow', 'cover', 'reckon', 'restructure'))
    `.execute(db);
    await sql`
        CREATE INDEX idx_envelop_allocations_borrow_link
        ON envelop_allocations (borrowed_link_id)
        WHERE borrowed_link_id IS NOT NULL
    `.execute(db);
    await sql`
        CREATE INDEX envelop_allocations_kind_idx
        ON envelop_allocations (kind)
        WHERE kind <> 'allocate'
    `.execute(db);

    await db.schema
        .alterTable("envelops")
        .addColumn("carry_over", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("carry_policy", "text", (col) => col.notNull().defaultTo("reset"))
        .execute();
    await sql`
        ALTER TABLE envelops
        ADD CONSTRAINT envelops_carry_policy_check
        CHECK (carry_policy IN ('reset', 'positive_only', 'both'))
    `.execute(db);

    await db.schema
        .alterTable("spaces")
        .addColumn("budget_mode", "text", (col) => col.notNull().defaultTo("flexible"))
        .execute();
    await sql`
        ALTER TABLE spaces
        ADD CONSTRAINT spaces_budget_mode_check
        CHECK (budget_mode IN ('flexible', 'strict'))
    `.execute(db);

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
