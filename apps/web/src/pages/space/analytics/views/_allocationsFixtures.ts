/**
 * Static fixtures for the Allocation map and Allocation matrix views.
 * Kept in one place so the four allocation surfaces stay consistent —
 * the same envelopes, accounts and per-cell amounts appear across all
 * tabs and the matrix.
 *
 * Numbers are illustrative only. When the backend is ready, replace
 * each consumer's `import` with a tRPC query that returns the same
 * shape.
 */

export type DummyAccount = {
    id: string;
    name: string;
    color: string;
    icon: string;
    /** "asset" | "liability" | "locked" — drives the Totals partition. */
    kind: "asset" | "liability" | "locked";
    balance: number;
};

export type DummyEnvelope = {
    id: string;
    name: string;
    color: string;
    icon: string;
};

export type DummyPlan = {
    id: string;
    name: string;
    color: string;
    icon: string;
    allocated: number;
    accountId: string;
};

export const ACCOUNTS: DummyAccount[] = [
    { id: "checking", name: "Checking", color: "#10b981", icon: "wallet", kind: "asset", balance: 7511.5 },
    { id: "brokerage", name: "Brokerage", color: "#a855f7", icon: "chart", kind: "asset", balance: 50334 },
    { id: "credit", name: "Credit Card", color: "#ef4444", icon: "credit", kind: "liability", balance: 45795 },
    { id: "cash", name: "Cash Wallet", color: "#0ea5e9", icon: "wallet", kind: "asset", balance: 1820 },
    { id: "mobile", name: "Mobile Money", color: "#22d3ee", icon: "wallet", kind: "asset", balance: 980 },
    { id: "retire", name: "Retirement", color: "#f59e0b", icon: "pig", kind: "locked", balance: 66109 },
];

export const ENVELOPES: DummyEnvelope[] = [
    { id: "subscriptions", name: "Subscriptions", color: "#f59e0b", icon: "repeat" },
    { id: "selfcare", name: "Self Care", color: "#3b82f6", icon: "heart" },
    { id: "hobbies", name: "Hobbies", color: "#22d3ee", icon: "sparkle" },
    { id: "books", name: "Books & Learning", color: "#84cc16", icon: "folder" },
    { id: "coffee", name: "Coffee", color: "#fb923c", icon: "coffee" },
    { id: "fitness", name: "Fitness", color: "#10b981", icon: "flame" },
    { id: "tech", name: "Tech & Gadgets", color: "#a855f7", icon: "terminal" },
    { id: "groceries", name: "Groceries", color: "#ef4444", icon: "cart" },
];

/**
 * Per-(envelope, account) allocation amount in dollars. Indexed
 * `MATRIX[envelopeId][accountId]`. Missing entry = no contribution.
 *
 * The `unassigned` key represents allocations not yet routed to any
 * concrete account — surfaced as a "Unassigned" column in the matrix
 * and the leftover slate-colored segment in stacked bars.
 */
export const MATRIX: Record<
    string,
    Partial<Record<DummyAccount["id"] | "unassigned", number>>
> = {
    subscriptions: { credit: 240, unassigned: 2191 },
    selfcare: { checking: 2347, cash: 1250 },
    hobbies: { checking: 2540, brokerage: 2138 },
    books: { checking: 270 },
    coffee: { mobile: 280, unassigned: 2542 },
    fitness: { checking: 2143 },
    tech: { brokerage: 3236 },
    groceries: { checking: 600 },
};

/** Per-envelope spent-this-period amount used by the By account view. */
export const SPENT_BY_ENV_ACCT: Record<
    string,
    Partial<Record<DummyAccount["id"], number>>
> = {
    fitness: { checking: 48 },
    tech: { checking: 1.58 },
    selfcare: { checking: 113 },
    groceries: { checking: 469 },
    coffee: { mobile: 79 },
    hobbies: { checking: 427 },
    subscriptions: { credit: 78 },
    books: { checking: 0 },
};

export const PLANS: DummyPlan[] = [
    { id: "laptop", name: "New Laptop", color: "#a855f7", icon: "target", allocated: 5873, accountId: "checking" },
    { id: "photo", name: "Photography Gear", color: "#22d3ee", icon: "target", allocated: 2432, accountId: "checking" },
    { id: "trip", name: "Japan Trip", color: "#3b82f6", icon: "target", allocated: 4120, accountId: "brokerage" },
];

/* ------------------------------------------------------------ */
/* Helpers — derive the per-view shapes from MATRIX             */
/* ------------------------------------------------------------ */

export function envelopeAllocations() {
    return ENVELOPES.map((env) => {
        const cells = MATRIX[env.id] ?? {};
        const segments = (Object.keys(cells) as Array<DummyAccount["id"] | "unassigned">)
            .map((acctId) => {
                const v = cells[acctId] ?? 0;
                if (v <= 0) return null;
                if (acctId === "unassigned") {
                    return {
                        id: "unassigned",
                        name: "Unassigned",
                        color: "#64748b",
                        value: v,
                    };
                }
                const acct = ACCOUNTS.find((a) => a.id === acctId)!;
                return {
                    id: acct.id,
                    name: acct.name,
                    color: acct.color,
                    value: v,
                };
            })
            .filter((s): s is NonNullable<typeof s> => !!s);
        const total = segments.reduce((s, x) => s + x.value, 0);
        return { ...env, segments, total };
    });
}

/** For the By account tab: which envelopes/plans the account funds. */
export function accountAllocations(accountId: string) {
    const acct = ACCOUNTS.find((a) => a.id === accountId)!;
    const envelopes = ENVELOPES.map((env) => {
        const allocated = MATRIX[env.id]?.[accountId] ?? 0;
        const spent = SPENT_BY_ENV_ACCT[env.id]?.[accountId] ?? 0;
        return { env, allocated, spent };
    }).filter((e) => e.allocated > 0 || e.spent > 0);

    const earmarkedEnv = envelopes.reduce(
        (s, e) => s + Math.max(0, e.allocated - e.spent),
        0
    );
    const planRows = PLANS.filter((p) => p.accountId === accountId);
    const earmarkedPlan = planRows.reduce((s, p) => s + p.allocated, 0);
    const earmarked = earmarkedEnv + earmarkedPlan;
    const unallocated = acct.balance - earmarked;
    return { acct, envelopes, plans: planRows, earmarked, unallocated };
}

export function totalsBreakdown() {
    const totalAssets = ACCOUNTS.filter((a) => a.kind === "asset").reduce(
        (s, a) => s + a.balance,
        0
    );
    const liabilities = ACCOUNTS.filter((a) => a.kind === "liability").reduce(
        (s, a) => s + a.balance,
        0
    );
    const locked = ACCOUNTS.filter((a) => a.kind === "locked").reduce(
        (s, a) => s + a.balance,
        0
    );
    const earmarkedEnv = ENVELOPES.reduce((s, env) => {
        const cells = MATRIX[env.id] ?? {};
        return (
            s +
            Object.values(cells).reduce<number>(
                (ss, v) => ss + (v ?? 0),
                0
            )
        );
    }, 0);
    const earmarkedPlans = PLANS.reduce((s, p) => s + p.allocated, 0);
    const earmarked = earmarkedEnv + earmarkedPlans;
    // Drift = sum of (allocated - actual cash earmarked at that account)
    // — synthesized as a small negative to match the design's −793.50.
    const drift = -793.5;
    const unallocated = totalAssets - earmarked + drift;
    return {
        totalAssets,
        earmarked,
        unallocated,
        drift,
        liabilities,
        locked,
        partition: [
            { label: "Plans", value: earmarkedPlans, color: "#a855f7" },
            { label: "Locked savings", value: locked, color: "#3b82f6" },
            { label: "Free", value: Math.max(0, unallocated), color: "#10b981" },
            { label: "Liabilities", value: liabilities, color: "#ef4444" },
        ],
    };
}
