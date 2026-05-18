import { Kysely, sql } from "kysely";

/**
 * Add a DB-level invariant that targets only ride on rolling envelopes.
 *
 * The procedure layer in `envelop.create` and `envelop.update` enforces
 * the rule today, but a missing field in an update payload could
 * previously leave a stale `target_date` on a monthly envelope. The
 * CHECK constraint makes that state unrepresentable.
 *
 * No data to migrate: production has nothing yet, and dev seeds the
 * goal envelopes with cadence='none', which trivially satisfies the
 * predicate.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE envelops
        ADD CONSTRAINT envelops_target_only_on_rolling_check
        CHECK (
            (target_amount IS NULL AND target_date IS NULL)
            OR cadence = 'none'
        )
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`
        ALTER TABLE envelops
        DROP CONSTRAINT IF EXISTS envelops_target_only_on_rolling_check
    `.execute(db);
};
