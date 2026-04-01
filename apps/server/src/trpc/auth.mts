import jwt from "jsonwebtoken";
import { ENV } from "../env.mjs";
import { logger } from "../utils/logger.mjs";

export interface JWTPayload {
    userId: string;
    purpose: "signup" | "signup-verified" | "auth" | "password-reset" | "password-reset-verified";
}

/**
 * Parse + verify the JWT from the Authorization header.
 * Returns the decoded payload, or null if invalid/missing.
 */
export const getUserFromAuthHeader = async (
    authHeader: string | undefined
): Promise<JWTPayload | null> => {
    if (!authHeader) return null;

    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET) as JWTPayload;
        return decoded;
    } catch (error) {
        logger.debug(`JWT verification failed: ${(error as Error).message}`);
        return null;
    }
};

/**
 * Sign a JWT with the given payload and expiry.
 */
export const signJWT = (
    payload: Omit<JWTPayload, "iat" | "exp">,
    expiresIn: number = 7 * 24 * 60 * 60 // default 7 days in seconds
): string => {
    return jwt.sign(payload as object, ENV.JWT_SECRET, { expiresIn });
};
