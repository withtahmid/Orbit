import { Kysely, sql } from "kysely";

/**
 * Promote transfer fees to first-class expense transactions.
 *
 * Before: a transfer row carried `fee_amount` + `fee_expense_category_id`
 * inline. Fees routed to an envelope only via the fee category's default
 * — re-introducing the via-category coupling we eliminated in migration
 * 041 for everything else. Asymmetric, and required UNION-ALL fee
 * branches across every spend-by-envelope analytics query.
 *
 * After: every fee is its own `type='expense'` row with its own
 * `expense_category_id`, `envelop_id`, source_account_id, datetime, and
 * a `parent_transfer_id` pointing back at the originating transfer.
 * Transfers are now amount-only.
 *
 * Balance preservation during backfill:
 *   The existing account-balance trigger function still has fee logic
 *   while this migration runs. We exploit that:
 *     (1) INSERT a paired expense → trigger debits source by fee_amount
 *         again (temporarily double-counted).
 *     (2) UPDATE transfer SET fee_amount=NULL → trigger reverses the
 *         original fee portion of that transfer (-OLD effect + NEW
 *         effect with fee=0 = +fee to source).
 *   Net delta across (1)+(2): zero. The fee debit's *ownership* moves
 *   from the transfer row to the linked expense row, account balances
 *   unchanged.
 *
 *   We rely on every Kysely migration running in a single DB transaction
 *   so the intermediate state in step (1) is never visible to readers.
 *
 * After backfill we replace the trigger function with a fee-blind
 * version, drop the CHECK, then drop the columns.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("transactions")
        .addColumn("parent_transfer_id", "uuid", (col) =>
            col.references("transactions.id").onDelete("cascade")
        )
        .execute();

    await sql`
        CREATE INDEX idx_transactions_parent_transfer_id
        ON transactions (parent_transfer_id)
        WHERE parent_transfer_id IS NOT NULL
    `.execute(db);

    // Backfill: for every transfer with a fee, insert a paired expense
    // row. Envelope is resolved from the fee category's current default.
    // The existing balance trigger fires on this INSERT — see the
    // balance-preservation note above for why that's correct here.
    await sql`
        INSERT INTO transactions (
            space_id,
            created_by,
            type,
            amount,
            source_account_id,
            destination_account_id,
            expense_category_id,
            envelop_id,
            event_id,
            description,
            location,
            transaction_datetime,
            parent_transfer_id
        )
        SELECT
            t.space_id,
            t.created_by,
            'expense'::__type_transaction_type,
            t.fee_amount,
            t.source_account_id,
            NULL,
            t.fee_expense_category_id,
            ec.default_envelop_id,
            t.event_id,
            CASE
                WHEN t.description IS NULL OR t.description = ''
                    THEN 'Transfer fee'
                ELSE 'Fee — ' || t.description
            END,
            t.location,
            t.transaction_datetime,
            t.id
        FROM transactions t
        JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
        WHERE t.type = 'transfer'
          AND t.fee_amount IS NOT NULL
    `.execute(db);

    // Guard: every fee-bearing transfer should now have a paired row.
    const orphans = await sql<{ count: string }>`
        SELECT COUNT(*)::text AS count
        FROM transactions t
        WHERE t.type = 'transfer'
          AND t.fee_amount IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM transactions f
              WHERE f.parent_transfer_id = t.id
                AND f.type = 'expense'
          )
    `.execute(db);
    const orphanCount = Number(orphans.rows[0]?.count ?? "0");
    if (orphanCount > 0) {
        throw new Error(
            `Backfill incomplete: ${orphanCount} fee-bearing transfers without a paired expense row. ` +
                `Aborting to preserve ledger integrity.`
        );
    }

    // Null out fee columns on the transfer rows. The trigger fires and
    // reverses the original fee deduction, cancelling the temporary
    // double-count from the paired-row inserts above.
    await sql`
        UPDATE transactions
        SET fee_amount = NULL,
            fee_expense_category_id = NULL
        WHERE type = 'transfer'
          AND fee_amount IS NOT NULL
    `.execute(db);

    // Replace the balance-effect function with a fee-blind version.
    // Mirrors the post-026 / pre-030 shape: transfer just moves `amount`
    // from source to destination. Fees, if any, are independent expense
    // rows that the same trigger handles via the 'expense' branch.
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
        .dropColumn("fee_amount")
        .dropColumn("fee_expense_category_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    // Restore the columns and CHECK first so the trigger-function
    // restoration below can reference fee_amount.
    await db.schema
        .alterTable("transactions")
        .addColumn("fee_amount", "numeric(12, 2)")
        .addColumn("fee_expense_category_id", "uuid", (col) =>
            col.references("expense_categories.id").onDelete("restrict")
        )
        .execute();

    // Reverse the backfill: pull amount + category from each linked
    // expense row back onto its parent transfer, then delete the linked
    // expense rows. Trigger fires for both ops; the same balance
    // preservation argument from up() applies in reverse.
    await sql`
        UPDATE transactions t
        SET fee_amount = f.amount,
            fee_expense_category_id = f.expense_category_id
        FROM transactions f
        WHERE f.parent_transfer_id = t.id
          AND f.type = 'expense'
    `.execute(db);

    await sql`
        DELETE FROM transactions
        WHERE parent_transfer_id IS NOT NULL
          AND type = 'expense'
    `.execute(db);

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

    // Restore the fee-aware balance-effect function (mirror of 030's up).
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
                VALUES (tx.source_account_id, -signed_amount - signed_fee, NOW())
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

    await sql`DROP INDEX IF EXISTS idx_transactions_parent_transfer_id`.execute(db);

    await db.schema
        .alterTable("transactions")
        .dropColumn("parent_transfer_id")
        .execute();
};
