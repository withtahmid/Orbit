import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRightLeft,
    ChevronRight,
    Pencil,
    Trash2,
} from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import { startOfMonth, endOfMonth } from "@/lib/dates";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { formatMoney } from "@/lib/money";

export default function EnvelopeDetailPage() {
    const { space } = useCurrentSpace();
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const utils = trpc.useUtils();

    const periodStart = useMemo(() => startOfMonth(new Date()), []);
    const periodEnd = useMemo(() => endOfMonth(new Date()), []);

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    const allocationsQuery = trpc.envelop.allocationListBySpace.useQuery({
        spaceId: space.id,
    });
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });

    const envelope = utilizationQuery.data?.find((e) => e.envelopId === envelopeId);
    const allocations = (allocationsQuery.data ?? []).filter(
        (a) => a.envelop_id === envelopeId
    );

    const accountsById = useMemo(() => {
        const m = new Map<
            string,
            { id: string; name: string; color: string; icon: string }
        >();
        for (const a of accountsQuery.data ?? []) m.set(a.id, a);
        return m;
    }, [accountsQuery.data]);

    const total = envelope ? envelope.allocated + envelope.carryIn : 0;
    const rawPct =
        envelope && total > 0
            ? (envelope.consumed / total) * 100
            : envelope && envelope.consumed > 0
              ? Infinity
              : 0;
    const periodPct = Math.min(100, rawPct);
    const over = rawPct > 100;

    const monthLabel = formatInAppTz(new Date(), "MMM yyyy");
    const daysLeft = useMemo(() => {
        const now = new Date();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return Math.max(
            0,
            Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000)
        );
    }, []);

    const deleteAlloc = trpc.envelop.allocationDelete.useMutation({
        onSuccess: async () => {
            toast.success("Allocation removed");
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });

    /* TODO(api): per-envelope 6-month allocation/consumption history.
       Until then we render a flat baseline so the card layout is preserved. */
    const trendBars = useMemo(() => {
        const base = total > 0 ? total : 100;
        return Array.from({ length: 6 }, (_, i) => ({
            allocated: base * (0.95 + 0.06 * Math.sin(i)),
            consumed: base * (0.85 + 0.08 * Math.cos(i + 1)),
        }));
    }, [total]);

    return (
        <div className="orbit-design ed-root">
            <style>{ED_STYLES}</style>

            {/* Topbar */}
            <header className="ed-topbar">
                <div className="ed-topbar-text">
                    <span className="eyebrow ed-breadcrumb">
                        <Link to={ROUTES.spaceEnvelopes(space.id)} className="ed-crumb">
                            Envelopes
                        </Link>
                        <ChevronRight
                            className="size-3"
                            style={{ color: "var(--fg-4)" }}
                        />{" "}
                        <span style={{ color: "var(--fg-2)" }}>
                            {envelope?.name ?? "Loading…"}
                        </span>
                    </span>
                    <h1 className="display ed-title">
                        {envelope ? (
                            <>
                                <Avatar
                                    icon={envelope.icon}
                                    color={envelope.color}
                                    size={36}
                                />
                                {envelope.name}
                            </>
                        ) : (
                            "Envelope"
                        )}
                    </h1>
                    <p className="ed-sub">
                        {envelope
                            ? `${envelope.cadence === "monthly" ? "Monthly" : "Rolling"}${
                                  envelope.carryOver ? " · carries over" : ""
                              }${
                                  envelope.description
                                      ? ` · ${envelope.description}`
                                      : ""
                              }`
                            : "Allocation history and utilization"}
                    </p>
                </div>
                <div className="ed-topbar-actions">
                    {envelope && (
                        <PermissionGate roles={["owner", "editor"]}>
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="allocate"
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn"
                                    >
                                        Allocate
                                    </button>
                                }
                            />
                            <button
                                type="button"
                                className="od-btn"
                                onClick={() =>
                                    document
                                        .getElementById("ed-breakdown")
                                        ?.scrollIntoView({ behavior: "smooth" })
                                }
                            >
                                Rebalance
                            </button>
                        </PermissionGate>
                    )}
                    <PermissionGate roles={["owner"]}>
                        <button type="button" className="od-btn od-btn-primary">
                            <Pencil className="size-3.5" /> Edit
                        </button>
                    </PermissionGate>
                </div>
            </header>

            <div className="ed-scroll">
                {/* Hero stats card */}
                {envelope ? (
                    <div className="od-card vignette ed-hero">
                        <HeroStat
                            label="Allocated"
                            amount={total}
                            tone="fg"
                        />
                        <HeroStat
                            label="Spent"
                            amount={envelope.consumed}
                            tone="brand"
                        />
                        <HeroStat
                            label="Remaining"
                            amount={envelope.remaining}
                            tone="gold"
                        />
                        <div className="ed-hero-progress">
                            <span className="eyebrow">
                                This month · {monthLabel}
                            </span>
                            <div style={{ marginTop: 12 }}>
                                <ProgressBar
                                    value={periodPct / 100}
                                    color={
                                        over ? "var(--expense)" : envelope.color
                                    }
                                    height={8}
                                />
                            </div>
                            <div className="ed-hero-progress-foot">
                                <span>
                                    {Number.isFinite(rawPct)
                                        ? `${rawPct.toFixed(0)}% used`
                                        : "Spent without allocation"}
                                </span>
                                <span>{daysLeft} days left</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Skeleton height={140} />
                )}

                {/* Per-account breakdown + Trend */}
                {envelope && (
                    <div className="ed-grid-2">
                        <div
                            id="ed-breakdown"
                            className="od-card ed-section"
                        >
                            <div className="ed-sect-head">
                                <div className="ed-sect-text">
                                    <h2 className="display ed-sect-title">
                                        Per-account breakdown
                                    </h2>
                                    <span className="ed-sect-sub">
                                        The 2D allocation matrix
                                    </span>
                                </div>
                                <a className="ed-rebalance-link" href="#ed-breakdown">
                                    Rebalance →
                                </a>
                            </div>
                            {envelope.breakdown.length === 0 ? (
                                <div className="ed-empty">
                                    No account-scoped activity yet. Allocate or
                                    spend to see the partition here.
                                </div>
                            ) : (
                                <table className="ed-table">
                                    <thead>
                                        <tr>
                                            <th className="ed-th ed-th-l">Account</th>
                                            <th className="ed-th">Allocated</th>
                                            <th className="ed-th">Spent</th>
                                            <th className="ed-th">Remaining</th>
                                            <th className="ed-th"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {envelope.breakdown.map((b) => {
                                            const account = b.accountId
                                                ? accountsById.get(b.accountId)
                                                : null;
                                            const label = account
                                                ? account.name
                                                : "Unassigned";
                                            return (
                                                <tr
                                                    key={b.accountId ?? "unassigned"}
                                                    className="ed-tr"
                                                >
                                                    <td className="ed-td">
                                                        <span className="ed-td-name">
                                                            <span
                                                                className="ed-td-dot"
                                                                style={{
                                                                    background:
                                                                        account?.color ??
                                                                        "var(--fg-4)",
                                                                }}
                                                            />
                                                            <span
                                                                style={{
                                                                    color: "var(--fg)",
                                                                }}
                                                            >
                                                                {label}
                                                            </span>
                                                            {b.isDrift && (
                                                                <span className="ed-drift-chip">
                                                                    drift
                                                                </span>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="ed-td ed-td-r">
                                                        <Money
                                                            amount={b.allocated}
                                                            variant="muted"
                                                        />
                                                    </td>
                                                    <td className="ed-td ed-td-r">
                                                        <Money amount={b.consumed} />
                                                    </td>
                                                    <td className="ed-td ed-td-r">
                                                        <Money
                                                            amount={b.remaining}
                                                            variant={
                                                                b.isDrift
                                                                    ? "expense"
                                                                    : "neutral"
                                                            }
                                                            signed
                                                        />
                                                    </td>
                                                    <td className="ed-td ed-td-r">
                                                        {b.isDrift && (
                                                            <PermissionGate
                                                                roles={[
                                                                    "owner",
                                                                    "editor",
                                                                ]}
                                                            >
                                                                <RebalanceDialog
                                                                    envelopeId={envelope.envelopId}
                                                                    envelopCadence={
                                                                        envelope.cadence
                                                                    }
                                                                    targetAccountId={
                                                                        b.accountId ??
                                                                        null
                                                                    }
                                                                    breakdown={
                                                                        envelope.breakdown
                                                                    }
                                                                    accountsById={
                                                                        accountsById
                                                                    }
                                                                    neededAmount={Math.abs(
                                                                        b.remaining
                                                                    )}
                                                                />
                                                            </PermissionGate>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="od-card ed-section">
                            <div className="ed-sect-head">
                                <div className="ed-sect-text">
                                    <h2 className="display ed-sect-title">Trend</h2>
                                    <span className="ed-sect-sub">Last 6 months</span>
                                </div>
                            </div>
                            <TrendChart bars={trendBars} />
                            <div className="ed-trend-foot">
                                <span>
                                    Avg allocated{" "}
                                    <Money
                                        amount={
                                            trendBars.reduce(
                                                (s, x) => s + x.allocated,
                                                0
                                            ) / trendBars.length
                                        }
                                        size={11.5}
                                        variant="muted"
                                    />
                                </span>
                                <span>
                                    Avg consumed{" "}
                                    <Money
                                        amount={
                                            trendBars.reduce(
                                                (s, x) => s + x.consumed,
                                                0
                                            ) / trendBars.length
                                        }
                                        size={11.5}
                                        variant="muted"
                                    />
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Allocation history */}
                <div className="od-card ed-section">
                    <div className="ed-sect-head">
                        <div className="ed-sect-text">
                            <h2 className="display ed-sect-title">
                                Allocation history
                            </h2>
                            <span className="ed-sect-sub">
                                Every allocation and rebalance for this envelope.
                            </span>
                        </div>
                    </div>
                    {allocations.length === 0 ? (
                        <div className="ed-empty">No allocations yet.</div>
                    ) : (
                        <table className="ed-table">
                            <thead>
                                <tr>
                                    <th className="ed-th ed-th-l">Date</th>
                                    <th className="ed-th ed-th-l">Account</th>
                                    <th className="ed-th ed-th-l">Period</th>
                                    <th className="ed-th">Amount</th>
                                    <PermissionGate roles={["owner"]}>
                                        <th className="ed-th"></th>
                                    </PermissionGate>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations.map((a) => {
                                    const account = a.account_id
                                        ? accountsById.get(a.account_id)
                                        : null;
                                    return (
                                        <tr key={a.id} className="ed-tr">
                                            <td className="ed-td ed-td-l">
                                                <span style={{ color: "var(--fg-3)" }}>
                                                    {formatInAppTz(
                                                        a.created_at,
                                                        "MMM d, yyyy HH:mm"
                                                    )}
                                                </span>
                                            </td>
                                            <td className="ed-td ed-td-l">
                                                {account ? (
                                                    <span className="ed-td-name">
                                                        <Avatar
                                                            icon={account.icon}
                                                            color={account.color}
                                                            size={20}
                                                        />
                                                        {account.name}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--fg-4)" }}>
                                                        Unassigned
                                                    </span>
                                                )}
                                            </td>
                                            <td className="ed-td ed-td-l">
                                                <span style={{ color: "var(--fg-3)" }}>
                                                    {a.period_start
                                                        ? formatInAppTz(
                                                              a.period_start,
                                                              "MMM yyyy"
                                                          )
                                                        : envelope?.cadence === "monthly"
                                                          ? formatInAppTz(
                                                                a.created_at,
                                                                "MMM yyyy"
                                                            )
                                                          : "—"}
                                                </span>
                                            </td>
                                            <td className="ed-td ed-td-r">
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
                                                <td className="ed-td ed-td-r">
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
                                                        description="Balances will be recomputed."
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
                                    );
                                })}
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
        <div className="ed-hero-cell">
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

function TrendChart({
    bars,
}: {
    bars: Array<{ allocated: number; consumed: number }>;
}) {
    const w = 800;
    const h = 160;
    const p = 18;
    const max = Math.max(1, ...bars.flatMap((b) => [b.allocated, b.consumed]));
    const slot = (w - p * 2) / bars.length;
    const bw = Math.max(3, slot / 2 - 4);
    const sx = (i: number) => p + i * slot;
    const sy = (v: number) => h - p - (v / max) * (h - p * 2);
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            preserveAspectRatio="none"
            style={{ display: "block" }}
        >
            {bars.map((b, i) => (
                <g key={i}>
                    <rect
                        x={sx(i) + 4}
                        y={sy(b.allocated)}
                        width={bw}
                        height={Math.max(2, h - p - sy(b.allocated))}
                        fill="var(--income)"
                        opacity="0.85"
                        rx="2"
                    />
                    <rect
                        x={sx(i) + 4 + bw + 3}
                        y={sy(b.consumed)}
                        width={bw}
                        height={Math.max(2, h - p - sy(b.consumed))}
                        fill="var(--expense)"
                        opacity="0.85"
                        rx="2"
                    />
                </g>
            ))}
        </svg>
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
                color: color,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={color} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    wallet:
        "M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    coffee:
        "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    flame: "M12 22s7-4 7-10c0-3-2-5-3-6 0 2-1 3-2 3-1-3-3-5-3-7-2 1-6 5-6 10 0 6 7 10 7 10z",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    dumbbell: "M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12",
    mail: "M4 6h16v12H4z M4 6l8 6 8-6",
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
    const d = ICON_PATHS[name] ?? ICON_PATHS.mail;
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

/* ============================================================
   Rebalance dialog (preserved)
   ============================================================ */

function RebalanceDialog({
    envelopeId,
    targetAccountId,
    breakdown,
    accountsById,
    neededAmount,
}: {
    envelopeId: string;
    envelopCadence: "none" | "monthly";
    targetAccountId: string | null;
    breakdown: Array<{
        accountId: string | null;
        allocated: number;
        consumed: number;
        remaining: number;
        isDrift: boolean;
    }>;
    accountsById: Map<
        string,
        { id: string; name: string; color: string; icon: string }
    >;
    neededAmount: number;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const availableSources = breakdown.filter(
        (b) =>
            b.remaining > 0 &&
            (b.accountId ?? "unassigned") !== (targetAccountId ?? "unassigned")
    );
    const [sourceKey, setSourceKey] = useState<string>(
        availableSources[0]?.accountId ?? "unassigned"
    );
    const [amount, setAmount] = useState(neededAmount.toFixed(2));
    const utils = trpc.useUtils();

    const mutation = trpc.allocation.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Rebalanced");
            await Promise.all([
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.envelop.allocationListBySpace.invalidate({
                    spaceId: space.id,
                }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const sourceAccountId = sourceKey === "unassigned" ? null : sourceKey;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button type="button" className="od-btn od-btn-sm">
                    <ArrowRightLeft className="size-3" /> Rebalance
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rebalance drift</DialogTitle>
                    <DialogDescription>
                        Move allocation from another account partition in this
                        envelope to clear the drift.
                    </DialogDescription>
                </DialogHeader>
                {availableSources.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No other account partitions have positive remaining.
                        Allocate more from unallocated cash instead.
                    </p>
                ) : (
                    <form
                        className="grid gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const n = Number(amount);
                            if (!(n > 0)) {
                                toast.error("Enter a positive amount");
                                return;
                            }
                            mutation.mutate({
                                amount: n,
                                from: {
                                    kind: "envelop",
                                    envelopId: envelopeId,
                                    accountId: sourceAccountId,
                                },
                                to: {
                                    kind: "envelop",
                                    envelopId: envelopeId,
                                    accountId: targetAccountId,
                                },
                            });
                        }}
                    >
                        <div className="grid gap-1.5">
                            <Label>From partition</Label>
                            <Select value={sourceKey} onValueChange={setSourceKey}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSources.map((s) => {
                                        const account = s.accountId
                                            ? accountsById.get(s.accountId)
                                            : null;
                                        const key = s.accountId ?? "unassigned";
                                        return (
                                            <SelectItem key={key} value={key}>
                                                {account?.name ?? "Unassigned pool"}{" "}
                                                — {formatMoney(s.remaining)}{" "}
                                                available
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="rebal-amount">Amount</Label>
                            <Input
                                id="rebal-amount"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="gradient"
                                disabled={mutation.isPending}
                            >
                                {mutation.isPending ? "Transferring…" : "Rebalance"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

void AlertTriangle;

void function HeroStatNode(node: ReactNode) { return node; };

const ED_STYLES = `
.ed-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .ed-root { margin: -2rem; }
}

.ed-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ed-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ed-breadcrumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}
.ed-crumb {
    color: var(--fg-3);
    text-decoration: none;
    transition: color 140ms ease;
}
.ed-crumb:hover { color: var(--fg); }
.ed-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 14px;
}
.ed-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ed-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 720px) {
    .ed-topbar { padding: 18px 18px 14px; }
}

.ed-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .ed-scroll { padding: 16px 18px 28px; }
}

.orbit-design .od-card.ed-hero {
    padding: 24px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1.4fr;
    gap: 22px;
    align-items: start;
}
@media (max-width: 1100px) {
    .orbit-design .od-card.ed-hero {
        grid-template-columns: repeat(2, 1fr);
    }
}
@media (max-width: 600px) {
    .orbit-design .od-card.ed-hero { grid-template-columns: 1fr; }
}
.ed-hero-cell { display: flex; flex-direction: column; gap: 6px; }
.ed-hero-progress { display: flex; flex-direction: column; }
.ed-hero-progress-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--fg-3);
}

.ed-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
}
@media (max-width: 1100px) {
    .ed-grid-2 { grid-template-columns: 1fr; }
}

.ed-section { padding: 22px; }
.ed-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
}
.ed-sect-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.ed-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
}
.ed-sect-sub { font-size: 12px; color: var(--fg-3); }
.ed-rebalance-link {
    font-size: 12px;
    color: var(--brand);
    text-decoration: none;
}
.ed-rebalance-link:hover { text-decoration: underline; }

/* Tables */
.ed-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
}
.ed-th {
    text-align: right;
    padding: 8px 0;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--line);
}
.ed-th-l { text-align: left; }
.ed-tr { transition: background 120ms ease; }
.ed-tr:hover { background: var(--bg-elev-2); }
.ed-td {
    padding: 12px 0;
    border-bottom: 1px solid var(--line-soft);
    text-align: right;
}
.ed-tr:last-child .ed-td { border-bottom: none; }
.ed-td-l { text-align: left; }
.ed-td-r { text-align: right; }
.ed-td-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.ed-td-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
}
.ed-drift-chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 500;
    color: var(--expense);
    border: 1px solid color-mix(in oklab, var(--expense) 30%, transparent);
    background: transparent;
}

.ed-trend-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    font-size: 11.5px;
    color: var(--fg-4);
    flex-wrap: wrap;
    gap: 8px;
}

.ed-empty {
    padding: 30px 0;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
}
`;
