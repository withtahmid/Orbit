import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("envelop_allocation_consumptions")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("envelop_allocation_id", "uuid", (col) =>
            col.notNull().references("envelop_allocations.id").onDelete("cascade")
        )
        .addColumn("transaction_id", "uuid", (col) =>
            col.notNull().references("transactions.id").onDelete("cascade")
        )
        .addColumn("amount", "numeric(12, 2)", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("created_by", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("restrict")
        )
        .addCheckConstraint("envelop_allocation_consumptions_amount_check", sql`amount > 0`)
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("envelop_allocation_consumptions").execute();
};
