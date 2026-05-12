import { Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { OrbitLogo } from "@/components/orbit/OrbitLogo";

const HeroNav = () => (
    <nav
        style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 64,
            padding: "0 8px",
        }}
    >
        <Link to={ROUTES.root} style={{ textDecoration: "none" }}>
            <OrbitLogo size={26} />
        </Link>
        <div className="ol-nav-center">
            <a href="#product" className="ol-navlink">
                Product
            </a>
            <Link to={ROUTES.docs} className="ol-navlink">
                Docs
            </Link>
            <a href="#pricing" className="ol-navlink">
                Pricing
            </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
                to={ROUTES.login}
                className="ol-btn ol-btn-ghost ol-btn-sm"
                style={{ textDecoration: "none" }}
            >
                Log in
            </Link>
            <Link
                to={ROUTES.signup}
                className="ol-btn ol-btn-primary ol-btn-sm"
                style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                Get started
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path
                        d="M3 8h10m-4-4 4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </Link>
        </div>
    </nav>
);

const HeroOrbitMark = ({ size = 360 }: { size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 360 360"
        fill="none"
        aria-hidden
        style={{ display: "block" }}
    >
        <defs>
            <radialGradient id="ol-hero-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="1" />
                <stop offset="60%" stopColor="var(--brand)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ol-hero-ring-1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.9" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="ol-hero-ring-2" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.1" />
            </linearGradient>
        </defs>
        <circle cx="180" cy="180" r="140" fill="url(#ol-hero-core)" opacity="0.35" />
        <ellipse
            cx="180"
            cy="180"
            rx="160"
            ry="62"
            stroke="url(#ol-hero-ring-1)"
            strokeWidth="1.4"
            transform="rotate(-22 180 180)"
        />
        <ellipse
            cx="180"
            cy="180"
            rx="160"
            ry="62"
            stroke="url(#ol-hero-ring-2)"
            strokeWidth="1.4"
            transform="rotate(34 180 180)"
        />
        <ellipse
            cx="180"
            cy="180"
            rx="120"
            ry="46"
            stroke="var(--brand)"
            strokeOpacity="0.35"
            strokeWidth="1"
            transform="rotate(8 180 180)"
        />
        <circle cx="328" cy="226" r="4" fill="var(--gold)" />
        <circle cx="60" cy="142" r="3" fill="var(--brand)" />
        <circle cx="244" cy="86" r="2.5" fill="var(--fg-2)" opacity="0.7" />
        <circle cx="180" cy="180" r="36" fill="var(--brand)" />
        <circle cx="180" cy="180" r="36" fill="url(#ol-hero-core)" opacity="0.6" />
        <circle cx="170" cy="170" r="9" fill="oklch(100% 0 0 / 0.18)" />
    </svg>
);

const HeroPreview = () => (
    <div className="ol-preview">
        <div
            style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                opacity: 0.9,
            }}
        >
            <HeroOrbitMark size={520} />
        </div>

        {/* Floating "Today" card — back layer */}
        <div
            className="ol-card"
            style={{
                position: "absolute",
                top: 24,
                right: 12,
                width: 240,
                padding: 16,
                transform: "rotate(3deg)",
                boxShadow: "var(--shadow-3)",
                background: "var(--bg-elev-1)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                }}
            >
                <span className="ol-eyebrow" style={{ fontSize: 9.5 }}>
                    Today
                </span>
                <span style={{ fontSize: 10, color: "var(--fg-4)" }}>Apr 24</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 4 }}>
                Safe to spend
            </div>
            <div
                className="ol-serif"
                style={{
                    fontSize: 32,
                    fontWeight: 400,
                    letterSpacing: "-0.02em",
                    color: "var(--fg)",
                }}
            >
                1,284
                <span style={{ fontSize: 16, color: "var(--fg-3)" }}>.50</span>
            </div>
            <div style={{ height: 1, background: "var(--line-soft)", margin: "12px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                {[
                    { name: "Groceries", v: 412, max: 600, c: "var(--brand)" },
                    { name: "Eating out", v: 184, max: 200, c: "var(--gold)" },
                    { name: "Transport", v: 64, max: 150, c: "var(--brand-2)" },
                ].map((r) => (
                    <div key={r.name}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                color: "var(--fg-2)",
                                marginBottom: 3,
                            }}
                        >
                            <span>{r.name}</span>
                            <span style={{ color: "var(--fg-3)" }}>
                                {r.v}/{r.max}
                            </span>
                        </div>
                        <div
                            style={{
                                height: 3,
                                background: "var(--bg-elev-3)",
                                borderRadius: 2,
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    width: `${Math.min(100, (r.v / r.max) * 100)}%`,
                                    height: "100%",
                                    background: r.c,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Recent transaction chip — front layer */}
        <div
            className="ol-card"
            style={{
                position: "absolute",
                bottom: 64,
                left: 0,
                width: 268,
                padding: "12px 14px",
                transform: "rotate(-4deg)",
                boxShadow: "var(--shadow-3)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "var(--bg-elev-1)",
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--brand-soft)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--brand)",
                    flexShrink: 0,
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M3 7h18l-2 12H5L3 7zm5 0V5a4 4 0 1 1 8 0v2"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--fg)" }}>
                    Trader Joe&apos;s
                </div>
                <div style={{ fontSize: 10.5, color: "var(--fg-3)" }}>Groceries · Maya</div>
            </div>
            <div
                style={{
                    fontFeatureSettings: "'tnum'",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--expense)",
                }}
            >
                −48.20
            </div>
        </div>

        {/* Members/avatars chip — front layer */}
        <div
            className="ol-card"
            style={{
                position: "absolute",
                bottom: 8,
                right: 56,
                padding: "10px 14px",
                boxShadow: "var(--shadow-3)",
                background: "var(--bg-elev-1)",
                display: "flex",
                alignItems: "center",
                gap: 10,
            }}
        >
            <div style={{ display: "flex" }}>
                {[
                    { i: "M", c: "oklch(70% 0.13 30)" },
                    { i: "S", c: "oklch(70% 0.13 200)" },
                    { i: "K", c: "oklch(70% 0.13 120)" },
                ].map((a, i) => (
                    <span
                        key={i}
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: a.c,
                            color: "white",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10.5,
                            fontWeight: 600,
                            marginLeft: i ? -8 : 0,
                            border: "2px solid var(--bg-elev-1)",
                        }}
                    >
                        {a.i}
                    </span>
                ))}
            </div>
            <span style={{ fontSize: 11.5, color: "var(--fg-2)" }}>
                3 in{" "}
                <em style={{ fontStyle: "normal", color: "var(--fg)" }}>Family Budget</em>
            </span>
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--income)",
                    boxShadow: "0 0 0 3px oklch(72% 0.14 165 / 0.18)",
                }}
            />
        </div>
    </div>
);

const TRUST = [
    {
        icon: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2v-9z",
        label: "Free for personal use",
    },
    {
        icon: "M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z M9 12l2 2 4-4",
        label: "Bank-grade encryption",
    },
    {
        icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
        label: "Built for shared households",
    },
];

export default function LandingPage() {
    return (
        <div className="orbit-design orbit-landing">
            <style>{LANDING_STYLES}</style>

            <div className="ol-cover">
                {/* Ambient gradient backdrop */}
                <span
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background:
                            "radial-gradient(60% 50% at 85% 10%, var(--brand-soft), transparent 70%), radial-gradient(50% 40% at 0% 100%, var(--gold-soft), transparent 70%)",
                    }}
                />
                {/* Subtle grid */}
                <span
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        opacity: 0.4,
                        backgroundImage:
                            "linear-gradient(var(--line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)",
                        backgroundSize: "80px 80px",
                        maskImage:
                            "radial-gradient(80% 60% at 50% 40%, black, transparent 80%)",
                        WebkitMaskImage:
                            "radial-gradient(80% 60% at 50% 40%, black, transparent 80%)",
                    }}
                />

                <div className="ol-nav-wrap">
                    <HeroNav />
                </div>

                <div className="ol-main-grid">
                    {/* Left: copy */}
                    <div className="ol-copy">
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 11px 5px 6px",
                                borderRadius: 999,
                                background: "var(--bg-elev-1)",
                                border: "1px solid var(--line)",
                                fontSize: 11.5,
                                color: "var(--fg-2)",
                                marginBottom: 28,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "var(--brand-soft)",
                                    color: "var(--brand)",
                                    letterSpacing: "0.04em",
                                }}
                            >
                                NEW
                            </span>
                            <span>Shared spaces &amp; live envelopes</span>
                            <svg
                                width="11"
                                height="11"
                                viewBox="0 0 16 16"
                                fill="none"
                                style={{ color: "var(--fg-4)" }}
                            >
                                <path
                                    d="M6 4l4 4-4 4"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>

                        <h1 className="ol-serif ol-hero-h1">
                            Plan, spend,
                            <br />
                            <em style={{ fontStyle: "italic", color: "var(--gold)" }}>
                                reconcile
                            </em>
                            .
                        </h1>

                        <p className="ol-hero-p">
                            One coherent picture across accounts, envelopes, and long-horizon
                            plans — for couples, families, and roommates who&apos;d rather talk
                            about life than spreadsheets.
                        </p>

                        <div className="ol-cta-row">
                            <Link
                                to={ROUTES.signup}
                                className="ol-btn ol-btn-primary ol-btn-lg"
                                style={{
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    paddingInline: 22,
                                }}
                            >
                                Start free
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                    <path
                                        d="M3 8h10m-4-4 4 4-4 4"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </Link>
                            <Link
                                to={ROUTES.docs}
                                className="ol-btn ol-btn-lg"
                                style={{
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                    <path
                                        d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z M14 3v6h6"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                                Read the docs
                            </Link>
                        </div>

                        {/* Trust line */}
                        <div className="ol-trust">
                            {TRUST.map((t) => (
                                <span
                                    key={t.label}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        style={{ color: "var(--brand)" }}
                                    >
                                        <path
                                            d={t.icon}
                                            stroke="currentColor"
                                            strokeWidth="1.6"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    {t.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right: product visual */}
                    <div className="ol-preview-wrap">
                        <HeroPreview />
                    </div>
                </div>

                {/* Footer / wordmark strip */}
                <div className="ol-footer">
                    <span>orbit.withtahmid.com</span>
                    <div className="ol-footer-right">
                        <span>v1.0 · April 2026</span>
                        <span
                            style={{
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: "var(--fg-4)",
                            }}
                        />
                        <a
                            href="https://github.com/withtahmid/Orbit"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg-4)", textDecoration: "none" }}
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

const LANDING_STYLES = `
.orbit-landing { min-height: 100vh; }

.orbit-landing .ol-serif {
    font-family: "Newsreader", "Iowan Old Style", Georgia, serif;
}

.orbit-landing .ol-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--fg-3);
}

.orbit-landing .ol-cover {
    width: 100%;
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    /* One inline-padding scale so nav, grid, and footer line up at every viewport.
       Designed for 1440 (80px) and scales fluidly down to 20px on phone. */
    --ol-px: clamp(20px, 5vw, 80px);
}

.orbit-landing .ol-nav-wrap {
    position: relative;
    padding: clamp(14px, 1.6vw, 22px) var(--ol-px) 0;
}
.orbit-landing .ol-nav-center {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--fg-2);
}

.orbit-landing .ol-main-grid {
    position: relative;
    flex: 1;
    padding: clamp(2rem, 5vh, 5rem) var(--ol-px);
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: clamp(1.5rem, 4vw, 4rem);
    align-content: center;
    align-items: center;
}

.orbit-landing .ol-copy {
    max-width: min(640px, 95%);
}

.orbit-landing .ol-hero-h1 {
    /* Design composes at 92px; clamp scales fluidly across breakpoints. */
    font-size: clamp(2.75rem, 7.4vw, 6.5rem);
    line-height: 0.95;
    font-weight: 400;
    letter-spacing: -0.035em;
    margin: 0;
    color: var(--fg);
}

.orbit-landing .ol-hero-p {
    /* Design uses 19px / 1.5 line-height. */
    font-size: clamp(1rem, 1.35vw, 1.25rem);
    line-height: 1.5;
    color: var(--fg-2);
    margin: clamp(1.25rem, 2.2vw, 1.75rem) 0 0;
    max-width: 56ch;
    font-weight: 400;
}

.orbit-landing .ol-cta-row {
    display: flex;
    gap: 10px;
    margin-top: clamp(1.5rem, 3vw, 2.25rem);
    align-items: center;
    flex-wrap: wrap;
}

.orbit-landing .ol-trust {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: clamp(1.25rem, 2.5vw, 2rem);
    font-size: 12px;
    color: var(--fg-3);
    flex-wrap: wrap;
}

.orbit-landing .ol-preview-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
}
.orbit-landing .ol-preview {
    position: relative;
    width: 620px;
    height: 540px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: center;
    transform: scale(var(--ol-preview-scale, 1));
}

.orbit-landing .ol-footer {
    position: relative;
    padding: clamp(1rem, 1.5vh, 1.5rem) var(--ol-px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    font-size: 11.5px;
    color: var(--fg-4);
    letter-spacing: 0.04em;
    border-top: 1px solid var(--line-soft);
    margin-top: 16px;
    flex-wrap: wrap;
}
.orbit-landing .ol-footer-right {
    display: flex;
    gap: 22px;
    align-items: center;
}

/* Preview scales proportionally to viewport. Original design is 620×540
   composed inside a 1440-wide layout, so we shrink it as the viewport
   narrows so it always fits next to the copy column. */
.orbit-landing { --ol-preview-scale: 1; }
@media (max-width: 1440px) { .orbit-landing { --ol-preview-scale: 0.9;  } }
@media (max-width: 1280px) { .orbit-landing { --ol-preview-scale: 0.8;  } }
@media (max-width: 1100px) { .orbit-landing { --ol-preview-scale: 0.7;  } }
@media (max-width: 900px)  { .orbit-landing { --ol-preview-scale: 0.85; } }
@media (max-width: 640px)  { .orbit-landing { --ol-preview-scale: 0.6;  } }

/* Tablet & below: collapse to single column, keep the visual centered. */
@media (max-width: 1023px) {
    .orbit-landing .ol-main-grid {
        grid-template-columns: 1fr;
        gap: clamp(1.5rem, 4vh, 2.5rem);
    }
    .orbit-landing .ol-preview-wrap { margin: -2vh 0; }
}

/* Phone: drop center nav, stack footer, collapse trust line spacing. */
@media (max-width: 640px) {
    .orbit-landing .ol-nav-center { display: none; }
    .orbit-landing .ol-footer {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.6rem;
    }
    .orbit-landing .ol-footer-right { flex-wrap: wrap; gap: 14px; }
    .orbit-landing .ol-preview-wrap { margin: -6vh 0; overflow: hidden; }
    .orbit-landing .ol-trust { gap: 12px; }
}

/* Very narrow: drop the preview entirely so copy gets the room. */
@media (max-width: 380px) {
    .orbit-landing .ol-preview-wrap { display: none; }
}

.orbit-landing .ol-card {
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: var(--shadow-1);
}

.orbit-landing .ol-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid var(--line);
    background: var(--bg-elev-1);
    color: var(--fg);
    transition: all 140ms ease;
    box-shadow: var(--shadow-1);
    font-family: inherit;
    cursor: pointer;
}
.orbit-landing .ol-btn:hover:not(.ol-btn-primary):not(.ol-btn-ghost) {
    background: var(--bg-elev-2);
    border-color: var(--line-strong);
}
.orbit-landing .ol-btn-primary {
    background: var(--brand);
    color: var(--brand-fg);
    border-color: oklch(78% 0.14 165);
    box-shadow: 0 1px 0 0 oklch(100% 0 0 / 0.18) inset, 0 6px 20px -6px var(--brand-glow);
}
.orbit-landing .ol-btn-primary:hover { filter: brightness(1.05); }
.orbit-landing .ol-btn-ghost {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
}
.orbit-landing .ol-btn-ghost:hover { background: var(--bg-elev-2); }
.orbit-landing .ol-btn-sm { height: 30px; padding: 0 10px; font-size: 12px; }
.orbit-landing .ol-btn-lg { height: 44px; padding: 0 18px; font-size: 14px; }

.orbit-landing .ol-navlink {
    color: var(--fg-2);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 8px;
    transition: all 140ms;
    font-size: 13px;
}
.orbit-landing .ol-navlink:hover {
    background: var(--bg-elev-2);
    color: var(--fg);
}

@keyframes ol-orbit-pulse {
    0%   { transform: scale(1);   opacity: 0.5; }
    100% { transform: scale(2.6); opacity: 0;   }
}
`;
