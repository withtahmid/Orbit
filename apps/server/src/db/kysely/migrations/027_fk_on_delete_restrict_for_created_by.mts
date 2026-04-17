import { Kysely, sql } from "kysely";

/**
 * Make `created_by` / `updated_by` FKs to `users.id` explicitly RESTRICT.
 *
 * Postgres' default (`NO ACTION`) resolves like RESTRICT at commit time,
 * so deleting a user who created a transaction already fails. Stating it
 * as RESTRICT is informational — it aligns the schema with the invariant
 * documented in the project spec §15.13, and it makes future migrations
 * that switch to `SET NULL` (for soft-delete) obvious drifts from the
 * baseline rather than silent changes in behaviour.
 *
 * Covered:
 *   - transactions.created_by        → users.id  (RESTRICT)
 *   - spaces.created_by              → users.id  (RESTRICT)
 *   - spaces.updated_by              → users.id  (RESTRICT)
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE transactions
            DROP CONSTRAINT IF EXISTS transactions_created_by_fkey,
            ADD CONSTRAINT transactions_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
    `.execute(db);

    await sql`
        ALTER TABLE spaces
            DROP CONSTRAINT IF EXISTS spaces_created_by_fkey,
            ADD CONSTRAINT spaces_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
    `.execute(db);

    await sql`
        ALTER TABLE spaces
            DROP CONSTRAINT IF EXISTS spaces_updated_by_fkey,
            ADD CONSTRAINT spaces_updated_by_fkey
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT;
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE transactions
            DROP CONSTRAINT IF EXISTS transactions_created_by_fkey,
            ADD CONSTRAINT transactions_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES users(id);
    `.execute(db);

    await sql`
        ALTER TABLE spaces
            DROP CONSTRAINT IF EXISTS spaces_created_by_fkey,
            ADD CONSTRAINT spaces_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES users(id);
    `.execute(db);

    await sql`
        ALTER TABLE spaces
            DROP CONSTRAINT IF EXISTS spaces_updated_by_fkey,
            ADD CONSTRAINT spaces_updated_by_fkey
                FOREIGN KEY (updated_by) REFERENCES users(id);
    `.execute(db);
};
