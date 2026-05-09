import { useState, useCallback } from "react";

/**
 * Generates a stable UUID for one mutation attempt and exposes a `rotate`
 * fn to mint a fresh one after success. Pass the current key with every
 * `mutate.mutate({...})` call so that retries — whether from a slow
 * network, an accidental double-click, or any in-flight duplicate — hit
 * the server's idempotency cache and return the original result instead
 * of creating a duplicate row.
 *
 * Usage:
 *   const { key, rotate } = useIdempotencyKey();
 *   const mut = trpc.transaction.expense.useMutation({
 *     onSuccess: () => { rotate(); ... },
 *   });
 *   mut.mutate({ ...input, idempotencyKey: key });
 *
 * Why a hook (and not just useMemo with a no-dep array): we need to be
 * able to mint a NEW key after success without unmounting the form.
 */
export function useIdempotencyKey() {
    const [key, setKey] = useState(() => crypto.randomUUID());
    const rotate = useCallback(() => setKey(crypto.randomUUID()), []);
    return { key, rotate };
}
