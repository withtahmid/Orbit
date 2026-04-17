import { Link } from "react-router-dom";
import {
    TrendingUp,
    TrendingDown,
    PieChart as PieIcon,
    Wallet,
    Mail,
    Flame,
    Network,
    ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

interface Entry {
    view: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    tint: string;
}

const ENTRIES: Entry[] = [
    {
        view: "cash-flow",
        title: "Cash flow",
        description: "Monthly income vs expense over time. Spot under/over-earning months.",
        icon: TrendingUp,
        tint: "hsl(152 70% 55%)",
    },
    {
        view: "categories",
        title: "Category spending",
        description:
            "Where your expenses go, rolled up to top-level categories with drill-down.",
        icon: PieIcon,
        tint: "hsl(260 70% 65%)",
    },
    {
        view: "envelopes",
        title: "Envelope utilization",
        description: "How much of each envelope you've consumed this period.",
        icon: Mail,
        tint: "hsl(160 84% 50%)",
    },
    {
        view: "allocations",
        title: "Allocation map",
        description:
            "Which accounts fund which envelopes and plans — the money-partitioning view.",
        icon: Network,
        tint: "hsl(175 70% 50%)",
    },
    {
        view: "accounts",
        title: "Account distribution",
        description: "Where your money lives across assets, liabilities, and locked accounts.",
        icon: Wallet,
        tint: "hsl(200 80% 60%)",
    },
    {
        view: "balance",
        title: "Balance history",
        description: "Total spendable balance over time.",
        icon: TrendingDown,
        tint: "hsl(38 92% 60%)",
    },
    {
        view: "heatmap",
        title: "Spending heatmap",
        description: "Daily expense intensity for the year — see spending patterns at a glance.",
        icon: Flame,
        tint: "hsl(4 78% 62%)",
    },
];

export default function AnalyticsPage() {
    const { space } = useCurrentSpace();

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Analytics"
                description="Pick an analysis to dive into. Each view has its own period selector."
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ENTRIES.map((e) => (
                    <Link
                        key={e.view}
                        to={ROUTES.spaceAnalyticsDetail(space.id, e.view)}
                        className="group"
                    >
                        <Card
                            className="h-full transition-all hover:-translate-y-0.5 hover:border-foreground/20"
                            style={{ borderLeft: `3px solid ${e.tint}` }}
                        >
                            <CardContent className="grid gap-2 p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <span
                                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
                                        style={{
                                            backgroundColor: `color-mix(in oklab, ${e.tint} 20%, transparent)`,
                                            color: e.tint,
                                        }}
                                    >
                                        <e.icon className="size-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold">{e.title}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {e.description}
                                        </p>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
