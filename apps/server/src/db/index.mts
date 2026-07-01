import { Pool } from "pg";
import { ENV, IS_DEMO } from "../env.mjs";

/**
 * Apply the app-wide session TimeZone to every checked-out connection.
 * This is how we make `DATE_TRUNC('month', NOW())`, `::date`, and any
 * `timestamptz → timestamp` conversion agree on the same wall clock
 * without threading the zone through every SQL call site. Single source
 * of truth: `ENV.APP_TIMEZONE`.
 *
 * The zone is applied via the libpq startup `options` parameter (`-c
 * timezone=...`) so it is baked into each backend at connect time. This
 * is required for PgBouncer transaction-pooling endpoints (e.g. Neon's
 * `-pooler` host): a post-connect `SET TIME ZONE` is run on whatever
 * backend happens to serve that statement and is NOT retained across the
 * pooler's per-transaction backend reassignment, so sessions silently
 * fall back to the server default (GMT). That drift mis-files `date`
 * columns written from an APP_TZ wall-clock instant by one day around
 * month boundaries (e.g. a July-1 00:00 Asia/Dhaka month-start instant,
 * `…T18:00Z`, casts to `date` as 2026-06-30 under GMT). Startup `options`
 * is honored by the pooler, so it holds for every backend.
 *
 * The post-connect `SET` is kept as reinforcement, and each connection is
 * verified after setup: if the session zone is NOT `APP_TIMEZONE` (e.g. a
 * future pooler silently strips the startup `options`), we log loudly rather
 * than let `date`-column reads/writes drift silently by a day. That drift is
 * the exact failure this block prevents, so it must never fail quiet.
 */
const createPGPool = (): Pool => {
    // `APP_TIMEZONE` is interpolated into the libpq startup `options` string
    // (space-delimited, backslash-escaped). Reject anything that isn't a plain
    // IANA zone name so a stray space or metachar can't corrupt the startup
    // packet — fail fast on misconfiguration instead of connecting wrong.
    if (!/^[A-Za-z0-9_+/-]+$/.test(ENV.APP_TIMEZONE)) {
        throw new Error(
            `Invalid APP_TIMEZONE '${ENV.APP_TIMEZONE}': expected a plain IANA zone name.`
        );
    }
    const pool = new Pool({
        connectionString: ENV.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        // Startup parameter — survives the pooler; see block comment.
        options: `-c timezone=${ENV.APP_TIMEZONE}`,
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
        client
            .query(statements.join("; "))
            // Verify the zone actually took on THIS connection. `SHOW
            // timezone` reports the canonical name (e.g. "Asia/Dhaka").
            .then(() => client.query("SHOW timezone"))
            .then((res) => {
                const actual = res.rows?.[0]?.TimeZone;
                if (actual !== ENV.APP_TIMEZONE) {
                    // eslint-disable-next-line no-console
                    console.error(
                        `[db] Session timezone is '${actual}', expected ` +
                            `'${ENV.APP_TIMEZONE}'. Date math (period_start, ` +
                            `DATE_TRUNC, ::date) will be WRONG on this connection ` +
                            `— check that the pooler forwards startup 'options'.`
                    );
                }
            })
            .catch((err) => {
                // Don't crash the pool; log and let queries surface the
                // problem if the zone name is invalid.
                // eslint-disable-next-line no-console
                console.error("Failed to apply/verify session config on pg connection:", err);
            });
    });
    return pool;
};
export default createPGPool;
