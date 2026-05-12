import type { ReactNode } from "react";
import { OrbitLogo } from "@/components/orbit/OrbitLogo";

/**
 * AuthShell — the editorial split layout used by login + signup.
 *
 * Left or right is the editorial side (logo, big serif headline, orbital
 * SVG, footer wordmark strip); the opposite side is the form pane on the
 * raised --bg-elev-1 surface.
 *
 * Designed at 1200×800; the form pane is fixed to a fluid 420–520px
 * column and the editorial side fills the rest. Below 880px viewport
 * the editorial side hides and the form pane goes full-width.
 */
export function AuthShell({
    children,
    side = "right",
}: {
    children: ReactNode;
    /** Which side the form pane sits on. Login uses "right", signup "left". */
    side?: "right" | "left";
}) {
    return (
        <div className={`orbit-design oa-shell oa-shell-${side}`}>
            <style>{AUTH_SHELL_STYLES}</style>

            <aside className="oa-editorial vignette">
                <OrbitLogo size={26} />

                <div className="oa-editorial-body">
                    <h2 className="serif oa-editorial-title">
                        Plan, spend,{" "}
                        <em
                            style={{ color: "var(--gold)", fontStyle: "italic" }}
                        >
                            reconcile
                        </em>
                        .
                    </h2>
                    <p className="oa-editorial-lede">
                        Orbit is a collaborative ledger for small groups —
                        families, couples, roommates. One coherent picture
                        across accounts, envelopes, and long-horizon plans.
                    </p>

                    <svg
                        className="oa-editorial-mark"
                        width="380"
                        height="240"
                        viewBox="0 0 380 240"
                        aria-hidden
                    >
                        <ellipse
                            cx="190"
                            cy="120"
                            rx="170"
                            ry="58"
                            fill="none"
                            stroke="var(--line-strong)"
                            strokeWidth="1"
                            transform="rotate(-12 190 120)"
                        />
                        <ellipse
                            cx="190"
                            cy="120"
                            rx="140"
                            ry="48"
                            fill="none"
                            stroke="var(--brand-glow)"
                            strokeWidth="1"
                            transform="rotate(18 190 120)"
                        />
                        <ellipse
                            cx="190"
                            cy="120"
                            rx="100"
                            ry="34"
                            fill="none"
                            stroke="var(--gold-soft)"
                            strokeWidth="1"
                            transform="rotate(40 190 120)"
                        />
                        <circle cx="190" cy="120" r="6" fill="var(--brand)" />
                        <circle cx="80" cy="98" r="3" fill="var(--gold)" />
                        <circle cx="290" cy="148" r="3" fill="var(--ent-4)" />
                    </svg>
                </div>

                <div className="oa-editorial-footer">
                    <span>orbit.withtahmid.com</span>
                    <span>v1.0 · 2026</span>
                </div>
            </aside>

            <main className="oa-form">{children}</main>
        </div>
    );
}

/**
 * AuthFormHeader — the eyebrow + display title + lede stack used at
 * the top of every auth form pane. Matches the design's spacing
 * (eyebrow → 8px → 30/32px display title → 6px → muted lede).
 */
export function AuthFormHeader({
    eyebrow,
    title,
    description,
}: {
    eyebrow: ReactNode;
    title: ReactNode;
    description?: ReactNode;
}) {
    return (
        <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="display oa-form-title">{title}</h1>
            {description && <p className="oa-form-lede">{description}</p>}
        </div>
    );
}

/** Small arrow-right used inside CTAs across auth pages. */
export const ArrowRight = ({
    size = 14,
    color = "currentColor",
}: {
    size?: number;
    color?: string;
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
    >
        <path
            d="M5 12h14m-5-5 5 5-5 5"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const AUTH_SHELL_STYLES = `
.oa-shell {
    width: 100%;
    min-height: 100vh;
    display: grid;
    background: var(--bg);
    position: relative;
    overflow: hidden;
}

/* Editorial banner on the LEFT, form pane on the RIGHT.
   Columns scale proportionally (~62% / 38%) so the banner stays dominant
   without crowding the form on wide displays. The form column has a
   min-width so it never gets cramped, and below 880px the layout stacks. */
.oa-shell-right,
.oa-shell-left { grid-template-columns: minmax(0, 1.6fr) minmax(440px, 1fr); }
.oa-editorial  { border-right: 1px solid var(--line); }

.oa-editorial {
    padding: clamp(32px, 5vw, 56px) clamp(28px, 5vw, 64px);
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
    gap: clamp(24px, 4vh, 48px);
}
/* Logo and footer are intrinsically-sized; the body fills the remaining
   vertical space and centers its content. This kills the dramatic empty
   gaps that "justify-content: space-between" creates on tall viewports. */
.oa-editorial > :first-child { flex: 0 0 auto; }
.oa-editorial-footer { flex: 0 0 auto; }

.oa-editorial-body {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(20px, 2.4vw, 32px);
}
/* Cap the text width separately from the mark so the orbital can be
   wider than the headline column. */
.oa-editorial-title,
.oa-editorial-lede {
    max-width: 560px;
}

.oa-editorial-title {
    /* Designed at 56px; clamps fluidly with the column. */
    font-size: clamp(2.25rem, 4.4vw, 3.75rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--fg);
    font-weight: 400;
}

.oa-editorial-lede {
    font-size: clamp(14px, 1.05vw, 16px);
    color: var(--fg-3);
    line-height: 1.55;
}

.oa-editorial-mark {
    margin-top: clamp(8px, 1.5vh, 24px);
    opacity: 0.9;
    width: 100%;
    height: auto;
    /* Scales with the editorial column so the orbital reads as the visual
       centerpiece rather than a small accent. */
    max-width: clamp(480px, 80%, 760px);
}

.oa-editorial-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11.5px;
    color: var(--fg-4);
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.oa-form {
    padding: clamp(40px, 6vw, 64px) clamp(28px, 5vw, 56px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--bg-elev-1);
    min-width: 0;
}

.oa-form-inner {
    display: flex;
    flex-direction: column;
    gap: 30px;
    /* Fills the form column more comfortably as it scales — never below
       400 (matches design intent), never wider than 560 (still scannable). */
    max-width: clamp(400px, 75%, 560px);
    align-self: center;
    width: 100%;
}

.oa-form-title {
    font-size: clamp(1.75rem, 2.6vw, 2.25rem);
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 8px 0 6px;
}

.oa-form-lede {
    font-size: 14px;
    color: var(--fg-3);
    margin: 0;
}

.oa-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.oa-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
/* Header row puts the field label on the left and any hint / inline
   action (e.g. "Forgot password?") on the right, on the same baseline. */
.oa-field-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
}
.oa-field-label {
    font-size: 12px;
    color: var(--fg-2);
    font-weight: 500;
}
.oa-field-input-wrap {
    position: relative;
    display: flex;
}
.oa-field-suffix {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    color: var(--fg-4);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    pointer-events: none;
}
.oa-field-hint {
    font-size: 11.5px;
    color: var(--fg-4);
    text-align: right;
}
.oa-field-hint-action {
    font-size: 12px;
    color: var(--brand);
    text-decoration: none;
}
.oa-field-hint-action:hover { text-decoration: underline; }
.oa-field-error {
    font-size: 11.5px;
    color: var(--expense);
}
.oa-field-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: 0;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--fg-4);
    font-family: inherit;
}
.oa-field-toggle:hover { color: var(--fg-2); background: var(--bg-elev-2); }

.oa-progress {
    display: flex;
    gap: 6px;
    margin-bottom: 18px;
}
.oa-progress span {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: var(--bg-elev-3);
    transition: background 200ms ease;
}
.oa-progress span.is-active { background: var(--brand); }

.oa-otp {
    display: flex;
    gap: 10px;
    justify-content: center;
}
.oa-otp-cell {
    width: 48px;
    height: 56px;
    display: grid;
    place-items: center;
    font-size: 26px;
    font-weight: 500;
    background: var(--bg-elev-2);
    border-radius: 10px;
    border: 1px solid var(--line);
    color: var(--fg);
    transition: border-color 120ms, box-shadow 120ms;
}
.oa-otp-cell.is-active {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
}
.oa-otp-cell.is-empty { color: var(--fg-4); }
.oa-otp-caret {
    width: 1px;
    height: 22px;
    background: var(--brand);
    animation: orbit-blink 1s steps(2) infinite;
}
.oa-otp-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: text;
    border: 0;
    padding: 0;
    font-size: 16px;
    background: transparent;
}
.oa-otp-wrap { position: relative; }

.oa-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

/* Stacks below 880px: form full width, editorial side hides. */
@media (max-width: 880px) {
    .oa-shell,
    .oa-shell-right,
    .oa-shell-left { grid-template-columns: 1fr; }
    .oa-editorial { display: none; }
    .oa-form { padding: clamp(32px, 8vw, 56px) clamp(20px, 6vw, 40px); }
}

@media (max-width: 520px) {
    .oa-row-2 { grid-template-columns: 1fr; }
    .oa-otp { gap: 6px; }
    .oa-otp-cell { width: 42px; height: 50px; font-size: 22px; }
}
`;
