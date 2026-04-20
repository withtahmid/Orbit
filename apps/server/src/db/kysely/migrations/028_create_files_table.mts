import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createType("__type_file_purpose")
        .asEnum(["avatar", "transaction_receipt", "event_attachment", "exported_report"])
        .execute();

    await db.schema.createType("__type_file_status").asEnum(["pending", "confirmed"]).execute();

    await db.schema
        .createTable("files")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("r2_key", "text", (col) => col.notNull().unique())
        .addColumn("mime_type", "varchar(127)", (col) => col.notNull())
        .addColumn("size_bytes", "bigint", (col) => col.notNull())
        .addColumn("original_name", "varchar(255)", (col) => col.notNull())
        .addColumn("purpose", sql`__type_file_purpose`, (col) => col.notNull())
        .addColumn("status", sql`__type_file_status`, (col) => col.notNull().defaultTo("pending"))
        .addColumn("uploaded_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("confirmed_at", "timestamptz")
        .execute();

    await db.schema
        .createIndex("files_uploaded_by_idx")
        .on("files")
        .column("uploaded_by")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("files").execute();
    await db.schema.dropType("__type_file_status").execute();
    await db.schema.dropType("__type_file_purpose").execute();
};
