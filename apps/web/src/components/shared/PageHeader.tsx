import { cn } from "@/lib/utils";

export function PageHeader({
    title,
    description,
    actions,
    className,
}: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-center md:justify-between",
                className
            )}
        >
            <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
                {description && (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
}
