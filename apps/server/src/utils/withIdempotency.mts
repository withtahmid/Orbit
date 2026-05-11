import { Kysely } from "kysely";
import { TRPCError } from "@trpc/server";
import type { DB } from "../db/kysely/types.mjs";

/**
 * Idempotency wrapper for mutation procedures. Given a client-supplied
 * `key`, the work runs at most once: a second call with the same key
 * returns the cached response without re-running the operation.
 *
 * Use inside the procedure's transaction so that cache claim + work
 * commit atomically. If the work throws, the claim row rolls back too
 * — failed attempts can be safely retried with the same key.
 *
 * Concurrency model:
 *   - INSERT … ON CONFLICT (key) DO NOTHING is atomic and lock-aware:
 *     Postgres takes a row-level lock on the about-to-conflict row and
 *     waits for the first transaction to commit or rollback. We never
 *     raise a unique-violation, so the surrounding transaction can't
 *     enter the aborted state (`25P02 in_failed_sql_transaction`) — a
 *     real footgun if you do this with try/catch instead.
 *   - First request: claim succeeds → run work → write response → commit.
 *   - Concurrent request: claim returns 0 rows; we re-read; first call's
 *     committed response is now visible → return it.
 *   - Concurrent request that arrives mid-work: blocks on the row lock
 *     until the first commits, then proceeds via the same re-read path.
 *
 * Storage shape:
 *   - `response IS NULL` means "claimed but not yet completed". The
 *     wrapped fn either commits (response becomes non-null) or throws
 *     (whole transaction rolls back, claim is gone).
 *   - On completion we store `{ v: result }` rather than the raw result.
 *     The wrapper distinguishes "no row stored yet" from "row stored
 *     with payload that happens to be null/false/0" — without the
 *     sentinel, a procedure returning `null` would lock its own key
 *     forever (every retry would interpret null as "in flight").
 *
 * If `key` is undefined the caller opts out — work runs every time.
 *
 * Type contract: T must be JSON-serializable. Date objects come back as
 * ISO strings on cache hits — same shape tRPC sends over the wire on
 * fresh calls (no transformer is configured), so callers see consistent
 * data either way.
 */
export async function withIdempotency<T>({
    trx,
    userId,
    operation,
    key,
    fn,
}: {
    trx: Kysely<DB>;
    userId: string;
    operation: string;
    key: string | undefined | null;
    fn: () => Promise<T>;
}): Promise<T> {
    if (!key) return fn();

    const completed = (cached: {
        response: unknown;
        user_id: string;
        operation: string;
    }) => {
        if (cached.user_id !== userId || cached.operation !== operation) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                    "Idempotency key already used for a different operation",
            });
        }
        if (cached.response === null) {
            // Claimed by someone else's transaction that hasn't yet
            // committed a response. We blocked on the row lock and got
            // here, so the other call must have rolled back without
            // committing — or this is genuinely concurrent with no
            // work having succeeded yet. Either way, treat as a busy
            // signal; the client can retry with the same key.
            throw new TRPCError({
                code: "CONFLICT",
                message:
                    "Operation already in progress; try again in a moment.",
            });
        }
        const wrapper = cached.response as { v: T } | null;
        if (wrapper && typeof wrapper === "object" && "v" in wrapper) {
            return wrapper.v;
        }
        // Defensive fallback: legacy rows or external writes that didn't
        // use the sentinel. Treat the column as the value itself.
        return cached.response as T;
    };

    // Try to claim. ON CONFLICT DO NOTHING means: if a row exists, this
    // is a no-op and `inserted` is undefined — no exception is raised
    // and the trx stays clean so the follow-up SELECT works.
    const inserted = await trx
        .insertInto("idempotency_keys")
        .values({
            key,
            user_id: userId,
            operation,
            response: null,
        })
        .onConflict((oc) => oc.column("key").doNothing())
        .returning("key")
        .executeTakeFirst();

    if (!inserted) {
        const existing = await trx
            .selectFrom("idempotency_keys")
            .select(["response", "user_id", "operation"])
            .where("key", "=", key)
            .executeTakeFirstOrThrow();
        return completed(existing);
    }

    const result = await fn();

    // Persist the response wrapped in a sentinel object so storage of
    // `null` / `false` / `0` is unambiguous from "not yet completed".
    // JSON.stringify normalises Dates etc. to ISO strings — same shape
    // the wire serializer would send anyway.
    //
    // `JSON.stringify({ v: undefined })` is `"{}"` — round-tripping
    // would yield `{}` and the cache-hit branch would fall through to
    // the legacy fallback (returning `{}` instead of `undefined`).
    // Coerce undefined to null up front so the sentinel is preserved
    // and the caller always sees the same value on cache hit and miss.
    const wrapped = JSON.parse(
        JSON.stringify({ v: result === undefined ? null : result })
    );
    await trx
        .updateTable("idempotency_keys")
        .set({ response: wrapped })
        .where("key", "=", key)
        .execute();

    return result;
}
