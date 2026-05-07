import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiTone = "neutral" | "income" | "expense" | "muted";

export interface KpiItem {
    label: string;
    /** When provided as a number, rendered with `MoneyDisplay`; otherwise rendered as-is. */
    value: number | React.ReactNode;
    /** Mark `value` as money so it gets the income/expense color treatment. */
    money?: boolean;
    /** Color treatment for the value — overrides money inference. */
    tone?: KpiTone;
    /** Subtle line under the value. */
    sub?: React.ReactNode;
    /** Tiny indicator chip drawn next to the value. */
    delta?: { label: string; direction: "up" | "down" | "flat" };
    /** Override formatter when value is a number. */
    valueFormat?: "money" | "integer" | "percent";
}

/**
 * Editorial KPI bar — a single rounded card with N evenly-divided cells. Used at
 * the top of every analytics detail view as the headline strip.
 */
export function KpiStrip({
    items,
    isLoading,
    className,
}: {
    items: KpiItem[];
    isLoading?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4",
                className
            )}
            style={{
                gridTemplateColumns:
                    items.length <= 4
                        ? `repeat(${items.length}, minmax(0, 1fr))`
                        : undefined,
            }}
        >
            {items.map((it, i) => (
                <div
                    key={i}
                    className="flex flex-col gap-1 p-4 sm:p-5"
                >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {it.label}
                    </span>
                    <div className="flex items-baseline gap-2">
                        {isLoading ? (
                            <Skeleton className="h-7 w-24" />
                        ) : (
                            <KpiValue item={it} />
                        )}
                        {!isLoading && it.delta && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                                    it.delta.direction === "up" &&
                                        "text-[color:var(--income)]",
                                    it.delta.direction === "down" &&
                                        "text-[color:var(--expense)]",
                                    it.delta.direction === "flat" &&
                                        "text-muted-foreground"
                                )}
                            >
                                {it.delta.direction === "up" && (
                                    <ArrowUpRight className="size-3" />
                                )}
                                {it.delta.direction === "down" && (
                                    <ArrowDownRight className="size-3" />
                                )}
                                {it.delta.label}
                            </span>
                        )}
                    </div>
                    {it.sub && (
                        <span className="text-[11px] text-muted-foreground">
                            {it.sub}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function KpiValue({ item }: { item: KpiItem }) {
    const cls = "text-xl font-bold tabular-nums sm:text-2xl";

    if (typeof item.value === "number") {
        const fmt = item.valueFormat ?? (item.money ? "money" : "money");
        if (fmt === "money") {
            const variant: "income" | "expense" | "neutral" | "muted" =
                item.tone === "income"
                    ? "income"
                    : item.tone === "expense"
                      ? "expense"
                      : item.tone === "muted"
                        ? "muted"
                        : "neutral";
            return (
                <MoneyDisplay
                    amount={item.value}
                    variant={variant}
                    signed={false}
                    className={cls}
                />
            );
        }
        if (fmt === "integer") {
            return (
                <span className={cn(cls, item.tone === "muted" && "text-muted-foreground")}>
                    {Math.round(item.value).toLocaleString("en-US")}
                </span>
            );
        }
        // percent
        return (
            <span
                className={cn(
                    cls,
                    item.tone === "income" && "text-[color:var(--income)]",
                    item.tone === "expense" && "text-[color:var(--expense)]"
                )}
            >
                {item.value.toFixed(1)}
                <span className="ml-0.5 text-base font-medium text-muted-foreground">%</span>
            </span>
        );
    }
    return <span className={cls}>{item.value}</span>;
}
