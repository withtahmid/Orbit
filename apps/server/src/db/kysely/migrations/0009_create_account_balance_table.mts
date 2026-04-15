import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("account_balances")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("account_id", "uuid", (col) =>
            col.notNull().references("accounts.id").unique().onDelete("cascade")
        )
        .addColumn("balance", "numeric(20, 2)", (col) => col.notNull().defaultTo(0))
        .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`NOW()`))
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("account_balances").execute();
};
