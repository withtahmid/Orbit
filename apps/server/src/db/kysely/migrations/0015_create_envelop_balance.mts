import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("envelop_balances")
        .addColumn("envelop_id", "uuid", (col) =>
            col.notNull().primaryKey().references("envelops.id").onDelete("cascade")
        )
        .addColumn("allocated", "numeric(20, 2)", (col) => col.notNull().defaultTo(0))
        .addColumn("consumed", "numeric(20, 2)", (col) => col.notNull().defaultTo(0))
        .addColumn("remaining", "numeric(20, 2)", (col) => col.notNull().defaultTo(0))
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("envelop_balances").execute();
};
