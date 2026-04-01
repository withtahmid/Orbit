import winston from "winston";
import { ENV } from "../env.mjs";
const { combine, timestamp, printf, colorize, align } = winston.format;
const isDev = ENV.NODE_ENV !== "production";
export const logger = winston.createLogger({
    level: isDev ? "silly" : "info",
    format: combine(
        timestamp({
            format: "YYYY-MM-DD hh:mm:ss.SSS A",
        }),
        colorize({ all: true }),
        align(),
        printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
    ),
    defaultMeta: { service: "home-mono" },
    transports: [new winston.transports.Console()],
});
