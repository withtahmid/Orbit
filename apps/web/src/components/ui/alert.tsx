import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
    "relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
    {
        variants: {
            variant: {
                default: "bg-card text-card-foreground border-border",
                destructive:
                    "border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive",
                success:
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 [&>svg]:text-emerald-400",
            },
        },
        defaultVariants: { variant: "default" },
    }
);

function Alert({
    className,
    variant,
    ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
    return (
        <div
            role="alert"
            data-slot="alert"
            className={cn(alertVariants({ variant }), className)}
            {...props}
        />
    );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
    return (
        <h5
            data-slot="alert-title"
            className={cn("mb-1 font-medium leading-none tracking-tight", className)}
            {...props}
        />
    );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="alert-description"
            className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)}
            {...props}
        />
    );
}

export { Alert, AlertTitle, AlertDescription };
