import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("envelop_allocations")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("envelop_id", "uuid", (col) =>
            col.notNull().references("envelops.id").onDelete("cascade")
        )
        .addColumn("amount", "numeric(12, 2)", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("created_by", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("restrict")
        )
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("envelop_allocations").execute();
};
