import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * How much spendable cash in this space is not yet committed to an envelope
 * or plan. On-read computation (the materialized balances table is gone).
 *
 * spendable = SUM(asset balances) − SUM(liability balances) (locked excluded)
 * held      = SUM(current-period envelope remaining) + SUM(plan allocated)
 * free      = spendable − held
 *
 * Envelope held:
 *   Per-envelope current-period remaining, summed. For cadence='none' the
 *   window is [epoch, ∞). For cadence='monthly' it's the current calendar
 *   month. Remaining = sum(allocations in period) − sum(expenses in period),
 *   clamped to ≥ 0 (overspend shows as drift but doesn't inflate free cash).
 *
 * Plan held:
 *   Sum of all plan allocations (rolling, no period). Net of signed
 *   allocations — includes unassigned and all account-pinned plan alloc.
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
        plan_held: string | null;
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
                    p.cadence = 'none'
                    OR (
                        COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.p_start
                        AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.p_end
                    )
                )
            GROUP BY p.envelop_id
        ),
        env_consume AS (
            SELECT p.envelop_id, COALESCE(SUM(t.amount), 0) AS consumed
            FROM period p
            LEFT JOIN expense_categories ec ON ec.envelop_id = p.envelop_id
            LEFT JOIN transactions t ON t.expense_category_id = ec.id
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
                SELECT COALESCE(SUM(GREATEST(0, ea.allocated - ec.consumed)), 0)
                FROM env_alloc ea
                JOIN env_consume ec ON ec.envelop_id = ea.envelop_id
            ) AS envelope_held,
            (
                SELECT COALESCE(SUM(pa.amount), 0)
                FROM plan_allocations pa
                JOIN plans p ON p.id = pa.plan_id
                WHERE p.space_id = ${spaceId}
            ) AS plan_held
    `
        .execute(trx)
        .then((r) => r.rows[0]);

    const spendable = Number(row?.spendable ?? 0);
    const envelopeHeld = Number(row?.envelope_held ?? 0);
    const planHeld = Number(row?.plan_held ?? 0);
    return spendable - envelopeHeld - planHeld;
}
