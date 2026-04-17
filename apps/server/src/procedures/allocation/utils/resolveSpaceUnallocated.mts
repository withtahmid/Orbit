import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * Compute how much spendable cash in this space is *not yet* inside an
 * envelope or plan. "Spendable" explicitly excludes locked accounts (FD, DPS)
 * because that money can't be drawn from — allowing it into the allocatable
 * pool would over-state what's truly free.
 *
 * spendable = SUM(asset balances) − SUM(liability balances)   (locked excluded)
 * held      = SUM(envelop_balances.remaining) + SUM(plan_balances.allocated)
 * free      = spendable − held
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
                SELECT COALESCE(SUM(eb.remaining), 0)
                FROM envelop_balances eb
                JOIN envelops e ON e.id = eb.envelop_id
                WHERE e.space_id = ${spaceId}
            ) AS envelope_held,
            (
                SELECT COALESCE(SUM(pb.allocated), 0)
                FROM plan_balances pb
                JOIN plans p ON p.id = pb.plan_id
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
