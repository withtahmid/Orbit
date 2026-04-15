import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const listSpaces = authorizedProcedure
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                name: z.string().max(255),
                myRole: z.enum(["owner", "editor", "viewer"]),
            })
        )
    )
    .query(async ({ ctx }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb
                .selectFrom("spaces")
                .innerJoin("space_members", "space_members.space_id", "spaces.id")
                .select(["spaces.id", "spaces.name", "space_members.role as myRole"])
                .where("space_members.user_id", "=", ctx.auth.user.id)
                .execute()
        );

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch spaces",
            });
        }

        return result.map((space) => ({
            ...space,
            myRole: z.enum(["owner", "editor", "viewer"]).parse(space.myRole),
        }));
    });
