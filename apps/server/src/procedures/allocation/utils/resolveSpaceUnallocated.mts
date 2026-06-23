import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * How much spendable cash in this space is not yet committed to an envelope.
 * On-read computation (the materialized balances table is gone).
 *
 * spendable = SUM(asset balances) − SUM(liability balances) (locked excluded)
 * held      = SUM(current-period envelope remaining, clamped to ≥ 0)
 * free      = spendable − held
 *
 * Envelope held:
 *   Per-envelope remaining = allocated − consumed, clamped to ≥ 0 so an
 *   overspent envelope shows as drift but doesn't inflate free cash. Monthly
 *   envelopes use the current calendar month (they reset each period, no
 *   carry-over). cadence='none' (rolling/goal) envelopes use the lifetime
 *   pool window [epoch, ∞). Matches `resolveEnvelopePeriodBalance`.
 */
export async function resolveSpaceUnallocated({
    trx,
    spaceId,
}: {
    trx: Kysely<DB>;
    spaceId: string;
}): Promise<number> {
    const row = await sql<{
        spendable: string | null;
        envelope_held: string | null;
    }>`
        WITH period AS (
            SELECT
                e.id AS envelop_id,
                e.cadence,
                CASE e.cadence
                    WHEN 'none' THEN DATE '1970-01-01'
                    WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                END AS p_start,
                CASE e.cadence
                    WHEN 'none' THEN DATE '9999-12-31'
                    WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                END AS p_end
            FROM envelops e
            WHERE e.space_id = ${spaceId}
        ),
        env_alloc AS (
            SELECT p.envelop_id, COALESCE(SUM(a.amount), 0) AS allocated
            FROM period p
            LEFT JOIN envelop_allocations a ON a.envelop_id = p.envelop_id
                AND (
                    (p.cadence = 'none' AND a.period_start IS NULL)
                    OR (
                        p.cadence <> 'none'
                        AND a.period_start >= p.p_start
                        AND a.period_start < p.p_end
                    )
                )
            GROUP BY p.envelop_id
        ),
        env_consume AS (
            SELECT p.envelop_id, COALESCE(SUM(t.amount), 0) AS consumed
            FROM period p
            LEFT JOIN transactions t ON t.envelop_id = p.envelop_id
                AND t.type = 'expense'
                AND t.transaction_datetime >= p.p_start
                AND t.transaction_datetime < p.p_end
            GROUP BY p.envelop_id
        )
        SELECT
            (
                SELECT COALESCE(SUM(
                    CASE
                        WHEN a.account_type = 'liability' THEN -ab.balance
                        WHEN a.account_type = 'locked' THEN 0
                        ELSE ab.balance
                    END
                ), 0)
                FROM account_balances ab
                JOIN accounts a ON a.id = ab.account_id
                JOIN space_accounts sa ON sa.account_id = ab.account_id
                WHERE sa.space_id = ${spaceId}
            ) AS spendable,
            (
                -- Held per envelope, clamped to ≥ 0: an overspent envelope
                -- holds no cash, so negative remaining doesn't inflate the
                -- unbudgeted pool.
                SELECT COALESCE(SUM(
                    GREATEST(0, ea.allocated - ec.consumed)
                ), 0)
                FROM env_alloc ea
                JOIN env_consume ec ON ec.envelop_id = ea.envelop_id
            ) AS envelope_held
    `
        .execute(trx)
        .then((r) => r.rows[0]);

    const spendable = Number(row?.spendable ?? 0);
    const envelopeHeld = Number(row?.envelope_held ?? 0);
    return spendable - envelopeHeld;
}
