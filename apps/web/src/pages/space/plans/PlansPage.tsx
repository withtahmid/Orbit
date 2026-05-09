import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    Target,
    Plus,
    Trash2,
    Pencil,
    Filter as FilterIcon,
    ChevronDown,
    Check,
} from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatInAppTz } from "@/lib/formatDate";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ColorPickerButton } from "@/components/shared/ColorPicker";
import { IconPickerButton } from "@/components/shared/IconPicker";
import { OrbitModalShell, OrbitField } from "@/components/orbit/OrbitModalShell";
import {
    OrbitFormStyles,
    OrbitInput,
    OrbitTextarea,
    OrbitFieldRow,
} from "@/components/orbit/OrbitForm";
import { ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { getIcon } from "@/lib/entityIcons";
import { PlanAllocateDialog } from "@/features/allocations/PlanAllocateDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { toInputDate } from "@/lib/dates";

type SortMode = "progress" | "name" | "target" | "saved";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
    { value: "progress", label: "Progress" },
    { value: "saved", label: "Saved" },
    { value: "target", label: "Target amount" },
    { value: "name", label: "Name" },
];

export default function PlansPage() {
    const { space } = useCurrentSpace();
    const plansQuery = trpc.analytics.planProgress.useQuery({ spaceId: space.id });
    const [sort, setSort] = useState<SortMode>("progress");

    const plans = useMemo(() => {
        const data = [...(plansQuery.data ?? [])];
        if (sort === "name") data.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === "target")
            data.sort((a, b) => (b.targetAmount ?? 0) - (a.targetAmount ?? 0));
        else if (sort === "saved") data.sort((a, b) => b.allocated - a.allocated);
        else data.sort((a, b) => (b.pctComplete ?? 0) - (a.pctComplete ?? 0));
        return data;
    }, [plansQuery.data, sort]);

    const totals = useMemo(() => {
        const saved = plans.reduce((s, p) => s + p.allocated, 0);
        const target = plans.reduce(
            (s, p) => s + (p.targetAmount ?? 0),
            0
        );
        const progress = target > 0 ? (saved / target) * 100 : 0;
        return { saved, target, progress, count: plans.length };
    }, [plans]);

    return (
        <div className="orbit-design plans-root">
            <style>{PLANS_STYLES}</style>

            {/* Topbar */}
            <header className="plans-topbar">
                <div className="plans-topbar-text">
                    <span className="eyebrow">Long-horizon</span>
                    <h1 className="display plans-title">Plans</h1>
                    <p className="plans-sub">
                        Goal-based allocations earmarked for the future.
                    </p>
                </div>
                <div className="plans-topbar-actions">
                    <SortPicker sort={sort} setSort={setSort} />
                    <PermissionGate roles={["owner"]}>
                        <CreateOrEditPlanDialog
                            trigger={
                                <button
                                    type="button"
                                    className="od-btn od-btn-primary"
                                >
                                    <Plus className="size-3.5" /> New plan
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            </header>

            <div className="plans-scroll">
                {/* Hero summary card */}
                <div className="od-card vignette plans-hero">
                    <div className="plans-hero-cell">
                        <span className="eyebrow">Total saved</span>
                        <Money
                            amount={totals.saved}
                            size={30}
                            tone="gold"
                            decimals={0}
                        />
                    </div>
                    <div className="plans-hero-cell">
                        <span className="eyebrow">Across plans</span>
                        <span
                            className="tabular"
                            style={{
                                fontSize: 30,
                                fontWeight: 500,
                                color: "var(--fg)",
                                letterSpacing: "-0.04em",
                            }}
                        >
                            {totals.count}
                        </span>
                    </div>
                    <div className="plans-hero-cell">
                        <span className="eyebrow">Combined target</span>
                        <Money
                            amount={totals.target}
                            size={30}
                            decimals={0}
                        />
                    </div>
                    <div className="plans-hero-cell">
                        <span className="eyebrow">Overall progress</span>
                        <ProgressBar
                            value={totals.progress / 100}
                            color="var(--brand)"
                            height={8}
                        />
                        <span
                            style={{
                                fontSize: 11.5,
                                color: "var(--fg-3)",
                                marginTop: 8,
                            }}
                        >
                            {totals.progress.toFixed(1)}% complete
                        </span>
                    </div>
                </div>

                {/* Plan grid */}
                {plansQuery.isLoading ? (
                    <div className="plans-grid">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} height={170} />
                        ))}
                    </div>
                ) : plans.length === 0 ? (
                    <div className="od-card plans-empty">
                        <Target className="size-6" style={{ color: "var(--fg-4)" }} />
                        <div style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 500 }}>
                            No plans yet
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>
                            Create a plan to set aside money for long-term goals.
                        </div>
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditPlanDialog
                                trigger={
                                    <button className="od-btn od-btn-primary">
                                        <Plus className="size-3.5" /> New plan
                                    </button>
                                }
                            />
                        </PermissionGate>
                    </div>
                ) : (
                    <div className="plans-grid">
                        {plans.map((p) => {
                            const targetDate = p.targetDate
                                ? new Date(p.targetDate)
                                : null;
                            const daysLeft = targetDate
                                ? differenceInCalendarDays(targetDate, new Date())
                                : null;
                            const hasTarget = p.targetAmount && p.targetAmount > 0;
                            const pct = (p.pctComplete ?? 0) / 100;
                            const remaining = (p.targetAmount ?? 0) - p.allocated;
                            const monthsLeft =
                                daysLeft && daysLeft > 0
                                    ? Math.max(1, Math.round(daysLeft / 30))
                                    : null;
                            const monthly =
                                monthsLeft && remaining > 0
                                    ? remaining / monthsLeft
                                    : null;
                            return (
                                <Link
                                    key={p.planId}
                                    to={ROUTES.spacePlanDetail(space.id, p.planId)}
                                    className="od-card plans-card"
                                >
                                    <div className="plans-card-head">
                                        <span className="plans-card-name">
                                            <EntityAvatar
                                                icon={p.icon}
                                                colorVar={p.color}
                                                size={40}
                                            />
                                            <span className="plans-card-text">
                                                <span className="plans-card-title">
                                                    {p.name}
                                                </span>
                                                <span className="plans-card-target">
                                                    {targetDate
                                                        ? `Target: ${formatInAppTz(targetDate, "MMM yyyy")}`
                                                        : "No target date"}
                                                </span>
                                            </span>
                                        </span>
                                        <span
                                            className="plans-card-pct"
                                            style={{
                                                color: "var(--gold)",
                                                borderColor:
                                                    "color-mix(in oklab, var(--gold) 30%, transparent)",
                                            }}
                                        >
                                            {hasTarget
                                                ? `${(p.pctComplete ?? 0).toFixed(0)}%`
                                                : "—"}
                                        </span>
                                    </div>
                                    <div className="plans-card-amt-row">
                                        <Money amount={p.allocated} size={28} />
                                        {hasTarget && (
                                            <span className="plans-card-of">
                                                of{" "}
                                                <Money
                                                    amount={p.targetAmount ?? 0}
                                                    variant="muted"
                                                    size={12}
                                                />
                                            </span>
                                        )}
                                    </div>
                                    <ProgressBar value={pct} color={p.color} height={6} />
                                    <div className="plans-card-foot">
                                        <span>
                                            {hasTarget ? (
                                                <>
                                                    <Money
                                                        amount={Math.max(0, remaining)}
                                                        variant="muted"
                                                        size={11.5}
                                                    />{" "}
                                                    to go
                                                </>
                                            ) : daysLeft != null ? (
                                                `${daysLeft}d`
                                            ) : null}
                                        </span>
                                        {monthly != null && (
                                            <span>
                                                ~
                                                <Money
                                                    amount={monthly}
                                                    variant="muted"
                                                    size={11.5}
                                                />
                                                /mo to hit target
                                            </span>
                                        )}
                                        {!monthly && targetDate && daysLeft != null && (
                                            <span>
                                                {daysLeft < 0
                                                    ? `${Math.abs(daysLeft)}d overdue`
                                                    : `${daysLeft}d left`}
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className="plans-card-actions"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                        }}
                                    >
                                        <PermissionGate roles={["owner", "editor"]}>
                                            <PlanAllocateDialog
                                                planId={p.planId}
                                                direction="allocate"
                                            />
                                            <PlanAllocateDialog
                                                planId={p.planId}
                                                direction="deallocate"
                                            />
                                        </PermissionGate>
                                        <PermissionGate roles={["owner"]}>
                                            <span className="plans-card-icon-actions">
                                                <CreateOrEditPlanDialog plan={p} />
                                                <DeletePlanButton planId={p.planId} />
                                            </span>
                                        </PermissionGate>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ============================================================
   Helpers
   ============================================================ */

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
    tone,
}: {
    amount: number;
    variant?:
        | "neutral"
        | "income"
        | "expense"
        | "muted"
        | "gold"
        | "brand";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
    tone?: "gold" | "brand";
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        muted: "var(--fg-3)",
        gold: "var(--gold)",
        brand: "var(--brand)",
        neutral: "var(--fg)",
    };
    const color = tone ? colorMap[tone] : colorMap[variant];
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
                color,
                fontSize: size,
                fontWeight: weight,
                letterSpacing: size >= 24 ? "-0.04em" : undefined,
            }}
        >
            {text}
        </span>
    );
}

function EntityAvatar({
    icon,
    colorVar,
    size = 32,
}: {
    icon: string;
    colorVar: string;
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
                background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
                color: colorVar,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={colorVar} />
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
    color = "var(--brand)",
    height = 6,
}: {
    value: number;
    color?: string;
    height?: number;
}) {
    const v = Math.max(0, Math.min(1.5, value));
    const over = v > 1;
    return (
        <div
            style={{
                height,
                borderRadius: 999,
                background: "var(--bg-elev-3)",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <div
                style={{
                    height: "100%",
                    width: `${Math.min(v, 1) * 100}%`,
                    background: over ? "var(--expense)" : color,
                    borderRadius: 999,
                    transition: "width 600ms cubic-bezier(0.2,0.7,0.2,1)",
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

function SortPicker({
    sort,
    setSort,
}: {
    sort: SortMode;
    setSort: (v: SortMode) => void;
}) {
    const label =
        SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Progress";
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    <FilterIcon className="size-3.5" /> Sort: {label}
                    <ChevronDown className="size-3" style={{ color: "var(--fg-4)" }} />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="orbit-design plans-popover w-44 p-1"
            >
                {SORT_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        className="plans-popover-item"
                        onClick={() => setSort(o.value)}
                    >
                        {o.label}
                        {sort === o.value && (
                            <Check
                                className="ml-auto size-3.5"
                                style={{ color: "var(--brand)" }}
                            />
                        )}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

/* ============================================================
   Dialogs (preserved from previous impl, now driven by trigger prop)
   ============================================================ */

type WizardStep = "basics" | "funding" | "schedule";
const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
    { id: "basics", label: "Basics" },
    { id: "funding", label: "Funding" },
    { id: "schedule", label: "Schedule" },
];

function CreateOrEditPlanDialog({
    plan,
    trigger,
}: {
    plan?: {
        planId: string;
        name: string;
        color: string;
        icon: string;
        description: string | null;
        targetAmount: number | null;
        targetDate: Date | string | null;
    };
    trigger?: ReactNode;
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const editing = !!plan;
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>("basics");
    const [name, setName] = useState(plan?.name ?? "");
    const [color, setColor] = useState(plan?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(plan?.icon ?? "target");
    const [description, setDescription] = useState(plan?.description ?? "");
    const [targetAmount, setTargetAmount] = useState(
        plan?.targetAmount != null ? String(plan.targetAmount) : ""
    );
    const [targetDate, setTargetDate] = useState(
        toInputDate(plan?.targetDate ? new Date(plan.targetDate) : null)
    );

    const invalidate = async () => {
        await utils.plan.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.planProgress.invalidate({ spaceId: space.id });
    };

    const idem = useIdempotencyKey();
    const create = trpc.plan.create.useMutation({
        onSuccess: async () => {
            toast.success("Plan created");
            idem.rotate();
            await invalidate();
            setOpen(false);
            setStep("basics");
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.plan.update.useMutation({
        onSuccess: async () => {
            toast.success("Plan updated");
            await invalidate();
            setOpen(false);
            setStep("basics");
        },
        onError: (e) => toast.error(e.message),
    });

    const pending = create.isPending || update.isPending;
    const IconCmp = getIcon(icon);

    const submit = () => {
        if (pending) return;
        if (!name.trim()) return;
        const target = targetAmount ? Number(targetAmount) : null;
        const date = targetDate ? new Date(targetDate) : null;
        if (editing) {
            update.mutate({
                planId: plan!.planId,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || null,
                targetAmount: target,
                targetDate: date,
            });
        } else {
            create.mutate({
                spaceId: space.id,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || undefined,
                targetAmount: target ?? undefined,
                targetDate: date ?? undefined,
                idempotencyKey: idem.key,
            });
        }
    };

    const stepIdx = WIZARD_STEPS.findIndex((s) => s.id === step);
    const goPrev = () => {
        if (stepIdx > 0) setStep(WIZARD_STEPS[stepIdx - 1].id);
    };
    const goNext = () => {
        if (stepIdx < WIZARD_STEPS.length - 1) setStep(WIZARD_STEPS[stepIdx + 1].id);
    };
    const isLast = stepIdx === WIZARD_STEPS.length - 1;
    const stepInvalid = step === "basics" && !name.trim();

    /* Tiny forecast preview — derived from inputs. */
    const monthsUntilTarget = useMemo(() => {
        if (!targetDate) return null;
        const target = new Date(targetDate);
        if (Number.isNaN(target.getTime())) return null;
        const diff = differenceInCalendarDays(target, new Date());
        return Math.max(1, Math.round(diff / 30));
    }, [targetDate]);
    const monthlyContribution = useMemo(() => {
        const t = Number(targetAmount);
        if (!Number.isFinite(t) || t <= 0 || !monthsUntilTarget) return null;
        return t / monthsUntilTarget;
    }, [targetAmount, monthsUntilTarget]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ??
                    (editing ? (
                        <Button size="icon" variant="ghost" className="size-7">
                            <Pencil className="size-3.5" />
                        </Button>
                    ) : (
                        <Button variant="gradient">
                            <Plus />
                            New plan
                        </Button>
                    ))}
            </DialogTrigger>
            <DialogContent className="orbit-shell-host">
                <DialogTitle className="sr-only">
                    {editing ? "Edit plan" : "New plan"}
                </DialogTitle>
                <OrbitModalShell
                    width={620}
                    eyebrow={`Plans · Step ${stepIdx + 1} of ${WIZARD_STEPS.length}`}
                    title={editing ? "Edit plan" : name.trim() || "New plan"}
                    subtitle="A long-horizon savings goal — fund automatically from monthly surplus."
                    leadIcon={<IconCmp className="size-4" />}
                    leadColor={color}
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="orbit-btn"
                                disabled={stepIdx === 0}
                                onClick={goPrev}
                            >
                                <ChevronLeft className="size-3.5" />
                                Back
                            </button>
                            <div style={{ flex: 1 }} />
                            <button
                                type="button"
                                className="orbit-btn"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </button>
                            {isLast ? (
                                <button
                                    type="button"
                                    className="orbit-btn orbit-btn-primary"
                                    disabled={!name.trim() || pending}
                                    onClick={submit}
                                >
                                    <Check className="size-3.5" />
                                    {pending
                                        ? "Saving…"
                                        : editing
                                          ? "Save plan"
                                          : "Create plan"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="orbit-btn orbit-btn-primary"
                                    disabled={stepInvalid}
                                    onClick={goNext}
                                >
                                    Continue
                                    <ChevronRightIcon className="size-3.5" />
                                </button>
                            )}
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{PLAN_MODAL_STYLES}</style>

                    {/* Stepper */}
                    <div className="of-stepper">
                        {WIZARD_STEPS.map((s, i) => {
                            const status =
                                i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
                            return (
                                <ReactFragmentLite key={s.id}>
                                    <span
                                        className={`of-stepper-item is-${status}`}
                                    >
                                        <span className="of-stepper-num">
                                            {status === "done" ? (
                                                <Check className="size-3" />
                                            ) : (
                                                i + 1
                                            )}
                                        </span>
                                        <span className="of-stepper-label">
                                            {s.label}
                                        </span>
                                    </span>
                                    {i < WIZARD_STEPS.length - 1 && (
                                        <span
                                            className={`of-stepper-bar ${status === "done" ? "is-done" : ""}`}
                                        />
                                    )}
                                </ReactFragmentLite>
                            );
                        })}
                    </div>

                    <div className="plan-mod-divider" />

                    {/* Step content */}
                    {step === "basics" && (
                        <>
                            <OrbitField label="Name" required>
                                <OrbitInput
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="House down payment, Vacation…"
                                    required
                                    maxLength={255}
                                    autoFocus
                                />
                            </OrbitField>

                            <OrbitField label="Description" hint="Optional">
                                <OrbitTextarea
                                    rows={2}
                                    maxLength={2000}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Context for this plan"
                                />
                            </OrbitField>

                            <OrbitField label="Style">
                                <div className="plan-mod-style-row">
                                    <ColorPickerButton
                                        value={color}
                                        onChange={setColor}
                                    />
                                    <IconPickerButton
                                        value={icon}
                                        onChange={setIcon}
                                        color={color}
                                    />
                                </div>
                            </OrbitField>
                        </>
                    )}

                    {step === "funding" && (
                        <>
                            <OrbitField label="Target amount" required>
                                <OrbitInput
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={targetAmount}
                                    onChange={(e) => setTargetAmount(e.target.value)}
                                    placeholder="80,000.00"
                                    prefix="$"
                                />
                            </OrbitField>

                            <OrbitField label="Funding strategy">
                                <div className="of-radio-card-list">
                                    <label className="of-radio-card is-active">
                                        <input
                                            type="radio"
                                            name="plan-fund"
                                            defaultChecked
                                            className="of-radio-native"
                                        />
                                        <span className="of-radio-card-dot">
                                            <span className="of-radio-card-dot-inner" />
                                        </span>
                                        <span className="of-radio-card-text">
                                            <span className="of-radio-card-label">
                                                Manual top-ups
                                            </span>
                                            <span className="of-radio-card-hint">
                                                You decide how much to allocate each month
                                                from the Plans page.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </OrbitField>
                        </>
                    )}

                    {step === "schedule" && (
                        <>
                            <OrbitFieldRow>
                                <OrbitField label="Target date" hint="Optional">
                                    <OrbitInput
                                        type="date"
                                        value={targetDate}
                                        onChange={(e) => setTargetDate(e.target.value)}
                                    />
                                </OrbitField>
                                <OrbitField
                                    label="Months remaining"
                                    hint="Derived from target date"
                                >
                                    <OrbitInput
                                        readOnly
                                        value={
                                            monthsUntilTarget
                                                ? `${monthsUntilTarget} mo`
                                                : "—"
                                        }
                                    />
                                </OrbitField>
                            </OrbitFieldRow>

                            {monthlyContribution != null && (
                                <div className="plan-mod-forecast">
                                    <div className="plan-mod-forecast-head">
                                        <span className="plan-mod-eyebrow">Forecast</span>
                                        <span className="plan-mod-forecast-foot">
                                            Reach{" "}
                                            <strong style={{ color: "var(--fg)" }}>
                                                ${Number(targetAmount).toLocaleString()}
                                            </strong>{" "}
                                            in {monthsUntilTarget} months
                                        </span>
                                    </div>
                                    <svg
                                        width="100%"
                                        height="60"
                                        viewBox="0 0 540 60"
                                        preserveAspectRatio="none"
                                        aria-hidden
                                    >
                                        <defs>
                                            <linearGradient
                                                id="planFill"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="0%"
                                                    stopColor={color}
                                                    stopOpacity="0.3"
                                                />
                                                <stop
                                                    offset="100%"
                                                    stopColor={color}
                                                    stopOpacity="0"
                                                />
                                            </linearGradient>
                                        </defs>
                                        <path
                                            d="M0 50 L0 35 L60 32 L120 28 L180 24 L240 19 L300 15 L360 11 L420 8 L480 5 L540 3 L540 60 L0 60 Z"
                                            fill="url(#planFill)"
                                        />
                                        <path
                                            d="M0 35 L60 32 L120 28 L180 24 L240 19 L300 15 L360 11 L420 8 L480 5 L540 3"
                                            stroke={color}
                                            strokeWidth="1.5"
                                            fill="none"
                                        />
                                    </svg>
                                    <span className="plan-mod-forecast-foot">
                                        Approx{" "}
                                        <strong style={{ color: "var(--fg)" }}>
                                            $
                                            {monthlyContribution.toLocaleString(undefined, {
                                                maximumFractionDigits: 0,
                                            })}
                                        </strong>{" "}
                                        per month
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </OrbitModalShell>
            </DialogContent>
        </Dialog>
    );
}

/* Tiny fragment helper — React.Fragment with key prop, kept here so the
   stepper can interleave divider bars without fighting the fragment ban. */
function ReactFragmentLite({
    children,
}: {
    children: ReactNode;
}) {
    return <>{children}</>;
}

const PLAN_MODAL_STYLES = `
.plan-mod-divider { height: 1px; background: var(--line); }
.plan-mod-style-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.plan-mod-forecast {
    padding: 14px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.plan-mod-forecast-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}
.plan-mod-eyebrow {
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
}
.plan-mod-forecast-foot {
    font-size: 11px;
    color: var(--fg-4);
}
`;

function DeletePlanButton({ planId }: { planId: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.plan.delete.useMutation({
        onSuccess: async () => {
            toast.success("Plan deleted");
            await utils.plan.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.planProgress.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <ConfirmDialog
            trigger={
                <Button size="icon" variant="ghost" className="size-7">
                    <Trash2 className="size-3.5 text-destructive" />
                </Button>
            }
            title="Delete plan?"
            description="All allocations to this plan will be removed."
            confirmLabel="Delete"
            destructive
            onConfirm={() => del.mutate({ planId })}
        />
    );
}

const PLANS_STYLES = `
.plans-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .plans-root { margin: -2rem; }
}

.plans-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.plans-topbar-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
.plans-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.plans-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.plans-topbar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
@media (max-width: 720px) {
    .plans-topbar { padding: 18px 18px 14px; }
}

.plans-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .plans-scroll { padding: 16px 18px 28px; }
}

/* Hero */
.orbit-design .od-card.plans-hero {
    padding: 24px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 22px;
    align-items: start;
}
@media (max-width: 1100px) {
    .orbit-design .od-card.plans-hero {
        grid-template-columns: repeat(2, 1fr);
    }
}
@media (max-width: 600px) {
    .orbit-design .od-card.plans-hero { grid-template-columns: 1fr; }
}
.plans-hero-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

/* Grid */
.plans-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}
@media (max-width: 900px) {
    .plans-grid { grid-template-columns: 1fr; }
}
.plans-card {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease, background 140ms ease;
    position: relative;
}
.plans-card:hover {
    border-color: var(--line-strong);
    background: var(--bg-elev-2);
}
.plans-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.plans-card-name {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}
.plans-card-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.plans-card-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.plans-card-target {
    font-size: 11.5px;
    color: var(--fg-4);
}
.plans-card-pct {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid;
    background: transparent;
}
.plans-card-amt-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.plans-card-of {
    font-size: 12px;
    color: var(--fg-4);
}
.plans-card-foot {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--fg-3);
}
.plans-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
}
.plans-card-icon-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    opacity: 0;
    transition: opacity 140ms ease;
}
.plans-card:hover .plans-card-icon-actions,
.plans-card:focus-within .plans-card-icon-actions {
    opacity: 1;
}

/* Empty state */
.orbit-design .od-card.plans-empty {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
}

/* Sort popover */
.plans-popover-item {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    font-size: 13px;
    color: var(--fg-2);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
}
.plans-popover-item:hover { background: var(--bg-elev-2); color: var(--fg); }

/* Phone (<640px) — tighter cards and hero. */
@media (max-width: 640px) {
    .plans-card { padding: 16px; gap: 12px; }
    .plans-card-actions { gap: 6px; }
    .plans-card-icon-actions { opacity: 1; }
    .orbit-design .od-card.plans-empty { padding: 24px; }
}
`;
