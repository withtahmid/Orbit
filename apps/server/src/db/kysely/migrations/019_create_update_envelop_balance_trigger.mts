import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await sql`
		CREATE OR REPLACE FUNCTION __upsert_envelop_balance_delta(
			p_envelop_id uuid,
			p_allocated_delta numeric,
			p_consumed_delta numeric
		)
		RETURNS void
		LANGUAGE plpgsql
		AS $$
		BEGIN
			INSERT INTO envelop_balances (envelop_id, allocated, consumed, remaining)
			VALUES (
				p_envelop_id,
				p_allocated_delta,
				p_consumed_delta,
				p_allocated_delta - p_consumed_delta
			)
			ON CONFLICT (envelop_id)
			DO UPDATE
			SET
				allocated = envelop_balances.allocated + EXCLUDED.allocated,
				consumed = envelop_balances.consumed + EXCLUDED.consumed,
				remaining = (envelop_balances.allocated + EXCLUDED.allocated)
					- (envelop_balances.consumed + EXCLUDED.consumed);
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE OR REPLACE FUNCTION __apply_envelop_allocation_effect(
			allocation envelop_allocations,
			direction integer
		)
		RETURNS void
		LANGUAGE plpgsql
		AS $$
		BEGIN
			PERFORM __upsert_envelop_balance_delta(
				allocation.envelop_id,
				allocation.amount * direction,
				0
			);
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE OR REPLACE FUNCTION __apply_expense_transaction_effect(
			tx transactions,
			direction integer
		)
		RETURNS void
		LANGUAGE plpgsql
		AS $$
		DECLARE
			v_envelop_id uuid;
		BEGIN
			IF tx.type != 'expense' OR tx.expense_category_id IS NULL THEN
				RETURN;
			END IF;

			SELECT expense_categories.envelop_id
			INTO v_envelop_id
			FROM expense_categories
			WHERE expense_categories.id = tx.expense_category_id;

			IF v_envelop_id IS NULL THEN
				RETURN;
			END IF;

			PERFORM __upsert_envelop_balance_delta(
				v_envelop_id,
				0,
				tx.amount * direction
			);
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE OR REPLACE FUNCTION __sync_envelop_balance_from_allocations()
		RETURNS trigger
		LANGUAGE plpgsql
		AS $$
		BEGIN
			IF TG_OP = 'INSERT' THEN
				PERFORM __apply_envelop_allocation_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'UPDATE' THEN
				PERFORM __apply_envelop_allocation_effect(OLD, -1);
				PERFORM __apply_envelop_allocation_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'DELETE' THEN
				PERFORM __apply_envelop_allocation_effect(OLD, -1);
				RETURN OLD;
			END IF;

			RETURN NULL;
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE OR REPLACE FUNCTION __sync_envelop_balance_from_transactions()
		RETURNS trigger
		LANGUAGE plpgsql
		AS $$
		BEGIN
			IF TG_OP = 'INSERT' THEN
				PERFORM __apply_expense_transaction_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'UPDATE' THEN
				PERFORM __apply_expense_transaction_effect(OLD, -1);
				PERFORM __apply_expense_transaction_effect(NEW, 1);
				RETURN NEW;
			END IF;

			IF TG_OP = 'DELETE' THEN
				PERFORM __apply_expense_transaction_effect(OLD, -1);
				RETURN OLD;
			END IF;

			RETURN NULL;
		END;
		$$;
	`.execute(db);

    await sql`
		CREATE TRIGGER __trigger_sync_envelop_balance_from_allocations
		AFTER INSERT OR UPDATE OR DELETE ON envelop_allocations
		FOR EACH ROW
		EXECUTE FUNCTION __sync_envelop_balance_from_allocations();
	`.execute(db);

    await sql`
		CREATE TRIGGER __trigger_sync_envelop_balance_from_transactions
		AFTER INSERT OR UPDATE OR DELETE ON transactions
		FOR EACH ROW
		EXECUTE FUNCTION __sync_envelop_balance_from_transactions();
	`.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
		DROP TRIGGER IF EXISTS __trigger_sync_envelop_balance_from_transactions ON transactions;
	`.execute(db);
    await sql`
		DROP TRIGGER IF EXISTS __trigger_sync_envelop_balance_from_allocations ON envelop_allocations;
	`.execute(db);

    await sql`
		DROP FUNCTION IF EXISTS __sync_envelop_balance_from_transactions();
	`.execute(db);
    await sql`
		DROP FUNCTION IF EXISTS __sync_envelop_balance_from_allocations();
	`.execute(db);

    await sql`
		DROP FUNCTION IF EXISTS __apply_expense_transaction_effect(transactions, integer);
	`.execute(db);
    await sql`
		DROP FUNCTION IF EXISTS __apply_envelop_allocation_effect(envelop_allocations, integer);
	`.execute(db);
    await sql`
		DROP FUNCTION IF EXISTS __upsert_envelop_balance_delta(uuid, numeric, numeric);
	`.execute(db);
};
