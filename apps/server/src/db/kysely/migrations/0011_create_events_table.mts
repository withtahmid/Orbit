import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("events")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("space_id", "uuid", (col) =>
            col.notNull().references("spaces.id").onDelete("cascade")
        )
        .addColumn("name", "varchar(255)", (col) => col.notNull())
        .addColumn("start_time", "timestamptz", (col) => col.notNull())
        .addColumn("end_time", "timestamptz", (col) => col.notNull())
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addCheckConstraint("events_time_check", sql`end_time > start_time`)
        .execute();
};
export const down = async (db: Kysely<any>): Promise<void> => {
    await db.schema.dropTable("events").execute();
};
