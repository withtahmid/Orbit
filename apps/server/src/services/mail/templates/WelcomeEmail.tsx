import React from "react";

interface WelcomeEmailProps {
    name: string;
}

const fontStack =
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const WelcomeEmail: React.FC<WelcomeEmailProps> = ({ name }) => (
    <div
        style={{
            backgroundColor: "#0a1312",
            padding: "32px 16px",
            fontFamily: fontStack,
        }}
    >
        <div
            style={{
                maxWidth: "480px",
                margin: "0 auto",
                backgroundColor: "#121c1b",
                border: "1px solid #1f2625",
                borderRadius: "12px",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    background: "linear-gradient(135deg, #14eb94 0%, #24c5b4 100%)",
                    padding: "32px 24px",
                    textAlign: "center" as const,
                }}
            >
                <div
                    style={{
                        color: "#05140f",
                        fontSize: "12px",
                        fontWeight: 700,
                        letterSpacing: "3px",
                        textTransform: "uppercase" as const,
                        marginBottom: "8px",
                    }}
                >
                    Orbit
                </div>
                <h1
                    style={{
                        color: "#05140f",
                        margin: 0,
                        fontSize: "22px",
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                    }}
                >
                    Welcome, {name}
                </h1>
            </div>

            <div style={{ padding: "32px 24px" }}>
                <p
                    style={{
                        color: "#f1f5f4",
                        fontSize: "15px",
                        lineHeight: "1.6",
                        margin: "0 0 16px 0",
                    }}
                >
                    Your account is ready.
                </p>
                <p
                    style={{
                        color: "#c5d0ce",
                        fontSize: "15px",
                        lineHeight: "1.6",
                        margin: "0 0 24px 0",
                    }}
                >
                    Orbit helps you track spaces, envelopes, and transactions — all in one place.
                    Jump in and set up your first space to get started.
                </p>

                <p
                    style={{
                        color: "#9caba9",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        margin: 0,
                    }}
                >
                    If you have any questions, just reply to this email — we&apos;re happy to help.
                </p>
            </div>

            <div
                style={{
                    borderTop: "1px solid #1f2625",
                    padding: "16px 24px",
                    textAlign: "center" as const,
                    backgroundColor: "#0f1817",
                }}
            >
                <p style={{ color: "#6b7a78", fontSize: "12px", margin: 0 }}>
                    © {new Date().getFullYear()} Orbit. All rights reserved.
                </p>
            </div>
        </div>
    </div>
);

export default WelcomeEmail;
