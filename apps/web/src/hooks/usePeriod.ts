import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
    resolvePeriod,
    type PeriodPresetId,
    type PeriodRange,
} from "@/lib/dates";

const DEFAULT_PRESET: PeriodPresetId = "this-month";

function parseDate(v: string | null): Date | undefined {
    if (!v) return undefined;
    // Expect YYYY-MM-DD as written by `fmt()`. Parse as local midnight
    // (not UTC — `new Date("2026-04-15")` would be UTC and shift the date
    // by a day for any timezone west of UTC).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return undefined;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
}

function fmt(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * URL-persisted period state. Reads ?period=this-month (or "custom" with
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD). Writes the same keys on change. Default
 * "this-month" is never written to URL — keeps links clean.
 */
export function usePeriod(defaultPreset: PeriodPresetId = DEFAULT_PRESET): {
    period: PeriodRange;
    preset: PeriodPresetId;
    setPreset: (p: PeriodPresetId) => void;
    setCustom: (start: Date, end: Date) => void;
} {
    const [params, setParams] = useSearchParams();
    const preset =
        (params.get("period") as PeriodPresetId | null) ?? defaultPreset;
    const customStart = parseDate(params.get("from"));
    const customEnd = parseDate(params.get("to"));

    const period = useMemo(
        () => resolvePeriod(preset, customStart, customEnd),
        [preset, customStart, customEnd]
    );

    const setPreset = useCallback(
        (p: PeriodPresetId) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (p === defaultPreset) next.delete("period");
                    else next.set("period", p);
                    if (p !== "custom") {
                        next.delete("from");
                        next.delete("to");
                    }
                    return next;
                },
                { replace: true }
            );
        },
        [setParams, defaultPreset]
    );

    const setCustom = useCallback(
        (start: Date, end: Date) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("period", "custom");
                    next.set("from", fmt(start));
                    next.set("to", fmt(end));
                    return next;
                },
                { replace: true }
            );
        },
        [setParams]
    );

    return { period, preset, setPreset, setCustom };
}
