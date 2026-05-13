import type { Kysely } from "kysely";
import { TRPCError } from "@trpc/server";
import type { DB } from "../../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../../space/utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../../db/kysely/types.mjs";

/**
 * Load a DPS scheme and confirm the caller is a member of the space
 * the scheme is anchored on, with one of the allowed roles. Returns
 * the scheme row.
 */
export const resolveDpsSchemeAccess = async ({
    trx,
    schemeId,
    userId,
    roles,
}: {
    trx: Kysely<DB>;
    schemeId: string;
    userId: string;
    roles: SpaceMembers["role"][];
}) => {
    const scheme = await trx
        .selectFrom("dps_schemes")
        .selectAll()
        .where("id", "=", schemeId)
        .executeTakeFirst();
    if (!scheme) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "DPS scheme not found",
        });
    }
    await resolveSpaceMembership({
        trx,
        spaceId: scheme.space_id,
        userId,
        roles,
    });
    return scheme;
};
