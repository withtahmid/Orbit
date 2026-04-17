import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type Variant = "neutral" | "income" | "expense" | "transfer" | "muted";

export function MoneyDisplay({
    amount,
    variant = "neutral",
    signed = false,
    className,
}: {
    amount: number | string | null | undefined;
    variant?: Variant;
    /** Show `+` prefix for positive values (negatives always show `−`). */
    signed?: boolean;
    className?: string;
}) {
    const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
    const isNegative = n < 0;
    const absolute = Math.abs(n);
    // Negative values always get a minus. "signed" controls whether positives
    // get an explicit "+" — useful for diffs where the sign is meaningful.
    const sign = isNegative
        ? "−"
        : signed
          ? variant === "income"
              ? "+"
              : ""
          : "";
    const color = isNegative
        ? "text-[color:var(--expense)]"
        : variant === "income"
          ? "text-[color:var(--income)]"
          : variant === "expense"
            ? "text-[color:var(--expense)]"
            : variant === "transfer"
              ? "text-[color:var(--transfer)]"
              : variant === "muted"
                ? "text-muted-foreground"
                : "";
    return (
        <span className={cn("tabular-nums font-medium", color, className)}>
            {sign}
            {formatMoney(absolute)}
        </span>
    );
}
