import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>) => {
    await db.schema.createType("__type_account_user_role").asEnum(["owner", "viewer"]).execute();

    await db.schema
        .createTable("user_accounts")
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("account_id", "uuid", (col) =>
            col.notNull().references("accounts.id").onDelete("cascade")
        )
        .addColumn("role", sql`__type_account_user_role`, (col) => col.notNull())

        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addPrimaryKeyConstraint("user_accounts_pkey", ["user_id", "account_id"])
        .execute();
};
export const down = async (db: Kysely<any>) => {
    await db.schema.dropTable("user_accounts").execute();
    await db.schema.dropType("__type_account_user_role").execute();
};
