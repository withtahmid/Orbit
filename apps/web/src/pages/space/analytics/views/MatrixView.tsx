import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { cn } from "@/lib/utils";

type Account = {
    id: string;
    name: string;
    color: string;
    icon: string;
    accountType: "asset" | "liability" | "locked";
    balance: number;
};
type Envelope = {
    id: string;
    name: string;
    color: string;
    icon: string;
};

/**
 * Allocation matrix — every envelope × every account in one grid, with
 * marginal totals on the right and bottom and a Pareto-style "Concentration"
 * strip below highlighting the cells that dominate the partition.
 *
 * Allocations whose accountId is null ("unassigned") are dropped here —
 * the matrix is a pure account × envelope grid; "unassigned" surfaces in
 * AllocationsView's by-envelope tab as a slate segment instead.
 */
export default function MatrixView() {
    const { space } = useCurrentSpace();
    const ACCENT = "#a855f7";

    /* Hooks must be called in the same order on every render — including
       across personal↔space switches that change `isPersonal`. Keep the
       query and downstream useMemos *above* the personal-space early
       return; the `enabled` flag gates the network round-trip without
       changing hook order. The early return is below. */
    const q = trpc.analytics.allocations.useQuery(
        { spaceId: space.id },
        { enabled: !space.isPersonal }
    );

    const accounts: Account[] = useMemo(
        () =>
            (q.data?.accounts ?? []).filter(
                (a) => a.accountType !== "locked"
            ),
        [q.data]
    );
    const envelopes: Envelope[] = useMemo(
        () => q.data?.envelopes ?? [],
        [q.data]
    );

    /** matrix[envIdx][acctIdx] = $ amount (0 if no contribution at all) */
    const cells: number[][] = useMemo(() => {
        if (!q.data) return [];
        const lookup = new Map<string, number>();
        for (const c of q.data.matrix) {
            if (c.accountId == null) continue;
            lookup.set(`${c.envelopId}|${c.accountId}`, c.amount);
        }
        return envelopes.map((env) =>
            accounts.map(
                (acct) => lookup.get(`${env.id}|${acct.id}`) ?? 0
            )
        );
    }, [q.data, envelopes, accounts]);

    const stats = useMemo(() => {
        const flat: number[] = [];
        let max = 0;
        let largestCell: { env: string; acct: string; v: number } | null = null;
        for (let i = 0; i < cells.length; i++) {
            for (let j = 0; j < cells[i].length; j++) {
                const v = cells[i][j];
                if (v > 0) {
                    flat.push(v);
                    if (v > max) {
                        max = v;
                        largestCell = {
                            env: envelopes[i].name,
                            acct: accounts[j].name,
                            v,
                        };
                    }
                }
            }
        }
        const min = flat.length ? Math.min(...flat) : 0;
        const rowTotals = cells.map((row) => row.reduce((s, v) => s + v, 0));
        const colTotals = accounts.map((_, j) =>
            cells.reduce((s, row) => s + (row[j] ?? 0), 0)
        );
        const grandTotal = rowTotals.reduce((s, v) => s + v, 0);
        const possibleCells = envelopes.length * accounts.length;
        return {
            flat,
            max,
            min,
            largestCell,
            rowTotals,
            colTotals,
            grandTotal,
            possibleCells,
            density: possibleCells > 0 ? (flat.length / possibleCells) * 100 : 0,
        };
    }, [cells, envelopes, accounts]);

    /** Top 5 cells by allocation — drives the "Concentration" Pareto strip. */
    const topCells = useMemo(() => {
        const list: Array<{
            envName: string;
            envColor: string;
            acctName: string;
            value: number;
        }> = [];
        for (let i = 0; i < cells.length; i++) {
            for (let j = 0; j < cells[i].length; j++) {
                const v = cells[i][j];
                if (v > 0) {
                    list.push({
                        envName: envelopes[i].name,
                        envColor: envelopes[i].color,
                        acctName: accounts[j].name,
                        value: v,
                    });
                }
            }
        }
        list.sort((a, b) => b.value - a.value);
        const top5 = list.slice(0, 5);
        const top5Sum = top5.reduce((s, x) => s + x.value, 0);
        const concentrationPct =
            stats.grandTotal > 0 ? (top5Sum / stats.grandTotal) * 100 : 0;
        return { rows: top5, concentrationPct };
    }, [cells, envelopes, accounts, stats.grandTotal]);

    const kpiItems: KpiItem[] = [
        {
            label: "Total allocated",
            value: stats.grandTotal,
            money: true,
        },
        {
            label: "Active cells",
            value: stats.flat.length,
            valueFormat: "integer",
            sub: `of ${stats.possibleCells} possible`,
        },
        {
            label: "Density",
            value: stats.density,
            valueFormat: "percent",
            sub: "% — lower is more concentrated",
        },
        {
            label: "Largest cell",
            value: stats.largestCell?.v ?? 0,
            money: true,
            sub: stats.largestCell
                ? `${stats.largestCell.env} ← ${stats.largestCell.acct}`
                : "—",
        },
    ];

    /* Personal-space stub. Placed below all hooks so hook order stays
       constant across personal↔space switches. */
    if (space.isPersonal) {
        return (
            <AnalyticsDetailLayout
                title="Allocation matrix"
                description="Every envelope × every account in one grid."
            >
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        Allocation matrix is a per-space view. Open a real
                        space to see it.
                    </CardContent>
                </Card>
            </AnalyticsDetailLayout>
        );
    }

    return (
        <AnalyticsDetailLayout
            title="Allocation matrix"
            description="Every envelope × every account in one grid. Cell intensity is the funding amount; an empty cell means no contribution. Margins on the right and bottom show row and column totals."
        >
            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <Card>
                <CardHeader>
                    <CardTitle>Envelope × Account</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Rows are envelopes; columns are accounts. Hover any cell to
                        see its exact amount.
                    </p>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : envelopes.length === 0 || accounts.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Need at least one envelope and one account to render
                            the matrix.
                        </p>
                    ) : (
                        <MatrixGrid
                            envelopes={envelopes}
                            accounts={accounts}
                            cells={cells}
                            rowTotals={stats.rowTotals}
                            colTotals={stats.colTotals}
                            grandTotal={stats.grandTotal}
                            min={stats.min}
                            max={stats.max}
                            accent={ACCENT}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Concentration</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Of all funding cells, the top {topCells.rows.length} already
                        account for {topCells.concentrationPct.toFixed(0)}% of
                        allocations.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-2.5">
                        {topCells.rows.map((r, i) => (
                            <div
                                key={i}
                                className="grid items-center gap-3 grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2fr)_auto] sm:gap-4"
                            >
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                    #{i + 1}
                                </span>
                                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-foreground/90">
                                    <span
                                        className="size-1.5 rounded-full"
                                        style={{ backgroundColor: r.envColor }}
                                    />
                                    <span className="truncate">{r.envName}</span>
                                </span>
                                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <ArrowLeft className="size-3 shrink-0 text-muted-foreground/60" />
                                    <span className="truncate">{r.acctName}</span>
                                </span>
                                <span className="relative block h-1 w-full overflow-hidden rounded-full bg-muted/60">
                                    <span
                                        className="absolute inset-y-0 left-0 rounded-full"
                                        style={{
                                            width: `${
                                                stats.max > 0
                                                    ? (r.value / stats.max) * 100
                                                    : 0
                                            }%`,
                                            backgroundColor: r.envColor,
                                        }}
                                    />
                                </span>
                                <MoneyDisplay
                                    amount={r.value}
                                    variant="neutral"
                                    className="text-right text-[13px] font-semibold"
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

function MatrixGrid({
    envelopes,
    accounts,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    min,
    max,
    accent,
}: {
    envelopes: Envelope[];
    accounts: Account[];
    cells: number[][];
    rowTotals: number[];
    colTotals: number[];
    grandTotal: number;
    min: number;
    max: number;
    accent: string;
}) {
    /**
     * Map a cell's $ amount to a 0..1 intensity. Floors at 0.15 so the
     * smallest non-zero cells still read as filled — without the floor,
     * `min` maps to 0 and the cell visually disappears against an empty
     * one, defeating the heatmap.
     */
    const intensity = (v: number): number => {
        if (v <= 0) return 0;
        if (max === min) return 0.6;
        const t = (v - min) / (max - min);
        return 0.15 + t * 0.85;
    };

    return (
        <div className="overflow-x-auto">
            <table
                className="w-full border-separate text-[12px]"
                style={{ borderSpacing: 0, minWidth: 720 }}
            >
                <thead>
                    <tr>
                        <th
                            className="sticky left-0 z-[1] bg-card px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                            style={{ minWidth: 180 }}
                        >
                            Envelope
                        </th>
                        {accounts.map((a) => (
                            <th
                                key={a.id}
                                className="px-2.5 py-2.5 text-center text-[11px] font-medium text-muted-foreground"
                                style={{ minWidth: 110 }}
                            >
                                {a.name}
                            </th>
                        ))}
                        <th
                            className="border-l-2 px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                            style={{ borderLeftColor: "var(--border)" }}
                        >
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {envelopes.map((e, i) => (
                        <tr key={e.id}>
                            <td
                                className="sticky left-0 z-[1] truncate border-t border-border/40 bg-card px-2.5 py-2 text-[12.5px] text-foreground/90"
                                style={{ maxWidth: 220 }}
                            >
                                <span className="inline-flex items-center gap-2">
                                    <span
                                        className="size-1.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: e.color }}
                                    />
                                    <span className="truncate">{e.name}</span>
                                </span>
                            </td>
                            {cells[i].map((v, j) => (
                                <td
                                    key={j}
                                    className="border-t border-border/40 p-1"
                                >
                                    <Cell
                                        value={v}
                                        intensity={intensity(v)}
                                        accent={accent}
                                        envName={envelopes[i].name}
                                        acctName={accounts[j].name}
                                    />
                                </td>
                            ))}
                            <td
                                className="border-l-2 border-t border-border/40 px-3 py-2 text-right tabular-nums font-medium"
                                style={{ borderLeftColor: "var(--border)" }}
                            >
                                {compactMoney(rowTotals[i])}
                            </td>
                        </tr>
                    ))}
                    <tr>
                        <td className="sticky left-0 z-[1] border-t-2 border-border bg-card px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Total
                        </td>
                        {colTotals.map((t, j) => (
                            <td
                                key={j}
                                className="border-t-2 border-border px-2.5 py-2.5 text-center tabular-nums font-medium"
                            >
                                {compactMoney(t)}
                            </td>
                        ))}
                        <td
                            className="border-l-2 border-t-2 border-border px-3 py-2.5 text-right tabular-nums font-semibold"
                            style={{ borderLeftColor: "var(--border)" }}
                        >
                            {compactMoney(grandTotal)}
                        </td>
                    </tr>
                </tbody>
            </table>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Intensity:</span>
                <span className="inline-flex items-center">
                    {[0.1, 0.25, 0.4, 0.55, 0.75].map((i, idx) => (
                        <span
                            key={idx}
                            className={cn(
                                "h-3.5 w-7 border",
                                idx > 0 && "border-l-0"
                            )}
                            style={{
                                background: `color-mix(in oklab, ${accent} ${
                                    10 + i * 60
                                }%, var(--card))`,
                                borderColor: `color-mix(in oklab, ${accent} 35%, transparent)`,
                            }}
                        />
                    ))}
                </span>
                <span className="flex w-32 justify-between text-[10.5px]">
                    <span>{compactMoney(min)}</span>
                    <span>{compactMoney(max)}</span>
                </span>
            </div>
        </div>
    );
}

function Cell({
    value,
    intensity,
    accent,
    envName,
    acctName,
}: {
    value: number;
    intensity: number;
    accent: string;
    envName: string;
    acctName: string;
}) {
    if (value <= 0) {
        return (
            <span
                aria-hidden
                className="block h-9 rounded-md border border-dashed border-border/40 bg-background/20 opacity-60"
            />
        );
    }
    const pct = 10 + Math.min(1, intensity) * 60;
    /**
     * Inverted text contrast: cells fade from dark→bright as the value
     * grows, so low-intensity cells need light text and high-intensity
     * cells need dark text to stay readable. Mirrors the design's
     * `intensity > 0.5 ? brand-fg : fg` pattern.
     */
    const textColor =
        intensity > 0.45 ? "oklch(15% 0.02 290)" : "var(--foreground)";
    return (
        <span
            className="flex h-9 items-center justify-center rounded-md border text-[12px] font-semibold tabular-nums"
            title={`${envName} ← ${acctName}: $${value.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`}
            style={{
                background: `color-mix(in oklab, ${accent} ${pct}%, var(--card))`,
                borderColor: `color-mix(in oklab, ${accent} 40%, transparent)`,
                color: textColor,
            }}
        >
            {compactCellMoney(value)}
        </span>
    );
}

/**
 * Cell formatter. Small values render as exact dollars (`$240`, `$600`),
 * large values collapse to `$X.XK`. The design's `(v/1000).toFixed(0)`
 * approach mapped both `$240` and `$600` to `$0`/`$1` which reads as a bug
 * — exact small numbers communicate the partition shape better.
 */
function compactCellMoney(v: number): string {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${Math.round(v)}`;
}

/** Margin-cell formatter — same shape, used for row/column/grand totals. */
function compactMoney(n: number): string {
    if (!Number.isFinite(n) || n === 0) return "$0";
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${Math.round(n)}`;
}
