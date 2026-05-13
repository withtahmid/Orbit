import type { Kysely, Selectable } from "kysely";
import { TRPCError } from "@trpc/server";
import type {
    DB,
    DpsSchemes,
    Transactions,
    UserAccounts,
} from "../../../db/kysely/types.mjs";

type DpsSchemeRow = Selectable<DpsSchemes>;
import { resolveAccountPermission } from "../../account/utils/resolveAccountPermission.mjs";
import { resolveTransactionSpaceIntegrity } from "../../transaction/utils/resolveTransactionSpaceIntegrity.mjs";
import { resolveAvailableBalance } from "../../transaction/utils/resolveAvailableBalance.mjs";

/**
 * Post one DPS installment as a tagged transfer: source = the user's
 * savings account, destination = the DPS locked account. The transfer
 * is tagged with `dps_scheme_id` so the schedule + projection readers
 * can attribute it.
 *
 * `bypassAvailableBalance` is honored only for historical backfill of
 * old installments — Orbit doesn't have historical balance state, so
 * a 3-year-old installment can't sensibly be gated by today's balance.
 */
export const postDpsInstallment = async ({
    trx,
    scheme,
    userId,
    sourceAccountId,
    occurredAt,
    description,
    bypassAvailableBalance,
}: {
    trx: Kysely<DB>;
    scheme: DpsSchemeRow;
    userId: string;
    sourceAccountId: string;
    occurredAt: Date;
    description: string | null;
    bypassAvailableBalance: boolean;
}) => {
    if (scheme.status !== "active") {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot record installment on a ${scheme.status} DPS`,
        });
    }

    await resolveAccountPermission({
        trx,
        accountId: sourceAccountId,
        userId,
        roles: ["owner"] as unknown as UserAccounts["role"][],
    });

    await resolveTransactionSpaceIntegrity({
        trx,
        spaceId: scheme.space_id,
        sourceAccountId,
        destinationAccountId: scheme.account_id,
    });

    const amount = Number(scheme.installment_amount);
    if (!bypassAvailableBalance) {
        await resolveAvailableBalance({
            trx,
            accountId: sourceAccountId,
            requiredBalance: amount,
        });
    }

    const txn = await trx
        .insertInto("transactions")
        .values({
            space_id: scheme.space_id,
            created_by: userId,
            type: "transfer" as unknown as Transactions["type"],
            amount,
            source_account_id: sourceAccountId,
            destination_account_id: scheme.account_id,
            description,
            transaction_datetime: occurredAt,
            dps_scheme_id: scheme.id,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();
    return txn.id;
};
