import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelops")
        .addColumn("cadence", "text", (col) =>
            col.notNull().defaultTo("none")
        )
        .addColumn("carry_over", "boolean", (col) => col.notNull().defaultTo(false))
        .execute();

    // Launch scope is 'none' + 'monthly'. Leave the door open for 'weekly' / 'yearly'
    // later — the check constraint is the single place to widen it.
    await sql`
        ALTER TABLE envelops
        ADD CONSTRAINT envelops_cadence_check
        CHECK (cadence IN ('none', 'monthly'))
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`ALTER TABLE envelops DROP CONSTRAINT IF EXISTS envelops_cadence_check`.execute(db);
    await db.schema.alterTable("envelops").dropColumn("carry_over").execute();
    await db.schema.alterTable("envelops").dropColumn("cadence").execute();
};
