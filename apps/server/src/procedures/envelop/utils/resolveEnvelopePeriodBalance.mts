import { Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";
import { resolvePeriodWindow, type Cadence } from "./periodWindow.mjs";

/**
 * Three-mode carry policy for envelopes:
 *   reset         — fresh slate every period (was carry_over=false).
 *   positive_only — surplus only (was carry_over=true).
 *   both          — surplus + debt; overspend persists as obligation.
 */
export type CarryPolicy = "reset" | "positive_only" | "both";

export interface PeriodBalanceRow {
    envelopId: string;
    accountId: string | null;
    allocated: number;
    consumed: number;
    carriedIn: number;
    remaining: number;
}

interface Opts {
    trx: Kysely<DB>;
    envelopId: string;
    /** Optional account scope. `undefined` = aggregate across accounts. */
    accountId?: string | null | undefined;
    /** Reference instant the period is relative to. Defaults to now. */
    at?: Date;
}

/**
 * Compute an envelope's current-period balance on-read. Optionally narrows
 * to a single account partition (including the unassigned pool when
 * `accountId: null` is passed). If `accountId` is omitted, rolls up across
 * all accounts (envelope total, the top-line number).
 *
 * Carry-over adds the previous period's remaining to `carriedIn`. We only
 * look back one period — deep history is computed by the detail-page query
 * that walks all periods for charting, not here.
 */
export async function resolveEnvelopePeriodBalance({
    trx,
    envelopId,
    accountId,
    at,
}: Opts): Promise<PeriodBalanceRow> {
    const envelope = await trx
        .selectFrom("envelops")
        .select(["id", "cadence", "carry_policy"])
        .where("id", "=", envelopId)
        .executeTakeFirstOrThrow();

    const cadence = envelope.cadence as Cadence;
    const policy = envelope.carry_policy as CarryPolicy;
    const carry = policy !== "reset";
    const { start, end, prevStart, prevEnd } = resolvePeriodWindow(cadence, at);

    const row = await sql<{
        allocated: string;
        consumed: string;
    }>`
        SELECT
            COALESCE((
                SELECT SUM(a.amount)
                FROM envelop_allocations a
                WHERE a.envelop_id = ${envelopId}
                  AND ${sql.raw(accountMatch("a", accountId))}
                  AND ${allocationInWindow("a", cadence, start, end)}
            ), 0)::text AS allocated,
            COALESCE((
                SELECT SUM(t.amount)
                FROM transactions t
                WHERE t.envelop_id = ${envelopId}
                  AND t.type = 'expense'
                  AND ${sql.raw(transactionAccountMatch(accountId))}
                  AND t.transaction_datetime >= ${start}
                  AND t.transaction_datetime < ${end}
            ), 0)::text AS consumed
    `
        .execute(trx)
        .then((r) => r.rows[0]);

    let carriedIn = 0;
    if (carry && cadence !== "none") {
        const prev = await sql<{ remaining: string }>`
            SELECT (
                COALESCE((
                    SELECT SUM(a.amount)
                    FROM envelop_allocations a
                    WHERE a.envelop_id = ${envelopId}
                      AND ${sql.raw(accountMatch("a", accountId))}
                      AND ${allocationInWindow("a", cadence, prevStart, prevEnd)}
                ), 0)
                -
                COALESCE((
                    SELECT SUM(t.amount)
                    FROM transactions t
                    WHERE t.envelop_id = ${envelopId}
                      AND t.type = 'expense'
                      AND ${sql.raw(transactionAccountMatch(accountId))}
                      AND t.transaction_datetime >= ${prevStart}
                      AND t.transaction_datetime < ${prevEnd}
                ), 0)
            )::text AS remaining
        `
            .execute(trx)
            .then((r) => r.rows[0]);
        const prevRemaining = Number(prev?.remaining ?? 0);
        // Carry math depends on policy:
        //   'positive_only' → only surpluses carry (legacy, asymmetric).
        //   'both'          → surplus AND debt carry. The honest mode where
        //                     overspend persists as a real obligation into
        //                     the next period until covered.
        carriedIn =
            policy === "both" ? prevRemaining : Math.max(0, prevRemaining);
    }

    const allocated = Number(row?.allocated ?? 0);
    const consumed = Number(row?.consumed ?? 0);
    const remaining = carriedIn + allocated - consumed;

    return {
        envelopId,
        accountId: accountId === undefined ? null : accountId,
        allocated,
        consumed,
        carriedIn,
        remaining,
    };
}

/**
 * Whether an allocation row falls inside a period window, accounting for
 * cadence='none' (always true) and the optional period_start column.
 *
 * Produced as a parameterized fragment that can be embedded in a larger
 * sql`` template via `sql.raw` — so we return the literal SQL text with
 * inlined boundary dates interpolated by kysely when this fragment is
 * embedded. We use regular `sql` here too by returning a RawBuilder.
 */
function allocationInWindow(
    alias: string,
    cadence: Cadence,
    start: Date,
    end: Date
) {
    if (cadence === "none") {
        return sql`TRUE`;
    }
    // For monthly: effective period_start = COALESCE(a.period_start, date_trunc('month', a.created_at))
    return sql`COALESCE(${sql.raw(alias)}.period_start, date_trunc('month', ${sql.raw(alias)}.created_at)::date)
             >= ${start}::date
         AND COALESCE(${sql.raw(alias)}.period_start, date_trunc('month', ${sql.raw(alias)}.created_at)::date)
             < ${end}::date`;
}

/**
 * Produce the SQL fragment matching a specific account scope on an allocation
 * alias. Passed as raw text so it embeds in sql.raw calls.
 *
 *   undefined → no filter (aggregate across accounts)
 *   null      → only allocations with account_id IS NULL (unassigned pool)
 *   string    → only the given account
 */
function accountMatch(alias: string, accountId: string | null | undefined): string {
    if (accountId === undefined) return "TRUE";
    if (accountId === null) return `${alias}.account_id IS NULL`;
    // NOTE: accountId is controlled by our own trpc layer (uuid-validated via zod)
    // so embedding it as text is safe. We still quote-escape defensively.
    const safe = accountId.replace(/'/g, "''");
    return `${alias}.account_id = '${safe}'::uuid`;
}

/**
 * Produce the SQL fragment matching a specific source account on a
 * transaction. Expense transactions always have a source account, so the
 * match targets source_account_id.
 */
function transactionAccountMatch(accountId: string | null | undefined): string {
    if (accountId === undefined) return "TRUE";
    if (accountId === null) return "FALSE"; // unassigned pool is never consumed
    const safe = accountId.replace(/'/g, "''");
    return `t.source_account_id = '${safe}'::uuid`;
}
