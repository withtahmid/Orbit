import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
    Search,
    Home,
    Wallet,
    ArrowLeftRight,
    Mail,
    FolderTree,
    Calendar,
    BarChart3,
    Settings,
    Plus,
    LineChart,
    BookOpen,
    ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";

type Item = {
    id: string;
    label: string;
    hint?: string;
    icon: LucideIcon;
    /** Keyboard shortcut to display (e.g. "G O", "N T") */
    shortcut?: string;
    onSelect: () => void;
};

type Group = {
    name: string;
    items: Item[];
};

/**
 * Editorial-dark Command Palette — opens with ⌘K (or Ctrl+K). Provides:
 *  - Jump-to navigation (Overview · Accounts · Transactions · …)
 *  - Create entries (New transaction · transfer · envelope · …)
 *  - Recent transactions (live from the current space)
 *  - Fuzzy filter via the search input
 *  - Keyboard nav (↑/↓ select, ↵ open, ⌘K close)
 */
export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    /* Global ⌘K / Ctrl+K toggle. */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    /* Reset state on open and focus the input. */
    useEffect(() => {
        if (open) {
            setQuery("");
            setActiveIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="orbit-shell-host cp-dialog">
                <DialogTitle className="sr-only">Command palette</DialogTitle>
                <CommandPaletteBody
                    query={query}
                    setQuery={setQuery}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                    inputRef={inputRef}
                    onClose={() => setOpen(false)}
                />
            </DialogContent>
        </Dialog>
    );
}

function CommandPaletteBody({
    query,
    setQuery,
    activeIndex,
    setActiveIndex,
    inputRef,
    onClose,
}: {
    query: string;
    setQuery: (s: string) => void;
    activeIndex: number;
    setActiveIndex: (n: number | ((p: number) => number)) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onClose: () => void;
}) {
    const { space } = useCurrentSpace();
    const navigate = useNavigate();
    const { authStore } = useStore();

    const isPersonal = space.isPersonal;

    /* Recent transactions — only fetch on a real space; in personal mode
       use the personal cross-space variant. */
    const recentSpaceQuery = trpc.transaction.listBySpace.useQuery(
        { spaceId: space.id, limit: 4 },
        { enabled: !isPersonal }
    );
    const recentPersonalQuery = trpc.personal.transactions.useQuery(
        { limit: 4 },
        { enabled: isPersonal }
    );
    const recent = isPersonal ? recentPersonalQuery : recentSpaceQuery;

    const go = useCallback(
        (path: string) => {
            navigate(path);
            onClose();
        },
        [navigate, onClose]
    );

    /* Item registry — flat list of every selectable. Groups partition for
       display only; the keyboard cursor walks the flat list. */
    const groups: Group[] = useMemo(() => {
        const jumpTo: Item[] = [
            {
                id: "go-overview",
                label: "Overview",
                icon: Home,
                shortcut: "G O",
                onSelect: () => go(ROUTES.spaceOverview(space.id)),
            },
            {
                id: "go-accounts",
                label: "Accounts",
                icon: Wallet,
                shortcut: "G A",
                onSelect: () => go(ROUTES.spaceAccounts(space.id)),
            },
            {
                id: "go-transactions",
                label: "Transactions",
                icon: ArrowLeftRight,
                shortcut: "G T",
                onSelect: () => go(ROUTES.spaceTransactions(space.id)),
            },
            {
                id: "go-budgets",
                label: "Budgets",
                icon: Mail,
                shortcut: "G E",
                onSelect: () => go(ROUTES.spaceBudgets(space.id)),
            },
            {
                id: "go-categories",
                label: "Categories",
                icon: FolderTree,
                shortcut: "G C",
                onSelect: () => go(ROUTES.spaceCategories(space.id)),
            },
            {
                id: "go-events",
                label: "Events",
                icon: Calendar,
                shortcut: "G V",
                onSelect: () => go(ROUTES.spaceEvents(space.id)),
            },
            {
                id: "go-analytics",
                label: "Analytics",
                icon: BarChart3,
                shortcut: "G N",
                onSelect: () => go(ROUTES.spaceAnalytics(space.id)),
            },
            {
                id: "go-settings",
                label: "Settings",
                icon: Settings,
                shortcut: "G S",
                onSelect: () => go(ROUTES.spaceSettings(space.id)),
            },
        ];

        const create: Item[] = [
            {
                id: "create-transaction",
                label: "New transaction",
                icon: Plus,
                shortcut: "N T",
                onSelect: () => {
                    /* TODO(api): integrate with NewTransactionSheet's controlled
                       open state. For now, route to transactions where the
                       sheet trigger lives. */
                    go(ROUTES.spaceTransactions(space.id));
                },
            },
            {
                id: "create-transfer",
                label: "New transfer",
                icon: ArrowLeftRight,
                shortcut: "N R",
                onSelect: () => go(ROUTES.spaceTransactions(space.id)),
            },
            {
                id: "create-envelope",
                label: "New envelope",
                icon: Mail,
                shortcut: "N E",
                onSelect: () => go(ROUTES.spaceBudgets(space.id)),
            },
        ];

        const utility: Item[] = [
            {
                id: "switch-space",
                label: "Switch space",
                icon: ArrowLeftRight,
                onSelect: () => go(ROUTES.spaces),
            },
            {
                id: "my-money",
                label: "My money",
                icon: LineChart,
                onSelect: () => go(ROUTES.space("me")),
            },
            {
                id: "docs",
                label: "Docs",
                icon: BookOpen,
                onSelect: () => go(ROUTES.docs),
            },
        ];

        /* Recent transactions — stable id format so they don't collide with
           static items if the user types fast. */
        const recentItems: Item[] = (recent.data?.items ?? [])
            .slice(0, 4)
            .map((t) => {
                const amount = Number(t.amount);
                const sign =
                    (t.type as unknown as string) === "income"
                        ? "+"
                        : (t.type as unknown as string) === "expense"
                          ? "−"
                          : "";
                const amt = `${sign}${Math.abs(amount).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`;
                const desc = t.description || "Transaction";
                return {
                    id: `recent-${t.id}`,
                    label: `${desc} · ${amt}`,
                    icon: ArrowLeftRight,
                    onSelect: () => go(ROUTES.spaceTransactions(space.id)),
                };
            });

        return [
            { name: "Jump to", items: jumpTo },
            { name: "Create", items: create },
            { name: "Utility", items: utility },
            ...(recentItems.length > 0
                ? [{ name: "Recent", items: recentItems }]
                : []),
        ];
    }, [go, space.id, recent.data]);

    /* Filter groups by query. Match against label + hint. */
    const filteredGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return groups;
        return groups
            .map((g) => ({
                name: g.name,
                items: g.items.filter(
                    (i) =>
                        i.label.toLowerCase().includes(q) ||
                        (i.hint?.toLowerCase().includes(q) ?? false)
                ),
            }))
            .filter((g) => g.items.length > 0);
    }, [groups, query]);

    /* Flat ordered list for keyboard cursor. */
    const flat = useMemo(
        () => filteredGroups.flatMap((g) => g.items),
        [filteredGroups]
    );

    /* Keep activeIndex in bounds when filter results shrink. */
    useEffect(() => {
        if (activeIndex >= flat.length) setActiveIndex(0);
    }, [flat.length, activeIndex, setActiveIndex]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const it = flat[activeIndex];
            if (it) it.onSelect();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    };

    const userInitial =
        authStore.user?.name?.[0]?.toUpperCase() ??
        authStore.user?.email?.[0]?.toUpperCase() ??
        "?";
    void userInitial;

    return (
        <div className="orbit-design cp-root">
            <style>{CP_STYLES}</style>
            <div className="cp-search">
                <Search
                    className="size-4"
                    style={{ color: "var(--fg-3)" }}
                    aria-hidden
                />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type to search…"
                    className="cp-input"
                    spellCheck={false}
                    autoComplete="off"
                />
                <span className="cp-esc">esc</span>
            </div>
            <div className="cp-body" role="listbox">
                {flat.length === 0 ? (
                    <div className="cp-empty">No results for &ldquo;{query}&rdquo;</div>
                ) : (
                    filteredGroups.map((g) => (
                        <div key={g.name} className="cp-group">
                            <div className="cp-group-head">{g.name}</div>
                            {g.items.map((it) => {
                                const flatIndex = flat.indexOf(it);
                                const active = flatIndex === activeIndex;
                                return (
                                    <button
                                        key={it.id}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        className={`cp-item ${active ? "is-active" : ""}`}
                                        onMouseEnter={() => setActiveIndex(flatIndex)}
                                        onClick={it.onSelect}
                                    >
                                        <it.icon
                                            className="size-3.5 cp-item-icon"
                                            style={{
                                                color: active
                                                    ? "var(--brand)"
                                                    : "var(--fg-3)",
                                            }}
                                        />
                                        <span className="cp-item-label">{it.label}</span>
                                        {it.shortcut && (
                                            <span className="cp-shortcut mono">
                                                {it.shortcut}
                                            </span>
                                        )}
                                        {active && (
                                            <ArrowRight
                                                className="size-3"
                                                style={{ color: "var(--brand)" }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>
            <div className="cp-foot">
                <Hint icon="↑↓" label="navigate" />
                <Hint icon="↵" label="open" />
                <Hint icon="⌘K" label="close" />
                <span className="cp-tip">
                    Tip: type <span className="cp-kbd mono">?</span> for shortcut help
                </span>
            </div>
        </div>
    );
}

function Hint({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <span className="cp-hint">
            <span className="cp-kbd mono">{icon}</span>
            {label}
        </span>
    );
}

const CP_STYLES = `
.cp-dialog {
    /* shadcn DialogContent overrides */
    width: min(640px, calc(100vw - 32px));
    max-width: none;
    top: 96px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    padding: 0 !important;
    background: transparent !important;
    border: 0 !important;
    box-shadow: none !important;
}

.cp-root {
    background: var(--bg-elev-1);
    border: 1px solid var(--line-strong);
    border-radius: 18px;
    color: var(--fg);
    font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 32px 80px -16px rgb(0 0 0 / 0.7),
        0 1px 0 0 var(--inset-hi) inset;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.cp-search {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
}
.cp-input {
    flex: 1;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--fg);
    font-size: 15px;
    font-family: inherit;
    min-width: 0;
}
.cp-input::placeholder { color: var(--fg-4); }
.cp-esc {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg-3);
    font-size: 10px;
}

.cp-body {
    padding: 8px;
    max-height: 360px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.cp-empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--fg-4);
    font-size: 13px;
}
.cp-group { display: flex; flex-direction: column; }
.cp-group-head {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
    padding: 8px 12px 4px;
}
.cp-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: var(--fg-2);
    font-size: 13.5px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 100ms ease, color 100ms ease;
}
.cp-item.is-active {
    background: var(--brand-soft);
    color: var(--fg);
    font-weight: 500;
}
.cp-item-icon { flex-shrink: 0; }
.cp-item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cp-shortcut {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg-3);
    font-size: 10px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
}

.cp-foot {
    padding: 10px 14px;
    border-top: 1px solid var(--line);
    background: var(--bg);
    display: flex;
    gap: 14px;
    font-size: 11px;
    color: var(--fg-4);
    flex-wrap: wrap;
}
.cp-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.cp-tip {
    margin-left: auto;
}
.cp-kbd {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg-3);
    font-size: 10px;
    font-family: "Geist Mono", ui-monospace, monospace;
}
`;
