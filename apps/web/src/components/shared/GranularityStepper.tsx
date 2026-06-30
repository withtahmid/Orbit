import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { DateRangePicker } from "@/components/shared/DateRangePicker";
import { formatInAppTz } from "@/lib/formatDate";
import { cursorLabelPattern, type CursorPeriod, type Granularity } from "@/lib/dates";
import { cn } from "@/lib/utils";

const GRANULARITY_OPTIONS: { id: Granularity; label: string }[] = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "year", label: "Year" },
];

const RESET_LABEL: Record<Exclude<Granularity, "custom">, string> = {
    day: "Today",
    week: "This week",
    month: "This month",
    year: "This year",
};

/** Center label for the current window, per granularity. */
function periodLabel(p: CursorPeriod): string {
    if (p.granularity === "week" || p.granularity === "custom") {
        // period.end is exclusive — show the inclusive last day.
        const inclusiveEnd = new Date(p.end.getTime() - 1);
        const tail = p.granularity === "custom" ? "MMM d, yyyy" : "MMM d";
        return `${formatInAppTz(p.start, "MMM d")} – ${formatInAppTz(inclusiveEnd, tail)}`;
    }
    return formatInAppTz(p.start, cursorLabelPattern(p.granularity));
}

/**
 * The cockpit's time control: a granularity segmented control + a
 * step-back/forward cursor (with a "this period" reset). "Custom…" opens
 * the shared `DateRangePicker`. State is owned by the parent (the cockpit
 * hook); this component is presentational.
 */
export function GranularityStepper({
    granularity,
    period,
    isCurrent,
    onGranularity,
    onStep,
    onToday,
    onCustom,
    className,
}: {
    granularity: Granularity;
    period: CursorPeriod;
    isCurrent: boolean;
    onGranularity: (g: Granularity) => void;
    onStep: (dir: number) => void;
    onToday: () => void;
    onCustom: (start: Date, end: Date) => void;
    className?: string;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const isCustom = granularity === "custom";

    const picker = (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-selected={isCustom}
                    className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded px-3 transition-colors",
                        isCustom
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <CalendarRange className="size-3.5" />
                    Custom
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="orbit-design border-0 bg-transparent p-0 shadow-none"
                style={{ width: "min(640px, calc(100vw - 32px))" }}
            >
                <DateRangePicker
                    start={period.start}
                    end={period.end}
                    onChange={() => {}}
                    onApply={(s, e) => {
                        onCustom(s, e);
                        setPickerOpen(false);
                    }}
                    onCancel={() => setPickerOpen(false)}
                />
            </PopoverContent>
        </Popover>
    );

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {/* Granularity segmented control */}
            <div
                role="tablist"
                aria-label="Granularity"
                className="inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5 text-[12.5px]"
            >
                {GRANULARITY_OPTIONS.map((opt) => {
                    const active = granularity === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onGranularity(opt.id)}
                            className={cn(
                                "h-8 rounded px-3 transition-colors",
                                active
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    );
                })}
                {picker}
            </div>

            {/* Stepper (custom mode shows the editable range label instead) */}
            {isCustom ? (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground"
                        >
                            <CalendarRange className="size-3.5 text-muted-foreground" />
                            {periodLabel(period)}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="orbit-design border-0 bg-transparent p-0 shadow-none"
                        style={{ width: "min(640px, calc(100vw - 32px))" }}
                    >
                        <DateRangePicker
                            start={period.start}
                            end={period.end}
                            onChange={() => {}}
                            onApply={(s, e) => {
                                onCustom(s, e);
                                setPickerOpen(false);
                            }}
                            onCancel={() => setPickerOpen(false)}
                        />
                    </PopoverContent>
                </Popover>
            ) : (
                <div className="inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5">
                    <button
                        type="button"
                        aria-label="Previous period"
                        onClick={() => onStep(-1)}
                        className="grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <span className="min-w-[9.5rem] px-2 text-center text-[13px] font-medium tabular-nums">
                        {periodLabel(period)}
                    </span>
                    <button
                        type="button"
                        aria-label="Next period"
                        disabled={isCurrent}
                        onClick={() => onStep(1)}
                        className="grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            )}

            {/* "This period" reset — only when not already current. */}
            {!isCustom && !isCurrent && (
                <button
                    type="button"
                    onClick={onToday}
                    className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-[13px] font-medium text-[color:var(--primary)] transition-colors hover:border-foreground/30"
                >
                    {RESET_LABEL[granularity]}
                </button>
            )}
        </div>
    );
}
