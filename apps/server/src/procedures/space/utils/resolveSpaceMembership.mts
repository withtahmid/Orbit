import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import type { DB, SpaceMembers } from "../../../db/kysely/types.mjs";

export const resolveSpaceMembership = async ({
    trx,
    spaceId,
    userId,
    roles,
}: {
    trx: Kysely<DB>;
    spaceId: string;
    userId: string;
    roles: SpaceMembers["role"][];
}) => {
    const space = await trx
        .selectFrom("spaces")
        .select(["spaces.id"])
        .where("spaces.id", "=", spaceId)
        .executeTakeFirst();

    if (!space) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Space not found",
        });
    }
    const membership = await trx
        .selectFrom("space_members")
        .select(["space_members.user_id", "space_members.role"])
        .where("space_members.space_id", "=", spaceId)
        .where("space_members.user_id", "=", userId)
        .where("space_members.role", "in", roles)
        .executeTakeFirst();

    if (!membership) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to perform the action in this space",
        });
    }
    return { space, membership };
};
