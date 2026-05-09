import { Kysely, sql } from "kysely";

/**
 * Per-space budget mode:
 *   - 'flexible' (default) — overspend is allowed, the reckoning is
 *      offered but skippable, transactions always record.
 *   - 'strict'             — overspend at month rollover blocks new
 *      transaction creation in the space until past-month overspends
 *      are reckoned with. YNAB-style accountability.
 *
 * Default is 'flexible' so the introduction is non-disruptive — owners
 * who want strict opt in via the space settings page.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("spaces")
        .addColumn("budget_mode", "text", (col) =>
            col.notNull().defaultTo("flexible")
        )
        .execute();

    await sql`
        ALTER TABLE spaces
        ADD CONSTRAINT spaces_budget_mode_check
        CHECK (budget_mode IN ('flexible', 'strict'))
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE spaces DROP CONSTRAINT IF EXISTS spaces_budget_mode_check
    `.execute(db);
    await db.schema.alterTable("spaces").dropColumn("budget_mode").execute();
};
