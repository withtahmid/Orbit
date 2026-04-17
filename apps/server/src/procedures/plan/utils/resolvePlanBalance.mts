import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

export interface PlanBalanceRow {
    planId: string;
    accountId: string | null;
    allocated: number;
}

/**
 * Plans have no cadence — they're rolling goal buckets. Balance is simply
 * the signed sum of allocations filtered by the optional account scope.
 * Transactions never consume plan allocations directly; they can only be
 * reduced by explicit deallocation (negative allocation) or by a transfer
 * handled in allocation/transfer.mts.
 *
 * `accountId` scoping:
 *   undefined → roll up across accounts (plan total)
 *   null      → only allocations with account_id IS NULL (unassigned pool)
 *   string    → only the given account partition
 */
export async function resolvePlanBalance({
    trx,
    planId,
    accountId,
}: {
    trx: Kysely<DB>;
    planId: string;
    accountId?: string | null | undefined;
}): Promise<PlanBalanceRow> {
    const row = await sql<{ allocated: string }>`
        SELECT COALESCE((
            SELECT SUM(amount)
            FROM plan_allocations
            WHERE plan_id = ${planId}
              AND ${sql.raw(accountMatch(accountId))}
        ), 0)::text AS allocated
    `
        .execute(trx)
        .then((r) => r.rows[0]);

    return {
        planId,
        accountId: accountId === undefined ? null : accountId,
        allocated: Number(row?.allocated ?? 0),
    };
}

function accountMatch(accountId: string | null | undefined): string {
    if (accountId === undefined) return "TRUE";
    if (accountId === null) return "account_id IS NULL";
    const safe = accountId.replace(/'/g, "''");
    return `account_id = '${safe}'::uuid`;
}
