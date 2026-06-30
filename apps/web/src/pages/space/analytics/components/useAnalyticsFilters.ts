import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** Cheap RFC-4122-ish gate for URL filter params. The server runs a
 *  proper Zod uuid validator; this just stops a single malformed pasted
 *  link from 400-ing the whole view. */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID_RE.test(s);

export type FilterKey = "env" | "acc" | "cat";

/**
 * Shared analytics filter state, lifted out of Spending Trends so the
 * same Envelope/Account/Category filter bar can drive the Categories
 * and Calendar views too.
 *
 * State lives in URL search params (`env`, `acc`, `cat`) so links stay
 * shareable; multi-value keys repeat per id. Garbage values are dropped
 * client-side so a bad pasted link never reaches the server's uuid
 * validator.
 *
 * `opts.categories === false` makes the hook ignore `cat` entirely — it
 * never reads, writes, or clears it. Spending-by-category needs this:
 * that page already owns `cat` as its drill-focus param, and the
 * category tree drill *is* its category navigation, so the bar there
 * surfaces only Envelopes + Accounts.
 */
export function useAnalyticsFilters(opts?: { categories?: boolean }) {
    const manageCategories = opts?.categories !== false;
    const [params, setParams] = useSearchParams();

    const envelopeIds = useMemo(
        () => params.getAll("env").filter(isUuid),
        [params]
    );
    const accountIds = useMemo(
        () => params.getAll("acc").filter(isUuid),
        [params]
    );
    const categoryIds = useMemo(
        () => (manageCategories ? params.getAll("cat").filter(isUuid) : []),
        [params, manageCategories]
    );

    const setFilterIds = useCallback(
        (key: FilterKey, values: string[]) => {
            if (key === "cat" && !manageCategories) return;
            setParams(
                (p) => {
                    const next = new URLSearchParams(p);
                    next.delete(key);
                    for (const v of values) next.append(key, v);
                    return next;
                },
                { replace: true }
            );
        },
        [setParams, manageCategories]
    );

    const clearAllFilters = useCallback(() => {
        setParams(
            (p) => {
                const next = new URLSearchParams(p);
                next.delete("env");
                next.delete("acc");
                if (manageCategories) next.delete("cat");
                return next;
            },
            { replace: true }
        );
    }, [setParams, manageCategories]);

    /* Undefined when empty so callers never spend a round-trip on an
       empty array. */
    const envelopeIdsArg = envelopeIds.length > 0 ? envelopeIds : undefined;
    const accountIdsArg = accountIds.length > 0 ? accountIds : undefined;
    const categoryIdsArg = categoryIds.length > 0 ? categoryIds : undefined;
    const hasAnyFilter =
        envelopeIds.length + accountIds.length + categoryIds.length > 0;

    return {
        envelopeIds,
        accountIds,
        categoryIds,
        envelopeIdsArg,
        accountIdsArg,
        categoryIdsArg,
        setFilterIds,
        clearAllFilters,
        hasAnyFilter,
    };
}
