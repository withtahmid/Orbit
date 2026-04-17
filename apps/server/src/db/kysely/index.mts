import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./types.mjs";

export const createQueryBuilder = (pool: Pool): Kysely<DB> => {
    const dialect = new PostgresDialect({
        pool,
    });
    return new Kysely<DB>({
        dialect,
    });
};
