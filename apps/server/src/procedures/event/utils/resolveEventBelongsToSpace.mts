import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import type { DB } from "../../../db/kysely/types.mjs";

export const resolveEventBelongsToSpace = async ({
    trx,
    eventId,
    spaceId,
}: {
    trx: Kysely<DB>;
    eventId: string;
    spaceId: string;
}) => {
    const row = await trx
        .selectFrom("events")
        .select("events.id")
        .where("events.id", "=", eventId)
        .where("events.space_id", "=", spaceId)
        .executeTakeFirst();
    if (!row) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Event does not belong to this space",
        });
    }
};
