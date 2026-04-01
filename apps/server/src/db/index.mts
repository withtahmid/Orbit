import { Pool } from "pg";
import { ENV } from "../env.mjs";
// dotenv.config();

const createPGPool = (): Pool => {
    return new Pool({
        connectionString: ENV.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
};
export default createPGPool;
