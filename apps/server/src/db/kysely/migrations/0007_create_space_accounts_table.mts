import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
    await db.schema
        .createTable("space_accounts")
        .addColumn("account_id", "uuid", (col) =>
            col.notNull().references("accounts.id").onDelete("cascade")
        )
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addPrimaryKeyConstraint("space_accounts_pkey", ["account_id", "space_id"])
        .execute();
};
export const down = async (db: Kysely<any>) => {
    await db.schema.dropTable("space_accounts").execute();
};
