import { Kysely, sql } from "kysely";

/**
 * Transaction-entry pins — friction reducer for the new-transaction form.
 *
 * Two tables, two scopes:
 *
 *   user_space_pin  → per-user-per-space.  Account only.
 *   space_pin       → shared across all members of a space.  Envelope + Event.
 *
 * Picked two tables over a single nullable-user_id table because each
 * scope has different authorization rules (set/clear), different
 * uniqueness keys, and a different FK to the pinned entity.  Splitting
 * keeps the constraints declarative and the procedures readable.
 *
 * ON DELETE CASCADE on every entity FK gives us silent auto-expire for
 * free: archiving/deleting an account, envelope, or event drops the
 * matching pin row without any application-level bookkeeping.
 *
 * `space_pin.set_by_user_id` is preserved for future "Pinned by Alice"
 * attribution; the v1 UI does not surface it.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createType("__type_transaction_entry_pin_field")
        .asEnum(["account", "envelop", "event"])
        .execute();

    await db.schema
        .createTable("user_space_pin")
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("field", sql`__type_transaction_entry_pin_field`, (col) =>
            col.notNull()
        )
        .addColumn("account_id", "uuid", (col) =>
            col.references("accounts.id").onDelete("cascade")
        )
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("updated_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addPrimaryKeyConstraint("user_space_pin_pkey", ["user_id", "space_id", "field"])
        .addCheckConstraint(
            "user_space_pin_field_account_only",
            sql`(field = 'account' AND account_id IS NOT NULL)`
        )
        .execute();

    await db.schema
        .createTable("space_pin")
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("field", sql`__type_transaction_entry_pin_field`, (col) =>
            col.notNull()
        )
        .addColumn("envelop_id", "uuid", (col) =>
            col.references("envelops.id").onDelete("cascade")
        )
        .addColumn("event_id", "uuid", (col) =>
            col.references("events.id").onDelete("cascade")
        )
        .addColumn("set_by_user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("updated_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addPrimaryKeyConstraint("space_pin_pkey", ["space_id", "field"])
        .addCheckConstraint(
            "space_pin_field_entity_match",
            sql`(
                (field = 'envelop' AND envelop_id IS NOT NULL AND event_id IS NULL)
                OR (field = 'event' AND event_id IS NOT NULL AND envelop_id IS NULL)
            )`
        )
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("space_pin").execute();
    await db.schema.dropTable("user_space_pin").execute();
    await db.schema.dropType("__type_transaction_entry_pin_field").execute();
};
