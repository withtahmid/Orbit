import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";

/**
 * List the spaces this account is currently shared with, along with the
 * caller's role in each (if any — an account can be in a space where the
 * caller isn't a member, e.g. if another owner shared it elsewhere).
 */
export const listAccountSpaces = authorizedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                await resolveAccountPermission({
                    trx: ctx.services.qb,
                    accountId: input.accountId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "viewer"] as unknown as UserAccounts["role"][],
                });

                return ctx.services.qb
                    .selectFrom("space_accounts")
                    .innerJoin("spaces", "spaces.id", "space_accounts.space_id")
                    .leftJoin("space_members", (join) =>
                        join
                            .onRef("space_members.space_id", "=", "spaces.id")
                            .on("space_members.user_id", "=", ctx.auth.user.id)
                    )
                    .where("space_accounts.account_id", "=", input.accountId)
                    .select([
                        "spaces.id as space_id",
                        "spaces.name as space_name",
                        "space_members.role as my_role",
                        "space_accounts.created_at as shared_at",
                    ])
                    .orderBy("space_accounts.created_at", "asc")
                    .execute();
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list account spaces",
            });
        }
        return (result ?? []).map((r) => ({
            spaceId: r.space_id,
            name: r.space_name,
            myRole: (r.my_role as unknown as "owner" | "editor" | "viewer" | null) ?? null,
            sharedAt: new Date(r.shared_at),
        }));
    });
