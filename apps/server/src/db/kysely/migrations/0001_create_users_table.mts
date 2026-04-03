import { Kysely, sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
    await db.schema
        .createTable("users")
        .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
        .addColumn("email", "varchar(255)", (col) => col.unique().notNull())
        .addColumn("password_hash", "varchar(255)", (col) => col.notNull())
        .addColumn("first_name", "varchar(100)", (col) => col.notNull())
        .addColumn("last_name", "varchar(100)", (col) => col.notNull())
        .addColumn("avatar_url", "varchar(255)")
        .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`NOW()`))
        .addColumn("updated_at", "timestamptz")
        .execute();

    sql`
        CREATE OR REPLACE FUNCTION update_users_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    `.execute(db);

    sql`
        CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_users_updated_at_column();
    `.execute(db);
};

export const down = async (db: Kysely<any>): Promise<void> => {
    await sql`DROP TRIGGER IF EXISTS update_users_updated_at ON users`.execute(db);
    await sql`DROP FUNCTION IF EXISTS update_users_updated_at_column()`.execute(db);
    await db.schema.dropTable("users").execute();
};
