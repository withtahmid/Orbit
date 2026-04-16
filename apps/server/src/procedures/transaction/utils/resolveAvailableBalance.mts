import { Kysely } from "kysely";
import { DB } from "../../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const resolveAvailableBalance = async ({
    trx,
    accountId,
    requiredBalance,
}: {
    trx: Kysely<DB>;
    accountId: string;
    requiredBalance: number;
}) => {
    const balanceRecord = await trx
        .selectFrom("account_balances")
        .select("balance")
        .where("account_balances.account_id", "=", accountId)
        .executeTakeFirst();

    if (!balanceRecord) {
        throw new TRPCError({
            code: "NOT_FOUND",
        });
    }

    if (Number(balanceRecord.balance) < Number(requiredBalance)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient funds",
        });
    }

    return balanceRecord.balance;
};
