import React from "react";

interface VerificationCodeEmailProps {
    code: string;
    email: string;
}

const VerificationCodeEmail: React.FC<VerificationCodeEmailProps> = ({ code, email }) => (
    <div
        style={{
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            maxWidth: "480px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            overflow: "hidden",
        }}
    >
        <div
            style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
                padding: "32px 24px",
                textAlign: "center" as const,
            }}
        >
            <h1 style={{ color: "#ffffff", margin: 0, fontSize: "24px", fontWeight: 600 }}>
                Verify your email
            </h1>
        </div>

        <div style={{ padding: "32px 24px" }}>
            <p style={{ color: "#374151", fontSize: "15px", lineHeight: "1.6", margin: "0 0 8px 0" }}>
                Hi there,
            </p>
            <p style={{ color: "#374151", fontSize: "15px", lineHeight: "1.6", margin: "0 0 24px 0" }}>
                Use the verification code below to complete your signup for <strong>{email}</strong>:
            </p>

            <div
                style={{
                    background: "#f3f4f6",
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center" as const,
                    margin: "0 0 24px 0",
                }}
            >
                <span
                    style={{
                        fontSize: "36px",
                        fontWeight: 700,
                        letterSpacing: "8px",
                        color: "#6366f1",
                        fontFamily: "'Courier New', monospace",
                    }}
                >
                    {code}
                </span>
            </div>

            <p style={{ color: "#6b7280", fontSize: "13px", lineHeight: "1.5", margin: "0 0 8px 0" }}>
                This code expires in <strong>10 minutes</strong>.
            </p>
            <p style={{ color: "#6b7280", fontSize: "13px", lineHeight: "1.5", margin: 0 }}>
                If you didn't request this code, you can safely ignore this email.
            </p>
        </div>

        <div
            style={{
                borderTop: "1px solid #e5e7eb",
                padding: "16px 24px",
                textAlign: "center" as const,
            }}
        >
            <p style={{ color: "#9ca3af", fontSize: "12px", margin: 0 }}>
                © {new Date().getFullYear()} Orbit. All rights reserved.
            </p>
        </div>
    </div>
);

export default VerificationCodeEmail;
