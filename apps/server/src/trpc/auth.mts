import jwt from "jsonwebtoken";
import { Kysely } from "kysely";
import { DB } from "../db/kysely/types.mjs";
import { ENV } from "../env.mjs";
import { logger } from "../utils/logger.mjs";

interface JWTPayload {
    userId: string;
}

export const signJWT = (
    payload: Omit<JWTPayload, "iat" | "exp">,
    expiresIn: number = 7 * 24 * 60 * 60
): string => {
    return jwt.sign(payload as object, ENV.JWT_SECRET, { expiresIn });
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

    // const [error, user] = await safeAwait(
    //     qb
    //         .selectFrom("users")
    //         .select(["id"])
    //         .where("id", "=", payload.userId)
    //         .executeTakeFirstOrThrow()
    // );

    // if (error) {
    //     logger.debug(`Error fetching user: ${(error as Error).message}`);
    //     return null;
    // }

    return { id: payload.userId };
};
