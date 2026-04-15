import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("spaces")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("name", "varchar(255)", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`NOW()`))
        .addColumn("created_by", "uuid", (col) => col.notNull().references("users.id"))
        .addColumn("updated_by", "uuid", (col) => col.notNull().references("users.id"))
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("spaces").execute();
};
