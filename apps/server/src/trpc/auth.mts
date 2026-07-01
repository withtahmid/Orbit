import jwt from "jsonwebtoken";
import { Kysely } from "kysely";
import type { DB } from "../db/kysely/types.mjs";
import { ENV } from "../env.mjs";
import { logger } from "../utils/logger.mjs";
import { safeAwait } from "../utils/safeAwait.mjs";

interface JWTPayload {
    userId: string;
    tokenVersion?: number;
    iat?: number;
    exp?: number;
}

// No expiresIn: sessions are meant to last forever. The only way to
// invalidate one is bumping the user's token_version (password change,
// password reset, account deletion) or the client discarding the token.
export const signJWT = (payload: { userId: string; tokenVersion: number }): string => {
    return jwt.sign(payload as object, ENV.JWT_SECRET);
};

export const authorizeJWT = async (authHeader: string | undefined): Promise<JWTPayload | null> => {
    if (!authHeader) return null;

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET) as JWTPayload;
        return decoded;
    } catch (error) {
        logger.debug(`JWT verification failed: ${(error as Error).message}`);
        return null;
    }
};

export interface AuthenticatedUser {
    id: string;
}

export const fetchUserFromJWT = async (
    payload: JWTPayload | null,
    qb: Kysely<DB>
): Promise<AuthenticatedUser | null> => {
    if (!payload) return null;

    const [error, user] = await safeAwait(
        qb
            .selectFrom("users")
            .select(["id", "deleted_at", "token_version"])
            .where("id", "=", payload.userId)
            .executeTakeFirst()
    );

    if (error) {
        logger.debug(`Error fetching user: ${(error as Error).message}`);
        return null;
    }
    if (!user) return null;
    if (user.deleted_at) return null;

    // Tokens minted before migration 040 don't carry tokenVersion; treat them
    // as version 1 (the default for backfilled rows) so we don't log everyone
    // out the moment that migration lands.
    const claimedVersion = payload.tokenVersion ?? 1;
    if (claimedVersion !== user.token_version) return null;

    return { id: user.id };
};
