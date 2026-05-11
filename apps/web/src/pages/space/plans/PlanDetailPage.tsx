import { Link, useParams } from "react-router-dom";
import { ChevronRight, Trash2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatInAppTz } from "@/lib/formatDate";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

export default function PlanDetailPage() {
    const { space } = useCurrentSpace();
    const { planId } = useParams<{ planId: string }>();
    const utils = trpc.useUtils();

    const progressQuery = trpc.analytics.planProgress.useQuery({ spaceId: space.id });
    const allocationsQuery = trpc.plan.allocationListBySpace.useQuery({
        spaceId: space.id,
    });
    const plan = progressQuery.data?.find((p) => p.planId === planId);
    const allocations = (allocationsQuery.data ?? []).filter(
        (a) => a.plan_id === planId
    );

    const deleteAlloc = trpc.plan.allocationDelete.useMutation({
        onSuccess: async () => {
            toast.success("Allocation removed");
            await utils.plan.allocationListBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.planProgress.invalidate({ spaceId: space.id });
            await utils.analytics.spaceSummary.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const targetDate = plan?.targetDate ? new Date(plan.targetDate) : null;
    const daysLeft = targetDate
        ? differenceInCalendarDays(targetDate, new Date())
        : null;
    const remaining = (plan?.targetAmount ?? 0) - (plan?.allocated ?? 0);
    const monthsLeft =
        daysLeft && daysLeft > 0 ? Math.max(1, Math.round(daysLeft / 30)) : null;
    const monthly = monthsLeft && remaining > 0 ? remaining / monthsLeft : null;

    return (
        <div className="orbit-design pd-root">
            <style>{PD_STYLES}</style>

            {/* Topbar */}
            <header className="pd-topbar">
                <div className="pd-topbar-text">
                    <span className="eyebrow pd-breadcrumb">
                        <Link to={ROUTES.spacePlans(space.id)} className="pd-crumb">
                            Plans
                        </Link>
                        <ChevronRight
                            className="size-3"
                            style={{ color: "var(--fg-4)" }}
                        />{" "}
                        <span style={{ color: "var(--fg-2)" }}>
                            {plan?.name ?? "Loading…"}
                        </span>
                    </span>
                    <h1 className="display pd-title">
                        {plan ? (
                            <>
                                <Avatar
                                    icon={plan.icon}
                                    color={plan.color}
                                    size={36}
                                />
                                {plan.name}
                            </>
                        ) : (
                            "Plan"
                        )}
                    </h1>
                    <p className="pd-sub">
                        {plan
                            ? plan.description ?? "Long-term goal progress"
                            : "Long-term goal progress"}
                    </p>
                </div>
            </header>

            <div className="pd-scroll">
                {/* Hero */}
                {plan ? (
                    <div className="od-card vignette pd-hero">
                        <HeroStat label="Saved" amount={plan.allocated} tone="gold" />
                        <HeroStat
                            label="Target"
                            amount={plan.targetAmount ?? 0}
                            tone="fg"
                        />
                        <HeroStat
                            label="Remaining"
                            amount={Math.max(0, remaining)}
                            tone="brand"
                        />
                        <div className="pd-hero-progress">
                            <span className="eyebrow">
                                {plan.pctComplete != null
                                    ? `${plan.pctComplete.toFixed(0)}% funded`
                                    : "No target set"}
                                {targetDate
                                    ? ` · target ${formatInAppTz(targetDate, "MMM yyyy")}`
                                    : ""}
                            </span>
                            <div style={{ marginTop: 12 }}>
                                <ProgressBar
                                    value={(plan.pctComplete ?? 0) / 100}
                                    color={plan.color}
                                    height={8}
                                />
                            </div>
                            <div className="pd-hero-progress-foot">
                                {monthly != null && (
                                    <span>
                                        ~
                                        <Money amount={monthly} variant="muted" size={11.5} />
                                        /mo to hit target
                                    </span>
                                )}
                                {targetDate && daysLeft != null && (
                                    <span>
                                        {daysLeft < 0
                                            ? `${Math.abs(daysLeft)}d overdue`
                                            : `${daysLeft}d left`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Skeleton height={140} />
                )}

                {/* Allocation history */}
                <div className="od-card pd-section">
                    <div className="pd-sect-head">
                        <div className="pd-sect-text">
                            <h2 className="display pd-sect-title">
                                Allocation history
                            </h2>
                            <span className="pd-sect-sub">
                                Every contribution to this plan.
                            </span>
                        </div>
                    </div>
                    {allocations.length === 0 ? (
                        <div className="pd-empty">No allocations yet.</div>
                    ) : (
                        <table className="pd-table">
                            <thead>
                                <tr>
                                    <th className="pd-th pd-th-l">Date</th>
                                    <th className="pd-th">Amount</th>
                                    <PermissionGate roles={["owner"]}>
                                        <th className="pd-th"></th>
                                    </PermissionGate>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations.map((a) => (
                                    <tr key={a.id} className="pd-tr">
                                        <td className="pd-td pd-td-l">
                                            <span style={{ color: "var(--fg-3)" }}>
                                                {formatInAppTz(
                                                    a.created_at,
                                                    "MMM d, yyyy HH:mm"
                                                )}
                                            </span>
                                        </td>
                                        <td className="pd-td pd-td-r">
                                            <Money
                                                amount={Number(a.amount)}
                                                variant={
                                                    Number(a.amount) < 0
                                                        ? "expense"
                                                        : "income"
                                                }
                                                signed
                                            />
                                        </td>
                                        <PermissionGate roles={["owner"]}>
                                            <td className="pd-td pd-td-r">
                                                <ConfirmDialog
                                                    trigger={
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-7"
                                                        >
                                                            <Trash2 className="size-3.5 text-destructive" />
                                                        </Button>
                                                    }
                                                    title="Delete allocation?"
                                                    destructive
                                                    confirmLabel="Delete"
                                                    onConfirm={() =>
                                                        deleteAlloc.mutate({
                                                            allocationId: a.id,
                                                        })
                                                    }
                                                />
                                            </td>
                                        </PermissionGate>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

function HeroStat({
    label,
    amount,
    tone,
}: {
    label: string;
    amount: number;
    tone: "fg" | "brand" | "gold";
}) {
    const color =
        tone === "brand"
            ? "var(--brand)"
            : tone === "gold"
              ? "var(--gold)"
              : "var(--fg)";
    return (
        <div className="pd-hero-cell">
            <span className="eyebrow">{label}</span>
            <span
                className="tabular"
                style={{
                    fontSize: 32,
                    fontWeight: 500,
                    color,
                    letterSpacing: "-0.04em",
                    marginTop: 6,
                }}
            >
                {amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
            </span>
        </div>
    );
}

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?: "neutral" | "income" | "expense" | "muted";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        muted: "var(--fg-3)",
        neutral: "var(--fg)",
    };
    const abs = Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    let text = abs;
    if (amount < 0) text = "−" + abs;
    else if (signed && amount > 0) text = "+" + abs;
    return (
        <span
            className="tabular"
            style={{
                color: colorMap[variant],
                fontSize: size,
                fontWeight: weight,
            }}
        >
            {text}
        </span>
    );
}

function Avatar({
    icon,
    color,
    size = 32,
}: {
    icon: string;
    color: string;
    size?: number;
}) {
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${color} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
                color,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={color} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    plane: "m3 13 7-1 4-7 2 1-2 7 7 4-1 2-7-3-3 4-2 1 1-3z",
    lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14",
    target:
        "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    dot: "M12 12h.01",
};

function DesignIcon({
    name,
    size,
    color,
}: {
    name: string;
    size: number;
    color: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.target;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
        </svg>
    );
}

function ProgressBar({
    value,
    color,
    height = 6,
}: {
    value: number;
    color: string;
    height?: number;
}) {
    const v = Math.max(0, Math.min(1, value));
    return (
        <div
            style={{
                height,
                borderRadius: 999,
                background: "var(--bg-elev-3)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    height: "100%",
                    width: `${v * 100}%`,
                    background: color,
                    borderRadius: 999,
                }}
            />
        </div>
    );
}

function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 12,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

const PD_STYLES = `
.pd-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .pd-root { margin: -2rem; }
}

.pd-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.pd-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pd-breadcrumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}
.pd-crumb {
    color: var(--fg-3);
    text-decoration: none;
    transition: color 140ms ease;
}
.pd-crumb:hover { color: var(--fg); }
.pd-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 14px;
}
.pd-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
@media (max-width: 720px) {
    .pd-topbar { padding: 18px 18px 14px; }
}

.pd-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .pd-scroll { padding: 16px 18px 28px; }
}

/* Hero */
.orbit-design .od-card.pd-hero {
    padding: 24px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1.4fr;
    gap: 22px;
    align-items: start;
}
@media (max-width: 1100px) {
    .orbit-design .od-card.pd-hero { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
    .orbit-design .od-card.pd-hero { grid-template-columns: 1fr; }
}
.pd-hero-cell { display: flex; flex-direction: column; gap: 6px; }
.pd-hero-progress { display: flex; flex-direction: column; }
.pd-hero-progress-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--fg-3);
    flex-wrap: wrap;
    gap: 8px;
}

/* Section */
.pd-section { padding: 22px; }
.pd-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
}
.pd-sect-text { display: flex; flex-direction: column; gap: 2px; }
.pd-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
}
.pd-sect-sub { font-size: 12px; color: var(--fg-3); }

/* Tables */
.pd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
}
.pd-th {
    text-align: right;
    padding: 8px 0;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--line);
}
.pd-th-l { text-align: left; }
.pd-tr { transition: background 120ms ease; }
.pd-tr:hover { background: var(--bg-elev-2); }
.pd-td {
    padding: 12px 0;
    border-bottom: 1px solid var(--line-soft);
    text-align: right;
}
.pd-tr:last-child .pd-td { border-bottom: none; }
.pd-td-l { text-align: left; }
.pd-td-r { text-align: right; }

.pd-empty {
    padding: 30px 0;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
}

/* Phone (<640px) */
@media (max-width: 640px) {
    .pd-topbar { padding: 14px 14px 10px; }
    .pd-title { font-size: 20px; gap: 10px; }
    .pd-scroll { padding: 12px 14px 22px; gap: 12px; }
    .orbit-design .od-card.pd-hero { padding: 16px; gap: 14px; }
    .pd-section { padding: 14px; }
    .pd-sect-head { margin-bottom: 10px; }
    .pd-table { font-size: 12px; }
    .pd-td { padding: 10px 0; }
    .pd-th { padding: 6px 0; }
}
`;
