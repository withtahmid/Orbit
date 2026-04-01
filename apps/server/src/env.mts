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
});
