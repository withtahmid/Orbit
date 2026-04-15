import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const spaceMemberList = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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
            throw new Error("Failed to fetch space members");
        }
        return result;
    });
