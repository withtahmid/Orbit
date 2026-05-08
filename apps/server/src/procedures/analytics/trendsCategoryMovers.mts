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
 * Categories with the largest movement vs the immediately-preceding window
 * of equal length. Sorted by absolute delta amount desc — biggest swings
 * (in either direction) bubble to the top.
 */
export const trendsCategoryMovers = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(10),
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

                const durationMs =
                    input.periodEnd.getTime() - input.periodStart.getTime();
                const prevStart = new Date(
                    input.periodStart.getTime() - durationMs
                );

                /* Scope by space_accounts (cash-flow rule §12) so cross-
                   space transfer fees and accounts shared late don't
                   silently disappear. */
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
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        SELECT
                            t.fee_expense_category_id AS category_id,
                            t.fee_amount AS amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        WHERE t.type = 'transfer'
                          AND t.fee_amount IS NOT NULL
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.fee_expense_category_id IS NOT NULL
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(SUM(CASE WHEN s.dt >= ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS cur,
                        COALESCE(SUM(CASE WHEN s.dt < ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS prv
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
                        currentTotal: cur,
                        previousTotal: prv,
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
                message:
                    error.message ||
                    "Failed to compute trends category movers",
            });
        }
        return result;
    });
