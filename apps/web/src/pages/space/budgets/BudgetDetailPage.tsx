import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    AlertTriangle,
    ArchiveRestore,
    ArrowRightLeft,
    ChevronRight,
    Coins,
    Pencil,
} from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import { startOfMonth, endOfMonth } from "@/lib/dates";
import { toast } from "sonner";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { EnvelopeMoveDialog } from "@/features/allocations/EnvelopeMoveDialog";
import { EnvelopeTopUpDialog } from "@/features/allocations/EnvelopeTopUpDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { CreateOrEditEnvelopeDialog } from "./BudgetsPage";

export default function BudgetDetailPage() {
    const { space } = useCurrentSpace();
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const [editOpen, setEditOpen] = useState(false);

    const periodStart = useMemo(() => startOfMonth(new Date()), []);
    const periodEnd = useMemo(() => endOfMonth(new Date()), []);

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const envelope = utilizationQuery.data?.find((e) => e.envelopId === envelopeId);

    const txQuery = trpc.transaction.listBySpace.useQuery(
        { spaceId: space.id, envelopId: envelopeId, limit: 10 },
        { enabled: !!envelopeId }
    );

    // Period-scoped pool: this-period allocation.
    // The hero "Remaining" stat below uses cumulative `envelope.remaining`,
    // which is the separate concept.
    const total = envelope ? envelope.allocated : 0;
    const over = !!envelope && envelope.consumed > total;
    // Spend gauge: fraction of budget consumed, so the bar FILLS as you spend
    // (consistent meaning in every state) rather than draining then snapping to
    // full red when over. >1 overspends — ProgressBar caps + reds it.
    const spentFrac =
        envelope && total > 0
            ? envelope.consumed / total
            : envelope && envelope.consumed > 0
              ? 1.5
              : 0;
    const pctSpent =
        envelope && total > 0
            ? (envelope.consumed / total) * 100
            : envelope && envelope.consumed > 0
              ? Infinity
              : 0;

    const monthLabel = formatInAppTz(new Date(), "MMM yyyy");
    const daysLeft = useMemo(() => {
        const now = new Date();
        /* Use the BST-aware end-of-month so the countdown matches the
           server's wall-clock view of "this month". */
        const monthEnd = endOfMonth(now);
        return Math.max(
            0,
            Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000)
        );
    }, []);

    return (
        <div className="orbit-design ed-root">
            <style>{ED_STYLES}</style>

            {/* Topbar */}
            <header className="ed-topbar">
                <div className="ed-topbar-text">
                    <span className="eyebrow ed-breadcrumb">
                        <Link to={ROUTES.spaceBudgets(space.id)} className="ed-crumb">
                            Budgets
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
                                {envelope.archived && (
                                    <span className="ed-archived-badge">
                                        Archived
                                    </span>
                                )}
                            </>
                        ) : (
                            "Envelope"
                        )}
                    </h1>
                    <p className="ed-sub">
                        {envelope
                            ? `${envelope.cadence === "monthly" ? "Monthly" : "Rolling"}${
                                  envelope.description
                                      ? ` · ${envelope.description}`
                                      : ""
                              }`
                            : "Utilization and recent activity"}
                    </p>
                </div>
                <div className="ed-topbar-actions">
                    {envelope && !envelope.archived && (
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
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="deallocate"
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn"
                                    >
                                        Deallocate
                                    </button>
                                }
                            />
                            <EnvelopeTopUpDialog
                                envelopId={envelope.envelopId}
                                envelopeName={envelope.name}
                                envelopeColor={envelope.color}
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn"
                                    >
                                        <Coins className="size-3.5" /> Top up…
                                    </button>
                                }
                            />
                            <EnvelopeMoveDialog
                                sourceEnvelopId={envelope.envelopId}
                                sourceEnvelopeName={envelope.name}
                                sourceEnvelopeColor={envelope.color}
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn"
                                    >
                                        <ArrowRightLeft className="size-3.5" />{" "}
                                        Move to…
                                    </button>
                                }
                            />
                        </PermissionGate>
                    )}
                    {envelope?.archived && envelope.remaining > 0 && (
                        <PermissionGate roles={["owner", "editor"]}>
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="deallocate"
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn"
                                    >
                                        Free trapped cash
                                    </button>
                                }
                            />
                        </PermissionGate>
                    )}
                    {envelope?.archived && (
                        <PermissionGate roles={["owner"]}>
                            <UnarchiveButton
                                envelopId={envelope.envelopId}
                                spaceId={space.id}
                            />
                        </PermissionGate>
                    )}
                    {envelope && !envelope.archived && (
                        <PermissionGate roles={["owner"]}>
                            <button
                                type="button"
                                className="od-btn od-btn-primary"
                                onClick={() => setEditOpen(true)}
                            >
                                <Pencil className="size-3.5" /> Edit
                            </button>
                            <CreateOrEditEnvelopeDialog
                                envelope={{
                                    envelopId: envelope.envelopId,
                                    name: envelope.name,
                                    color: envelope.color,
                                    icon: envelope.icon,
                                    description: envelope.description,
                                    cadence: envelope.cadence,
                                    targetAmount: envelope.targetAmount,
                                    targetDate: envelope.targetDate,
                                }}
                                open={editOpen}
                                onOpenChange={setEditOpen}
                                hideDefaultTrigger
                            />
                        </PermissionGate>
                    )}
                </div>
            </header>

            <div className="ed-scroll">
                {/* Hero stats card */}
                {envelope ? (
                    <div className="od-card vignette ed-hero">
                        {/* Spent before Allocated — matches the spend-gauge
                            order on the cards/list (Spent → Allocated cap). */}
                        <HeroStat
                            label="Spent"
                            amount={envelope.consumed}
                            tone="brand"
                        />
                        <HeroStat
                            label="Allocated"
                            amount={total}
                            tone="fg"
                        />
                        <HeroStat
                            label="Position"
                            amount={envelope.remaining}
                            tone="gold"
                            /* Signed `Position` already shows overspend
                               directly when negative — the explicit note
                               was redundant once the rolling-lifetime
                               fix made `remaining` honest, so it's been
                               removed here. List/card/analytics pills
                               still surface the lifetime overrun where
                               there's no signed amount visible. */
                        />
                        <div className="ed-hero-progress">
                            {/* Rolling envelopes have no monthly reset
                                so "This month" + "days left" framing
                                lies to the user. Show a lifetime label
                                instead and drop the countdown there. */}
                            <span className="eyebrow">
                                {envelope.cadence === "none"
                                    ? "Lifetime"
                                    : `This month · ${monthLabel}`}
                            </span>
                            <div style={{ marginTop: 12 }}>
                                <ProgressBar
                                    value={spentFrac}
                                    color={envelope.color}
                                    height={8}
                                />
                            </div>
                            <div className="ed-hero-progress-foot">
                                <span>
                                    {Number.isFinite(pctSpent)
                                        ? over
                                            ? `${(pctSpent - 100).toFixed(0)}% over`
                                            : `${Math.round(100 - pctSpent)}% left`
                                        : "Spent without allocation"}
                                </span>
                                {envelope.cadence !== "none" && (
                                    <span>{daysLeft} days left</span>
                                )}
                            </div>
                        </div>
                    </div>
                ) : utilizationQuery.isLoading ? (
                    <Skeleton height={140} />
                ) : (
                    <div className="od-card vignette ed-hero">
                        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>
                            This envelope no longer exists.{" "}
                            <Link
                                to={ROUTES.spaceBudgets(space.id)}
                                className="ed-crumb"
                            >
                                Back to budgets
                            </Link>
                        </p>
                    </div>
                )}

                {/* Goal progress — rendered when this rolling envelope
                    carries a target. The "Saved" numerator tracks
                    lifetime positive allocations so spending from a
                    goal does not unwind its completion status. */}
                {envelope && envelope.targetAmount != null && (
                    <div className="od-card ed-section ed-goal">
                        <div className="ed-sect-head">
                            <div className="ed-sect-text">
                                <h2 className="display ed-sect-title">
                                    Goal progress
                                </h2>
                                <span className="ed-sect-sub">
                                    {envelope.targetDate
                                        ? `Target by ${formatInAppTz(
                                              envelope.targetDate,
                                              "MMM d, yyyy"
                                          )}`
                                        : "No deadline set"}
                                </span>
                            </div>
                            <div
                                className="ed-goal-summary"
                                aria-label={`${envelope.lifetimeFunded.toFixed(2)} saved of ${envelope.targetAmount.toFixed(2)} target`}
                            >
                                <strong className="ed-goal-saved">
                                    {envelope.lifetimeFunded.toFixed(2)}
                                </strong>
                                <span aria-hidden> / </span>
                                <span aria-hidden>
                                    {envelope.targetAmount.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <ProgressBar
                            value={
                                envelope.pctComplete != null
                                    ? envelope.pctComplete / 100
                                    : 0
                            }
                            color={envelope.color}
                            height={8}
                        />
                    </div>
                )}

                {/* Recent transactions — the activity feed for this
                    envelope. Renders for every envelope (goal or not) so the
                    page stays substantive below the hero. */}
                {envelope && (
                    <div className="od-card ed-section">
                        <div className="ed-sect-head">
                            <div className="ed-sect-text">
                                <h2 className="display ed-sect-title">
                                    Recent transactions
                                </h2>
                                <span className="ed-sect-sub">
                                    The latest activity tagged to this envelope.
                                </span>
                            </div>
                        </div>
                        {txQuery.isLoading ? (
                            <div className="ed-empty">Loading…</div>
                        ) : !txQuery.data ||
                          txQuery.data.items.length === 0 ? (
                            <div className="ed-empty">
                                No transactions tagged to this envelope yet.
                            </div>
                        ) : (
                            <div className="ed-tx-list">
                                {txQuery.data.items.map((t) => {
                                    const txType = t.type as unknown as string;
                                    return (
                                        <div key={t.id} className="ed-tx-row">
                                            <div className="ed-tx-main">
                                                <TransactionTypeBadge
                                                    type={txType as any}
                                                />
                                                <span className="ed-tx-desc">
                                                    {t.description ?? "—"}
                                                </span>
                                            </div>
                                            <span className="ed-tx-date">
                                                {formatInAppTz(
                                                    t.transaction_datetime,
                                                    "MMM d"
                                                )}
                                            </span>
                                            <MoneyDisplay
                                                amount={Number(t.amount)}
                                                variant={
                                                    txType === "income"
                                                        ? "income"
                                                        : txType === "expense"
                                                          ? "expense"
                                                          : "neutral"
                                                }
                                                className="ed-tx-amt"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function UnarchiveButton({
    envelopId,
    spaceId,
}: {
    envelopId: string;
    spaceId: string;
}) {
    const utils = trpc.useUtils();
    const mutation = trpc.envelop.archive.useMutation({
        onSuccess: async () => {
            toast.success("Unarchived");
            await Promise.all([
                utils.envelop.listBySpace.invalidate({ spaceId }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId }),
                utils.analytics.spaceSummary.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <button
            type="button"
            className="od-btn od-btn-primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ envelopId, archived: false })}
        >
            <ArchiveRestore className="size-3.5" />
            {mutation.isPending ? "Unarchiving…" : "Unarchive"}
        </button>
    );
}

function HeroStat({
    label,
    amount,
    tone,
    note,
}: {
    label: string;
    amount: number;
    tone: "fg" | "brand" | "gold";
    note?: string;
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
                }}
            >
                {amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
            </span>
            {/* Lifetime-overrun note for rolling envelopes. Icon paired
                with the red text so colorblind users get a non-color cue. */}
            {note && (
                <span className="ed-hero-note">
                    <AlertTriangle
                        className="size-3"
                        aria-hidden
                        style={{ flexShrink: 0 }}
                    />
                    <span>{note}</span>
                </span>
            )}
        </div>
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
.ed-archived-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    margin-left: 10px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    color: var(--fg-3);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
}
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
.ed-hero-note {
    display: inline-flex;
    align-items: flex-start;
    gap: 4px;
    font-size: 11px;
    color: var(--expense);
    line-height: 1.35;
}
@media (max-width: 600px) {
    .ed-hero-note {
        border-top: 1px solid var(--line-soft);
        padding-top: 6px;
        margin-top: 2px;
    }
}
.ed-hero-progress { display: flex; flex-direction: column; }
.ed-hero-progress-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--fg-3);
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
.ed-goal-summary {
    text-align: right;
    font-size: 13px;
    color: var(--fg-2);
    font-variant-numeric: tabular-nums;
}
.ed-goal-saved { color: var(--fg); font-weight: 600; }

/* Recent transactions list */
.ed-tx-list {
    display: flex;
    flex-direction: column;
}
.ed-tx-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line-soft);
}
.ed-tx-row:last-child { border-bottom: none; }
.ed-tx-main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.ed-tx-desc {
    font-size: 13px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ed-tx-date {
    font-size: 12px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.ed-tx-amt {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
}

.ed-empty {
    padding: 30px 0;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
}

/* Phone (<640px) — tighten everything. */
@media (max-width: 640px) {
    .ed-topbar { padding: 14px 14px 10px; }
    .ed-title { font-size: 20px; gap: 10px; }
    .ed-scroll { padding: 12px 14px 22px; gap: 12px; }
    .orbit-design .od-card.ed-hero { padding: 16px; gap: 14px; }
    .ed-section { padding: 14px; }
    .ed-sect-head { margin-bottom: 10px; }
    .ed-tx-row { gap: 10px; }
}
`;
