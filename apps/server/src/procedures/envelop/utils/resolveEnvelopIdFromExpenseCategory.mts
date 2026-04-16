import { Kysely } from "kysely";
import { DB } from "../../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const resolveEnvelopIdFromExpenseCategory = async ({
    trx,
    expenseCategoryId,
}: {
    trx: Kysely<DB>;
    expenseCategoryId: string;
}) => {
    const record = await trx
        .selectFrom("expense_categories")
        .select("envelop_id")
        .where("id", "=", expenseCategoryId)
        .executeTakeFirst();

    if (!record) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Expense category not found",
        });
    }

    return record.envelop_id;
};
