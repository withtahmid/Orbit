import { cn } from "@/lib/utils";

export function PageHeader({
    title,
    description,
    actions,
    eyebrow,
    className,
}: {
    title: string;
    description?: React.ReactNode;
    /** Small all-caps label rendered above the title (e.g. "Family Budget"). */
    eyebrow?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col gap-4 pb-6 md:flex-row md:items-start md:justify-between",
                className
            )}
        >
            <div className="max-w-3xl">
                {eyebrow && <p className="o-eyebrow mb-2">{eyebrow}</p>}
                <h1 className="o-page-title">{title}</h1>
                {description && (
                    <p className="o-page-sub mt-3 max-w-160">{description}</p>
                )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
