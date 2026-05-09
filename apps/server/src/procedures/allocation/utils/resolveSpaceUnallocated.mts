import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * How much spendable cash in this space is not yet committed to an envelope
 * or plan. On-read computation (the materialized balances table is gone).
 *
 * spendable = SUM(asset balances) − SUM(liability balances) (locked excluded)
 * held      = SUM(current-period envelope remaining, incl. carryIn) + SUM(plan allocated)
 * free      = spendable − held
 *
 * Envelope held:
 *   Per-envelope current-period remaining, summed. For cadence='none' the
 *   window is [epoch, ∞). For cadence='monthly' it's the current calendar
 *   month. When `carry_over = true`, the previous period's remaining
 *   (clamped to ≥ 0) is added in as `carryIn` — matching
 *   `resolveEnvelopePeriodBalance`. The whole held value per envelope is
 *   clamped to ≥ 0 so that overspend shows as drift but doesn't inflate
 *   free cash.
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
                e.carry_policy,
                CASE e.cadence
                    WHEN 'none' THEN DATE '1970-01-01'
                    WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                END AS p_start,
                CASE e.cadence
                    WHEN 'none' THEN DATE '9999-12-31'
                    WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                END AS p_end,
                CASE e.cadence
                    WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) - INTERVAL '1 month')::date
                    ELSE NULL
                END AS prev_start,
                CASE e.cadence
                    WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                    ELSE NULL
                END AS prev_end
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
        ),
        env_prev_alloc AS (
            -- Only include previous-period allocations for envelopes that
            -- actually carry (positive_only OR both). 'reset' envelopes
            -- contribute zero carryIn so the join is skipped.
            SELECT p.envelop_id, COALESCE(SUM(a.amount), 0) AS allocated
            FROM period p
            LEFT JOIN envelop_allocations a ON a.envelop_id = p.envelop_id
                AND p.cadence <> 'none'
                AND p.carry_policy <> 'reset'
                AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.prev_start
                AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.prev_end
            GROUP BY p.envelop_id
        ),
        env_prev_consume AS (
            SELECT p.envelop_id, COALESCE(SUM(t.amount), 0) AS consumed
            FROM period p
            LEFT JOIN expense_categories ec ON ec.envelop_id = p.envelop_id
                AND p.cadence <> 'none'
                AND p.carry_policy <> 'reset'
            LEFT JOIN transactions t ON t.expense_category_id = ec.id
                AND t.type = 'expense'
                AND t.transaction_datetime >= p.prev_start
                AND t.transaction_datetime < p.prev_end
            GROUP BY p.envelop_id
        ),
        env_policy AS (
            SELECT envelop_id, carry_policy FROM period
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
                -- envelope_held per envelope, honoring carry_policy:
                --   reset         → carryIn = 0
                --   positive_only → carryIn = max(0, prev_remaining)
                --   both          → carryIn = prev_remaining (signed)
                -- Outer GREATEST(0, ...) clamps held to ≥ 0 because an
                -- overspent envelope holds no cash; we don't want negative
                -- holds inflating the unbudgeted pool.
                SELECT COALESCE(SUM(
                    GREATEST(
                        0,
                        CASE
                            WHEN ep.carry_policy = 'both' THEN
                                COALESCE(epa.allocated, 0) - COALESCE(epc.consumed, 0)
                            WHEN ep.carry_policy = 'positive_only' THEN
                                GREATEST(0, COALESCE(epa.allocated, 0) - COALESCE(epc.consumed, 0))
                            ELSE 0
                        END
                        + ea.allocated
                        - ec.consumed
                    )
                ), 0)
                FROM env_alloc ea
                JOIN env_consume ec ON ec.envelop_id = ea.envelop_id
                JOIN env_policy ep ON ep.envelop_id = ea.envelop_id
                LEFT JOIN env_prev_alloc epa ON epa.envelop_id = ea.envelop_id
                LEFT JOIN env_prev_consume epc ON epc.envelop_id = ea.envelop_id
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
