import React from "react";

interface SpaceInviteEmailProps {
    spaceName: string;
    inviterName: string;
    role: string;
    acceptUrl: string;
    expiresInHours: number;
}

const ROLE_LABEL: Record<string, string> = {
    owner: "an Owner",
    editor: "an Editor",
    viewer: "a Viewer",
};

const formatRole = (role: string) =>
    ROLE_LABEL[role.toLowerCase()] ??
    `a ${role.charAt(0).toUpperCase()}${role.slice(1)}`;

const fontStack =
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const SpaceInviteEmail: React.FC<SpaceInviteEmailProps> = ({
    spaceName,
    inviterName,
    role,
    acceptUrl,
    expiresInHours,
}) => (
    <div style={{ backgroundColor: "#0a1312", padding: "32px 16px", fontFamily: fontStack }}>
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
                    You&apos;re invited
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
                    <strong>{inviterName}</strong> invited you to join{" "}
                    <strong style={{ color: "#14eb94" }}>{spaceName}</strong> on Orbit as{" "}
                    <strong>{formatRole(role)}</strong>.
                </p>

                <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
                    <a
                        href={acceptUrl}
                        style={{
                            display: "inline-block",
                            background: "#14eb94",
                            color: "#05140f",
                            padding: "12px 24px",
                            borderRadius: "10px",
                            fontWeight: 600,
                            fontSize: "14px",
                            textDecoration: "none",
                        }}
                    >
                        Accept invite
                    </a>
                </div>

                <p
                    style={{
                        color: "#9caba9",
                        fontSize: "12px",
                        lineHeight: "1.5",
                        margin: "0 0 4px 0",
                        wordBreak: "break-all" as const,
                    }}
                >
                    Or paste this link into your browser:
                    <br />
                    <span style={{ color: "#c5d0ce" }}>{acceptUrl}</span>
                </p>

                <p
                    style={{
                        color: "#9caba9",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        margin: "16px 0 0 0",
                    }}
                >
                    This invite expires in{" "}
                    <strong style={{ color: "#c5d0ce" }}>{expiresInHours} hours</strong>. If you
                    didn&apos;t expect it, you can safely ignore this email.
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

export default SpaceInviteEmail;
