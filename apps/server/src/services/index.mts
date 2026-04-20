import createPGPool from "../db/index.mjs";
import { createQueryBuilder } from "../db/kysely/index.mjs";
import { logger } from "../utils/logger.mjs";
import { createMailService } from "./mail/mailer.mjs";
import { createR2Service } from "./r2/client.mjs";

export type Services = {
    pgPool: ReturnType<typeof createPGPool>;
    qb: ReturnType<typeof createQueryBuilder>;
    mailer: ReturnType<typeof createMailService>;
    r2: ReturnType<typeof createR2Service>;
};

export const createServices = (): Services => {
    const pgPool = createPGPool();
    logger.info("PostgreSQL connection pool created successfully");
    const qb = createQueryBuilder(pgPool);
    logger.info("Kysely query builder created successfully");
    const r2 = createR2Service();
    logger.info("R2 client initialized");
    return {
        pgPool,
        qb,
        mailer: createMailService(),
        r2,
    };
};
