/**
 * Shared Orbit logo (mark + wordmark) used across the editorial-dark
 * design pages — landing, auth, space selector. The "Orbit" wordmark
 * picks up the .display class from orbit-design.css when rendered
 * inside an .orbit-design scope.
 */
export const OrbitLogo = ({
    size = 26,
    withWord = true,
}: {
    size?: number;
    withWord?: boolean;
}) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
            <ellipse
                cx="12"
                cy="12"
                rx="10"
                ry="4.2"
                stroke="var(--brand)"
                strokeWidth="1.1"
                opacity="0.55"
                transform="rotate(-22 12 12)"
            />
            <ellipse
                cx="12"
                cy="12"
                rx="10"
                ry="4.2"
                stroke="var(--brand)"
                strokeWidth="1.1"
                opacity="0.85"
                transform="rotate(28 12 12)"
            />
            <circle cx="12" cy="12" r="2.4" fill="var(--brand)" />
        </svg>
        {withWord && (
            <span
                className="display"
                style={{
                    fontSize: size * 0.78,
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                    color: "var(--fg)",
                }}
            >
                Orbit
            </span>
        )}
    </span>
);
