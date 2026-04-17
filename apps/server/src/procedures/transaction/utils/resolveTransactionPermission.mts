import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import type { DB, Transactions, UserAccounts } from "../../../db/kysely/types.mjs";
import { resolveAccountPermission } from "../../account/utils/resolveAccountPermission.mjs";

type TransactionType = Transactions["type"];

export const resolveTransactionPermission = async ({
    trx,
    sourceAccountId,
    destinationAccountId,
    userId,
    type,
}: {
    trx: Kysely<DB>;
    sourceAccountId: string | null;
    destinationAccountId: string | null;
    userId: string;
    type: TransactionType;
}) => {
    if (type === ("adjustment" as unknown as Transactions["type"])) {
        if (!sourceAccountId && !destinationAccountId) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                    "Either source or destination account is required for adjustment transactions",
            });
        }

        if (sourceAccountId) {
            await resolveAccountPermission({
                trx,
                accountId: sourceAccountId,
                userId,
                roles: ["owner"] as unknown as UserAccounts["role"][],
            });
        }

        if (destinationAccountId) {
            await resolveAccountPermission({
                trx,
                accountId: destinationAccountId,
                userId,
                roles: ["owner"] as unknown as UserAccounts["role"][],
            });
        }
        return;
    }
    if (type === ("income" as unknown as Transactions["type"])) {
        if (!destinationAccountId) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Destination account is required for income transactions",
            });
        }

        await resolveAccountPermission({
            trx,
            accountId: destinationAccountId,
            userId,
            roles: ["owner"] as unknown as UserAccounts["role"][],
        });
        return;
    }

    if (type === ("expense" as unknown as Transactions["type"])) {
        if (!sourceAccountId) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Source account is required for expense transactions",
            });
        }

        await resolveAccountPermission({
            trx,
            accountId: sourceAccountId,
            userId,
            roles: ["owner"] as unknown as UserAccounts["role"][],
        });

        await rejectIfLocked({ trx, accountId: sourceAccountId });
        return;
    }

    if (type === ("transfer" as unknown as Transactions["type"])) {
        if (!sourceAccountId || !destinationAccountId) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Source and destination accounts are required for transfer transactions",
            });
        }

        await resolveAccountPermission({
            trx,
            accountId: sourceAccountId,
            userId,
            roles: ["owner"] as unknown as UserAccounts["role"][],
        });

        await rejectIfLocked({ trx, accountId: sourceAccountId });

        const destinationOwnerMembership = await trx
            .selectFrom("user_accounts")
            .select("user_accounts.user_id")
            .where("user_accounts.account_id", "=", destinationAccountId)
            .where("user_accounts.user_id", "=", userId)
            .where("user_accounts.role", "=", "owner" as unknown as UserAccounts["role"])
            .executeTakeFirst();

        if (destinationOwnerMembership) {
            return;
        }

        const destinationViewerMembershipInSameSpace = await trx
            .selectFrom("user_accounts")
            .innerJoin(
                "space_accounts as destination_space_accounts",
                "destination_space_accounts.account_id",
                "user_accounts.account_id"
            )
            .innerJoin(
                "space_accounts as source_space_accounts",
                "source_space_accounts.space_id",
                "destination_space_accounts.space_id"
            )
            .select("user_accounts.user_id")
            .where("user_accounts.account_id", "=", destinationAccountId)
            .where("user_accounts.user_id", "=", userId)
            .where("user_accounts.role", "=", "viewer" as unknown as UserAccounts["role"])
            .where("source_space_accounts.account_id", "=", sourceAccountId)
            .executeTakeFirst();

        if (!destinationViewerMembershipInSameSpace) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have permission to transfer into the destination account",
            });
        }

        return;
    }

    throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported transaction type",
    });
};

const rejectIfLocked = async ({
    trx,
    accountId,
}: {
    trx: Kysely<DB>;
    accountId: string;
}) => {
    const acct = await trx
        .selectFrom("accounts")
        .select("account_type")
        .where("id", "=", accountId)
        .executeTakeFirst();
    if (!acct) return;
    if ((acct.account_type as unknown as string) === "locked") {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot spend or transfer out of a locked account",
        });
    }
};
