import { useCallback } from "react";
import { trpc } from "@/trpc";
import type { RouterOutput } from "@/trpc";

export type SpacePins = RouterOutput["pin"]["listBySpace"];
export type PinField = "account" | "envelop" | "event";

/**
 * Read the current pins for one space and expose mutations to set or
 * clear them. Skips the network entirely when `spaceId === "me"` so the
 * personal-space form doesn't 404 against a non-real space.
 *
 * Optimistic update on set/clear: writes the new value into the cache
 * immediately so the trigger's pin glyph flips without waiting for the
 * round-trip. The server's response then reconciles.
 */
export function usePins(spaceId: string) {
    const utils = trpc.useUtils();
    const isPersonal = spaceId === "me";

    const pinsQuery = trpc.pin.listBySpace.useQuery(
        { spaceId },
        {
            enabled: !isPersonal,
            staleTime: 5 * 60 * 1000,
        }
    );

    const setMutation = trpc.pin.set.useMutation({
        onMutate: async (variables) => {
            await utils.pin.listBySpace.cancel({ spaceId });
            const prev = utils.pin.listBySpace.getData({ spaceId });
            /* Apply an optimistic write so the pin glyph flips on click
               instead of waiting for the round-trip. We look up the
               entity from its sibling React Query cache (already loaded
               by the form's listBySpace queries) so the optimistic
               shape carries name/color/icon and not just an id. */
            utils.pin.listBySpace.setData({ spaceId }, (old) => {
                const base = old ?? { account: null, envelop: null, event: null };
                if (variables.field === "account") {
                    const a = utils.account.listBySpace
                        .getData({ spaceId })
                        ?.find((x) => x.id === variables.accountId);
                    if (!a) return base;
                    return {
                        ...base,
                        account: {
                            id: a.id,
                            name: a.name,
                            account_type: a.account_type,
                            color: a.color,
                            icon: a.icon,
                        },
                    };
                }
                if (variables.field === "envelop") {
                    const e = utils.envelop.listBySpace
                        .getData({ spaceId })
                        ?.find((x) => x.id === variables.envelopId);
                    if (!e) return base;
                    return {
                        ...base,
                        envelop: {
                            id: e.id,
                            name: e.name,
                            color: e.color,
                            icon: e.icon,
                            /* setByUserId stays unknown until the server
                               responds — leave empty for the optimistic
                               window. */
                            setByUserId: null,
                        },
                    };
                }
                if (variables.field === "event") {
                    const ev = utils.event.listBySpace
                        .getData({ spaceId })
                        ?.find((x) => x.id === variables.eventId);
                    if (!ev) return base;
                    return {
                        ...base,
                        event: {
                            id: ev.id,
                            name: ev.name,
                            color: ev.color,
                            icon: ev.icon,
                            setByUserId: null,
                        },
                    };
                }
                return base;
            });
            return { prev };
        },
        onError: (_err, _variables, ctx) => {
            if (ctx?.prev !== undefined) {
                utils.pin.listBySpace.setData({ spaceId }, ctx.prev);
            }
        },
        onSettled: () => {
            void utils.pin.listBySpace.invalidate({ spaceId });
        },
    });

    const clearMutation = trpc.pin.clear.useMutation({
        onMutate: async (variables) => {
            await utils.pin.listBySpace.cancel({ spaceId });
            const prev = utils.pin.listBySpace.getData({ spaceId });
            utils.pin.listBySpace.setData({ spaceId }, (old) => {
                if (!old) return old;
                if (variables.field === "account") return { ...old, account: null };
                if (variables.field === "envelop") return { ...old, envelop: null };
                if (variables.field === "event") return { ...old, event: null };
                return old;
            });
            return { prev };
        },
        onError: (_err, _variables, ctx) => {
            if (ctx?.prev !== undefined) {
                utils.pin.listBySpace.setData({ spaceId }, ctx.prev);
            }
        },
        onSettled: () => {
            void utils.pin.listBySpace.invalidate({ spaceId });
        },
    });

    const pinAccount = useCallback(
        (accountId: string) => setMutation.mutate({ spaceId, field: "account", accountId }),
        [setMutation, spaceId]
    );
    const pinEnvelop = useCallback(
        (envelopId: string) => setMutation.mutate({ spaceId, field: "envelop", envelopId }),
        [setMutation, spaceId]
    );
    const pinEvent = useCallback(
        (eventId: string) => setMutation.mutate({ spaceId, field: "event", eventId }),
        [setMutation, spaceId]
    );
    const clearPin = useCallback(
        (field: PinField) => clearMutation.mutate({ spaceId, field }),
        [clearMutation, spaceId]
    );

    return {
        pins: pinsQuery.data,
        isLoading: pinsQuery.isLoading,
        isPersonal,
        pinAccount,
        pinEnvelop,
        pinEvent,
        clearPin,
        isMutating: setMutation.isPending || clearMutation.isPending,
    };
}
