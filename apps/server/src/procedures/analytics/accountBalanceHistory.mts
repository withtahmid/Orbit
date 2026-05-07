import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers, UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * Single-account balance time-series for the AccountsGlance sparklines on
 * the Overview page. Same backward-walking approach as
 * `analytics.balanceHistory` but scoped to one account, and authorized
 * via the caller's relationship to the account directly (account owner,
 * viewer, or via a space they're a member of) rather than a single
 * `spaceId` — the Overview shows accounts across spaces so a per-space
 * authorization check would over-restrict.
 */
export const accountBalanceHistory = authorizedProcedure
    .input(
        z.object({
            accountId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("day"),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const access = await trx
                    .selectFrom("user_accounts")
                    .where("user_id", "=", ctx.auth.user.id)
                    .where("account_id", "=", input.accountId)
                    .select(["role"])
                    .executeTakeFirst();
                if (!access) {
                    const viaSpace = await trx
                        .selectFrom("space_accounts")
                        .innerJoin(
                            "space_members",
                            "space_members.space_id",
                            "space_accounts.space_id"
                        )
                        .where("space_accounts.account_id", "=", input.accountId)
                        .where("space_members.user_id", "=", ctx.auth.user.id)
                        .where(
                            "space_members.role",
                            "in",
                            ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][]
                        )
                        .select("space_accounts.account_id")
                        .executeTakeFirst();
                    if (!viaSpace) {
                        throw new TRPCError({
                            code: "FORBIDDEN",
                            message: "No access to this account",
                        });
                    }
                }
                /* role variable read suppression — auth is the side-effect. */
                void (access as UserAccounts | undefined);

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : input.bucket === "month"
                            ? "1 month"
                            : "1 year";

                const rows = await sql<{ bucket: Date; balance: string }>`
                    WITH current_balance AS (
                        SELECT COALESCE((
                            SELECT balance FROM account_balances
                            WHERE account_id = ${input.accountId}
                        ), 0) AS balance
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    bucket_deltas AS (
                        SELECT
                            date_trunc(${input.bucket}, t.transaction_datetime) AS bucket,
                            SUM(
                                CASE
                                    WHEN t.type IN ('income','transfer','adjustment')
                                        AND t.destination_account_id = ${input.accountId}
                                        THEN t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type IN ('expense','transfer','adjustment')
                                        AND t.source_account_id = ${input.accountId}
                                        THEN -t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = ${input.accountId}
                                        AND t.fee_amount IS NOT NULL
                                        THEN -t.fee_amount
                                    ELSE 0
                                END
                            ) AS delta
                        FROM transactions t
                        WHERE t.source_account_id = ${input.accountId}
                           OR t.destination_account_id = ${input.accountId}
                        GROUP BY 1
                    ),
                    future_after AS (
                        SELECT b.bucket,
                               COALESCE(SUM(CASE WHEN bd.bucket > b.bucket THEN bd.delta ELSE 0 END), 0) AS future_delta
                        FROM buckets b
                        LEFT JOIN bucket_deltas bd ON TRUE
                        GROUP BY b.bucket
                    )
                    SELECT
                        f.bucket::timestamptz AS bucket,
                        ((SELECT balance FROM current_balance) - f.future_delta)::text AS balance
                    FROM future_after f
                    ORDER BY f.bucket ASC
                `.execute(trx);

                return rows.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    balance: Number(r.balance),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute account balance history",
            });
        }
        return result;
    });
