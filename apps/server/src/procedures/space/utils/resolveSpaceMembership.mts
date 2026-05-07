import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import type { DB, SpaceMembers } from "../../../db/kysely/types.mjs";

/**
 * All space-membership roles. Use this constant for read-only procedures
 * that only need to verify the caller is a member at all (analytics,
 * listings, etc.) — saves repeating the
 * `["owner","editor","viewer"] as unknown as SpaceMembers["role"][]`
 * cast at every call site.
 */
export const ALL_ROLES: SpaceMembers["role"][] = [
    "owner",
    "editor",
    "viewer",
] as unknown as SpaceMembers["role"][];

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
