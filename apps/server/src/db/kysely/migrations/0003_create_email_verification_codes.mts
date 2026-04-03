import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createType("email_verification_code_purpose")
        .asEnum(["signup", "password_reset", "change_email"])
        .execute();

    await db.schema
        .createTable("email_verification_codes")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("user_id", "uuid", (col) => col.references("users.id").onDelete("cascade"))
        .addColumn("tmp_user_id", "uuid", (col) =>
            col.references("tmp_users.id").onDelete("cascade")
        )
        .addColumn("code", "varchar(6)", (col) => col.notNull())
        .addColumn("expires_at", "timestamptz", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("purpose", sql`email_verification_code_purpose`, (col) => col.notNull())
        .addCheckConstraint(
            "valid_user_or_tmp_user",
            sql`(user_id IS NOT NULL AND tmp_user_id IS NULL) OR (user_id IS NULL AND tmp_user_id IS NOT NULL)`
        )
        .addCheckConstraint(
            "purpose_valid",
            sql`
                purpose IN ('signup', 'password_reset', 'change_email')
                AND (
                    (purpose = 'signup' AND tmp_user_id IS NOT NULL AND user_id IS NULL)
                    OR (purpose IN ('password_reset', 'change_email') AND user_id IS NOT NULL AND tmp_user_id IS NULL)
                )
            `
        )
        .execute();

    await db.schema
        .createIndex("idx_evc_user_id")
        .on("email_verification_codes")
        .column("user_id")
        .execute();

    await db.schema
        .createIndex("idx_evc_tmp_user_id")
        .on("email_verification_codes")
        .column("tmp_user_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("email_verification_codes").execute();
    await db.schema.dropType("email_verification_code_purpose").execute();
};
