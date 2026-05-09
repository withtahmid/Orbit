import type { Kysely } from "kysely";
import type { DB } from "../db/kysely/types.mjs";
import { logger } from "../utils/logger.mjs";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Periodically delete expired idempotency cache rows. Each row has its
 * own `expires_at` (set on insert via the column default), so cleanup is
 * a single DELETE keyed off the partial index.
 *
 * Idempotent and safe to run concurrently across replicas — DELETE just
 * removes rows that are already past their TTL; if another instance
 * already removed them, our DELETE is a no-op.
 *
 * Returns a `stop` function so tests / graceful-shutdown paths can clear
 * the interval cleanly.
 */
export function startIdempotencyCleanup(qb: Kysely<DB>): () => void {
    const tick = async () => {
        try {
            const result = await qb
                .deleteFrom("idempotency_keys")
                .where("expires_at", "<", new Date())
                .executeTakeFirst();
            const removed = Number(result?.numDeletedRows ?? 0);
            if (removed > 0) {
                logger.info(
                    `Idempotency cleanup: removed ${removed} expired keys`
                );
            }
        } catch (err) {
            // Don't crash the server on cleanup failure — the index keeps
            // queries fast even with stale rows. Just log.
            logger.error(`Idempotency cleanup failed: ${(err as Error).message}`);
        }
    };

    // Run once shortly after startup so we don't wait an hour to do the
    // first sweep, then on the regular interval.
    const initial = setTimeout(tick, 30_000);
    const handle = setInterval(tick, CLEANUP_INTERVAL_MS);
    return () => {
        clearTimeout(initial);
        clearInterval(handle);
    };
}
