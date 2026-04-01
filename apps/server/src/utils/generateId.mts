import crypto from "crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 20;

/**
 * Generate a random ID (nanoid-style) without extra dependencies.
 * Produces a 20-char lowercase alphanumeric string.
 */
export const generateId = (length: number = ID_LENGTH): string => {
    const bytes = crypto.randomBytes(length);
    let id = "";
    for (let i = 0; i < length; i++) {
        id += ALPHABET[bytes[i]! % ALPHABET.length];
    }
    return id;
};

/**
 * Generate a 6-digit numeric OTP code.
 */
export const generateOTP = (): string => {
    const num = crypto.randomInt(0, 1_000_000);
    return num.toString().padStart(6, "0");
};
