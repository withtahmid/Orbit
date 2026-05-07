import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalCategoryWoW = authorizedProcedure
    .input(
        z.object({
            anchor: z.coerce.date().optional(),
            limit: z.number().int().min(1).max(20).default(6),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                const memberSpaces = await resolveMemberSpaceIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                if (owned.length === 0 || memberSpaces.length === 0) return [];

                const anchor = input.anchor ?? new Date();
                const weekMs = 7 * 24 * 60 * 60 * 1000;
                const curStart = new Date(anchor.getTime() - weekMs);
                const prvStart = new Date(curStart.getTime() - weekMs);

                const rows = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    cur: string;
                    prv: string;
                }>`
                    WITH spending AS (
                        SELECT
                            t.expense_category_id AS category_id,
                            t.amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.space_id = ANY(${memberSpaces})
                          AND t.source_account_id = ANY(${owned})
                          AND t.expense_category_id IS NOT NULL
                          AND t.transaction_datetime >= ${prvStart}
                          AND t.transaction_datetime < ${anchor}
                        UNION ALL
                        SELECT
                            t.fee_expense_category_id,
                            t.fee_amount,
                            t.transaction_datetime
                        FROM transactions t
                        WHERE t.type = 'transfer'
                          AND t.fee_amount IS NOT NULL
                          AND t.space_id = ANY(${memberSpaces})
                          AND t.source_account_id = ANY(${owned})
                          AND t.fee_expense_category_id IS NOT NULL
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
                `.execute(ctx.services.qb);

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
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal category WoW",
            });
        }
        return result;
    });
