import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Steps({
    current,
    total,
    labels,
}: {
    current: number;
    total: number;
    labels?: string[];
}) {
    return (
        <div className="flex items-center justify-center gap-3">
            {Array.from({ length: total }).map((_, i) => {
                const step = i + 1;
                const isActive = step === current;
                const isComplete = step < current;
                return (
                    <div key={i} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={cn(
                                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all",
                                    isActive &&
                                        "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(99,102,241,0.4)]",
                                    isComplete && "border-emerald-400 bg-emerald-400/10 text-emerald-300",
                                    !isActive && !isComplete && "border-border text-muted-foreground"
                                )}
                            >
                                {isComplete ? <Check className="size-3.5" /> : step}
                            </div>
                            {labels?.[i] && (
                                <span
                                    className={cn(
                                        "text-[11px] font-medium text-muted-foreground",
                                        isActive && "text-foreground"
                                    )}
                                >
                                    {labels[i]}
                                </span>
                            )}
                        </div>
                        {i < total - 1 && (
                            <div
                                className={cn(
                                    "h-px w-8 bg-border",
                                    isComplete && "bg-emerald-400/60"
                                )}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
