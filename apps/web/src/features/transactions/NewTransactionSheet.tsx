import { useRef, useState, useMemo, type FormEvent, type ReactNode } from "react";
import {
    Plus,
    ArrowDown,
    ArrowUp,
    ArrowLeftRight,
    SlidersHorizontal,
    Check,
    Calendar,
    Wallet,
    Briefcase,
    Tag,
} from "lucide-react";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OrbitDrawerShell, OrbitField } from "@/components/orbit/OrbitModalShell";
import {
    OrbitAmountCard,
    OrbitFieldRow,
    OrbitFormStyles,
    OrbitInfoPill,
    OrbitInput,
    OrbitRadioRow,
    OrbitSelect,
    OrbitTextarea,
    OrbitToggle,
    type OrbitSelectItem,
} from "@/components/orbit/OrbitForm";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { FileUploadField } from "@/components/file-upload-field";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { trpc } from "@/trpc";
import type { RouterOutput } from "@/trpc";
import { useInvalidateAnalytics } from "@/lib/invalidate";
import { cn } from "@/lib/utils";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";
import { Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { AlertTriangle } from "lucide-react";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";
import { getIcon } from "@/lib/entityIcons";

type SpaceAccount = RouterOutput["account"]["listBySpace"][number];
type Envelop = RouterOutput["envelop"]["listBySpace"][number];
type Category = RouterOutput["expenseCategory"]["listBySpace"][number];

const ownedByMe = (a: SpaceAccount) => a.myRole === "owner";

function AccountLabel({ account }: { account: SpaceAccount }) {
    const first = account.owners?.[0];
    const extra = (account.owners?.length ?? 0) - 1;
    return (
        <span className="of-acc-label">
            <span className="of-acc-name">{account.name}</span>
            {first && (
                <span className="of-acc-meta">
                    <UserAvatar
                        fileId={first.avatar_file_id}
                        firstName={first.first_name}
                        size="xs"
                    />
                    {first.first_name}
                    {extra > 0 && ` +${extra}`}
                </span>
            )}
        </span>
    );
}

/** Convert a SpaceAccount to an OrbitSelectItem with its icon/color. */
function toAccountItem(a: SpaceAccount): OrbitSelectItem {
    const Icon = getIcon(a.icon ?? null);
    return {
        value: a.id,
        label: <AccountLabel account={a} />,
        leadIcon: <Icon className="size-3.5" />,
        leadColor: a.color ?? "var(--ent-1)",
    };
}

type TxTab = "income" | "expense" | "transfer" | "adjustment";

const TAB_META: Record<
    TxTab,
    {
        label: string;
        icon: typeof ArrowDown;
        color: string;
        eyebrow: string;
        title: string;
        subtitle: string;
        leadIcon: typeof ArrowDown;
    }
> = {
    expense: {
        label: "Expense",
        icon: ArrowUp,
        color: "var(--expense)",
        eyebrow: "New transaction",
        title: "Add expense",
        subtitle: "Posted to ledger immediately. Drafts auto-save.",
        leadIcon: ArrowUp,
    },
    income: {
        label: "Income",
        icon: ArrowDown,
        color: "var(--income)",
        eyebrow: "New transaction",
        title: "Add income",
        subtitle: "Posted to ledger immediately. Drafts auto-save.",
        leadIcon: ArrowDown,
    },
    transfer: {
        label: "Transfer",
        icon: ArrowLeftRight,
        color: "var(--transfer)",
        eyebrow: "New transfer",
        title: "Move money",
        subtitle: "Between accounts within this space. Doesn't affect totals.",
        leadIcon: ArrowLeftRight,
    },
    adjustment: {
        label: "Adjust",
        icon: SlidersHorizontal,
        color: "var(--gold)",
        eyebrow: "New transaction",
        title: "Reconcile balance",
        subtitle:
            "Correct a drift between Orbit's balance and your bank's. Posted as a one-line adjustment.",
        leadIcon: SlidersHorizontal,
    },
};

const TAB_ORDER: TxTab[] = ["expense", "income", "transfer", "adjustment"];

/**
 * Reads the current space's strict-mode status + pending reckoning count
 * once at the sheet level so both the banner AND the Save button can
 * react. Without this, the banner could show "you're blocked" while the
 * button stays enabled — the user submits, gets a server toast, and has
 * to navigate manually. Hoisting consolidates the truth.
 */
function useSheetStrictGate(open: boolean) {
    const spaceId = useCurrentSpaceId();
    const isPersonal = spaceId === "me";
    const spacesQuery = trpc.space.list.useQuery(undefined, {
        enabled: !isPersonal && open,
    });
    const space = spacesQuery.data?.find((s) => s.id === spaceId);
    const isStrict = space?.budgetMode === "strict";
    const reckoningQuery = trpc.reckoning.listPending.useQuery(
        { spaceId },
        { enabled: !isPersonal && isStrict && open }
    );
    const items = reckoningQuery.data ?? [];
    const blocked = !isPersonal && isStrict && items.length > 0;
    return {
        isPersonal,
        isStrict: !!isStrict,
        items,
        blocked,
        spaceId,
    };
}

export function NewTransactionSheet({ trigger }: { trigger?: React.ReactNode } = {}) {
    const [open, setOpen] = useState(false);
    const [activeType, setActiveType] = useState<TxTab>("expense");
    const [formKey, setFormKey] = useState(0);
    const strict = useSheetStrictGate(open);
    // Save is only disabled when strict-blocked AND the user is on a
    // spending tab. Income always records (server allows it) so the
    // button stays usable on that tab.
    const saveBlocked = strict.blocked && activeType !== "income";
    /* When true, the next successful submit re-renders the form with a fresh
       key (resetting all field state) instead of closing the sheet. Held in a
       ref because the mutation's onSuccess fires before React would observe
       a state change scheduled in the same tick. */
    const addAnotherRef = useRef(false);
    const meta = TAB_META[activeType];
    const LeadIcon = meta.leadIcon;

    const handleDone = () => {
        if (addAnotherRef.current) {
            addAnotherRef.current = false;
            setFormKey((k) => k + 1);
        } else {
            setOpen(false);
        }
    };

    const submitAddAnother = () => {
        addAnotherRef.current = true;
        const form = document.getElementById("nt-form") as HTMLFormElement | null;
        form?.requestSubmit();
    };

    return (
        <Sheet
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) addAnotherRef.current = false;
            }}
        >
            <SheetTrigger asChild>
                {trigger ?? (
                    <Button variant="gradient">
                        <Plus />
                        <span className="hidden sm:inline">New transaction</span>
                        <span className="sm:hidden">New</span>
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent
                side="right"
                className="orbit-shell-host !p-0 sm:max-w-[520px]"
            >
                <SheetTitle className="sr-only">{meta.title}</SheetTitle>
                <OrbitDrawerShell
                    eyebrow={meta.eyebrow}
                    title={meta.title}
                    subtitle={meta.subtitle}
                    leadIcon={<LeadIcon className="size-4" />}
                    leadColor={meta.color}
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            {activeType !== "adjustment" && (
                                <button
                                    type="button"
                                    className="nt-btn"
                                    onClick={submitAddAnother}
                                    disabled={saveBlocked}
                                    title={
                                        saveBlocked
                                            ? "Settle past-month overspends first"
                                            : undefined
                                    }
                                >
                                    Save & add another
                                </button>
                            )}
                            <button
                                type="submit"
                                form="nt-form"
                                className="nt-btn nt-btn-primary"
                                disabled={saveBlocked}
                                title={
                                    saveBlocked
                                        ? "Settle past-month overspends first"
                                        : undefined
                                }
                            >
                                <Check className="size-3.5" />
                                {activeType === "adjustment"
                                    ? "Post adjustment"
                                    : activeType === "transfer"
                                      ? "Transfer"
                                      : "Save transaction"}
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{NT_STYLES}</style>
                    {/* 4-tab type bar */}
                    <div className="nt-tabs" role="tablist">
                        {TAB_ORDER.map((id) => {
                            const m = TAB_META[id];
                            const active = id === activeType;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    className={cn("nt-tab", active && "is-active")}
                                    style={active ? { color: m.color } : undefined}
                                    onClick={() => setActiveType(id)}
                                >
                                    <m.icon className="size-3" />
                                    {m.label}
                                </button>
                            );
                        })}
                    </div>

                    {open && strict.blocked && (
                        <StrictModeBanner
                            activeType={activeType}
                            spaceId={strict.spaceId}
                            items={strict.items}
                        />
                    )}

                    <Tabs
                        value={activeType}
                        onValueChange={(v) => setActiveType(v as TxTab)}
                    >
                        <TabsContent value="income">
                            <IncomeForm key={`income-${formKey}`} onDone={handleDone} />
                        </TabsContent>
                        <TabsContent value="expense">
                            <ExpenseForm key={`expense-${formKey}`} onDone={handleDone} />
                        </TabsContent>
                        <TabsContent value="transfer">
                            <TransferForm key={`transfer-${formKey}`} onDone={handleDone} />
                        </TabsContent>
                        <TabsContent value="adjustment">
                            <AdjustmentForm key={`adjustment-${formKey}`} onDone={handleDone} />
                        </TabsContent>
                    </Tabs>
                </OrbitDrawerShell>
            </SheetContent>
        </Sheet>
    );
}

/**
 * Pre-flight banner: shows when the current space is in Strict mode and
 * there are unresolved past-month overspends. Reading the strict gate
 * BEFORE the user fills out the form is much better UX than letting them
 * write a transaction, hit Save, and only then learn the request is
 * blocked. Income still records (server allows it), so we soften the
 * copy when the user is on that tab.
 *
 * State is fetched once in the parent (`useSheetStrictGate`) and passed
 * in as props so the Save button + this banner share a single source of
 * truth.
 */
function StrictModeBanner({
    activeType,
    spaceId,
    items,
}: {
    activeType: TxTab;
    spaceId: string;
    items: { overBy: number }[];
}) {
    const total = items.reduce((s, i) => s + i.overBy, 0);
    const incomeOk = activeType === "income";

    return (
        <div className="nt-strict-banner">
            <AlertTriangle className="size-4" />
            <div className="nt-strict-banner-text">
                <div className="nt-strict-banner-title">
                    Strict mode: {items.length} past-month overspend
                    {items.length === 1 ? "" : "s"} unresolved
                </div>
                <div className="nt-strict-banner-sub">
                    Total ${total.toFixed(2)}.{" "}
                    {incomeOk
                        ? "Income still records — but expense / transfer / adjust will be blocked until you settle."
                        : "Expense / transfer / adjust are blocked until you settle. Income still records."}
                </div>
            </div>
            <Link
                to={ROUTES.spaceReckoning(spaceId)}
                className="nt-strict-banner-cta"
            >
                Settle now →
            </Link>
        </div>
    );
}

const NT_STYLES = `
.nt-strict-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    margin: 12px 0 4px;
    border-radius: 12px;
    background: color-mix(in oklab, var(--expense) 10%, var(--bg-elev-2));
    border: 1px solid color-mix(in oklab, var(--expense) 35%, transparent);
    color: var(--fg);
}
.nt-strict-banner > svg {
    color: var(--expense);
    margin-top: 1px;
    flex-shrink: 0;
}
.nt-strict-banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.nt-strict-banner-title {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
}
.nt-strict-banner-sub {
    font-size: 11px;
    color: var(--fg-3);
    line-height: 1.4;
}
.nt-strict-banner-cta {
    align-self: center;
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--expense);
    color: var(--bg);
    font-size: 11.5px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition: opacity 140ms ease;
}
.nt-strict-banner-cta:hover {
    opacity: 0.9;
}
.nt-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 4px;
    padding: 4px;
    background: var(--bg-elev-2);
    border-radius: 10px;
    border: 1px solid var(--line-soft);
}
.nt-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 6px;
    border-radius: 7px;
    border: 0;
    background: transparent;
    color: var(--fg-3);
    font-weight: 400;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: background 140ms ease, color 140ms ease;
}
.nt-tab:hover { color: var(--fg-2); }
.nt-tab.is-active {
    background: var(--bg-elev-1);
    color: var(--fg);
    font-weight: 500;
    box-shadow: var(--shadow-1);
}

/* Form layout */
.nt-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 16px;
}

.of-acc-label { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.of-acc-name { color: var(--fg); }
.of-acc-meta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--fg-3);
}
.of-acc-meta::before { content: "·"; margin: 0 2px; color: var(--fg-4); }

/* Native datetime-local — make it editorial-dark and force dark UI */
.nt-form input[type="datetime-local"],
.nt-form input[type="date"] {
    color-scheme: dark;
    color: var(--fg);
    background: transparent;
    /* The native widget needs a hard min-width or iOS Safari clips
       "MM/DD/YYYY, HH:MM AM" to "MM/DD/YYYY, HH:M" inside a flex parent. */
    min-width: 0;
    /* Make the entire visible area tappable rather than just the value text. */
    width: 100%;
}
.nt-form input[type="datetime-local"]::-webkit-calendar-picker-indicator,
.nt-form input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(0.65) sepia(0.1) saturate(0.4);
    cursor: pointer;
    /* On mobile let the native indicator span the full input so the
       tap area covers the whole field, not just a 14×14 corner icon. */
    padding: 0;
    margin: 0;
}


/* Override CategoryTreeSelect's shadcn outline-button trigger so it matches
   the editorial-dark Select look. The combobox role is unique to that comp. */
.orbit-design [role="combobox"] {
    height: 38px !important;
    border-radius: 10px !important;
    background: var(--bg-elev-1) !important;
    border-color: var(--line) !important;
    color: var(--fg) !important;
    font-weight: 400 !important;
    font-size: 13px !important;
    box-shadow: none !important;
    padding-left: 10px !important;
    padding-right: 10px !important;
}
.orbit-design [role="combobox"]:hover {
    background: var(--bg-elev-1) !important;
    border-color: var(--line-strong) !important;
}
.orbit-design [role="combobox"][data-state="open"] {
    border-color: var(--brand) !important;
    box-shadow: 0 0 0 3px var(--brand-soft) !important;
}

/* Envelope-draw chip (expense only) */
.nt-env-row {
    padding: 10px 12px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.nt-env-row-label { font-size: 11.5px; color: var(--fg-3); flex: 1; }
.nt-env-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 9px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--line);
}
.nt-env-card {
    padding: 12px 14px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.nt-env-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}
.nt-env-card-meta {
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.nt-env-warn {
    border-top: 1px dashed var(--line);
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.nt-env-warn-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}
.nt-env-warn-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--expense);
    flex-shrink: 0;
    margin-top: 6px;
}
.nt-env-warn-head-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.nt-env-warn-title {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    line-height: 1.35;
}
.nt-env-warn-sub {
    font-size: 11.5px;
    color: var(--fg-3);
}

.nt-recover-card {
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 140ms ease;
}
.nt-recover-card:hover {
    border-color: var(--line-strong);
}
.nt-recover-card-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.nt-recover-card-title {
    font-size: 12.5px;
    color: var(--fg);
    font-weight: 500;
    line-height: 1.3;
}
.nt-recover-card-hint {
    font-size: 11px;
    color: var(--fg-4);
    line-height: 1.4;
}
.nt-recover-card-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    flex-wrap: wrap;
}
.nt-recover-card-row--end {
    justify-content: flex-end;
}
.nt-recover-select {
    flex: 1 1 180px;
    min-width: 0;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font-size: 12.5px;
    padding: 0 10px;
    font-family: inherit;
    transition: border-color 140ms ease;
}
.nt-recover-select:focus {
    outline: none;
    border-color: var(--brand);
}
.nt-recover-btn {
    height: 36px;
    padding: 0 16px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg-elev-2);
    color: var(--fg);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 140ms ease, border-color 140ms ease;
    white-space: nowrap;
    flex-shrink: 0;
}
.nt-recover-btn:hover:not(:disabled) {
    background: var(--bg-elev-3);
    border-color: var(--line-strong);
}
.nt-recover-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
@media (max-width: 480px) {
    .nt-recover-card-row {
        flex-direction: column;
        align-items: stretch;
    }
    .nt-recover-card-row--end {
        align-items: stretch;
    }
}

/* Transfer swap circle */
.nt-swap {
    display: flex;
    justify-content: center;
    margin: -4px 0;
}
.nt-swap > span {
    width: 36px;
    height: 36px;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: var(--bg-elev-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-2);
}

/* Drift card (adjustment) */
.nt-drift {
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.nt-drift-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.nt-drift-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.nt-drift-eyebrow {
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
}
.nt-drift-num {
    font-family: "Newsreader", Georgia, serif;
    font-size: 24px;
    line-height: 1;
    color: var(--fg);
    font-weight: 500;
    letter-spacing: -0.01em;
    display: flex;
    align-items: baseline;
    gap: 4px;
}
.nt-drift-num .currency { font-size: 14px; color: var(--fg-3); }
.nt-drift-actual-input {
    display: flex;
    align-items: baseline;
    gap: 4px;
    height: 34px;
    padding: 0 10px;
    border-radius: 10px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    transition: border-color 120ms ease, box-shadow 120ms ease;
}
.nt-drift-actual-input:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
}
.nt-drift-actual-input > input {
    flex: 1; min-width: 0; height: 100%;
    border: 0; outline: 0; background: transparent;
    font-family: "Newsreader", Georgia, serif;
    font-size: 22px; color: var(--fg); font-weight: 500;
    padding: 0;
}
.nt-drift-actual-input > input::-webkit-outer-spin-button,
.nt-drift-actual-input > input::-webkit-inner-spin-button {
    -webkit-appearance: none; margin: 0;
}
.nt-drift-actual-input > input { -moz-appearance: textfield; }
.nt-drift-foot { font-size: 10.5px; color: var(--fg-4); }
.nt-drift-divider { height: 1px; background: var(--line-soft); }
.nt-drift-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.nt-drift-summary-label { font-size: 11px; color: var(--fg-3); }
.nt-drift-summary-num {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-family: "Newsreader", Georgia, serif;
    font-size: 26px;
    line-height: 1;
    font-weight: 500;
    letter-spacing: -0.01em;
}
.nt-drift-summary-suffix { font-size: 10px; color: var(--fg-4); letter-spacing: 0.08em; text-transform: uppercase; }
.nt-drift-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 500;
}
.nt-drift-chip > .dot { width: 5px; height: 5px; border-radius: 99px; }

/* Footer buttons */
.nt-btn {
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    color: var(--fg);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 140ms ease, border-color 140ms ease, filter 140ms ease;
}
.nt-btn:hover:not(:disabled):not(.nt-btn-primary) {
    background: var(--bg-elev-2);
    border-color: var(--line-strong);
}
.nt-btn-primary {
    background: var(--brand);
    color: var(--brand-fg);
    border-color: oklch(78% 0.14 165);
}
.nt-btn-primary:hover:not(:disabled) {
    filter: brightness(1.05);
}

/* Scope FileUploadField inside the drawer to look at home */
.orbit-design .nt-form label.text-sm,
.orbit-design .nt-form .text-sm.font-medium {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--fg-2);
    letter-spacing: 0.02em;
}

/* Phone (<640px): tighter tabs, drawer ergonomics. */
@media (max-width: 640px) {
    .nt-tabs { padding: 3px; gap: 3px; }
    .nt-tab { height: 30px; font-size: 11.5px; gap: 5px; padding: 0 6px; }
    .nt-form { gap: 14px; margin-top: 12px; }
    .nt-env-row { padding: 8px 10px; gap: 8px; }
    .nt-env-row-label { font-size: 11px; }
    /* Footer buttons fill the row on phone for big tap targets. */
    .nt-btn { flex: 1 1 auto; justify-content: center; height: 40px; }
}

/* Phone (<480px): single-column drift grid + smaller amount input. */
@media (max-width: 480px) {
    .nt-tab { font-size: 11px; gap: 4px; padding: 0 4px; }
    /* Hide the tab text label, keep the icon, when the screen can't fit
       all four labels comfortably. The lucide icon alone communicates
       expense / income / transfer / adjust. */
    .nt-tab svg { width: 14px; height: 14px; }
    .nt-drift-grid { grid-template-columns: 1fr; gap: 12px; }
    .nt-drift { padding: 14px; }
    .nt-drift-num { font-size: 20px; }
    .nt-drift-summary-num { font-size: 22px; }
}

@media (max-width: 360px) {
    /* On the smallest phones, the four-up tab bar packs into icon-only
       buttons so the drawer header doesn't clip the last tab. */
    .nt-tab {
        gap: 0;
        padding: 0 4px;
        font-size: 0;
    }
    .nt-tab svg { font-size: initial; width: 15px; height: 15px; }
}
`;

function defaultDateTime(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return toInputDateTime(d);
}

/** Render an OrbitSelect of events for the current space, including a
 *  "None" item. Returns null until events are loaded. */
function EventSelect({
    spaceId,
    value,
    onChange,
}: {
    spaceId: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const eventsQuery = trpc.event.listBySpace.useQuery({ spaceId });
    if (!eventsQuery.data) return null;
    const activeEvents = eventsQuery.data.filter((ev) => ev.status === "active");
    if (activeEvents.length === 0) return null;
    const items: OrbitSelectItem[] = [
        { value: "__none", label: "No event" },
        ...activeEvents.map((ev) => ({
            value: ev.id,
            label: ev.name,
            leadIcon: <Calendar className="size-3.5" />,
            leadColor: "var(--ent-5)",
        })),
    ];
    return (
        <OrbitField
            label="Link to event"
            hint="Optional · groups related transactions"
        >
            <OrbitSelect
                value={value || "__none"}
                onValueChange={(v) => onChange(v === "__none" ? "" : v)}
                items={items}
                placeholder="No event"
            />
        </OrbitField>
    );
}

/** Rich status card under the category dropdown — shows the envelope's
 *  current period spent/planned/remaining, and if this transaction would
 *  push it negative, offers two recovery actions: Pull from another
 *  envelope, or Borrow from next month. The transaction can also be saved
 *  as overspend (the warning is informational, not a block). */
function EnvelopeStatusCard({
    spaceId,
    categoryId,
    categories,
    envelopes,
    pendingAmount,
}: {
    spaceId: string;
    categoryId: string | null;
    categories: Category[];
    envelopes: Envelop[];
    pendingAmount: number;
}) {
    const cat = categoryId ? categories.find((c) => c.id === categoryId) : null;
    const envelopeId = cat?.envelop_id ?? null;
    const env = envelopeId
        ? envelopes.find((e) => e.id === envelopeId)
        : null;

    const periodStart = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }, []);
    const periodEnd = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }, []);

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery(
        { spaceId, periodStart, periodEnd },
        { enabled: !!envelopeId }
    );

    const utils = trpc.useUtils();
    const pullIdem = useIdempotencyKey();
    const borrowIdem = useIdempotencyKey();
    const transferMutation = trpc.allocation.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Pulled funds");
            pullIdem.rotate();
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId }),
                utils.analytics.spaceSummary.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });
    const borrowMutation = trpc.envelop.borrowFromNextMonth.useMutation({
        onSuccess: async () => {
            toast.success("Borrowed from next month");
            borrowIdem.rotate();
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId }),
                utils.analytics.spaceSummary.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });
    const [pullSourceId, setPullSourceId] = useState<string>("");

    if (!env) return null;

    const color = env.color || "var(--ent-2)";
    const Icon = getIcon(env.icon ?? null);

    const utilRow = utilizationQuery.data?.find(
        (u) => u.envelopId === env.id
    );
    const allocated = utilRow ? utilRow.allocated + utilRow.carryIn : 0;
    const consumed = utilRow?.consumed ?? 0;
    const remaining = utilRow?.remaining ?? 0;
    const isMonthly = env.cadence === "monthly";

    const overBy =
        pendingAmount > remaining ? pendingAmount - remaining : 0;
    const willOverspend = overBy > 0 && pendingAmount > 0;

    // Other envelopes with positive remaining — sources for the "Pull"
    // picker. Skip archived envelopes; they won't accept allocation
    // changes via transfer either way.
    const pullCandidates = (utilizationQuery.data ?? []).filter(
        (u) => u.envelopId !== env.id && u.remaining > 0 && !u.archived
    );

    return (
        <div className="nt-env-card">
            <div className="nt-env-card-head">
                <span
                    className="nt-env-chip"
                    style={{
                        background: `color-mix(in oklab, ${color} 12%, transparent)`,
                        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
                        color,
                    }}
                >
                    <Icon className="size-3" />
                    {env.name}
                </span>
                <span className="nt-env-card-meta">
                    Spent ${consumed.toFixed(2)} of ${allocated.toFixed(2)}
                    {" · "}
                    <strong
                        style={{
                            color:
                                remaining < 0
                                    ? "var(--expense)"
                                    : "var(--fg)",
                        }}
                    >
                        ${remaining.toFixed(2)} left
                    </strong>
                </span>
            </div>

            {willOverspend && (
                <div className="nt-env-warn">
                    <div className="nt-env-warn-head">
                        <span className="nt-env-warn-dot" />
                        <div className="nt-env-warn-head-text">
                            <span className="nt-env-warn-title">
                                Will overspend {env.name} by{" "}
                                <span className="tabular">
                                    ${overBy.toFixed(2)}
                                </span>
                            </span>
                            <span className="nt-env-warn-sub">
                                Save as-is, or recover with one of these:
                            </span>
                        </div>
                    </div>

                    {pullCandidates.length > 0 && (
                        <div className="nt-recover-card">
                            <div className="nt-recover-card-head">
                                <span className="nt-recover-card-title">
                                    Pull from another envelope
                                </span>
                                <span className="nt-recover-card-hint">
                                    Move ${overBy.toFixed(2)} of plan from
                                    another bucket into {env.name}.
                                </span>
                            </div>
                            <div className="nt-recover-card-row">
                                <select
                                    className="nt-recover-select"
                                    value={pullSourceId}
                                    onChange={(e) =>
                                        setPullSourceId(e.target.value)
                                    }
                                >
                                    <option value="">
                                        Choose source envelope…
                                    </option>
                                    {pullCandidates.map((c) => (
                                        <option
                                            key={c.envelopId}
                                            value={c.envelopId}
                                        >
                                            {c.name} · $
                                            {c.remaining.toFixed(2)} left
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="nt-recover-btn"
                                    disabled={
                                        !pullSourceId ||
                                        transferMutation.isPending
                                    }
                                    onClick={() =>
                                        transferMutation.mutate({
                                            amount: overBy,
                                            from: {
                                                kind: "envelop",
                                                envelopId: pullSourceId,
                                            },
                                            to: {
                                                kind: "envelop",
                                                envelopId: env.id,
                                            },
                                            idempotencyKey: pullIdem.key,
                                        })
                                    }
                                >
                                    {transferMutation.isPending
                                        ? "Pulling…"
                                        : `Pull $${overBy.toFixed(2)}`}
                                </button>
                            </div>
                        </div>
                    )}

                    {isMonthly && (
                        <div className="nt-recover-card">
                            <div className="nt-recover-card-head">
                                <span className="nt-recover-card-title">
                                    Borrow from next month
                                </span>
                                <span className="nt-recover-card-hint">
                                    Adds ${overBy.toFixed(2)} to{" "}
                                    {env.name} now and removes the same from
                                    next month's plan.
                                </span>
                            </div>
                            <div className="nt-recover-card-row nt-recover-card-row--end">
                                <button
                                    type="button"
                                    className="nt-recover-btn"
                                    disabled={borrowMutation.isPending}
                                    onClick={() =>
                                        borrowMutation.mutate({
                                            envelopId: env.id,
                                            amount: overBy,
                                            idempotencyKey: borrowIdem.key,
                                        })
                                    }
                                >
                                    {borrowMutation.isPending
                                        ? "Borrowing…"
                                        : `Borrow $${overBy.toFixed(2)}`}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ============================================================
   INCOME FORM
   ============================================================ */
function IncomeForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const invalidate = useInvalidateAnalytics();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [accountId, setAccountId] = useState("");
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const accountItems = useMemo(
        () => (accountsQuery.data ?? []).map(toAccountItem),
        [accountsQuery.data]
    );

    const idem = useIdempotencyKey();
    const mutate = trpc.transaction.income.useMutation({
        onSuccess: async () => {
            toast.success("Income recorded");
            idem.rotate();
            await invalidate(spaceId);
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <form
            id="nt-form"
            className="nt-form"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (mutate.isPending) return;
                if (!accountId) {
                    toast.error("Pick an account");
                    return;
                }
                mutate.mutate({
                    spaceId,
                    accountId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    location: location || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                    idempotencyKey: idem.key,
                });
            }}
        >
            <OrbitAmountCard
                value={amount}
                onChange={setAmount}
                tone="income"
                autoFocus
            />

            <OrbitFieldRow>
                <OrbitField label="Date">
                    <OrbitInput
                        type="datetime-local"
                        value={datetime}
                        onChange={(e) => setDatetime(e.target.value)}
                        leadIcon={<Calendar className="size-3.5" />}
                    />
                </OrbitField>
                <OrbitField label="Account" required>
                    <OrbitSelect
                        value={accountId}
                        onValueChange={setAccountId}
                        items={accountItems}
                        placeholder="Choose account"
                        leadIcon={<Wallet className="size-3.5" />}
                        leadColor="var(--ent-1)"
                    />
                </OrbitField>
            </OrbitFieldRow>

            <OrbitField label="Source / Payer" hint="Optional">
                <OrbitInput
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Acme Corp · Salary"
                />
            </OrbitField>

            <OrbitField label="Location" hint="Optional">
                <OrbitInput
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where did this happen?"
                />
            </OrbitField>

            <EventSelect spaceId={spaceId} value={eventId} onChange={setEventId} />

            <OrbitField label="Receipts" hint="Optional · PNG · JPG · PDF">
                <FileUploadField
                    purpose="transaction_receipt"
                    fileIds={attachmentFileIds}
                    onChange={setAttachmentFileIds}
                    label=""
                />
            </OrbitField>

            <OrbitInfoPill tone="brand">
                Income lands in the chosen account immediately and appears in the
                ledger and analytics.
            </OrbitInfoPill>
        </form>
    );
}

/* ============================================================
   EXPENSE FORM
   ============================================================ */
function ExpenseForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const envelopesQuery = trpc.envelop.listBySpace.useQuery({ spaceId });
    const invalidate = useInvalidateAnalytics();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [sourceAccountId, setSource] = useState("");
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const accountItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter((a) => a.account_type !== "locked")
                .filter(ownedByMe)
                .map(toAccountItem),
        [accountsQuery.data]
    );

    // Filter categories whose envelope is archived. Server blocks new
    // transactions against them anyway; filtering here means the user
    // never sees them as a selectable option to begin with.
    const activeCategories = useMemo(() => {
        const cats = categoriesQuery.data ?? [];
        const envs = envelopesQuery.data ?? [];
        const archivedEnvIds = new Set(
            envs.filter((e) => e.archived).map((e) => e.id)
        );
        if (archivedEnvIds.size === 0) return cats;
        return cats.filter((c) => !archivedEnvIds.has(c.envelop_id));
    }, [categoriesQuery.data, envelopesQuery.data]);

    const idem = useIdempotencyKey();
    const mutate = trpc.transaction.expense.useMutation({
        onSuccess: async () => {
            toast.success("Expense recorded");
            idem.rotate();
            await invalidate(spaceId);
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <form
            id="nt-form"
            className="nt-form"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (mutate.isPending) return;
                if (!sourceAccountId || !categoryId) {
                    toast.error("Pick an account and category");
                    return;
                }
                mutate.mutate({
                    spaceId,
                    sourceAccountId,
                    expense_category_id: categoryId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    location: location || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                    idempotencyKey: idem.key,
                });
            }}
        >
            <OrbitAmountCard
                value={amount}
                onChange={setAmount}
                tone="fg"
                autoFocus
            />

            <OrbitField
                label="Category"
                hint="Envelope is inferred from the category"
                required
            >
                <CategoryTreeSelect
                    categories={activeCategories as any}
                    value={categoryId}
                    onChange={setCategoryId}
                    placeholder="Choose category"
                    allowAll={false}
                />
            </OrbitField>

            <EnvelopeStatusCard
                spaceId={spaceId}
                categoryId={categoryId}
                categories={(categoriesQuery.data ?? []) as Category[]}
                envelopes={(envelopesQuery.data ?? []) as Envelop[]}
                pendingAmount={Number(amount) || 0}
            />

            <OrbitFieldRow>
                <OrbitField label="Date">
                    <OrbitInput
                        type="datetime-local"
                        value={datetime}
                        onChange={(e) => setDatetime(e.target.value)}
                        leadIcon={<Calendar className="size-3.5" />}
                    />
                </OrbitField>
                <OrbitField label="Account" required>
                    <OrbitSelect
                        value={sourceAccountId}
                        onValueChange={setSource}
                        items={accountItems}
                        placeholder="Choose account"
                        leadIcon={<Wallet className="size-3.5" />}
                        leadColor="var(--ent-1)"
                    />
                </OrbitField>
            </OrbitFieldRow>

            <OrbitField label="Payee" hint="Optional · helps recognize this entry later">
                <OrbitInput
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tartine Bakery"
                />
            </OrbitField>

            <OrbitField label="Location" hint="Optional">
                <OrbitInput
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where did this happen?"
                />
            </OrbitField>

            <EventSelect spaceId={spaceId} value={eventId} onChange={setEventId} />

            <OrbitField label="Receipts" hint="Optional · PNG · JPG · PDF">
                <FileUploadField
                    purpose="transaction_receipt"
                    fileIds={attachmentFileIds}
                    onChange={setAttachmentFileIds}
                    label=""
                />
            </OrbitField>
        </form>
    );
}

/* ============================================================
   TRANSFER FORM
   ============================================================ */
function TransferForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const envelopesQuery = trpc.envelop.listBySpace.useQuery({ spaceId });
    const invalidate = useInvalidateAnalytics();

    const activeFeeCategories = useMemo(() => {
        const cats = categoriesQuery.data ?? [];
        const envs = envelopesQuery.data ?? [];
        const archived = new Set(envs.filter((e) => e.archived).map((e) => e.id));
        if (archived.size === 0) return cats;
        return cats.filter((c) => !archived.has(c.envelop_id));
    }, [categoriesQuery.data, envelopesQuery.data]);

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [sourceAccountId, setSource] = useState("");
    const [destinationAccountId, setDest] = useState("");
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);
    // Optional fee that banks / ATMs / FX providers skim off the top.
    // When enabled, the source is debited `amount + fee` while the
    // destination still receives `amount`. The fee shows up in every
    // analytics view via its category — see project-spec §11.6.
    const [feeEnabled, setFeeEnabled] = useState(false);
    const [feeAmount, setFeeAmount] = useState("");
    const [feeCategoryId, setFeeCategoryId] = useState<string | null>(null);

    const sourceItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter((a) => a.account_type !== "locked")
                .filter(ownedByMe)
                .map(toAccountItem),
        [accountsQuery.data]
    );

    const destItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter((a) => a.id !== sourceAccountId)
                .map(toAccountItem),
        [accountsQuery.data, sourceAccountId]
    );

    const idem = useIdempotencyKey();
    const mutate = trpc.transaction.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Transfer recorded");
            idem.rotate();
            await invalidate(spaceId);
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const feeNum = feeEnabled ? Number(feeAmount) : 0;
    const amountNum = Number(amount);
    const totalOut = (amountNum || 0) + (Number.isFinite(feeNum) ? feeNum : 0);

    return (
        <form
            id="nt-form"
            className="nt-form"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (mutate.isPending) return;
                if (!sourceAccountId || !destinationAccountId) {
                    toast.error("Pick both accounts");
                    return;
                }
                if (sourceAccountId === destinationAccountId) {
                    toast.error("Source and destination must differ");
                    return;
                }
                if (feeEnabled) {
                    if (!(feeNum > 0)) {
                        toast.error("Fee must be greater than 0");
                        return;
                    }
                    if (!feeCategoryId) {
                        toast.error("Pick a category for the fee");
                        return;
                    }
                }
                mutate.mutate({
                    spaceId,
                    sourceAccountId,
                    destinationAccountId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                    feeAmount: feeEnabled ? feeNum : undefined,
                    feeExpenseCategoryId:
                        feeEnabled && feeCategoryId ? feeCategoryId : undefined,
                    idempotencyKey: idem.key,
                });
            }}
        >
            <OrbitField label="From" required>
                <OrbitSelect
                    value={sourceAccountId}
                    onValueChange={setSource}
                    items={sourceItems}
                    placeholder="Choose source account"
                    leadIcon={<Wallet className="size-3.5" />}
                    leadColor="var(--ent-1)"
                />
            </OrbitField>

            <div className="nt-swap" aria-hidden>
                <span>
                    <ArrowDown className="size-3.5" />
                </span>
            </div>

            <OrbitField label="To" required>
                <OrbitSelect
                    value={destinationAccountId}
                    onValueChange={setDest}
                    items={destItems}
                    placeholder="Choose destination account"
                    leadIcon={<Wallet className="size-3.5" />}
                    leadColor="var(--ent-3)"
                />
            </OrbitField>

            <OrbitAmountCard
                value={amount}
                onChange={setAmount}
                tone="brand"
            />

            <OrbitField label="Date">
                <OrbitInput
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                    leadIcon={<Calendar className="size-3.5" />}
                />
            </OrbitField>

            <OrbitToggle
                checked={feeEnabled}
                onChange={setFeeEnabled}
                label="There's a fee on this transfer"
                hint="Wire fee, ATM fee, FX margin. Deducted from source on top of the amount and logged as a regular expense."
            />

            {feeEnabled && (
                <OrbitFieldRow>
                    <OrbitField label="Fee amount" hint="Charged by source">
                        <OrbitInput
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={feeAmount}
                            onChange={(e) => setFeeAmount(e.target.value)}
                            placeholder="0.00"
                            prefix="$"
                        />
                    </OrbitField>
                    <OrbitField label="Fee category" hint="Where the fee is logged">
                        <CategoryTreeSelect
                            categories={activeFeeCategories as any}
                            value={feeCategoryId}
                            onChange={setFeeCategoryId}
                            placeholder="Pick category"
                            allowAll={false}
                        />
                    </OrbitField>
                </OrbitFieldRow>
            )}

            {feeEnabled && amountNum > 0 && feeNum > 0 && (
                <FeeBreakdown
                    totalOut={totalOut}
                    delivered={amountNum}
                    fee={feeNum}
                />
            )}

            <OrbitField label="Memo" hint="Optional">
                <OrbitInput
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Monthly emergency-fund top-up"
                />
            </OrbitField>

            <EventSelect spaceId={spaceId} value={eventId} onChange={setEventId} />

            <OrbitField label="Receipts" hint="Optional · PNG · JPG · PDF">
                <FileUploadField
                    purpose="transaction_receipt"
                    fileIds={attachmentFileIds}
                    onChange={setAttachmentFileIds}
                    label=""
                />
            </OrbitField>

            <OrbitInfoPill tone="transfer">
                Transfers don't show up in income/expense totals. They're recorded as
                a paired (out, in) ledger entry.
            </OrbitInfoPill>
        </form>
    );
}

function FeeBreakdown({
    totalOut,
    delivered,
    fee,
}: {
    totalOut: number;
    delivered: number;
    fee: number;
}) {
    return (
        <div
            style={{
                background: "var(--bg-elev-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 10,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 11,
            }}
        >
            <FeeRow
                label="Source debited"
                value={`−$${totalOut.toFixed(2)}`}
                strong
            />
            <FeeRow label="Destination credited" value={`+$${delivered.toFixed(2)}`} />
            <FeeRow
                label="Fee (lost to provider)"
                value={`$${fee.toFixed(2)}`}
                tone="expense"
            />
        </div>
    );
}

function FeeRow({
    label,
    value,
    strong,
    tone,
}: {
    label: ReactNode;
    value: ReactNode;
    strong?: boolean;
    tone?: "expense";
}) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--fg-3)" }}>
            <span>{label}</span>
            <span
                style={{
                    fontFamily: "var(--font-mono, ui-monospace), monospace",
                    fontVariantNumeric: "tabular-nums",
                    color:
                        tone === "expense"
                            ? "var(--expense)"
                            : strong
                              ? "var(--fg)"
                              : "var(--fg-2)",
                    fontWeight: strong ? 600 : 400,
                }}
            >
                {value}
            </span>
        </div>
    );
}

/* ============================================================
   ADJUSTMENT FORM
   ============================================================ */
type AdjReason = "bank-fee" | "missed" | "rounding";

function AdjustmentForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const invalidate = useInvalidateAnalytics();

    const [accountId, setAccountId] = useState("");
    const [newBalance, setNewBalance] = useState("");
    const [description, setDescription] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [reason, setReason] = useState<AdjReason>("bank-fee");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const adjustableItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter(ownedByMe)
                .map(toAccountItem),
        [accountsQuery.data]
    );

    const idem = useIdempotencyKey();
    const mutate = trpc.transaction.adjust.useMutation({
        onSuccess: async () => {
            toast.success("Balance adjusted");
            idem.rotate();
            await invalidate(spaceId);
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const selected = (accountsQuery.data ?? []).find((a) => a.id === accountId);
    const orbitBalance = selected ? Number(selected.balance) : 0;
    const actualBalance = newBalance === "" ? null : Number(newBalance);
    const delta =
        actualBalance != null && Number.isFinite(actualBalance)
            ? actualBalance - orbitBalance
            : null;
    const isIncrease = delta != null && delta >= 0;

    return (
        <form
            id="nt-form"
            className="nt-form"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (mutate.isPending) return;
                if (!accountId) {
                    toast.error("Pick an account");
                    return;
                }
                const reasonText =
                    reason === "bank-fee"
                        ? "Bank correction"
                        : reason === "missed"
                          ? "Missed transaction"
                          : "Rounding / FX";
                const finalDesc = description.trim()
                    ? `${reasonText} — ${description.trim()}`
                    : reasonText;
                mutate.mutate({
                    spaceId,
                    accountId,
                    newBalance: Number(newBalance),
                    datetime: fromInputDateTime(datetime),
                    description: finalDesc,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                    idempotencyKey: idem.key,
                });
            }}
        >
            <OrbitField label="Account" required>
                <OrbitSelect
                    value={accountId}
                    onValueChange={setAccountId}
                    items={adjustableItems}
                    placeholder="Choose account"
                    leadIcon={<Wallet className="size-3.5" />}
                    leadColor="var(--ent-1)"
                />
            </OrbitField>

            {/* Drift card */}
            <div className="nt-drift">
                <div className="nt-drift-grid">
                    <div className="nt-drift-col">
                        <span className="nt-drift-eyebrow">Orbit balance</span>
                        <div className="nt-drift-num">
                            <span className="currency">$</span>
                            {selected
                                ? formatNum(orbitBalance)
                                : "0.00"}
                        </div>
                        <span className="nt-drift-foot">
                            {selected
                                ? `as of ${new Date().toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                  })}`
                                : "Pick an account first"}
                        </span>
                    </div>
                    <div className="nt-drift-col">
                        <span className="nt-drift-eyebrow">Actual balance</span>
                        <div className="nt-drift-actual-input">
                            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>$</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={newBalance}
                                onChange={(e) => setNewBalance(e.target.value)}
                                placeholder="0.00"
                                required
                            />
                        </div>
                        <span className="nt-drift-foot">What does your bank say?</span>
                    </div>
                </div>

                <div className="nt-drift-divider" />

                <div className="nt-drift-summary">
                    <div className="nt-drift-col">
                        <span className="nt-drift-summary-label">
                            Adjustment posted
                        </span>
                        <span
                            className="nt-drift-summary-num"
                            style={{
                                color:
                                    delta == null
                                        ? "var(--fg-3)"
                                        : isIncrease
                                          ? "var(--income)"
                                          : "var(--expense)",
                            }}
                        >
                            {delta == null ? (
                                <>—</>
                            ) : (
                                <>
                                    {isIncrease ? (
                                        <ArrowUp
                                            className="size-3.5"
                                            style={{ color: "var(--income)" }}
                                        />
                                    ) : (
                                        <ArrowDown
                                            className="size-3.5"
                                            style={{ color: "var(--expense)" }}
                                        />
                                    )}
                                    {formatNum(Math.abs(delta))}
                                    <span className="nt-drift-summary-suffix">USD</span>
                                </>
                            )}
                        </span>
                    </div>
                    <span
                        className="nt-drift-chip"
                        style={
                            delta == null
                                ? {
                                      background: "var(--bg-elev-1)",
                                      color: "var(--fg-3)",
                                      border: "1px solid var(--line)",
                                  }
                                : isIncrease
                                  ? {
                                        background: "var(--income-soft)",
                                        color: "var(--income)",
                                        border: "1px solid var(--income)",
                                    }
                                  : {
                                        background: "var(--expense-soft)",
                                        color: "var(--expense)",
                                        border: "1px solid var(--expense)",
                                    }
                        }
                    >
                        <span
                            className="dot"
                            style={{
                                background:
                                    delta == null
                                        ? "var(--fg-3)"
                                        : isIncrease
                                          ? "var(--income)"
                                          : "var(--expense)",
                            }}
                        />
                        {delta == null
                            ? "No drift"
                            : isIncrease
                              ? "Increase"
                              : "Decrease"}
                    </span>
                </div>
            </div>

            <OrbitField label="Reason" hint="Required for audit trail" required>
                <OrbitRadioRow
                    name="adj-reason"
                    value={reason}
                    onChange={setReason}
                    accent="var(--gold)"
                    options={[
                        {
                            value: "bank-fee",
                            label: "Bank correction",
                            hint: "Fees · interest · refunds",
                        },
                        {
                            value: "missed",
                            label: "Missed transaction",
                            hint: "Forgot to log",
                        },
                        {
                            value: "rounding",
                            label: "Rounding / FX",
                            hint: "Pennies & exchange",
                        },
                    ]}
                />
            </OrbitField>

            <OrbitField label="Date">
                <OrbitInput
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                    leadIcon={<Calendar className="size-3.5" />}
                />
            </OrbitField>

            <OrbitField label="Notes" hint="Optional but recommended">
                <OrbitTextarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Bank credited interest for April — caught at month-end reconcile."
                />
            </OrbitField>

            <OrbitField label="Receipts" hint="Optional · PNG · JPG · PDF">
                <FileUploadField
                    purpose="transaction_receipt"
                    fileIds={attachmentFileIds}
                    onChange={setAttachmentFileIds}
                    label=""
                />
            </OrbitField>

            <OrbitInfoPill tone="gold">
                Adjustments don't appear in income or expense totals — they correct
                your account balance only. They show as <b>adj</b> entries in the
                ledger.
            </OrbitInfoPill>
        </form>
    );
}

/* Format a number with thousand separators + 2 decimals. Defensive against
   NaN — falls back to "0.00". */
function formatNum(n: number): string {
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/* These imports are referenced but unused; keep them tree-shakable. */
void Briefcase;
void Tag;
