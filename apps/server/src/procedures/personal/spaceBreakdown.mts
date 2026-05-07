import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * Per-space breakdown of the caller's personal net worth.
 *
 * Powers the "Across N spaces" band on the My-money overview: shows how
 * the user's personally-owned account balances are split between each
 * shared space they're a member of, plus a "Personal-only" residual for
 * owned accounts not shared into any of those spaces.
 *
 * Categorization is exclusive (each owned account contributes to exactly
 * one bucket) so the segments add up to the personal totalBalance:
 *
 *   - If the account is shared into one or more user-member spaces, it
 *     attributes to the *earliest* such space (DISTINCT ON the earliest
 *     `space_accounts.created_at`).
 *   - Otherwise the account is personal-only.
 *
 * Liability accounts contribute their balance with a flipped sign, same
 * as `personalSummary` so the totals reconcile.
 */
export const personalSpaceBreakdown = authorizedProcedure.query(
    async ({ ctx }) => {
        const [error, result] = await safeAwait(
            (async () => {
                type Row = {
                    bucket_kind: "space" | "personal";
                    space_id: string | null;
                    space_name: string | null;
                    member_count: string;
                    my_role: string | null;
                    balance: string;
                };

                const rows = await sql<Row>`
                    WITH owned AS (
                        SELECT account_id
                        FROM user_accounts
                        WHERE user_id = ${ctx.auth.user.id}
                          AND role = 'owner'
                    ),
                    owned_balance AS (
                        SELECT
                            ab.account_id,
                            CASE a.account_type
                                WHEN 'liability' THEN -ab.balance
                                ELSE ab.balance
                            END AS balance
                        FROM account_balances ab
                        JOIN accounts a ON a.id = ab.account_id
                        WHERE ab.account_id IN (SELECT account_id FROM owned)
                    ),
                    member_spaces AS (
                        SELECT space_id, role
                        FROM space_members
                        WHERE user_id = ${ctx.auth.user.id}
                    ),
                    /* For each owned account, pick the earliest user-member
                       space it's shared into (DISTINCT ON). Accounts not
                       shared into any user-member space are absent. */
                    account_assignment AS (
                        SELECT DISTINCT ON (sa.account_id)
                            sa.account_id,
                            sa.space_id
                        FROM space_accounts sa
                        JOIN member_spaces ms ON ms.space_id = sa.space_id
                        WHERE sa.account_id IN (SELECT account_id FROM owned)
                        ORDER BY sa.account_id, sa.created_at ASC
                    ),
                    member_counts AS (
                        SELECT space_id, COUNT(*)::text AS count
                        FROM space_members
                        GROUP BY space_id
                    )
                    /* Per-space rows (one per member-space, even if the
                       user has no owned accounts in it — balance falls
                       to 0 via the LEFT JOIN). */
                    SELECT
                        'space'::text AS bucket_kind,
                        s.id AS space_id,
                        s.name AS space_name,
                        COALESCE(mc.count, '0') AS member_count,
                        ms.role::text AS my_role,
                        COALESCE(SUM(ob.balance), 0)::text AS balance
                    FROM member_spaces ms
                    JOIN spaces s ON s.id = ms.space_id
                    LEFT JOIN account_assignment aa ON aa.space_id = s.id
                    LEFT JOIN owned_balance ob ON ob.account_id = aa.account_id
                    LEFT JOIN member_counts mc ON mc.space_id = s.id
                    GROUP BY s.id, s.name, mc.count, ms.role
                    UNION ALL
                    /* Personal-only residual: owned accounts not shared
                       into any user-member space. */
                    SELECT
                        'personal'::text AS bucket_kind,
                        NULL AS space_id,
                        NULL AS space_name,
                        '1' AS member_count,
                        'owner' AS my_role,
                        COALESCE(SUM(ob.balance), 0)::text AS balance
                    FROM owned_balance ob
                    WHERE ob.account_id NOT IN (
                        SELECT account_id FROM account_assignment
                    )
                `.execute(ctx.services.qb);

                const spaces: Array<{
                    id: string;
                    name: string;
                    memberCount: number;
                    myRole: "owner" | "editor" | "viewer";
                    balance: number;
                }> = [];
                let personalBalance = 0;

                for (const r of rows.rows) {
                    if (r.bucket_kind === "space" && r.space_id && r.space_name) {
                        spaces.push({
                            id: r.space_id,
                            name: r.space_name,
                            memberCount: Number(r.member_count),
                            myRole: (r.my_role ?? "viewer") as
                                | "owner"
                                | "editor"
                                | "viewer",
                            balance: Number(r.balance),
                        });
                    } else if (r.bucket_kind === "personal") {
                        personalBalance = Number(r.balance);
                    }
                }

                /* Largest spaces first — readable order for the band. */
                spaces.sort((a, b) => b.balance - a.balance);

                const total =
                    personalBalance + spaces.reduce((s, x) => s + x.balance, 0);

                return {
                    personalBalance,
                    spaces,
                    total,
                };
            })()
        );

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute personal space breakdown",
            });
        }
        return result;
    }
);
