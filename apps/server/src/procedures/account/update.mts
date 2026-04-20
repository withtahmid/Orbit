import { TRPCError } from "@trpc/server";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveAccountPermission } from "./utils/resolveAccountPermission.mjs";
import { z } from "zod";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const updateAccount = authorizedProcedure
    .input(
        z
            .object({
                accountId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                color: z.string().regex(HEX).optional(),
                icon: z.string().min(1).max(48).optional(),
            })
            .refine(
                (d) => d.name !== undefined || d.color !== undefined || d.icon !== undefined,
                { message: "At least one field must be provided" }
            )
    )
    .mutation(async ({ ctx, input }) => {
        await resolveAccountPermission({
            trx: ctx.services.qb,
            accountId: input.accountId,
            userId: ctx.auth.user.id,
            roles: ["owner"] as unknown as UserAccounts["role"][],
        });

        const [error, result] = await safeAwait(
            ctx.services.qb
                .updateTable("accounts")
                .set({
                    name: input.name,
                    color: input.color,
                    icon: input.icon,
                    updated_at: new Date(),
                })
                .returning(["id", "name", "color", "icon"])
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
