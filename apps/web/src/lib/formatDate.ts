import { format as dfFormat } from "date-fns";
import { shiftForFormat } from "./dates";

/**
 * Format a Date or ISO string using date-fns, but rendering the
 * wall-clock in APP_TIMEZONE instead of the browser's local tz.
 *
 * Implementation trick: `date-fns` `format()` reads local-time fields
 * (getFullYear / getHours / …). By shifting the Date so its local
 * fields equal APP_TIMEZONE's wall-clock for the same absolute moment,
 * the output reflects the app timezone regardless of where the browser
 * is. Safe for Asia/Dhaka because it has no DST — for zones with DST
 * you'd need `date-fns-tz`.
 *
 * Accepts strings too because tRPC serializes Date → ISO string over
 * HTTP; this avoids forcing every call site to wrap in `new Date()`.
 */
export function formatInAppTz(
    input: Date | string | number | null | undefined,
    pattern: string
): string {
    if (input == null || input === "") return "";
    const d = input instanceof Date ? input : new Date(input);
    if (!Number.isFinite(d.getTime())) return "";
    return dfFormat(shiftForFormat(d), pattern);
}
