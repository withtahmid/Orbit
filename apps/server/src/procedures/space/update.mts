import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { TRPCError } from "@trpc/server";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const updateSpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255).optional(),
            budgetMode: z.enum(["flexible", "strict"]).optional(),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
            budgetMode: z.enum(["flexible", "strict"]),
        })
    )
    .mutation(async ({ ctx, input }) => {
        // Mode change is structural — owner-only, not editor.
        const requiredRoles =
            input.budgetMode !== undefined
                ? (["owner"] as unknown as SpaceMembers["role"][])
                : (["owner", "editor"] as unknown as SpaceMembers["role"][]);
        await resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: input.spaceId,
            userId: ctx.auth.user.id,
            roles: requiredRoles,
        });

        const [error, result] = await safeAwait(
            ctx.services.qb
                .updateTable("spaces")
                .set({
                    name: input.name,
                    budget_mode: input.budgetMode,
                    updated_by: ctx.auth.user.id,
                })
                .returning(["id", "name", "budget_mode"])
                .where("id", "=", input.spaceId)
                .executeTakeFirstOrThrow()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update space",
            });
        }

        return {
            id: result.id,
            name: result.name,
            budgetMode: result.budget_mode as "flexible" | "strict",
        };
    });
