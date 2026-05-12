import { Kysely, sql } from "kysely";

/**
 * Space invites — token-credentialed invitations to join a space.
 *
 * `token` is the credential; anyone with the link can accept (we don't
 * pin acceptance to the invited email, so a user can invite a friend
 * by any address and the friend can accept with whatever account they
 * already have).
 *
 * `(space_id, email)` partial-unique on still-pending rows keeps the
 * settings UI free of duplicates — re-inviting an email "rotates" the
 * token instead of stacking rows. Accepted/revoked rows are excluded
 * so the same email can be re-invited later.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("space_invites")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("email", "varchar(255)", (col) => col.notNull())
        .addColumn("role", sql`__type_space_user_role`, (col) => col.notNull())
        .addColumn("token", "varchar(64)", (col) => col.notNull().unique())
        .addColumn("invited_by", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("expires_at", "timestamptz", (col) => col.notNull())
        .addColumn("accepted_at", "timestamptz")
        .addColumn("accepted_by_user_id", "uuid", (col) =>
            col.references("users.id").onDelete("set null")
        )
        .addColumn("revoked_at", "timestamptz")
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .execute();

    await db.schema
        .createIndex("space_invites_space_id_idx")
        .on("space_invites")
        .column("space_id")
        .execute();

    await sql`
        CREATE UNIQUE INDEX space_invites_pending_unique
        ON space_invites (space_id, lower(email))
        WHERE accepted_at IS NULL AND revoked_at IS NULL
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("space_invites").execute();
};
