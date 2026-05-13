import { Kysely, sql } from "kysely";

/**
 * DPS (Deposit Pension Scheme) — Bangladeshi recurring deposit contracts.
 *
 * Two new tables and one additive column:
 *
 *   dps_schemes  → the contract: bank, scheme name, account number,
 *                  start date, term, installment, rate, compounding,
 *                  status. 1:1 with a `locked` account row, which is
 *                  where the principal lives in `account_balances`.
 *                  Projections (accumulated interest, projected
 *                  maturity) are derived on read, never stored — the
 *                  bank doesn't credit interest until maturity, so
 *                  posting it as a transaction would inflate spendable
 *                  balance.
 *
 *   dps_payouts  → lifecycle ledger. Separate from `transactions`
 *                  because a lifecycle event (opened, missed installment,
 *                  matured, encashed early, abandoned) can predate any
 *                  cash actually moving. The matching transaction is
 *                  linked via `linked_transaction_id`, nullable.
 *
 *   transactions.dps_scheme_id  → tags an installment transfer or a
 *                  maturity income to its scheme. ON DELETE SET NULL
 *                  mirrors `event_id`: deleting a scheme keeps the
 *                  historical money trail intact.
 */
export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("dps_schemes")
        .addColumn("id", "uuid", (col) =>
            col.primaryKey().defaultTo(sql`uuidv7()`)
        )
        .addColumn("account_id", "uuid", (col) =>
            col.notNull().unique().references("accounts.id").onDelete("restrict")
        )
        .addColumn("created_by", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("restrict")
        )
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("bank_name", "varchar(120)", (col) => col.notNull())
        .addColumn("scheme_name", "varchar(120)")
        .addColumn("account_number", "varchar(40)")
        .addColumn("installment_amount", "numeric(14, 2)", (col) =>
            col.notNull()
        )
        .addColumn("term_months", "integer", (col) => col.notNull())
        .addColumn("annual_rate_bps", "integer", (col) => col.notNull())
        .addColumn("compounding", "text", (col) =>
            col.notNull().defaultTo("quarterly")
        )
        .addColumn("start_date", "date", (col) => col.notNull())
        .addColumn("installment_day", "smallint", (col) => col.notNull())
        .addColumn("source_account_id", "uuid", (col) =>
            col.references("accounts.id").onDelete("set null")
        )
        .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
        .addColumn("matured_at", "timestamptz")
        .addColumn("closed_at", "timestamptz")
        .addColumn("early_encashment_rate_bps", "integer")
        .addColumn("final_payout_amount", "numeric(14, 2)")
        .addColumn("withholding_tax_bps", "integer", (col) =>
            col.notNull().defaultTo(1000)
        )
        .addColumn("notes", "text")
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn("updated_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addCheckConstraint(
            "dps_schemes_installment_amount_check",
            sql`installment_amount > 0`
        )
        .addCheckConstraint(
            "dps_schemes_term_months_check",
            sql`term_months > 0 AND term_months <= 360`
        )
        .addCheckConstraint(
            "dps_schemes_annual_rate_check",
            sql`annual_rate_bps > 0 AND annual_rate_bps <= 5000`
        )
        .addCheckConstraint(
            "dps_schemes_compounding_check",
            sql`compounding IN ('monthly', 'quarterly')`
        )
        .addCheckConstraint(
            "dps_schemes_installment_day_check",
            sql`installment_day >= 1 AND installment_day <= 31`
        )
        .addCheckConstraint(
            "dps_schemes_status_check",
            sql`status IN ('active', 'matured', 'encashed_early', 'abandoned')`
        )
        .addCheckConstraint(
            "dps_schemes_withholding_tax_check",
            sql`withholding_tax_bps >= 0 AND withholding_tax_bps <= 5000`
        )
        .addCheckConstraint(
            "dps_schemes_early_rate_check",
            sql`early_encashment_rate_bps IS NULL OR (early_encashment_rate_bps >= 0 AND early_encashment_rate_bps <= 5000)`
        )
        .execute();

    await sql`
        CREATE INDEX dps_schemes_space_idx
        ON dps_schemes (space_id)
    `.execute(db);

    await sql`
        CREATE INDEX dps_schemes_source_idx
        ON dps_schemes (source_account_id)
        WHERE source_account_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX dps_schemes_active_idx
        ON dps_schemes (space_id, start_date)
        WHERE status = 'active'
    `.execute(db);

    await db.schema
        .createTable("dps_payouts")
        .addColumn("id", "uuid", (col) =>
            col.primaryKey().defaultTo(sql`uuidv7()`)
        )
        .addColumn("dps_scheme_id", "uuid", (col) =>
            col.notNull().references("dps_schemes.id").onDelete("cascade")
        )
        .addColumn("kind", "text", (col) => col.notNull())
        .addColumn("occurred_at", "timestamptz", (col) => col.notNull())
        .addColumn("cash_amount", "numeric(14, 2)")
        .addColumn("linked_transaction_id", "uuid", (col) =>
            col.references("transactions.id").onDelete("set null")
        )
        .addColumn("note", "text")
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addCheckConstraint(
            "dps_payouts_kind_check",
            sql`kind IN ('opened', 'matured', 'encashed_early', 'abandoned', 'missed_installment')`
        )
        .execute();

    await sql`
        CREATE INDEX dps_payouts_scheme_idx
        ON dps_payouts (dps_scheme_id, occurred_at DESC)
    `.execute(db);

    await db.schema
        .alterTable("transactions")
        .addColumn("dps_scheme_id", "uuid", (col) =>
            col.references("dps_schemes.id").onDelete("set null")
        )
        .execute();

    await sql`
        CREATE INDEX transactions_dps_scheme_idx
        ON transactions (dps_scheme_id)
        WHERE dps_scheme_id IS NOT NULL
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP INDEX IF EXISTS transactions_dps_scheme_idx`.execute(db);
    await db.schema
        .alterTable("transactions")
        .dropColumn("dps_scheme_id")
        .execute();
    await db.schema.dropTable("dps_payouts").execute();
    await sql`DROP INDEX IF EXISTS dps_schemes_active_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS dps_schemes_source_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS dps_schemes_space_idx`.execute(db);
    await db.schema.dropTable("dps_schemes").execute();
};
