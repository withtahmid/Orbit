import type { ReactNode } from "react";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import type { EventStatus } from "./types";

/* Flip an event between active/closed. Keeps a single source of truth
   for the cache invalidation and toast copy, used from both the card
   menu on the list page and the detail-page header. */
export function EventStatusButton({
    eventId,
    status,
    variant = "icon",
}: {
    eventId: string;
    status: EventStatus;
    /* "icon": small icon button for card menus.
       "labeled": full-width button for the detail page header. */
    variant?: "icon" | "labeled";
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();

    const setStatus = trpc.event.setStatus.useMutation({
        onSuccess: async (_, vars) => {
            toast.success(
                vars.status === "closed" ? "Event closed" : "Event reopened"
            );
            await utils.event.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.eventTotals.invalidate({ spaceId: space.id });
            await utils.event.getById.invalidate({ eventId });
        },
        onError: (e) => toast.error(e.message),
    });

    const next: EventStatus = status === "active" ? "closed" : "active";
    const label = next === "closed" ? "Close event" : "Reopen event";
    const icon: ReactNode =
        next === "closed" ? (
            <Lock className="size-3.5" />
        ) : (
            <Unlock className="size-3.5" />
        );

    if (variant === "icon") {
        return (
            <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title={label}
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ eventId, status: next })}
            >
                {icon}
            </Button>
        );
    }

    return (
        <button
            type="button"
            className="od-btn od-btn-sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ eventId, status: next })}
        >
            {icon} {label}
        </button>
    );
}
