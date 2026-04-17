import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { sql } from "kysely";
import { TRPCError } from "@trpc/server";

export const addMemberToAccount = authorizedProcedure
    .input(
        z.object({
            accountId: z.string().uuid(),
            users: z.array(
                z.object({
                    id: z.string().uuid(),
                    role: z.enum(["owner", "viewer"]),
                })
            ),
        })
    )

    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveAccountPermission({
                    trx,
                    accountId: input.accountId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                const insertValues = input.users.map((user) => ({
                    account_id: input.accountId,
                    user_id: user.id,
                    role: user.role as unknown as UserAccounts["role"],
                }));

                await trx
                    .insertInto("user_accounts")
                    .values(insertValues)
                    .onConflict((oc) =>
                        oc.columns(["account_id", "user_id"]).doUpdateSet({
                            role: sql`excluded.role`,
                        })
                    )
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to add members to account",
            });
        }
        return {
            message: "Members added to account successfully",
        };
    });
