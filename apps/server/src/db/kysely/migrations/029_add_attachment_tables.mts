import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("users")
        .addColumn("avatar_file_id", "uuid", (col) =>
            col.references("files.id").onDelete("set null")
        )
        .execute();
    await db.schema.alterTable("users").dropColumn("avatar_url").execute();

    await db.schema
        .createTable("transaction_attachments")
        .addColumn("transaction_id", "uuid", (col) =>
            col.notNull().references("transactions.id").onDelete("cascade")
        )
        .addColumn("file_id", "uuid", (col) =>
            col.notNull().references("files.id").onDelete("cascade")
        )
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addPrimaryKeyConstraint("transaction_attachments_pkey", ["transaction_id", "file_id"])
        .execute();

    await db.schema
        .createIndex("transaction_attachments_file_id_idx")
        .on("transaction_attachments")
        .column("file_id")
        .execute();

    await db.schema
        .createTable("event_attachments")
        .addColumn("event_id", "uuid", (col) =>
            col.notNull().references("events.id").onDelete("cascade")
        )
        .addColumn("file_id", "uuid", (col) =>
            col.notNull().references("files.id").onDelete("cascade")
        )
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addPrimaryKeyConstraint("event_attachments_pkey", ["event_id", "file_id"])
        .execute();

    await db.schema
        .createIndex("event_attachments_file_id_idx")
        .on("event_attachments")
        .column("file_id")
        .execute();

    await db.schema
        .createTable("exported_reports")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("file_id", "uuid", (col) =>
            col.notNull().references("files.id").onDelete("cascade")
        )
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("kind", "varchar(64)", (col) => col.notNull())
        .addColumn("params_json", "jsonb")
        .addColumn("generated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .execute();

    await db.schema
        .createIndex("exported_reports_user_id_idx")
        .on("exported_reports")
        .column("user_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("exported_reports").execute();
    await db.schema.dropTable("event_attachments").execute();
    await db.schema.dropTable("transaction_attachments").execute();
    await db.schema
        .alterTable("users")
        .addColumn("avatar_url", "varchar(255)")
        .execute();
    await db.schema.alterTable("users").dropColumn("avatar_file_id").execute();
};
