import { Kysely, sql } from "kysely";

/**
 * Repair `envelop_allocations` rows whose `period_start` drifted to the LAST
 * DAY of the previous month.
 *
 * Root cause: `period_start` is a tz-less `date`, but the write passed the
 * APP_TZ month-start *instant* (e.g. 2026-07-01 00:00 Asia/Dhaka =
 * 2026-06-30T18:00Z). When the DB session ran in GMT — which happened
 * intermittently because Neon's transaction-pooling endpoint drops a
 * post-connect `SET TIME ZONE` — casting that instant to `date` truncated to
 * 2026-06-30. Allocations are always month-starts by design, so any
 * `period_start` with day <> 1 is corrupted, and its intended month is the
 * month of `period_start + 1 day`.
 *
 * The going-forward fix is `db/index.mts` (session tz applied via the libpq
 * startup `options` parameter, which the pooler honors). This migration
 * cleans up rows already written under the drift. Idempotent: after it runs
 * no row has day <> 1, so re-running is a no-op. Safe under any session tz —
 * it does pure `date` arithmetic, which carries no timezone.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    // 1) Where a correct sibling already exists for the intended month (same
    //    envelope), fold the corrupted amount into it. Both rows are
    //    "allocate to month M" operations that got split across two date
    //    buckets by the tz flip-flop, so summing reconstructs the true total.
    await sql`
        UPDATE envelop_allocations t
        SET amount = t.amount + c.amount
        FROM (
            SELECT envelop_id, amount,
                   date_trunc('month', period_start + INTERVAL '1 day')::date AS target
            FROM envelop_allocations
            WHERE period_start IS NOT NULL
              AND EXTRACT(DAY FROM period_start) <> 1
        ) c
        WHERE t.envelop_id = c.envelop_id
          AND t.period_start = c.target
    `.execute(db);

    // 2) Delete the corrupted rows that were just merged in step 1.
    await sql`
        DELETE FROM envelop_allocations bad
        USING envelop_allocations good
        WHERE bad.period_start IS NOT NULL
          AND EXTRACT(DAY FROM bad.period_start) <> 1
          AND good.envelop_id = bad.envelop_id
          AND good.period_start =
              date_trunc('month', bad.period_start + INTERVAL '1 day')::date
    `.execute(db);

    // 3) Shift the remaining (non-colliding) corrupted rows onto the correct
    //    month-start. `date_trunc('month', ps + 1 day)` snaps a last-day value
    //    to the 1st of the intended month.
    await sql`
        UPDATE envelop_allocations
        SET period_start = date_trunc('month', period_start + INTERVAL '1 day')::date
        WHERE period_start IS NOT NULL
          AND EXTRACT(DAY FROM period_start) <> 1
    `.execute(db);
};

/**
 * Not reversible: the original drift dates are not recoverable, and
 * re-introducing them would reintroduce the bug. Intentional no-op.
 */
export const down = async (_db: Kysely<any>): Promise<void> => {};
