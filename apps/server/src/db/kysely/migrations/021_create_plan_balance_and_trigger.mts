import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("plan_balances")
        .addColumn("plan_id", "uuid", (col) =>
            col.primaryKey().references("plans.id").onDelete("cascade")
        )
        .addColumn("allocated", "numeric(20, 2)", (col) => col.notNull().defaultTo(0))
        .execute();

    await sql`
        CREATE OR REPLACE FUNCTION __upsert_plan_balance_delta(
            p_plan_id uuid,
            p_allocated_delta numeric
        )
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
            INSERT INTO plan_balances (plan_id, allocated)
            VALUES (p_plan_id, p_allocated_delta)
            ON CONFLICT (plan_id)
            DO UPDATE
            SET allocated = plan_balances.allocated + EXCLUDED.allocated;
        END;
        $$;
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION __apply_plan_allocation_effect(
            allocation plan_allocations,
            direction integer
        )
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
            PERFORM __upsert_plan_balance_delta(
                allocation.plan_id,
                allocation.amount * direction
            );
        END;
        $$;
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION __sync_plan_balance_from_allocations()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                PERFORM __apply_plan_allocation_effect(NEW, 1);
                RETURN NEW;
            END IF;

            IF TG_OP = 'UPDATE' THEN
                PERFORM __apply_plan_allocation_effect(OLD, -1);
                PERFORM __apply_plan_allocation_effect(NEW, 1);
                RETURN NEW;
            END IF;

            IF TG_OP = 'DELETE' THEN
                PERFORM __apply_plan_allocation_effect(OLD, -1);
                RETURN OLD;
            END IF;

            RETURN NULL;
        END;
        $$;
    `.execute(db);

    await sql`
        CREATE TRIGGER __trigger_sync_plan_balance_from_allocations
        AFTER INSERT OR UPDATE OR DELETE ON plan_allocations
        FOR EACH ROW
        EXECUTE FUNCTION __sync_plan_balance_from_allocations();
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP TRIGGER IF EXISTS __trigger_sync_plan_balance_from_allocations ON plan_allocations`.execute(
        db
    );
    await sql`DROP FUNCTION IF EXISTS __sync_plan_balance_from_allocations()`.execute(db);
    await sql`DROP FUNCTION IF EXISTS __apply_plan_allocation_effect(plan_allocations, integer)`.execute(
        db
    );
    await sql`DROP FUNCTION IF EXISTS __upsert_plan_balance_delta(uuid, numeric)`.execute(db);
    await db.schema.dropTable("plan_balances").execute();
};
