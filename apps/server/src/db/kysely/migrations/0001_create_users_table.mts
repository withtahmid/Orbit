import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("users")
        .addColumn("id", "varchar(26)", (col) => col.primaryKey())
        .addColumn("email", "varchar(255)", (col) => col.unique().notNull())
        .addColumn("password_hash", "varchar(255)")
        .addColumn("first_name", "varchar(100)")
        .addColumn("last_name", "varchar(100)")
        .addColumn("status", "varchar(30)", (col) =>
            col.notNull().defaultTo("pending_verification")
        )
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("updated_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("users").execute();
};
