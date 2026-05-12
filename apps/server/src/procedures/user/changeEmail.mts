import { z } from "zod";
import bcrypt from "bcrypt";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const changeEmail = authorizedProcedure
    .input(
        z.object({
            email: z
                .string()
                .email("Please enter a valid email address")
                .transform((e) => e.toLowerCase()),
            currentPassword: z.string().min(1, "Current password is required"),
        })
    )
    .output(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const userId = ctx.auth.user.id;

        const [err, row] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const me = await trx
                    .selectFrom("users")
                    .select(["id", "email", "password_hash", "deleted_at"])
                    .where("id", "=", userId)
                    .forUpdate()
                    .executeTakeFirst();
                if (!me || me.deleted_at) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                }
                const ok = await bcrypt.compare(input.currentPassword, me.password_hash);
                if (!ok) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Current password is incorrect",
                    });
                }
                if (input.email === me.email.toLowerCase()) {
                    return { email: me.email };
                }

                return trx
                    .updateTable("users")
                    .set({ email: input.email })
                    .where("id", "=", userId)
                    .returning(["email"])
                    .executeTakeFirstOrThrow();
            })
        );
        if (err) {
            if (err instanceof TRPCError) throw err;
            // Postgres unique-violation: another row already owns this
            // email (possibly via a concurrent signup/changeEmail).
            const code = (err as { code?: string }).code;
            if (code === "23505") {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "That email is already in use",
                });
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to update email",
            });
        }
        return row;
    });
