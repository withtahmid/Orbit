import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground",
                outline: "text-foreground",
                success:
                    "border-transparent bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                warning:
                    "border-transparent bg-amber-500/15 text-amber-300 border-amber-500/30",
                info: "border-transparent bg-sky-500/15 text-sky-300 border-sky-500/30",
                violet:
                    "border-transparent bg-violet-500/15 text-violet-300 border-violet-500/30",
                destructive:
                    "border-transparent bg-destructive/15 text-destructive",
                income:
                    "border-transparent bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                expense:
                    "border-transparent bg-rose-500/15 text-rose-400 border-rose-500/30",
                transfer:
                    "border-transparent bg-slate-500/15 text-slate-300 border-slate-500/30",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

function Badge({
    className,
    variant,
    ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
    return (
        <span
            data-slot="badge"
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
