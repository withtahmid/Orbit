import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const spaceMemberList = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        await resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: input.spaceId,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
        });

        const [error, result] = await safeAwait(
            ctx.services.qb
                .selectFrom("space_members")
                .innerJoin("users", "users.id", "space_members.user_id")
                .select([
                    "users.id",
                    "users.email",
                    "users.first_name",
                    "users.last_name",
                    "users.avatar_url",
                    "space_members.role",
                ])
                .where("space_id", "=", input.spaceId)
                .execute()
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch space members",
            });
        }
        return result;
    });
