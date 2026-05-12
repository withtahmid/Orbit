import { Link, useNavigate, useParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, LogIn } from "lucide-react";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { RoleBadge } from "@/components/shared/RoleBadge";
import type { SpaceRole } from "@/lib/permissions";

export default observer(function AcceptInvitePage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { authStore } = useStore();
    const utils = trpc.useUtils();

    const infoQuery = trpc.space.inviteInfo.useQuery(
        { token: token ?? "" },
        { enabled: !!token, retry: false }
    );

    const accept = trpc.space.acceptInvite.useMutation({
        onSuccess: async ({ spaceId }) => {
            toast.success("Welcome to the space");
            await utils.space.list.invalidate();
            navigate(ROUTES.space(spaceId), { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    if (authStore.isLoading || (token && infoQuery.isLoading)) {
        return (
            <InviteShell>
                <Spinner />
            </InviteShell>
        );
    }

    if (!token) {
        return (
            <InviteShell>
                <ErrorState
                    title="No invite token"
                    body="The link you followed is missing the invite token."
                />
            </InviteShell>
        );
    }

    if (infoQuery.isError || !infoQuery.data) {
        return (
            <InviteShell>
                <ErrorState
                    title="Invite not found"
                    body="This link may have been mistyped, revoked, or the space removed."
                />
            </InviteShell>
        );
    }

    const info = infoQuery.data;

    if (info.status === "revoked") {
        return (
            <InviteShell>
                <ErrorState
                    title="Invite revoked"
                    body={`The invite to "${info.spaceName}" was cancelled by an admin.`}
                />
            </InviteShell>
        );
    }
    if (info.status === "expired") {
        return (
            <InviteShell>
                <ErrorState
                    title="Invite expired"
                    body={`Ask ${info.inviterName || "the inviter"} to send a fresh invite.`}
                />
            </InviteShell>
        );
    }
    if (info.status === "accepted") {
        return (
            <InviteShell>
                <AcceptedState spaceName={info.spaceName} />
            </InviteShell>
        );
    }

    if (!authStore.isAuthenticated) {
        const from = ROUTES.inviteAccept(token);
        return (
            <InviteShell>
                <InviteSummary info={info} />
                <div className="grid gap-2">
                    <Link
                        to={`${ROUTES.login}?from=${encodeURIComponent(from)}`}
                        className="ai-btn ai-btn-primary"
                    >
                        <LogIn className="size-4" />
                        Sign in to accept
                    </Link>
                    <Link
                        to={`${ROUTES.signup}?from=${encodeURIComponent(from)}`}
                        className="ai-btn"
                    >
                        Create an account
                    </Link>
                    <p className="text-center text-[11px] text-muted-foreground">
                        Invited as <strong>{info.email}</strong>. You can accept with any
                        Orbit account.
                    </p>
                </div>
            </InviteShell>
        );
    }

    const currentEmail = authStore.user?.email ?? "";
    const emailMismatch =
        !!currentEmail &&
        currentEmail.toLowerCase() !== info.email.toLowerCase();

    return (
        <InviteShell>
            <InviteSummary info={info} />
            {emailMismatch && (
                <div className="ai-mismatch" role="status">
                    <AlertTriangle className="size-4" aria-hidden />
                    <span>
                        Invited as <strong>{info.email}</strong>, but you&apos;re signed
                        in as <strong>{currentEmail}</strong>. You&apos;ll join the space
                        under your current account.
                    </span>
                </div>
            )}
            <button
                type="button"
                className="ai-btn ai-btn-primary"
                disabled={accept.isPending}
                onClick={() => accept.mutate({ token })}
            >
                {accept.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {accept.isPending ? "Accepting…" : `Accept and open ${info.spaceName}`}
            </button>
            {emailMismatch && (
                <Link
                    to={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.inviteAccept(token))}`}
                    onClick={() => authStore.clearAuth()}
                    className="ai-btn-ghost"
                >
                    Sign in as a different account
                </Link>
            )}
            <Link to={ROUTES.spaces} className="ai-btn-ghost">
                Not now
            </Link>
        </InviteShell>
    );
});

function InviteShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="orbit-design ai-page">
            <style>{INVITE_STYLES}</style>
            <div className="ai-card">
                <div className="ai-eyebrow">Orbit · Invite</div>
                <div className="ai-card-body">{children}</div>
            </div>
        </div>
    );
}

function InviteSummary({
    info,
}: {
    info: {
        email: string;
        role: SpaceRole;
        spaceName: string;
        inviterName: string;
        expiresAt: string;
    };
}) {
    const exp = new Date(info.expiresAt);
    return (
        <div className="grid gap-3">
            <h1 className="ai-title">
                <span className="ai-title-strong">{info.inviterName || "Someone"}</span>{" "}
                invited you to{" "}
                <span className="ai-title-brand">{info.spaceName}</span>
            </h1>
            <div className="ai-meta">
                <div>
                    <span className="ai-meta-label">Role</span>
                    <span className="ai-meta-value">
                        <RoleBadge role={info.role} />
                    </span>
                </div>
                <div>
                    <span className="ai-meta-label">Invited email</span>
                    <span className="ai-meta-value">{info.email}</span>
                </div>
                <div>
                    <span className="ai-meta-label">Expires</span>
                    <span className="ai-meta-value">
                        {exp.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
}

function ErrorState({ title, body }: { title: string; body: string }) {
    return (
        <div className="grid place-items-center gap-3 text-center">
            <span className="ai-icon ai-icon-warn">
                <AlertTriangle className="size-5" />
            </span>
            <h2 className="ai-title">{title}</h2>
            <p className="ai-subtitle">{body}</p>
            <Link to={ROUTES.root} className="ai-btn-ghost">
                Back to Orbit
            </Link>
        </div>
    );
}

function AcceptedState({ spaceName }: { spaceName: string }) {
    return (
        <div className="grid place-items-center gap-3 text-center">
            <span className="ai-icon ai-icon-ok">
                <CheckCircle2 className="size-5" />
            </span>
            <h2 className="ai-title">Already accepted</h2>
            <p className="ai-subtitle">
                You&apos;re already a member of <strong>{spaceName}</strong>.
            </p>
            <Link to={ROUTES.spaces} className="ai-btn">
                Go to your spaces
            </Link>
        </div>
    );
}

function Spinner() {
    return (
        <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
    );
}

const INVITE_STYLES = `
.ai-page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
    font-family: inherit;
}
.ai-card {
    width: 100%;
    max-width: 460px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 24px 48px -24px rgba(0,0,0,0.4);
}
.ai-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brand);
    margin-bottom: 18px;
}
.ai-card-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
}
.ai-title {
    font-family: "Newsreader", Georgia, serif;
    font-size: 24px;
    line-height: 1.25;
    font-weight: 500;
    color: var(--fg);
    margin: 0;
    letter-spacing: -0.01em;
}
.ai-title-strong { color: var(--fg); font-weight: 600; }
.ai-title-brand { color: var(--brand); }
.ai-subtitle {
    color: var(--fg-2);
    font-size: 13.5px;
    line-height: 1.55;
    margin: 0;
}
.ai-meta {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
}
.ai-meta > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
}
.ai-meta-label { color: var(--fg-3); }
.ai-meta-value { color: var(--fg); font-weight: 500; }
.ai-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.ai-icon-warn {
    color: var(--expense);
    background: color-mix(in oklab, var(--expense) 12%, transparent);
}
.ai-icon-ok {
    color: var(--income);
    background: color-mix(in oklab, var(--income) 12%, transparent);
}
.ai-btn, .ai-btn-primary, .ai-btn-ghost {
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--bg-elev-1);
    color: var(--fg);
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    font-family: inherit;
}
.ai-btn:hover { background: var(--bg-elev-2); }
.ai-btn-primary {
    background: var(--brand);
    color: var(--brand-fg);
    border-color: var(--brand);
}
.ai-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.ai-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.ai-btn-ghost {
    border: 0;
    background: transparent;
    color: var(--fg-2);
    font-size: 12.5px;
}
.ai-btn-ghost:hover { color: var(--fg); }
.ai-mismatch {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--expense) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--expense) 28%, transparent);
    color: var(--fg);
    font-size: 12.5px;
    line-height: 1.5;
}
.ai-mismatch > svg {
    color: var(--expense);
    flex-shrink: 0;
    margin-top: 1px;
}
`;
