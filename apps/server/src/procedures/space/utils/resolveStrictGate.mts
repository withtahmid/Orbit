import { Kysely, sql } from "kysely";
import { TRPCError } from "@trpc/server";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * Strict-mode budget gate. Throws if:
 *   - The space's `budget_mode` is 'strict', AND
 *   - The current user has unresolved past-month overspends in this space.
 *
 * This enforces "you must reckon with last month's overspend before
 * recording new transactions" — the YNAB-style accountability path.
 *
 * Flexible-mode spaces always pass. Strict-mode spaces with no pending
 * overspends also pass. Only the combination throws.
 *
 * Per-user gating: each user reckons with their own view of the past.
 * Sharing a space doesn't force you to wait on a co-owner's resolution.
 */
export async function resolveStrictGate({
    trx,
    spaceId,
    userId,
}: {
    trx: Kysely<DB>;
    spaceId: string;
    userId: string;
}): Promise<void> {
    const space = await trx
        .selectFrom("spaces")
        .select(["budget_mode"])
        .where("id", "=", spaceId)
        .executeTakeFirst();

    if (!space || space.budget_mode !== "strict") return;

    const now = new Date();
    const currentMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    // Same lookback as the reckoning UI — anything older than 90 days
    // doesn't block. Keeps strict mode from holding users hostage to
    // ancient drift.
    const lookbackStart = new Date(now.getTime() - 90 * 86_400_000);

    const pending = await sql<{ count: string }>`
        WITH months AS (
            SELECT generate_series(
                DATE_TRUNC('month', ${lookbackStart}::timestamp),
                DATE_TRUNC('month', ${currentMonthStart}::timestamp) - INTERVAL '1 day',
                INTERVAL '1 month'
            ) AS m_start
        )
        SELECT COUNT(*)::text AS count
        FROM envelops e
        CROSS JOIN months m
        WHERE e.space_id = ${spaceId}
          AND e.cadence = 'monthly'
          AND e.archived = false
          AND (m.m_start + INTERVAL '1 month') <= ${currentMonthStart}
          -- consumed includes transfer fees rolling up to this
          -- envelope; matches analytics.envelopeUtilization so a
          -- fee-only overspend correctly trips the strict gate.
          AND COALESCE((
              SELECT SUM(entry.amount) FROM (
                  SELECT t.amount
                  FROM transactions t
                  JOIN expense_categories ec ON ec.id = t.expense_category_id
                  WHERE ec.envelop_id = e.id
                    AND t.type = 'expense'
                    AND t.transaction_datetime >= m.m_start
                    AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                  UNION ALL
                  SELECT t.fee_amount AS amount
                  FROM transactions t
                  JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                  WHERE ec.envelop_id = e.id
                    AND t.type = 'transfer'
                    AND t.fee_amount IS NOT NULL
                    AND t.transaction_datetime >= m.m_start
                    AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
              ) entry
          ), 0) > COALESCE((
              SELECT SUM(a.amount)
              FROM envelop_allocations a
              WHERE a.envelop_id = e.id
                AND COALESCE(
                      a.period_start,
                      DATE_TRUNC('month', a.created_at)::date
                    ) = m.m_start::date
          ), 0)
          AND NOT EXISTS (
              SELECT 1 FROM reckoning_acknowledgments r
              WHERE r.space_id = ${spaceId}
                AND r.envelop_id = e.id
                AND r.user_id = ${userId}
                AND r.period_start = m.m_start::date
          )
    `
        .execute(trx)
        .then((r) => Number(r.rows[0]?.count ?? 0));

    if (pending > 0) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
                "This space is in Strict budget mode. Settle your past-month overspends from the reckoning page before recording new transactions.",
        });
    }
}
