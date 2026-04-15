import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";

export const listAccountsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: input.spaceId,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
        });

        const [error, accounts] = await safeAwait(
            ctx.services.qb
                .selectFrom("accounts")
                .innerJoin("space_accounts", "space_accounts.account_id", "accounts.id")
                .leftJoin("user_accounts", "space_accounts.account_id", "user_accounts.account_id")
                .where("space_accounts.space_id", "=", input.spaceId)
                .where("user_accounts.user_id", "=", ctx.auth.user.id)
                .select(["accounts.id", "accounts.name"])
                .execute()
        );
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch accounts for space",
            });
        }
        return accounts;
    });
