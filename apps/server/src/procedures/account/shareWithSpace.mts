import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Share an existing account with another space. Creates a row in
 * space_accounts. The caller must be an owner of the account AND a member
 * (owner or editor) of the target space. Rejects if the account is already
 * in that space.
 *
 * Note: transactions / envelopes / categories are per-space, so sharing an
 * account simply lets a new space transact against its balance. Historical
 * transactions in other spaces remain visible only in those spaces.
 */
export const shareAccountWithSpace = authorizedProcedure
    .input(
        z.object({
            accountId: z.string().uuid(),
            spaceId: z.string().uuid(),
        })
    )
    .output(z.object({ message: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveAccountPermission({
                    trx,
                    accountId: input.accountId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                const existing = await trx
                    .selectFrom("space_accounts")
                    .select("account_id")
                    .where("account_id", "=", input.accountId)
                    .where("space_id", "=", input.spaceId)
                    .executeTakeFirst();
                if (existing) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Account is already shared with this space",
                    });
                }

                await trx
                    .insertInto("space_accounts")
                    .values({
                        account_id: input.accountId,
                        space_id: input.spaceId,
                    })
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to share account",
            });
        }
        return { message: "Account shared" };
    });
