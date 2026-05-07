import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OrbitModalShell } from "@/components/orbit/OrbitModalShell";

/**
 * Editorial-dark confirm dialog.
 *
 * Renders a centered modal with the design's exact composition:
 * "Destructive action" eyebrow, title + subtitle, alert pill + outcome
 * bullet list (provided via `outcomes`), optional type-to-confirm input,
 * and footer Cancel / Confirm buttons. Built on shadcn's AlertDialog so
 * focus trap, escape-to-close, and overlay all keep working.
 */
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
    outcomes,
}: {
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    destructive?: boolean;
    typedConfirmationText?: string;
    /** Optional structured "what will happen" list — checkmarks for
     *  positive outcomes, X for irreversible warnings. */
    outcomes?: Array<{ kind: "ok" | "irreversible"; text: ReactNode }>;
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
            <AlertDialogContent className="orbit-shell-host">
                <OrbitModalShell
                    width={460}
                    eyebrow={destructive ? "Destructive action" : "Confirm"}
                    title={title}
                    subtitle={typeof description === "string" ? description : undefined}
                    onClose={() => onOpenChange?.(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="cd-btn"
                                onClick={() => onOpenChange?.(false)}
                            >
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                disabled={!canConfirm}
                                onClick={async () => {
                                    await onConfirm();
                                    setTyped("");
                                }}
                                className={`cd-btn ${
                                    destructive ? "cd-btn-danger" : "cd-btn-primary"
                                }`}
                            >
                                {confirmLabel}
                            </button>
                        </>
                    }
                >
                    <style>{CD_STYLES}</style>
                    <div className="cd-row">
                        <span
                            className="cd-icon"
                            style={{
                                background: destructive
                                    ? "color-mix(in oklab, var(--expense) 12%, transparent)"
                                    : "color-mix(in oklab, var(--warn) 12%, transparent)",
                                color: destructive
                                    ? "var(--expense)"
                                    : "var(--warn)",
                            }}
                            aria-hidden
                        >
                            <AlertTriangle className="size-4" />
                        </span>
                        <div className="cd-col">
                            {description && typeof description !== "string" && (
                                <span className="cd-desc">{description}</span>
                            )}
                            {outcomes && outcomes.length > 0 && (
                                <ul className="cd-outcomes" aria-label="Outcomes">
                                    {outcomes.map((o, i) => (
                                        <li key={i} className="cd-outcome">
                                            {o.kind === "ok" ? (
                                                <Check
                                                    className="size-3"
                                                    style={{ color: "var(--income)" }}
                                                    aria-hidden
                                                />
                                            ) : (
                                                <X
                                                    className="size-3"
                                                    style={{ color: "var(--expense)" }}
                                                    aria-hidden
                                                />
                                            )}
                                            <span>{o.text}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {typedConfirmationText && (
                                <label className="cd-typed">
                                    <span className="cd-typed-label">
                                        Type{" "}
                                        <span className="cd-typed-mono">
                                            {typedConfirmationText}
                                        </span>{" "}
                                        to confirm
                                    </span>
                                    <input
                                        type="text"
                                        value={typed}
                                        onChange={(e) => setTyped(e.target.value)}
                                        placeholder={typedConfirmationText}
                                        className="cd-input mono"
                                        spellCheck={false}
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                </OrbitModalShell>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const CD_STYLES = `
.cd-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
}
.cd-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.cd-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    flex: 1;
}
.cd-desc {
    font-size: 13px;
    color: var(--fg-2);
    line-height: 1.55;
}
.cd-outcomes {
    list-style: none;
    margin: 0;
    padding: 12px;
    background: var(--bg-elev-2);
    border-radius: 10px;
    border: 1px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.cd-outcome {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--fg-2);
    line-height: 1.4;
}
.cd-typed {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}
.cd-typed-label {
    font-size: 11.5px;
    color: var(--fg-2);
    font-weight: 500;
}
.cd-typed-mono {
    font-family: "Geist Mono", ui-monospace, monospace;
    background: var(--bg-elev-3);
    color: var(--fg);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
}
.cd-input {
    height: 38px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg);
    font-size: 13px;
    font-family: "Geist Mono", ui-monospace, monospace;
    outline: none;
    transition: border-color 120ms ease;
}
.cd-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
}

.cd-btn {
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
    transition: background 140ms ease, border-color 140ms ease, filter 140ms ease;
}
.cd-btn:hover:not(:disabled):not(.cd-btn-primary):not(.cd-btn-danger) {
    background: var(--bg-elev-2);
    border-color: var(--line-strong);
}
.cd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.cd-btn-primary {
    background: var(--brand);
    color: var(--brand-fg);
    border-color: oklch(78% 0.14 165);
}
.cd-btn-primary:hover:not(:disabled) {
    filter: brightness(1.05);
}
.cd-btn-danger {
    background: var(--expense);
    color: white;
    border-color: var(--expense);
}
.cd-btn-danger:hover:not(:disabled) {
    filter: brightness(1.05);
}
`;
