import createPGPool from "../db/index.mjs";
import { createQueryBuilder } from "../db/kysely/index.mjs";
import { logger } from "../utils/logger.mjs";
import { createMailService } from "./mail/mailer.mjs";

export type Services = {
    pgPool: ReturnType<typeof createPGPool>;
    qb: ReturnType<typeof createQueryBuilder>;
    mailer: ReturnType<typeof createMailService>;
};

export const createServices = (): Services => {
    const pgPool = createPGPool();
    logger.info("PostgreSQL connection pool created successfully");
    const qb = createQueryBuilder(pgPool);
    logger.info("Kysely query builder created successfully");
    return {
        pgPool,
        qb,
        mailer: createMailService(),
    };
};
