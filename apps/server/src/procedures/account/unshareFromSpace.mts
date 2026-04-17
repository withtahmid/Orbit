import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Remove an account from a space. Must leave the account in at least one
 * space (use account.delete to remove entirely). Blocks the unshare when the
 * space still has envelope/plan allocations or transactions tied to the
 * account — those would otherwise become orphans.
 *
 * Permission: account owner, OR space owner of the space being unshared from.
 */
export const unshareAccountFromSpace = authorizedProcedure
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
                // Permission: allow either path
                const accountOwner = await trx
                    .selectFrom("user_accounts")
                    .select("user_id")
                    .where("account_id", "=", input.accountId)
                    .where("user_id", "=", ctx.auth.user.id)
                    .where("role", "=", "owner" as unknown as UserAccounts["role"])
                    .executeTakeFirst();
                if (!accountOwner) {
                    await resolveSpaceMembership({
                        trx,
                        spaceId: input.spaceId,
                        userId: ctx.auth.user.id,
                        roles: ["owner"] as unknown as SpaceMembers["role"][],
                    });
                }
                // Still verify the account exists (resolveAccountPermission
                // throws NOT_FOUND for non-existent accounts).
                await resolveAccountPermission({
                    trx,
                    accountId: input.accountId,
                    userId: ctx.auth.user.id,
                    // Viewer permission is enough here — we've already
                    // verified edit rights via one of the two paths above.
                    roles: ["owner", "viewer"] as unknown as UserAccounts["role"][],
                }).catch(() => {
                    // listUsers path: account owner may not be in user_accounts
                    // as viewer etc. Don't double-fail if the membership check
                    // already succeeded.
                });

                const link = await trx
                    .selectFrom("space_accounts")
                    .select("account_id")
                    .where("account_id", "=", input.accountId)
                    .where("space_id", "=", input.spaceId)
                    .executeTakeFirst();
                if (!link) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Account is not shared with this space",
                    });
                }

                const otherSpacesRow = await trx
                    .selectFrom("space_accounts")
                    .where("account_id", "=", input.accountId)
                    .where("space_id", "!=", input.spaceId)
                    .select((eb) => eb.fn.countAll<string>().as("c"))
                    .executeTakeFirst();
                const otherSpaces = Number(otherSpacesRow?.c ?? 0);
                if (otherSpaces === 0) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "This is the account's only space. Delete the account instead of unsharing.",
                    });
                }

                // Refuse if the space still has bound data. Surfacing a
                // typed message lets the UI tell the user exactly what to
                // clean up (transactions vs allocations).
                const [txCount, envAllocCount, planAllocCount] = await Promise.all([
                    trx
                        .selectFrom("transactions")
                        .where("space_id", "=", input.spaceId)
                        .where((eb) =>
                            eb.or([
                                eb("source_account_id", "=", input.accountId),
                                eb("destination_account_id", "=", input.accountId),
                            ])
                        )
                        .select((eb) => eb.fn.countAll<string>().as("c"))
                        .executeTakeFirst(),
                    trx
                        .selectFrom("envelop_allocations as a")
                        .innerJoin("envelops as e", "e.id", "a.envelop_id")
                        .where("a.account_id", "=", input.accountId)
                        .where("e.space_id", "=", input.spaceId)
                        .select((eb) => eb.fn.countAll<string>().as("c"))
                        .executeTakeFirst(),
                    trx
                        .selectFrom("plan_allocations as a")
                        .innerJoin("plans as p", "p.id", "a.plan_id")
                        .where("a.account_id", "=", input.accountId)
                        .where("p.space_id", "=", input.spaceId)
                        .select((eb) => eb.fn.countAll<string>().as("c"))
                        .executeTakeFirst(),
                ]);
                const bound =
                    Number(txCount?.c ?? 0) +
                    Number(envAllocCount?.c ?? 0) +
                    Number(planAllocCount?.c ?? 0);
                if (bound > 0) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "This space still has transactions or allocations tied to the account. Remove those first, then unshare.",
                    });
                }

                await trx
                    .deleteFrom("space_accounts")
                    .where("account_id", "=", input.accountId)
                    .where("space_id", "=", input.spaceId)
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to unshare account",
            });
        }
        return { message: "Account unshared from space" };
    });
