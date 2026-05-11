import { Kysely, sql } from "kysely";

/**
 * Replace the asymmetric `carry_over: boolean` with a three-value
 * `carry_policy` enum that's mathematically honest:
 *
 *   - 'reset'         — fresh slate every period, both directions.
 *                        (Equivalent to old carry_over=false.)
 *   - 'positive_only' — surplus carries forward, debt forgotten.
 *                        (Equivalent to old carry_over=true.)
 *   - 'both'          — surplus AND debt both carry forward. The honest
 *                        mode where overspend persists as real obligation.
 *
 * We keep the legacy `carry_over` column populated alongside `carry_policy`
 * for one release cycle so any pre-deploy server instance still functions,
 * then it can be removed in a follow-up migration.
 *
 * Backfill mapping:
 *   carry_over=false → 'reset'
 *   carry_over=true  → 'positive_only'
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("envelops")
        .addColumn("carry_policy", "text", (col) =>
            col.notNull().defaultTo("reset")
        )
        .execute();

    await sql`
        UPDATE envelops
        SET carry_policy = CASE
            WHEN carry_over THEN 'positive_only'
            ELSE 'reset'
        END
    `.execute(db);

    await sql`
        ALTER TABLE envelops
        ADD CONSTRAINT envelops_carry_policy_check
        CHECK (carry_policy IN ('reset', 'positive_only', 'both'))
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE envelops DROP CONSTRAINT IF EXISTS envelops_carry_policy_check
    `.execute(db);
    await db.schema.alterTable("envelops").dropColumn("carry_policy").execute();
};
