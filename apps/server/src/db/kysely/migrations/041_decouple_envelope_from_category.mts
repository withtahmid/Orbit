import { Kysely, sql } from "kysely";

/**
 * Decouples envelope membership from category.
 *
 * Before this migration: a transaction's envelope was derived through its
 * category (`transactions.expense_category_id → expense_categories.envelop_id`).
 * Reorganizing categories silently rewrote history.
 *
 * After this migration: `transactions.envelop_id` is the source of truth for
 * which envelope an expense belongs to, frozen at insert time. The category
 * keeps a `default_envelop_id` that the entry form uses to auto-fill the
 * envelope picker — but the picker is editable and the chosen envelope is
 * persisted on the transaction row itself.
 *
 * Backfill copies the current ec.envelop_id onto every existing expense
 * transaction, guaranteeing analytics return identical numbers before vs.
 * after for pre-migration data.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("transactions")
        .addColumn("envelop_id", "uuid", (col) =>
            col.references("envelops.id").onDelete("restrict")
        )
        .execute();

    await sql`
        UPDATE transactions t
        SET envelop_id = ec.envelop_id
        FROM expense_categories ec
        WHERE t.expense_category_id = ec.id
          AND t.type = 'expense'
    `.execute(db);

    const orphans = await sql<{
        count: string;
    }>`
        SELECT COUNT(*)::text AS count
        FROM transactions
        WHERE type = 'expense' AND envelop_id IS NULL
    `.execute(db);
    const orphanCount = Number(orphans.rows[0]?.count ?? "0");
    if (orphanCount > 0) {
        throw new Error(
            `Backfill incomplete: ${orphanCount} expense transactions still have NULL envelop_id. ` +
                `Aborting migration to preserve analytics parity.`
        );
    }

    await db.schema
        .alterTable("transactions")
        .addCheckConstraint(
            "transactions_envelop_check",
            sql`(type != 'expense' OR envelop_id IS NOT NULL)`
        )
        .execute();

    await sql`
        CREATE INDEX idx_transactions_envelop_id
        ON transactions (envelop_id)
        WHERE envelop_id IS NOT NULL
    `.execute(db);

    await db.schema
        .alterTable("expense_categories")
        .renameColumn("envelop_id", "default_envelop_id")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("expense_categories")
        .renameColumn("default_envelop_id", "envelop_id")
        .execute();

    await sql`DROP INDEX IF EXISTS idx_transactions_envelop_id`.execute(db);

    await db.schema
        .alterTable("transactions")
        .dropConstraint("transactions_envelop_check")
        .execute();

    await db.schema.alterTable("transactions").dropColumn("envelop_id").execute();
};
