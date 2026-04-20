import { configEnv, e } from "@withtahmid/safenv";

export const ENV = configEnv(process.env, {
    PORT: e.number().default(3000),
    DATABASE_URL: e
        .string()
        .default("postgresql://postgres:password@postgres:5432/postgres?sslmode=disable"),
    NODE_ENV: e.string(),
    SMTP_HOST: e.string().default("maildev"),
    SMTP_PORT: e.number().default(1025),
    SMTP_USER: e.string().optional(),
    SMTP_PASS: e.string().optional(),
    SMTP_FROM: e.string().default("noreply@yourdomain.com"),
    JWT_SECRET: e.string().default("dev-jwt-secret-change-in-production"),
    /**
     * IANA timezone applied app-wide. All server-side period math
     * (`DATE_TRUNC('month', NOW())`, `::date` casts) runs in this zone
     * because the Postgres session TimeZone is `SET` to this value on
     * every connection. The web client also treats this as its canonical
     * display/edit timezone. Default `Asia/Dhaka` (UTC+06:00, no DST).
     * Per-space override is a future feature; until then, changing this
     * env requires a full app restart.
     */
    APP_TIMEZONE: e.string().default("Asia/Dhaka"),
    R2_ACCOUNT_ID: e.string().default(""),
    R2_ACCESS_KEY_ID: e.string().default(""),
    R2_SECRET_ACCESS_KEY: e.string().default(""),
    R2_BUCKET: e.string().default(""),
    R2_PUBLIC_URL_BASE: e.string().optional(),
});
