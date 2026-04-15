import jwt from "jsonwebtoken";
import { ENV } from "../../../env.mjs";
import { logger } from "../../../utils/logger.mjs";

interface JWTPayload {
    tempUserId: string;
    purpose: "signup" | "signup-verified" | "auth" | "password-reset" | "password-reset-verified";
}

export const signTmpJWT = (
    payload: Omit<JWTPayload, "iat" | "exp">,
    expiresIn: number = 7 * 24 * 60 * 60
): string => {
    return jwt.sign(payload as object, ENV.JWT_SECRET, { expiresIn });
};

export const authorizeTmpJWT = async (
    authHeader: string | undefined
): Promise<JWTPayload | null> => {
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
