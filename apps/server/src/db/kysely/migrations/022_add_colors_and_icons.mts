import { Kysely, sql } from "kysely";

const DEFAULT_COLOR = "#10b981";
const DEFAULT_ICON_ENVELOP = "mail";
const DEFAULT_ICON_PLAN = "target";
const DEFAULT_ICON_ACCOUNT = "wallet";
const DEFAULT_ICON_CATEGORY = "folder";
const DEFAULT_ICON_EVENT = "calendar-days";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelops")
        .addColumn("color", "varchar(7)", (col) => col.notNull().defaultTo(DEFAULT_COLOR))
        .addColumn("icon", "varchar(48)", (col) => col.notNull().defaultTo(DEFAULT_ICON_ENVELOP))
        .addColumn("description", "text")
        .execute();

    await db.schema
        .alterTable("plans")
        .addColumn("color", "varchar(7)", (col) => col.notNull().defaultTo(DEFAULT_COLOR))
        .addColumn("icon", "varchar(48)", (col) => col.notNull().defaultTo(DEFAULT_ICON_PLAN))
        .execute();

    await db.schema
        .alterTable("accounts")
        .addColumn("color", "varchar(7)", (col) => col.notNull().defaultTo(DEFAULT_COLOR))
        .addColumn("icon", "varchar(48)", (col) => col.notNull().defaultTo(DEFAULT_ICON_ACCOUNT))
        .execute();

    await db.schema
        .alterTable("expense_categories")
        .addColumn("color", "varchar(7)", (col) => col.notNull().defaultTo(DEFAULT_COLOR))
        .addColumn("icon", "varchar(48)", (col) => col.notNull().defaultTo(DEFAULT_ICON_CATEGORY))
        .execute();

    await db.schema
        .alterTable("events")
        .addColumn("color", "varchar(7)", (col) => col.notNull().defaultTo(DEFAULT_COLOR))
        .addColumn("icon", "varchar(48)", (col) => col.notNull().defaultTo(DEFAULT_ICON_EVENT))
        .addColumn("description", "text")
        .execute();

    // Backfill deterministic distinct-ish colors based on id for existing rows
    // so they don't all start the same. Uses a small palette modulo the id hash.
    await sql`
        UPDATE envelops SET color = (ARRAY[
            '#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6',
            '#ec4899','#f97316','#eab308','#22c55e','#64748b'
        ])[(abs(hashtext(id::text)) % 10) + 1];
    `.execute(db);
    await sql`
        UPDATE plans SET color = (ARRAY[
            '#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6',
            '#ec4899','#f97316','#eab308','#22c55e','#64748b'
        ])[(abs(hashtext(id::text)) % 10) + 1];
    `.execute(db);
    await sql`
        UPDATE accounts SET color = (ARRAY[
            '#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6',
            '#ec4899','#f97316','#eab308','#22c55e','#64748b'
        ])[(abs(hashtext(id::text)) % 10) + 1];
    `.execute(db);
    await sql`
        UPDATE expense_categories SET color = (ARRAY[
            '#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6',
            '#ec4899','#f97316','#eab308','#22c55e','#64748b'
        ])[(abs(hashtext(id::text)) % 10) + 1];
    `.execute(db);
    await sql`
        UPDATE events SET color = (ARRAY[
            '#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6',
            '#ec4899','#f97316','#eab308','#22c55e','#64748b'
        ])[(abs(hashtext(id::text)) % 10) + 1];
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.alterTable("events").dropColumn("description").execute();
    await db.schema.alterTable("events").dropColumn("icon").execute();
    await db.schema.alterTable("events").dropColumn("color").execute();

    await db.schema.alterTable("expense_categories").dropColumn("icon").execute();
    await db.schema.alterTable("expense_categories").dropColumn("color").execute();

    await db.schema.alterTable("accounts").dropColumn("icon").execute();
    await db.schema.alterTable("accounts").dropColumn("color").execute();

    await db.schema.alterTable("plans").dropColumn("icon").execute();
    await db.schema.alterTable("plans").dropColumn("color").execute();

    await db.schema.alterTable("envelops").dropColumn("description").execute();
    await db.schema.alterTable("envelops").dropColumn("icon").execute();
    await db.schema.alterTable("envelops").dropColumn("color").execute();
};
