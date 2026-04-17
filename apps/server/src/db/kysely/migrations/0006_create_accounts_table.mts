import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
    await db.schema
        .createType("__type_account_type")
        .asEnum(["asset", "liability", "locked"])
        .execute();

    await db.schema
        .createTable("accounts")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("name", "varchar(255)", (col) => col.notNull())
        .addColumn("account_type", sql`__type_account_type`, (col) => col.notNull())
        .addColumn("updated_at", "timestamptz", (col) => col.defaultTo(sql`NOW()`))
        .execute();
};
export const down = async (db: Kysely<any>) => {
    await db.schema.dropTable("accounts").execute();
    await db.schema.dropType("__type_account_type").execute();
};
