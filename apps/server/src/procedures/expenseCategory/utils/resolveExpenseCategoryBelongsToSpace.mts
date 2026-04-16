import { Kysely } from "kysely";
import { DB } from "../../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const resolveExpenseCategoryBelongsToSpace = async ({
    trx,
    expenseCategoryId,
    spaceId,
}: {
    trx: Kysely<DB>;
    expenseCategoryId: string;
    spaceId: string;
}) => {
    const record = await trx
        .selectFrom("expense_categories")
        .select("id")
        .where("id", "=", expenseCategoryId)
        .where("space_id", "=", spaceId)
        .executeTakeFirst();

    if (!record) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Expense category not found in the specified space",
        });
    }
};
