import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("plans")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("name", "varchar(255)", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`NOW()`))
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("plans").execute();
};
