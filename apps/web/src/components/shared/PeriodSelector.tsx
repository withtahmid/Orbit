import { Calendar } from "lucide-react";
import { format } from "date-fns";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { PERIOD_LABELS, toInputDate, type PeriodPresetId } from "@/lib/dates";
import { usePeriod } from "@/hooks/usePeriod";
import { cn } from "@/lib/utils";

const PRESET_ORDER: PeriodPresetId[] = [
    "this-month",
    "last-month",
    "last-3-months",
    "last-6-months",
    "last-12-months",
    "this-year",
    "all-time",
    "custom",
];

export function PeriodSelector({
    defaultPreset,
    className,
}: {
    defaultPreset?: PeriodPresetId;
    className?: string;
}) {
    const { period, preset, setPreset, setCustom } = usePeriod(defaultPreset);

    const label =
        preset === "custom"
            ? `${format(period.start, "MMM d")} – ${format(
                  new Date(period.end.getTime() - 1),
                  "MMM d, yyyy"
              )}`
            : PERIOD_LABELS[preset];

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPresetId)}>
                <SelectTrigger className="w-full min-w-[10rem] sm:w-auto">
                    <Calendar className="size-4 text-muted-foreground" />
                    <SelectValue>{label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {PRESET_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                            {PERIOD_LABELS[p]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {preset === "custom" && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                            Edit range
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72">
                        <div className="grid gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="period-from">From</Label>
                                <Input
                                    id="period-from"
                                    type="date"
                                    defaultValue={toInputDate(period.start)}
                                    onBlur={(e) => {
                                        const d = new Date(e.target.value);
                                        if (!Number.isNaN(d.getTime())) {
                                            setCustom(d, period.end);
                                        }
                                    }}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="period-to">To (inclusive)</Label>
                                <Input
                                    id="period-to"
                                    type="date"
                                    defaultValue={toInputDate(
                                        new Date(period.end.getTime() - 1)
                                    )}
                                    onBlur={(e) => {
                                        const d = new Date(e.target.value);
                                        if (!Number.isNaN(d.getTime())) {
                                            const exclusive = new Date(d);
                                            exclusive.setDate(exclusive.getDate() + 1);
                                            setCustom(period.start, exclusive);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
