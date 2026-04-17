import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("plan_allocations")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("plan_id", "uuid", (col) =>
            col.notNull().references("plans.id").onDelete("cascade")
        )
        .addColumn("amount", "numeric(12, 2)", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("created_by", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("restrict")
        )
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("plan_allocations").execute();
};
