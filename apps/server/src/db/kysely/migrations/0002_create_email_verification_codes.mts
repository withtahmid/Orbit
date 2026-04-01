import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("email_verification_codes")
        .addColumn("id", "varchar(26)", (col) => col.primaryKey())
        .addColumn("user_id", "varchar(26)", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("code", "varchar(6)", (col) => col.notNull())
        .addColumn("expires_at", "timestamptz", (col) => col.notNull())
        .addColumn("used", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .execute();

    await db.schema
        .createIndex("idx_evc_user_id")
        .on("email_verification_codes")
        .column("user_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("email_verification_codes").execute();
};
