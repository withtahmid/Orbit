import { Kysely, sql } from "kysely";

/**
 * Transfer fees as a first-class concept.
 *
 * Adds `fee_amount` + `fee_expense_category_id` to `transactions`.
 * Gated by CHECK constraints so fees are only valid on `type='transfer'`
 * and the two fields move together (both NULL or both populated,
 * with `fee_amount > 0`).
 *
 * The balance-sync trigger is updated so transfers with a fee debit the
 * source account by `amount + fee_amount`; the destination is still
 * credited the plain `amount`. Net effect on the ledger: the fee is
 * money leaving the source without arriving anywhere on Orbit's books
 * — matching real-world bank / ATM / FX fees.
 *
 * Analytics treat the fee as a category expense: topCategories /
 * categoryBreakdown / envelopeUtilization etc. sum `fee_amount` into
 * `fee_expense_category_id` alongside regular `type='expense'` rows.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("transactions")
        .addColumn("fee_amount", "numeric(12, 2)")
        .addColumn("fee_expense_category_id", "uuid", (col) =>
            col.references("expense_categories.id").onDelete("restrict")
        )
        .execute();

    // Both fee columns move together; fees are positive; fees only
    // apply to transfers. Expressed as a single check to keep the
    // constraint name stable.
    await db.schema
        .alterTable("transactions")
        .addCheckConstraint(
            "transactions_fee_shape_check",
            sql`(
                (fee_amount IS NULL AND fee_expense_category_id IS NULL)
                OR (
                    fee_amount IS NOT NULL
                    AND fee_expense_category_id IS NOT NULL
                    AND fee_amount > 0
                    AND type = 'transfer'
                )
            )`
        )
        .execute();

    // Replace the balance-effect helper so transfers deduct the fee
    // from the source on top of the transferred amount. Income /
    // expense / adjustment paths are unchanged. The trigger itself
    // (and __sync_account_balance_from_transactions) stays the same —
    // we just refresh the effect function.
    await sql`
        CREATE OR REPLACE FUNCTION __apply_transaction_balance_effect(tx transactions, direction integer)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        DECLARE
            signed_amount numeric(20, 2);
            signed_fee numeric(20, 2);
        BEGIN
            signed_amount := tx.amount * direction;
            signed_fee := COALESCE(tx.fee_amount, 0) * direction;

            IF tx.type = 'income' THEN
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.destination_account_id, signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET
                    balance = account_balances.balance + EXCLUDED.balance,
                    updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'expense' THEN
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.source_account_id, -signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET
                    balance = account_balances.balance + EXCLUDED.balance,
                    updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'transfer' THEN
                -- Source pays amount + fee. Fee money leaves the
                -- system; it's the bank's / ATM's / forex provider's
                -- cut. Destination is credited the plain amount.
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.source_account_id, -signed_amount - signed_fee, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET
                    balance = account_balances.balance + EXCLUDED.balance,
                    updated_at = NOW();

                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.destination_account_id, signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET
                    balance = account_balances.balance + EXCLUDED.balance,
                    updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'adjustment' THEN
                IF tx.source_account_id IS NOT NULL THEN
                    INSERT INTO account_balances (account_id, balance, updated_at)
                    VALUES (tx.source_account_id, -signed_amount, NOW())
                    ON CONFLICT (account_id)
                    DO UPDATE
                    SET
                        balance = account_balances.balance + EXCLUDED.balance,
                        updated_at = NOW();
                ELSE
                    INSERT INTO account_balances (account_id, balance, updated_at)
                    VALUES (tx.destination_account_id, signed_amount, NOW())
                    ON CONFLICT (account_id)
                    DO UPDATE
                    SET
                        balance = account_balances.balance + EXCLUDED.balance,
                        updated_at = NOW();
                END IF;
            END IF;
        END;
        $$;
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    // Restore the fee-less balance effect function first so the trigger
    // still works after we drop the columns.
    await sql`
        CREATE OR REPLACE FUNCTION __apply_transaction_balance_effect(tx transactions, direction integer)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        DECLARE
            signed_amount numeric(20, 2);
        BEGIN
            signed_amount := tx.amount * direction;

            IF tx.type = 'income' THEN
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.destination_account_id, signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'expense' THEN
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.source_account_id, -signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'transfer' THEN
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.source_account_id, -signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                INSERT INTO account_balances (account_id, balance, updated_at)
                VALUES (tx.destination_account_id, signed_amount, NOW())
                ON CONFLICT (account_id)
                DO UPDATE
                SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                RETURN;
            END IF;

            IF tx.type = 'adjustment' THEN
                IF tx.source_account_id IS NOT NULL THEN
                    INSERT INTO account_balances (account_id, balance, updated_at)
                    VALUES (tx.source_account_id, -signed_amount, NOW())
                    ON CONFLICT (account_id)
                    DO UPDATE
                    SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                ELSE
                    INSERT INTO account_balances (account_id, balance, updated_at)
                    VALUES (tx.destination_account_id, signed_amount, NOW())
                    ON CONFLICT (account_id)
                    DO UPDATE
                    SET balance = account_balances.balance + EXCLUDED.balance, updated_at = NOW();
                END IF;
            END IF;
        END;
        $$;
    `.execute(db);

    await db.schema
        .alterTable("transactions")
        .dropConstraint("transactions_fee_shape_check")
        .execute();
    await db.schema
        .alterTable("transactions")
        .dropColumn("fee_expense_category_id")
        .dropColumn("fee_amount")
        .execute();
};
