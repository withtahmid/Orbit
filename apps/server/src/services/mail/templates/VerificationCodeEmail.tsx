import React from "react";

interface VerificationCodeEmailProps {
    code: string;
    email: string;
}

const fontStack =
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const VerificationCodeEmail: React.FC<VerificationCodeEmailProps> = ({ code, email }) => (
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
                    Verify your email
                </h1>
            </div>

            <div style={{ padding: "32px 24px" }}>
                <p
                    style={{
                        color: "#f1f5f4",
                        fontSize: "15px",
                        lineHeight: "1.6",
                        margin: "0 0 8px 0",
                    }}
                >
                    Hi there,
                </p>
                <p
                    style={{
                        color: "#c5d0ce",
                        fontSize: "15px",
                        lineHeight: "1.6",
                        margin: "0 0 24px 0",
                    }}
                >
                    Use the verification code below to continue with{" "}
                    <strong style={{ color: "#f1f5f4" }}>{email}</strong>:
                </p>

                <div
                    style={{
                        background: "#0a1312",
                        border: "1px solid #1f2625",
                        borderRadius: "12px",
                        padding: "24px",
                        textAlign: "center" as const,
                        margin: "0 0 24px 0",
                    }}
                >
                    <span
                        style={{
                            fontSize: "36px",
                            fontWeight: 700,
                            letterSpacing: "10px",
                            color: "#14eb94",
                            fontFamily:
                                "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                        }}
                    >
                        {code}
                    </span>
                </div>

                <p
                    style={{
                        color: "#9caba9",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        margin: "0 0 8px 0",
                    }}
                >
                    This code expires in{" "}
                    <strong style={{ color: "#c5d0ce" }}>10 minutes</strong>.
                </p>
                <p
                    style={{
                        color: "#9caba9",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        margin: 0,
                    }}
                >
                    If you didn&apos;t request this code, you can safely ignore this email.
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

export default VerificationCodeEmail;
