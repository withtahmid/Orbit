import { trpc } from "@/trpc";

/**
 * Single source of truth for "everything analytics is now stale."
 * Used by every mutation that changes the underlying transaction /
 * envelope / category / account state — invalidates the entire
 * `analytics` and `personal` namespaces in one shot rather than
 * enumerating every dependent procedure (and missing the new ones
 * each time we add another KPI card).
 *
 * Returns a stable callback. Per-mutation handlers call it inside
 * `onSuccess` and pass the affected `spaceId` so we can also nuke the
 * scoped entity-list caches at the same time.
 *
 * Usage:
 *   const invalidate = useInvalidateAnalytics();
 *   const m = trpc.x.update.useMutation({ onSuccess: () => invalidate(spaceId) });
 */
export function useInvalidateAnalytics() {
    const utils = trpc.useUtils();
    return async (spaceId: string) => {
        await Promise.all([
            /* Whole-namespace invalidation — picks up every analytics
               procedure (existing + future) without enumeration. */
            utils.analytics.invalidate(),
            utils.personal.invalidate(),
            /* Entity lists that surface aggregated rollups. */
            utils.transaction.listBySpace.invalidate({ spaceId }),
            utils.transaction.filteredTotals.invalidate({ spaceId }),
            utils.account.listBySpace.invalidate({ spaceId }),
            utils.expenseCategory.listBySpace.invalidate({ spaceId }),
            utils.expenseCategory.listBySpaceWithUsage.invalidate({ spaceId }),
            utils.envelop.listBySpace.invalidate({ spaceId }),
        ]);
    };
}
