import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const updateProfile = authorizedProcedure
    .input(
        z.object({
            firstName: z.string().trim().min(1, "First name is required").max(100),
            lastName: z.string().trim().min(1, "Last name is required").max(100),
        })
    )
    .output(
        z.object({
            first_name: z.string(),
            last_name: z.string(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [err, row] = await safeAwait(
            ctx.services.qb
                .updateTable("users")
                .set({ first_name: input.firstName, last_name: input.lastName })
                .where("id", "=", ctx.auth.user.id)
                .returning(["first_name", "last_name"])
                .executeTakeFirstOrThrow()
        );
        if (err) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to update profile",
            });
        }
        return row;
    });
