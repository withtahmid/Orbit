import type { RouterOutput } from "@/trpc";

export type EventStatus = "active" | "closed";

type RawEventTotal = RouterOutput["analytics"]["eventTotals"][number];

/* Hydrated form of an event totals row — date strings parsed and status
   narrowed. Used across EventsPage list and EventDetailPage. */
export type EventTotal = Omit<
    RawEventTotal,
    "startTime" | "endTime" | "closedAt" | "status"
> & {
    startTime: Date;
    endTime: Date;
    closedAt: Date | null;
    status: EventStatus;
};

/* Calendar-derived state — orthogonal to the lifecycle status. */
export type EventCalendarState = "Past" | "Recent" | "Active" | "Upcoming";

export function eventCalendarState(
    start: Date,
    end: Date,
    now: Date
): EventCalendarState {
    if (now < start) return "Upcoming";
    if (now > end) {
        const days = Math.round((now.getTime() - end.getTime()) / 86_400_000);
        return days <= 14 ? "Recent" : "Past";
    }
    return "Active";
}
