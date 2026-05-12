import { Kysely, sql } from "kysely";

/**
 * Make `space_pin.set_by_user_id` nullable and switch the FK from
 * `ON DELETE CASCADE` to `ON DELETE SET NULL`.
 *
 * The CASCADE behavior we shipped in migration 043 was too aggressive:
 * a team-wide envelope/event pin would silently vanish for every member
 * the moment the user who set it left the space (or had their account
 * deleted). The pin records the *team's* default for the field — it's
 * not the property of the setter. SET NULL preserves the pin and loses
 * only the audit-trail attribution.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("space_pin")
        .alterColumn("set_by_user_id", (col) => col.dropNotNull())
        .execute();

    await sql`
        ALTER TABLE space_pin
        DROP CONSTRAINT space_pin_set_by_user_id_fkey
    `.execute(db);

    await sql`
        ALTER TABLE space_pin
        ADD CONSTRAINT space_pin_set_by_user_id_fkey
        FOREIGN KEY (set_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    /* Reverse: the down requires every space_pin row to have a non-null
       setter. The migration cascade-set rows to NULL on user delete, so
       any pin whose original setter was deleted needs a fresh user id.
       Cascade through three fallbacks:
         1. first owner of the space (most-correct, retains audit intent)
         2. any space member (correct in practice — owner could have left)
         3. any user (very-last resort; ownerless+memberless space is
            broken state anyway, but we don't want the migration to
            partial-apply)
       Then guard with a hard count check before re-adding NOT NULL so
       an unrecoverable row aborts cleanly rather than leaving the table
       half-migrated. */
    await sql`
        UPDATE space_pin sp
        SET set_by_user_id = COALESCE(
            (
                SELECT user_id FROM space_members
                WHERE space_id = sp.space_id
                  AND role = 'owner'::__type_space_user_role
                ORDER BY user_id
                LIMIT 1
            ),
            (
                SELECT user_id FROM space_members
                WHERE space_id = sp.space_id
                ORDER BY user_id
                LIMIT 1
            ),
            (SELECT id FROM users ORDER BY id LIMIT 1)
        )
        WHERE set_by_user_id IS NULL
    `.execute(db);

    const remaining = await sql<{ c: string }>`
        SELECT COUNT(*)::text AS c FROM space_pin WHERE set_by_user_id IS NULL
    `.execute(db);
    const remainingCount = Number(remaining.rows[0]?.c ?? "0");
    if (remainingCount > 0) {
        throw new Error(
            `Cannot down-migrate: ${remainingCount} space_pin rows with no resolvable setter remain. ` +
                `Delete them manually or seed a fallback user before retrying.`
        );
    }

    await sql`
        ALTER TABLE space_pin
        DROP CONSTRAINT space_pin_set_by_user_id_fkey
    `.execute(db);

    await sql`
        ALTER TABLE space_pin
        ADD CONSTRAINT space_pin_set_by_user_id_fkey
        FOREIGN KEY (set_by_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    `.execute(db);

    await db.schema
        .alterTable("space_pin")
        .alterColumn("set_by_user_id", (col) => col.setNotNull())
        .execute();
};
