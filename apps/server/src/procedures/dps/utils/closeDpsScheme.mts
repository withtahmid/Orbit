import type { Kysely, Selectable } from "kysely";
import { TRPCError } from "@trpc/server";
import type {
    DB,
    DpsSchemes,
    Transactions,
    UserAccounts,
} from "../../../db/kysely/types.mjs";

type DpsSchemeRow = Selectable<DpsSchemes>;
import { resolveSpaceMembership } from "../../space/utils/resolveSpaceMembership.mjs";
import { resolveAccountPermission } from "../../account/utils/resolveAccountPermission.mjs";
import { resolveTransactionSpaceIntegrity } from "../../transaction/utils/resolveTransactionSpaceIntegrity.mjs";

/**
 * Shared mechanics for closing a DPS scheme (matured, encashed early,
 * or abandoned).
 *
 *   1. Verify caller is `owner` of the space.
 *   2. Verify the scheme is currently `active`.
 *   3. Set the locked account balance to zero via an `adjustment`
 *      transaction (the only correct way to drain a locked account
 *      without weakening the global rule that locked accounts can't
 *      be transferred out of).
 *   4. If a `payoutAccountId` + `payoutAmount` were supplied, post an
 *      `income` transaction on that account for the full payout.
 *      Tagged with `dps_scheme_id` and `dpsPayoutCategoryId` (when
 *      provided) so the income shows up in analytics breakdowns.
 *   5. Flip `dps_schemes.status`, set `closed_at`/`matured_at`, and
 *      `final_payout_amount` / `early_encashment_rate_bps`.
 *   6. Insert a `dps_payouts` row for the lifecycle event, with
 *      `linked_transaction_id` pointing at the income row (if any).
 */
export const closeDpsScheme = async ({
    trx,
    scheme,
    userId,
    kind,
    occurredAt,
    payoutAmount,
    payoutAccountId,
    earlyEncashmentRateBps,
    note,
}: {
    trx: Kysely<DB>;
    scheme: DpsSchemeRow;
    userId: string;
    kind: "matured" | "encashed_early" | "abandoned";
    occurredAt: Date;
    payoutAmount: number | null;
    payoutAccountId: string | null;
    earlyEncashmentRateBps: number | null;
    note: string | null;
}) => {
    if (scheme.status !== "active") {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `DPS scheme is already ${scheme.status}; cannot ${kind} again`,
        });
    }
    await resolveSpaceMembership({
        trx,
        spaceId: scheme.space_id,
        userId,
        roles: ["owner"] as unknown as UserAccounts["role"][],
    });

    // 1) Drain the locked account balance to zero via adjustment.
    const balanceRow = await trx
        .selectFrom("account_balances")
        .select("balance")
        .where("account_id", "=", scheme.account_id)
        .executeTakeFirstOrThrow();
    const principalBefore = Number(balanceRow.balance);

    if (principalBefore > 0) {
        await trx
            .insertInto("transactions")
            .values({
                space_id: scheme.space_id,
                created_by: userId,
                type: "adjustment" as unknown as Transactions["type"],
                amount: principalBefore,
                source_account_id: scheme.account_id,
                destination_account_id: null,
                description: `DPS ${kind} — principal returned`,
                transaction_datetime: occurredAt,
                dps_scheme_id: scheme.id,
            })
            .execute();
    }

    // 2) Post the payout as income on the destination account (if any).
    let payoutTxnId: string | null = null;
    if (payoutAmount !== null && payoutAccountId) {
        // Caller must have access to the destination account.
        await resolveAccountPermission({
            trx,
            accountId: payoutAccountId,
            userId,
            roles: ["owner"] as unknown as UserAccounts["role"][],
        });
        await resolveTransactionSpaceIntegrity({
            trx,
            spaceId: scheme.space_id,
            sourceAccountId: null,
            destinationAccountId: payoutAccountId,
        });

        const txn = await trx
            .insertInto("transactions")
            .values({
                space_id: scheme.space_id,
                created_by: userId,
                type: "income" as unknown as Transactions["type"],
                amount: payoutAmount,
                source_account_id: null,
                destination_account_id: payoutAccountId,
                description: `DPS ${kind} payout — ${scheme.bank_name}`,
                transaction_datetime: occurredAt,
                dps_scheme_id: scheme.id,
            })
            .returning(["id"])
            .executeTakeFirstOrThrow();
        payoutTxnId = txn.id;
    }

    // 3) Update the scheme row.
    const patch: Record<string, unknown> = {
        status: kind,
        closed_at: occurredAt,
        updated_at: new Date(),
    };
    if (kind === "matured") patch.matured_at = occurredAt;
    if (payoutAmount !== null) patch.final_payout_amount = payoutAmount;
    if (earlyEncashmentRateBps !== null)
        patch.early_encashment_rate_bps = earlyEncashmentRateBps;
    await trx
        .updateTable("dps_schemes")
        .set(patch)
        .where("id", "=", scheme.id)
        .execute();

    // 4) Lifecycle ledger row.
    await trx
        .insertInto("dps_payouts")
        .values({
            dps_scheme_id: scheme.id,
            kind,
            occurred_at: occurredAt,
            cash_amount: payoutAmount,
            linked_transaction_id: payoutTxnId,
            note,
        })
        .execute();

    return { payoutTransactionId: payoutTxnId, principalReturned: principalBefore };
};
