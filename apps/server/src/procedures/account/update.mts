import { TRPCError } from "@trpc/server";
import { UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import { z } from "zod";

export const updateAccount = authorizedProcedure
    .input(
        z.object({
            accountId: z.string().uuid(),
            name: z.string().min(1).max(255),
        })
    )
    .mutation(async ({ ctx, input }) => {
        await resolveAccountPermission({
            trx: ctx.services.qb,
            accountId: input.accountId,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor"] as unknown as UserAccounts["role"][],
        });

        const [error, result] = await safeAwait(
            ctx.services.qb
                .updateTable("accounts")
                .set({
                    name: input.name,
                })
                .returning(["id", "name"])
                .where("id", "=", input.accountId)
                .executeTakeFirstOrThrow()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update account",
            });
        }

        return result;
    });
