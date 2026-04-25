import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    return (
        <Sonner
            theme="dark"
            position="top-right"
            offset={16}
            gap={10}
            visibleToasts={4}
            className="toaster group"
            style={
                {
                    // Sonner's `style` prop uses a pinned csstype version
                    // that diverges from React's, so we route through
                    // `Record<string, string>` and the cast below.
                    //
                    // CSS custom-property hooks Sonner reads internally.
                    // Wiring them to Orbit tokens so the toast reads as
                    // the same refined dark-emerald surface as cards/panels.
                    "--normal-bg": "var(--o-bg-1)",
                    "--normal-text": "var(--o-fg)",
                    "--normal-border": "var(--o-line)",
                    "--success-bg": "color-mix(in oklch, var(--o-emerald) 8%, var(--o-bg-1))",
                    "--success-border":
                        "color-mix(in oklch, var(--o-emerald) 30%, var(--o-line))",
                    "--success-text": "var(--o-fg)",
                    "--error-bg": "color-mix(in oklch, var(--o-bad) 8%, var(--o-bg-1))",
                    "--error-border":
                        "color-mix(in oklch, var(--o-bad) 30%, var(--o-line))",
                    "--error-text": "var(--o-fg)",
                    "--warning-bg":
                        "color-mix(in oklch, var(--o-warn) 8%, var(--o-bg-1))",
                    "--warning-border":
                        "color-mix(in oklch, var(--o-warn) 30%, var(--o-line))",
                    "--warning-text": "var(--o-fg)",
                    "--info-bg":
                        "color-mix(in oklch, var(--o-info) 8%, var(--o-bg-1))",
                    "--info-border":
                        "color-mix(in oklch, var(--o-info) 30%, var(--o-line))",
                    "--info-text": "var(--o-fg)",
                } as unknown as ToasterProps["style"]
            }
            toastOptions={{
                classNames: {
                    toast: "o-toast",
                    description: "o-toast__desc",
                    actionButton: "o-toast__action",
                    cancelButton: "o-toast__cancel",
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
