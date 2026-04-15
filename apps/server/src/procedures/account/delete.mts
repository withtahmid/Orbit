import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import { UserAccounts } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const deleteAccount = authorizedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveAccountPermission({
                    trx,
                    accountId: input.accountId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });
                await trx
                    .deleteFrom("accounts")
                    .where("accounts.id", "=", input.accountId)
                    .executeTakeFirst();
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete account",
            });
        }
    });
