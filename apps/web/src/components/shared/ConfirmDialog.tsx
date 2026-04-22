import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
    trigger,
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    destructive,
    typedConfirmationText,
}: {
    /** Uncontrolled mode — renders the trigger inside `AlertDialogTrigger`. */
    trigger?: React.ReactNode;
    /** Controlled mode — caller manages open state; `trigger` becomes optional. */
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    destructive?: boolean;
    typedConfirmationText?: string;
}) {
    const [typed, setTyped] = useState("");
    const canConfirm = !typedConfirmationText || typed === typedConfirmationText;
    return (
        <AlertDialog
            open={open}
            onOpenChange={(v) => {
                if (!v) setTyped("");
                onOpenChange?.(v);
            }}
        >
            {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description && (
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                {typedConfirmationText && (
                    <div className="grid gap-2">
                        <Label>
                            Type <span className="font-mono">{typedConfirmationText}</span> to
                            confirm
                        </Label>
                        <Input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={typedConfirmationText}
                        />
                    </div>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!canConfirm}
                        onClick={() => onConfirm()}
                        className={cn(
                            destructive
                                ? buttonVariants({ variant: "destructive" })
                                : buttonVariants()
                        )}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
