import { Kysely, sql } from "kysely";

/**
 * Soft-delete + JWT-invalidation infrastructure on `users`.
 *
 * `deleted_at` lets us tombstone a user without breaking the
 * RESTRICT FKs on `spaces.created_by`, `spaces.updated_by`,
 * `transactions.created_by`, `envelop_allocations.created_by`,
 * and `plan_allocations.created_by` (see migration 027). Hard-deleting
 * a user who has ever created shared data fails at the FK layer, so
 * `procedures/user/deleteAccount.mts` anonymizes the row and sets this
 * column instead. `fetchUserFromJWT` rejects any session for a row with
 * `deleted_at IS NOT NULL`.
 *
 * `token_version` is bumped on `changePassword` (and on `deleteAccount`)
 * so stolen JWTs stop working as soon as the legit user takes a security
 * action. Existing JWTs minted before this migration carry no
 * `tokenVersion` claim; the auth layer treats a missing claim as `1`,
 * matching the default value below, so we don't force-logout everyone
 * the moment we ship this.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("users")
        .addColumn("deleted_at", "timestamptz")
        .addColumn("token_version", "integer", (col) => col.notNull().defaultTo(1))
        .execute();

    await sql`
        CREATE INDEX IF NOT EXISTS users_deleted_at_idx
            ON users (deleted_at)
            WHERE deleted_at IS NOT NULL
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS users_deleted_at_idx`.execute(db);
    await db.schema.alterTable("users").dropColumn("deleted_at").execute();
    await db.schema.alterTable("users").dropColumn("token_version").execute();
};
