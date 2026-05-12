import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    ALL_ROLES,
    resolveSpaceMembership,
} from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Category week-over-week movement for the Overview TopMovers card.
 * Uses the trailing 7-day window ending at `anchor` and compares it to
 * the 7 days immediately before that. Sorted by absolute delta amount
 * desc — biggest swings (gains or drops) bubble to the top.
 */
export const categoryWoW = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            anchor: z.coerce.date().optional(),
            limit: z.number().int().min(1).max(20).default(6),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ALL_ROLES,
                });

                const anchor = input.anchor ?? new Date();
                const weekMs = 7 * 24 * 60 * 60 * 1000;
                const curStart = new Date(anchor.getTime() - weekMs);
                const prvStart = new Date(curStart.getTime() - weekMs);

                /* Scope by `space_accounts` (cash-flow rule §12) instead
                   of `t.space_id` (categorization tag). The latter would
                   drop expenses paid out of an account shared into this
                   space but recorded against another space's tag. */
                const rows = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    cur: string;
                    prv: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    spending AS (
                        SELECT
                            t.expense_category_id AS category_id,
                            t.amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.expense_category_id IS NOT NULL
                          AND t.transaction_datetime >= ${prvStart}
                          AND t.transaction_datetime < ${anchor}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(SUM(CASE WHEN s.dt >= ${curStart} THEN s.amount ELSE 0 END), 0)::text AS cur,
                        COALESCE(SUM(CASE WHEN s.dt < ${curStart} THEN s.amount ELSE 0 END), 0)::text AS prv
                    FROM spending s
                    JOIN expense_categories ec ON ec.id = s.category_id
                    GROUP BY ec.id, ec.name, ec.color, ec.icon
                `.execute(trx);

                const items = rows.rows.map((r) => {
                    const cur = Number(r.cur);
                    const prv = Number(r.prv);
                    const deltaAmount = cur - prv;
                    const deltaPct =
                        prv === 0
                            ? cur > 0
                                ? 1
                                : 0
                            : (cur - prv) / prv;
                    return {
                        categoryId: r.id,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        thisWeek: cur,
                        lastWeek: prv,
                        deltaAmount,
                        deltaPct,
                    };
                });
                items.sort(
                    (a, b) =>
                        Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount)
                );
                return items.slice(0, input.limit);
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute category WoW",
            });
        }
        return result;
    });
