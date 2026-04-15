import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
    await db.schema
        .createTable("accounts")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidV7()`))
        .addColumn("name", "varchar(255)", (col) => col.notNull())
        .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`NOW()`))
        .execute();
};
export const down = async (db: Kysely<any>) => {
    await db.schema.dropTable("accounts").execute();
};
