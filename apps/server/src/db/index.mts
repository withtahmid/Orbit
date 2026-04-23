import { Pool } from "pg";
import { ENV, IS_DEMO } from "../env.mjs";

/**
 * Apply the app-wide session TimeZone to every checked-out connection.
 * This is how we make `DATE_TRUNC('month', NOW())`, `::date`, and any
 * `timestamptz → timestamp` conversion agree on the same wall clock
 * without threading the zone through every SQL call site. Single source
 * of truth: `ENV.APP_TIMEZONE`.
 *
 * Using `SET` (not `SET LOCAL`) persists for the lifetime of the
 * connection, which matches pool checkout semantics — each pooled
 * client is set once on connect and reused.
 */
const createPGPool = (): Pool => {
    const pool = new Pool({
        connectionString: ENV.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    pool.on("connect", (client) => {
        // Format as a SQL literal (the zone is a trusted env var, but
        // escape just in case — single quotes doubled).
        const tz = ENV.APP_TIMEZONE.replace(/'/g, "''");
        const statements = [`SET TIME ZONE '${tz}'`];
        if (IS_DEMO) {
            // DB-level write freeze: Postgres rejects any INSERT/UPDATE/
            // DELETE/DDL on this session with "cannot execute X in a
            // read-only transaction". Belt-and-suspenders backstop to
            // `filterMutationsOnDemoMiddleware` — protects CLI scripts
            // (seed, ad-hoc tsx runs) that bypass the tRPC layer.
            statements.push(`SET default_transaction_read_only = on`);
        }
        client.query(statements.join("; ")).catch((err) => {
            // Don't crash the pool; log and let queries surface the
            // problem if the zone name is invalid.
            // eslint-disable-next-line no-console
            console.error("Failed to apply session config on pg connection:", err);
        });
    });
    return pool;
};
export default createPGPool;
