import { Link, Outlet } from "react-router-dom";
import { BookOpen, TrendingDown, TrendingUp, Target } from "lucide-react";
import { ROUTES } from "@/router/routes";

export function AuthLayout() {
    return (
        <div className="min-h-screen bg-background md:grid md:grid-cols-[minmax(420px,1fr)_1.2fr]">
            {/* Left: brand + form */}
            <div className="relative flex min-h-screen flex-col border-r border-border px-6 py-8 md:min-h-0 md:px-14 md:py-10">
                <Link
                    to={ROUTES.docs}
                    className="absolute right-6 top-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground md:right-10"
                >
                    <BookOpen className="size-3.5" />
                    Docs
                </Link>

                <div className="flex items-center gap-3">
                    <div className="o-brand-mark">O</div>
                    <div className="text-[22px] font-semibold tracking-tight">Orbit</div>
                </div>

                <main className="flex flex-1 flex-col justify-center">
                    <div className="w-full max-w-[400px]">
                        <Outlet />
                    </div>
                </main>

                <footer className="text-[11px] text-[var(--o-fg-faint)]">
                    © {new Date().getFullYear()} Orbit · Personal finance, made
                    collaborative
                </footer>
            </div>

            {/* Right: editorial preview — pure decoration, hidden on mobile */}
            <aside
                className="relative hidden overflow-hidden px-14 py-16 md:block"
                style={{
                    background:
                        "radial-gradient(ellipse at 70% 30%, color-mix(in oklch, var(--o-emerald) 15%, var(--o-bg-0)), var(--o-bg-0) 70%)",
                }}
                aria-hidden
            >
                <div className="o-eyebrow absolute left-14 right-14 top-14">
                    Live preview · your Family Budget
                </div>

                <div className="mt-20 max-w-[520px]">
                    <div className="text-[32px] leading-[1.15] tracking-tight text-foreground md:text-[38px]">
                        "You spent{" "}
                        <span className="text-[var(--o-emerald)]">89 less</span> on
                        coffee this month, but your{" "}
                        <span className="text-[var(--o-bad)]">
                            hobbies envelope is 64% over.
                        </span>
                        "
                    </div>
                    <div className="mt-6 text-sm text-muted-foreground">
                        — Orbit weekly digest
                    </div>
                </div>

                <div className="absolute bottom-16 left-14 right-14 flex gap-4">
                    <PreviewCard
                        icon={<TrendingUp className="size-3.5" />}
                        hue="var(--o-emerald)"
                        name="Groceries"
                        spent="879"
                        total="920"
                        width={60}
                    />
                    <PreviewCard
                        icon={<TrendingDown className="size-3.5" />}
                        hue="var(--o-bad)"
                        name="Hobbies"
                        spent="427"
                        total="260"
                        width={100}
                        over
                    />
                    <PreviewCard
                        icon={<Target className="size-3.5" />}
                        hue="var(--o-plan)"
                        name="Grad School"
                        spent="8,026"
                        total="15,000"
                        width={54}
                        plan
                    />
                </div>
            </aside>
        </div>
    );
}

function PreviewCard({
    icon,
    hue,
    name,
    spent,
    total,
    width,
    over,
    plan,
}: {
    icon: React.ReactNode;
    hue: string;
    name: string;
    spent: string;
    total: string;
    width: number;
    over?: boolean;
    plan?: boolean;
}) {
    return (
        <div className="flex flex-1 flex-col gap-2.5 rounded-[14px] border border-border bg-card p-4">
            <div className="flex items-center gap-2">
                <span
                    className="flex size-7 items-center justify-center rounded-md"
                    style={{
                        background: `color-mix(in oklch, ${hue} 18%, var(--o-bg-2))`,
                        color: hue,
                        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${hue} 22%, transparent)`,
                    }}
                >
                    {icon}
                </span>
                <span className="text-[13px] font-medium">{name}</span>
                {over && <span className="o-chip o-chip--bad">over</span>}
                {plan && <span className="o-chip o-chip--plan">plan</span>}
            </div>
            <div className="text-[20px] font-semibold tracking-tight">
                {spent}
                <span className="text-xs font-normal text-muted-foreground"> / {total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--o-bg-3)]">
                <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, background: hue }}
                />
            </div>
        </div>
    );
}
