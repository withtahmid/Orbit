import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createType("__type_transaction_type")
        .asEnum(["income", "expense", "transfer", "adjustment"])
        .execute();

    await db.schema
        .createTable("transactions")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("space_id", "uuid", (col) => col.notNull().references("spaces.id"))
        .addColumn("created_by", "uuid", (col) => col.notNull().references("users.id"))
        .addColumn("type", sql`__type_transaction_type`, (col) => col.notNull())
        .addColumn("amount", "numeric(12, 2)", (col) => col.notNull())
        .addColumn("source_account_id", "uuid", (col) => col.references("accounts.id"))
        .addColumn("destination_account_id", "uuid", (col) => col.references("accounts.id"))
        .addColumn("description", "text")
        .addColumn("transaction_datetime", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("location", "varchar(255)")
        .addColumn("expense_category_id", "uuid", (col) => col.references("expense_categories.id"))
        .addColumn("event_id", "uuid", (col) =>
            col.references("events.id").onDelete("set null")
        )
        .addCheckConstraint("transactions_amount_check", sql`amount > 0`)
        .addCheckConstraint(
            "transactions_income_check",
            sql`(type != 'income' OR (destination_account_id IS NOT NULL AND source_account_id IS NULL))`
        )
        .addCheckConstraint(
            "transactions_expense_category_check",
            sql`(type != 'expense' OR (expense_category_id IS NOT NULL AND source_account_id IS NOT NULL AND destination_account_id IS NULL))`
        )
        .addCheckConstraint(
            "transactions_transfer_check",
            sql`(type != 'transfer' OR (source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id != destination_account_id))`
        )
        .addCheckConstraint(
            "transactions_adjustment_check",
            sql`(type != 'adjustment' OR ((source_account_id IS NOT NULL) <> (destination_account_id IS NOT NULL)))`
        )
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("transactions").execute();
    await db.schema.dropType("__type_transaction_type").execute();
};
