import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";

/* Delete dialog for an event. The FK is ON DELETE SET NULL, so linked
   transactions survive — but their event_id is cleared. We surface that
   in the dialog so users can pick "Close" instead from the card menu
   when they want to preserve the link. */
export function DeleteEventDialog({
    eventId,
    linkedTransactionCount,
    trigger,
    onDeleted,
}: {
    eventId: string;
    linkedTransactionCount: number;
    trigger?: ReactNode;
    onDeleted?: () => void;
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const [open, setOpen] = useState(false);

    const del = trpc.event.delete.useMutation({
        onSuccess: async (res) => {
            const n = res?.unlinkedTransactionCount ?? 0;
            toast.success(
                n > 0
                    ? `Event deleted · ${n} transaction${n === 1 ? "" : "s"} unlinked`
                    : "Event deleted"
            );
            /* FK is ON DELETE SET NULL — transactions survive but their
               event_id is cleared. Cached lists/totals filtered by this
               eventId or carrying the now-null event_id are stale, so
               invalidate the whole transaction surface. */
            await Promise.all([
                utils.event.listBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.eventTotals.invalidate({ spaceId: space.id }),
                utils.transaction.listBySpace.invalidate(),
                utils.transaction.filteredTotals.invalidate(),
            ]);
            setOpen(false);
            onDeleted?.();
        },
        onError: (e) => toast.error(e.message),
    });

    const outcomes: Array<{ kind: "ok" | "irreversible"; text: ReactNode }> = [
        {
            kind: "irreversible",
            text: "The event record is permanently removed.",
        },
        linkedTransactionCount > 0
            ? {
                  kind: "irreversible",
                  text: `${linkedTransactionCount} linked transaction${
                      linkedTransactionCount === 1 ? "" : "s"
                  } will remain but become unlinked.`,
              }
            : {
                  kind: "ok",
                  text: "No transactions are linked to this event.",
              },
        {
            kind: "ok",
            text: 'To keep the historical link, dismiss this dialog and pick "Close event" from the menu instead.',
        },
    ];

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            trigger={
                trigger ?? (
                    <Button size="icon" variant="ghost" className="size-7">
                        <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                )
            }
            title="Delete event?"
            confirmLabel={del.isPending ? "Deleting…" : "Delete"}
            destructive
            outcomes={outcomes}
            onConfirm={() => del.mutate({ eventId })}
        />
    );
}
