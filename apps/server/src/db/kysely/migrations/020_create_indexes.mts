import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await sql`CREATE INDEX idx_transactions_space_datetime ON transactions (space_id, transaction_datetime DESC)`.execute(
        db
    );
    await sql`CREATE INDEX idx_transactions_space_type_datetime ON transactions (space_id, type, transaction_datetime DESC)`.execute(
        db
    );

    await db.schema
        .createIndex("idx_transactions_source_account")
        .on("transactions")
        .column("source_account_id")
        .execute();
    await db.schema
        .createIndex("idx_transactions_destination_account")
        .on("transactions")
        .column("destination_account_id")
        .execute();
    await db.schema
        .createIndex("idx_transactions_expense_category")
        .on("transactions")
        .column("expense_category_id")
        .execute();
    await db.schema
        .createIndex("idx_transactions_event")
        .on("transactions")
        .column("event_id")
        .execute();
    await db.schema
        .createIndex("idx_transactions_created_by")
        .on("transactions")
        .column("created_by")
        .execute();

    await db.schema.createIndex("idx_envelops_space").on("envelops").column("space_id").execute();
    await db.schema.createIndex("idx_plans_space").on("plans").column("space_id").execute();
    await db.schema.createIndex("idx_events_space").on("events").column("space_id").execute();
    await db.schema
        .createIndex("idx_expense_categories_space")
        .on("expense_categories")
        .column("space_id")
        .execute();
    await db.schema
        .createIndex("idx_expense_categories_envelop")
        .on("expense_categories")
        .column("envelop_id")
        .execute();
    await db.schema
        .createIndex("idx_expense_categories_parent")
        .on("expense_categories")
        .column("parent_id")
        .execute();

    await db.schema
        .createIndex("idx_envelop_allocations_envelop")
        .on("envelop_allocations")
        .column("envelop_id")
        .execute();
    await db.schema
        .createIndex("idx_envelop_allocations_created_at")
        .on("envelop_allocations")
        .column("created_at")
        .execute();
    await db.schema
        .createIndex("idx_plan_allocations_plan")
        .on("plan_allocations")
        .column("plan_id")
        .execute();
    await db.schema
        .createIndex("idx_plan_allocations_created_at")
        .on("plan_allocations")
        .column("created_at")
        .execute();

    await db.schema
        .createIndex("idx_space_accounts_space")
        .on("space_accounts")
        .column("space_id")
        .execute();
    await db.schema
        .createIndex("idx_space_accounts_account")
        .on("space_accounts")
        .column("account_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    const indexes = [
        "idx_transactions_space_datetime",
        "idx_transactions_space_type_datetime",
        "idx_transactions_source_account",
        "idx_transactions_destination_account",
        "idx_transactions_expense_category",
        "idx_transactions_event",
        "idx_transactions_created_by",
        "idx_envelops_space",
        "idx_plans_space",
        "idx_events_space",
        "idx_expense_categories_space",
        "idx_expense_categories_envelop",
        "idx_expense_categories_parent",
        "idx_envelop_allocations_envelop",
        "idx_envelop_allocations_created_at",
        "idx_plan_allocations_plan",
        "idx_plan_allocations_created_at",
        "idx_space_accounts_space",
        "idx_space_accounts_account",
    ];
    for (const name of indexes) {
        await db.schema.dropIndex(name).ifExists().execute();
    }
};
