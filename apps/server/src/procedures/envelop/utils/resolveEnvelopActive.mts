import { Kysely } from "kysely";
import { TRPCError } from "@trpc/server";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * Throw if the envelope is archived. Use as a guard before any operation
 * that creates new state attached to the envelope: new categories, new
 * transactions whose category routes to it, etc.
 */
export async function resolveEnvelopActive({
    trx,
    envelopId,
}: {
    trx: Kysely<DB>;
    envelopId: string;
}): Promise<void> {
    const env = await trx
        .selectFrom("envelops")
        .select(["id", "archived", "name"])
        .where("envelops.id", "=", envelopId)
        .executeTakeFirst();

    if (!env) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Envelop not found",
        });
    }

    if (env.archived) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Envelope "${env.name}" is archived. Unarchive it first to add new activity.`,
        });
    }
}

/**
 * Same guard, but resolves the envelope via a category. Use for transaction
 * paths where the user picks a category and we need to verify its routed
 * envelope is still active.
 */
export async function resolveCategoryEnvelopActive({
    trx,
    expenseCategoryId,
}: {
    trx: Kysely<DB>;
    expenseCategoryId: string;
}): Promise<void> {
    const row = await trx
        .selectFrom("expense_categories")
        .innerJoin("envelops", "envelops.id", "expense_categories.envelop_id")
        .select(["envelops.id", "envelops.archived", "envelops.name"])
        .where("expense_categories.id", "=", expenseCategoryId)
        .executeTakeFirst();

    if (!row) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Category not found",
        });
    }

    if (row.archived) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This category routes to archived envelope "${row.name}". Move the category to an active envelope, or unarchive.`,
        });
    }
}
