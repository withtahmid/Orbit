import type { Kysely } from "kysely";
import type { DB, UserAccounts } from "../../db/kysely/types.mjs";

/**
 * Account ids the caller personally owns. The anchor for every cross-space
 * personal view: a user_accounts row with role='owner' means the user owns
 * the money held in that account, regardless of which spaces it's shared
 * into.
 */
export async function resolveOwnedAccountIds(
    qb: Kysely<DB>,
    userId: string
): Promise<string[]> {
    const rows = await qb
        .selectFrom("user_accounts")
        .where("user_id", "=", userId)
        .where("role", "=", "owner" as unknown as UserAccounts["role"])
        .select("account_id")
        .execute();
    return rows.map((r) => r.account_id);
}

/**
 * Space ids the caller is currently a member of. Personal aggregations are
 * filtered by this set so that transactions in spaces the user has been
 * removed from don't bleed into their view — even if they still own an
 * account that was (or still is) shared into that space.
 */
export async function resolveMemberSpaceIds(
    qb: Kysely<DB>,
    userId: string
): Promise<string[]> {
    const rows = await qb
        .selectFrom("space_members")
        .where("user_id", "=", userId)
        .select("space_id")
        .execute();
    return rows.map((r) => r.space_id);
}
