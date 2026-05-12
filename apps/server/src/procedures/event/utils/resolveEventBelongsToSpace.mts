import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

export const resolveEventBelongsToSpace = async ({
    trx,
    eventId,
    spaceId,
    requireActive,
}: {
    trx: Kysely<DB>;
    eventId: string;
    spaceId: string;
    /**
     * When true, reject events whose status is not 'active'. Set this on
     * **create** paths (new transaction, transfer, adjustment, income)
     * so a stale pin or a UI bug can't silently land a transaction
     * against a closed/cancelled event. Leave false on **update** paths
     * so existing rows with now-closed events can still be edited.
     */
    requireActive?: boolean;
}) => {
    const row = await trx
        .selectFrom("events")
        .select(["events.id", "events.status"])
        .where("events.id", "=", eventId)
        .where("events.space_id", "=", spaceId)
        .executeTakeFirst();
    if (!row) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Event does not belong to this space",
        });
    }
    if (requireActive && row.status !== "active") {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Event is not active",
        });
    }
};
