import { type Kysely, sql } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

/**
 * Running "balance after this transaction" for a SINGLE account, keyed by
 * transaction id.
 *
 * The number mirrors the canonical balance trigger
 * (`018_create_update_account_balance_trigger`): `account_balances.balance`
 * is the sum of every signed effect on the account, so the balance
 * immediately after a given transaction is the cumulative signed effect of
 * every transaction on that account up to and including it, ordered by
 * `(transaction_datetime, id)` — the same order the list view uses.
 *
 * Signed effect on the account:
 *   +amount  when it is the destination of an income / transfer / adjustment
 *   -amount  when it is the source of an expense / transfer / adjustment
 * Transfer fees are their own `expense` rows (sourced from the account), so
 * they are counted naturally with no special casing.
 *
 * The window scans the account's full history (all spaces, not just the
 * filtered/paged rows) so the figure is the account's true balance at that
 * point — matching `account_balances.balance` and the Accounts page —
 * regardless of the active filters or pagination cursor. Only the requested
 * transaction ids are returned.
 */
export async function computeBalanceAfter(
    qb: Kysely<DB>,
    accountId: string,
    txIds: string[]
): Promise<Map<string, string>> {
    if (txIds.length === 0) return new Map();
    const res = await sql<{ id: string; balance_after: string }>`
        WITH account_ledger AS (
            SELECT
                id,
                SUM(
                    CASE
                        WHEN destination_account_id = ${accountId}
                            AND type IN ('income', 'transfer', 'adjustment')
                            THEN amount
                        ELSE 0
                    END
                    -
                    CASE
                        WHEN source_account_id = ${accountId}
                            AND type IN ('expense', 'transfer', 'adjustment')
                            THEN amount
                        ELSE 0
                    END
                ) OVER (
                    ORDER BY transaction_datetime ASC, id ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS balance_after
            FROM transactions
            WHERE source_account_id = ${accountId}
               OR destination_account_id = ${accountId}
        )
        SELECT id::text AS id, balance_after::text AS balance_after
        FROM account_ledger
        WHERE id = ANY(${txIds})
    `.execute(qb);

    const map = new Map<string, string>();
    for (const row of res.rows) map.set(row.id, row.balance_after);
    return map;
}

/**
 * Per-account "balance after this transaction" for a MULTI-account list,
 * keyed by transaction id → { accountId → balance }.
 *
 * Each transaction is expanded into its double-entry postings (income /
 * expense / adjustment → one posting; transfer → two, one per leg) and a
 * per-account running total is taken over that account's full history, so
 * every returned transaction carries the true balance of each account it
 * touched, immediately after it. A row therefore has one entry
 * (income/expense/adjustment) or two (transfer).
 *
 * `accountIds` is the set of accounts to compute — it bounds the ledger scan
 * and, critically, is the leak boundary: the personal feed passes only the
 * caller's owned accounts so a transfer's non-owned leg never yields a
 * balance. The balance is full-history (all spaces the account transacts in)
 * so it equals `account_balances.balance` at the account's newest row.
 */
export async function computeRowAccountBalances(
    qb: Kysely<DB>,
    txIds: string[],
    accountIds: string[]
): Promise<Map<string, Record<string, string>>> {
    if (txIds.length === 0 || accountIds.length === 0) return new Map();
    const res = await sql<{
        tx_id: string;
        account_id: string;
        balance: string;
    }>`
        WITH postings AS (
            SELECT id AS tx_id, transaction_datetime AS dt,
                   destination_account_id AS account_id, amount AS effect
            FROM transactions
            WHERE destination_account_id = ANY(${accountIds})
              AND type IN ('income', 'transfer', 'adjustment')
            UNION ALL
            SELECT id, transaction_datetime,
                   source_account_id, -amount
            FROM transactions
            WHERE source_account_id = ANY(${accountIds})
              AND type IN ('expense', 'transfer', 'adjustment')
        ),
        ledger AS (
            SELECT tx_id, account_id,
                SUM(effect) OVER (
                    PARTITION BY account_id
                    ORDER BY dt ASC, tx_id ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS balance
            FROM postings
        )
        SELECT tx_id::text AS tx_id, account_id::text AS account_id,
               balance::text AS balance
        FROM ledger
        WHERE tx_id = ANY(${txIds})
    `.execute(qb);

    const map = new Map<string, Record<string, string>>();
    for (const row of res.rows) {
        const rec = map.get(row.tx_id) ?? {};
        rec[row.account_id] = row.balance;
        map.set(row.tx_id, rec);
    }
    return map;
}
