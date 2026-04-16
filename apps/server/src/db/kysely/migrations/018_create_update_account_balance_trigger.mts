import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
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
				INSERT INTO account_balances (account_id, balance, updated_at)
				VALUES (tx.source_account_id, -signed_amount, NOW())
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

    await sql`
		CREATE OR REPLACE FUNCTION __sync_account_balance_from_transactions()
		RETURNS trigger
		LANGUAGE plpgsql
		AS $$
		BEGIN
			IF TG_OP = 'INSERT' THEN
				PERFORM __apply_transaction_balance_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'UPDATE' THEN
				PERFORM __apply_transaction_balance_effect(OLD, -1);
				PERFORM __apply_transaction_balance_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'DELETE' THEN
				PERFORM __apply_transaction_balance_effect(OLD, -1);
				RETURN OLD;
			END IF;

			RETURN NULL;
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE TRIGGER __trigger_sync_account_balance_from_transactions
		AFTER INSERT OR UPDATE OR DELETE ON transactions
		FOR EACH ROW
		EXECUTE FUNCTION __sync_account_balance_from_transactions();
	`.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
		DROP TRIGGER IF EXISTS __trigger_sync_account_balance_from_transactions ON transactions;
	`.execute(db);
    await sql`
		DROP FUNCTION IF EXISTS __sync_account_balance_from_transactions();
	`.execute(db);
    await sql`
		DROP FUNCTION IF EXISTS __apply_transaction_balance_effect(transactions, integer);
	`.execute(db);
};
