import { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .alterTable("plans")
        .addColumn("description", "text")
        .addColumn("target_amount", "numeric(20, 2)")
        .addColumn("target_date", "date")
        .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.alterTable("plans").dropColumn("target_date").execute();
    await db.schema.alterTable("plans").dropColumn("target_amount").execute();
    await db.schema.alterTable("plans").dropColumn("description").execute();
};
