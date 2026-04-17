import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const eventTotals = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const res = await sql<{
                    event_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    start_time: Date;
                    end_time: Date;
                    description: string | null;
                    expense_total: string;
                    income_total: string;
                    tx_count: string;
                }>`
                    SELECT
                        ev.id::text AS event_id,
                        ev.name, ev.color, ev.icon, ev.start_time, ev.end_time, ev.description,
                        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)::text AS expense_total,
                        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)::text AS income_total,
                        COUNT(t.id)::text AS tx_count
                    FROM events ev
                    LEFT JOIN transactions t ON t.event_id = ev.id
                    WHERE ev.space_id = ${input.spaceId}
                    GROUP BY ev.id
                    ORDER BY ev.start_time DESC
                `.execute(trx);

                return res.rows.map((r) => ({
                    eventId: r.event_id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    startTime: new Date(r.start_time),
                    endTime: new Date(r.end_time),
                    description: r.description,
                    expenseTotal: Number(r.expense_total),
                    incomeTotal: Number(r.income_total),
                    txCount: Number(r.tx_count),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute event totals",
            });
        }
        return result;
    });
