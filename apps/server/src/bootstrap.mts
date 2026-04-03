import { run_migration } from "./db/kysely/migrator.mjs";
import { logger } from "./utils/logger.mjs";

const run_bootstrap = async () => {
    logger.info("Running Bootstraps");
    // await run_migration({ migrateMode: "up" });
};

export default run_bootstrap;
