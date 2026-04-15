import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createType("__type_space_user_role")
        .asEnum(["owner", "editor", "viewer"])
        .execute();

    await db.schema
        .createTable("space_members")
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("role", sql`__type_space_user_role`, (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addPrimaryKeyConstraint("space_members_pkey", ["space_id", "user_id"])
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("space_members").execute();
    await db.schema.dropType("__type_space_user_role").execute();
};
