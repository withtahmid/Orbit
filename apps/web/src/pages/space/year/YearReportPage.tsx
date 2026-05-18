import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/**
 * Annual honesty view: per-envelope per-month plan vs actual spend.
 *
 * Each cell shows spent / planned with a color cue:
 *   - over plan       → red
 *   - within plan     → neutral
 *   - significantly under (< 50% of plan) → muted green
 *
 * The right edge column shows the year totals + cumulative overspend.
 * This is the surface that finally answers "how well did I budget last
 * year?" with a real number.
 */
export default function YearReportPage() {
    const { space } = useCurrentSpace();
    const { year } = useParams<{ year: string }>();

    const yearNum = useMemo(() => {
        const n = Number(year);
        return Number.isFinite(n) && n >= 2000 && n <= 2100
            ? n
            : new Date().getFullYear();
    }, [year]);

    // Cross-space personal mode dispatches to personal.yearReport which
    // unions every member space and surfaces `spaceName` per row so the
    // user can disambiguate identically-named envelopes (e.g. "Groceries"
    // in two different spaces).
    const perSpaceQuery = trpc.analytics.yearReport.useQuery(
        { spaceId: space.id, year: yearNum },
        { enabled: !space.isPersonal }
    );
    const personalQuery = trpc.personal.yearReport.useQuery(
        { year: yearNum },
        { enabled: space.isPersonal }
    );
    const reportQuery = space.isPersonal ? personalQuery : perSpaceQuery;

    return (
        <div className="orbit-design yr-root">
            <style>{YR_STYLES}</style>

            <header className="yr-topbar">
                <div className="yr-topbar-text">
                    <Link
                        to={ROUTES.spaceBudgets(space.id)}
                        className="yr-back"
                    >
                        <ArrowLeft className="size-3.5" /> Envelopes
                    </Link>
                    <h1 className="display yr-title">Year report · {yearNum}</h1>
                    <p className="yr-sub">
                        Plan vs actual spend, every envelope, every month.
                        The honest record of how the year went.
                    </p>
                </div>
                <div className="yr-topbar-actions">
                    {yearNum > 2000 ? (
                        <Link
                            to={ROUTES.spaceYearReport(space.id, yearNum - 1)}
                            className="od-btn"
                        >
                            <ChevronLeft className="size-3.5" /> {yearNum - 1}
                        </Link>
                    ) : (
                        <button
                            type="button"
                            className="od-btn"
                            disabled
                            aria-label="No earlier year available"
                        >
                            <ChevronLeft className="size-3.5" /> {yearNum - 1}
                        </button>
                    )}
                    {yearNum < 2100 ? (
                        <Link
                            to={ROUTES.spaceYearReport(space.id, yearNum + 1)}
                            className="od-btn"
                        >
                            {yearNum + 1} <ChevronRight className="size-3.5" />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            className="od-btn"
                            disabled
                            aria-label="No later year available"
                        >
                            {yearNum + 1} <ChevronRight className="size-3.5" />
                        </button>
                    )}
                </div>
            </header>

            <div className="yr-scroll">
                {reportQuery.isLoading ? (
                    <div className="od-card yr-empty">Loading…</div>
                ) : !reportQuery.data ||
                  reportQuery.data.envelopes.length === 0 ? (
                    <div className="od-card yr-empty">
                        No monthly envelopes for {yearNum}.
                    </div>
                ) : (
                    <div className="od-card yr-table-wrap">
                        <table className="yr-table">
                            <thead>
                                <tr>
                                    <th className="yr-th-name">Envelope</th>
                                    {MONTH_LABELS.map((m) => (
                                        <th key={m} className="yr-th-month">
                                            {m}
                                        </th>
                                    ))}
                                    <th className="yr-th-total">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportQuery.data.envelopes.map((e) => {
                                    // The personal variant adds spaceName per
                                    // row to disambiguate; the per-space
                                    // variant doesn't have the field. Read
                                    // it safely via cast since the union
                                    // type doesn't narrow inside JSX.
                                    const spaceName = (
                                        e as { spaceName?: string }
                                    ).spaceName;
                                    return (
                                    <tr
                                        key={`${spaceName ?? ""}-${e.envelopId}`}
                                    >
                                        <td className="yr-td-name">
                                            <span
                                                className="yr-name-dot"
                                                style={{
                                                    background: e.color,
                                                }}
                                            />
                                            <span>
                                                {e.name}
                                                {spaceName && (
                                                    <span className="yr-space-tag">
                                                        {spaceName}
                                                    </span>
                                                )}
                                                {e.archived && (
                                                    <span className="yr-archived">
                                                        archived
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        {e.months.map((c) => (
                                            <td
                                                key={c.month}
                                                className={`yr-cell ${
                                                    c.over > 0
                                                        ? "yr-cell-over"
                                                        : c.planned > 0 &&
                                                            c.spent > 0 &&
                                                            c.spent <
                                                                c.planned * 0.5
                                                          ? "yr-cell-under"
                                                          : ""
                                                }`}
                                                title={`Planned ${c.planned.toFixed(2)} · Spent ${c.spent.toFixed(2)}${c.over > 0 ? ` · over ${c.over.toFixed(2)}` : ""}`}
                                            >
                                                {c.planned === 0 &&
                                                c.spent === 0 ? (
                                                    <span className="yr-empty-cell">
                                                        —
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="yr-cell-spent">
                                                            {c.spent.toFixed(0)}
                                                        </span>
                                                        <span className="yr-cell-plan">
                                                            /
                                                            {c.planned.toFixed(0)}
                                                        </span>
                                                    </>
                                                )}
                                            </td>
                                        ))}
                                        <td className="yr-td-total">
                                            <div className="yr-total-spent">
                                                {e.totalSpent.toFixed(0)}
                                            </div>
                                            <div className="yr-total-plan">
                                                of {e.totalPlanned.toFixed(0)}
                                            </div>
                                            {e.totalOver > 0 && (
                                                <div className="yr-total-over">
                                                    +{e.totalOver.toFixed(0)} over
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

const YR_STYLES = `
.yr-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .yr-root { margin: -2rem; }
}
.yr-topbar {
    padding: 22px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}
.yr-topbar-text { display: flex; flex-direction: column; gap: 4px; }
.yr-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--fg-3);
    text-decoration: none;
    padding-bottom: 4px;
}
.yr-back:hover { color: var(--fg); }
.yr-title {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.yr-sub { font-size: 13px; color: var(--fg-3); margin: 0; max-width: 600px; }
.yr-topbar-actions {
    display: flex;
    gap: 8px;
}

.yr-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    overflow-x: auto;
}

.orbit-design .od-card.yr-empty {
    padding: 36px;
    text-align: center;
    color: var(--fg-3);
}

.orbit-design .od-card.yr-table-wrap {
    padding: 0;
    overflow-x: auto;
}

.yr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
.yr-table thead th {
    position: sticky;
    top: 0;
    background: var(--bg-elev-2);
    color: var(--fg-3);
    font-weight: 500;
    text-align: right;
    padding: 10px 8px;
    border-bottom: 1px solid var(--line-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10.5px;
}
.yr-th-name { text-align: left; padding-left: 18px !important; }
.yr-th-month { min-width: 60px; }
.yr-th-total { padding-right: 18px !important; min-width: 90px; }

.yr-table tbody tr {
    border-bottom: 1px solid var(--line-soft);
}
.yr-table tbody tr:last-child { border-bottom: none; }

.yr-td-name {
    padding: 10px 18px;
    color: var(--fg);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
}
.yr-name-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.yr-archived {
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    color: var(--fg-4);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.yr-space-tag {
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--fg-2);
    font-size: 10px;
    font-weight: 500;
}

.yr-cell {
    text-align: right;
    padding: 8px;
    color: var(--fg-2);
    border-left: 1px solid var(--line-soft);
}
.yr-cell-over {
    background: color-mix(in oklab, var(--expense) 14%, transparent);
}
.yr-cell-under {
    background: color-mix(in oklab, var(--income) 8%, transparent);
}
.yr-cell-spent {
    font-weight: 500;
    color: var(--fg);
}
.yr-cell-plan {
    color: var(--fg-4);
    font-size: 10px;
    margin-left: 2px;
}
.yr-empty-cell { color: var(--fg-4); }

.yr-td-total {
    text-align: right;
    padding: 8px 18px;
    border-left: 1px solid var(--line);
}
.yr-total-spent { font-weight: 500; color: var(--fg); font-size: 13px; }
.yr-total-plan { color: var(--fg-4); font-size: 10.5px; }
.yr-total-over {
    color: var(--expense);
    font-size: 10.5px;
    margin-top: 2px;
}

/* Phone (<640px) */
@media (max-width: 640px) {
    .yr-topbar { padding: 14px 14px 10px; }
    .yr-title { font-size: 20px; }
    .yr-scroll { padding: 12px 14px 22px; }
    .yr-table { font-size: 11.5px; }
    .yr-td-name { padding: 8px 14px; font-size: 12.5px; }
    .yr-th-name { padding-left: 14px !important; }
    .yr-th-total { padding-right: 14px !important; min-width: 80px; }
    .yr-td-total { padding: 8px 14px; }
    .yr-cell { padding: 6px; }
    .orbit-design .od-card.yr-empty { padding: 24px; }
}
`;
