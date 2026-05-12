import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const cashFlow = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("month"),
            /**
             * Classification mode:
             *   - `cash` (default): inflows include cross-space transfer
             *     principal, outflows include cross-space outbound
             *     transfer principal. Matches what shows up in the bank
             *     ledger for accounts in this space.
             *   - `operational`: only true `type='income'` deposits and
             *     `type='expense'` debits + transfer fees. Transfer
             *     principal is excluded both directions — gives the
             *     "did I actually earn / spend" view.
             *
             * See engineering spec §12 and the `operational*` fields on
             * `spaceSummary` for the matching semantics.
             */
            mode: z.enum(["cash", "operational"]).default("cash"),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : "1 month";

                /* Account-flow cash flow. Population: every transaction
                   touching at least one account shared into this space
                   (ignoring `transactions.space_id` — it's a
                   categorization tag, see spec §12).

                   Classification differs by mode:

                   - cash         → cross-space transfer principal counts
                                    on the leg that's in scope. Internal
                                    transfers net to zero. Fees count as
                                    outflow.

                   - operational  → transfer principal excluded both
                                    directions; only true income/expense
                                    + transfer fees + adjustments.

                   The transfer-principal CASE branches are always emitted;
                   their result is multiplied by a 0/1 factor derived from
                   the Zod-validated `mode` enum (no injection surface). */
                const xferFactor = input.mode === "cash" ? 1 : 0;

                const query = sql<{
                    bucket: Date;
                    income: string;
                    expense: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    deltas AS (
                        SELECT
                            date_trunc(${input.bucket}, transaction_datetime) AS bucket,
                            SUM(CASE
                                WHEN type = 'income'
                                    AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                WHEN type = 'transfer'
                                    AND destination_account_id IN (SELECT account_id FROM scope_accounts)
                                    AND source_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN amount * ${xferFactor}
                                WHEN type = 'adjustment'
                                    AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                ELSE 0
                            END) AS income,
                            SUM(
                                CASE
                                    WHEN type = 'expense'
                                        AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                    WHEN type = 'transfer'
                                        AND source_account_id IN (SELECT account_id FROM scope_accounts)
                                        AND destination_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN amount * ${xferFactor}
                                    WHEN type = 'adjustment'
                                        AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions
                        WHERE transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                          AND (
                              source_account_id IN (SELECT account_id FROM scope_accounts)
                              OR destination_account_id IN (SELECT account_id FROM scope_accounts)
                          )
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        COALESCE(d.income, 0)::text AS income,
                        COALESCE(d.expense, 0)::text AS expense
                    FROM buckets b
                    LEFT JOIN deltas d ON d.bucket = b.bucket
                    ORDER BY b.bucket ASC
                `;
                const res = await query.execute(trx);
                return res.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    income: Number(r.income),
                    expense: Number(r.expense),
                    net: Number(r.income) - Number(r.expense),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute cash flow",
            });
        }
        return result;
    });
