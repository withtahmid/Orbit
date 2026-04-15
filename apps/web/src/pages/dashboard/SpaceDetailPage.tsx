import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

export function SpaceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const spacesQuery = trpc.space.list.useQuery();
    const [accountName, setAccountName] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    if (!id) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    const accountsBySpaceQuery = trpc.account.listBySpace.useQuery({
        spaceId: id,
    });

    const myAccountsQuery = trpc.account.listByUser.useQuery();
    const utils = trpc.useUtils();

    const createAccountMutation = trpc.account.create.useMutation({
        onSuccess: async () => {
            await accountsBySpaceQuery.refetch();
            await utils.account.listByUser.invalidate();
        },
    });

    const currentSpace = spacesQuery.data?.find((space) => space.id === id);

    if (!spacesQuery.isLoading && !currentSpace) {
        return (
            <section className="spaces-page">
                <div className="spaces-empty-state">
                    <h1>Space not found</h1>
                    <p>The selected space is not available for your account.</p>
                    <Link to={ROUTES.spaces} className="signup-link">
                        Back to spaces
                    </Link>
                </div>
            </section>
        );
    }

    const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            const result = await createAccountMutation.mutateAsync({
                space_id: id,
                name: accountName.trim(),
            });

            setAccountName("");
            setStatus(`Account ${result.name} created.`);
        } catch (err: any) {
            setError(err?.message || "Failed to create account.");
        }
    };

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Space</p>
                    <h1 className="spaces-page__title">{currentSpace?.name ?? "Loading..."}</h1>
                </div>
                <Link
                    className="signup-btn signup-btn--primary spaces-page__create-btn"
                    to={ROUTES.spaceEdit(id)}
                >
                    Light Settings / Edit
                </Link>
            </header>

            {(status || error) && (
                <div
                    className={`signup-alert ${error ? "signup-alert--error" : "spaces-alert--success"}`}
                    role="status"
                >
                    {error || status}
                </div>
            )}

            <div className="space-edit-layout">
                <div className="space-edit-layout__left">
                    <article className="space-card space-card--form">
                        <h2>Create account in this space</h2>
                        <form className="signup-form" onSubmit={handleCreateAccount}>
                            <div className="signup-field">
                                <label htmlFor="new-account-name" className="signup-field__label">
                                    Account name
                                </label>
                                <input
                                    id="new-account-name"
                                    className="signup-field__input"
                                    value={accountName}
                                    onChange={(event) => setAccountName(event.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={createAccountMutation.isPending || !accountName.trim()}
                            >
                                Create account
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--form">
                        <h2>My account summary</h2>
                        {myAccountsQuery.isLoading && (
                            <p className="spaces-suggestion__hint">Loading your accounts...</p>
                        )}
                        {!myAccountsQuery.isLoading && (
                            <p className="spaces-suggestion__hint">
                                You currently have access to {myAccountsQuery.data?.length ?? 0}{" "}
                                account(s).
                            </p>
                        )}
                    </article>
                </div>

                <article className="space-card space-card--members">
                    <div className="space-members__header">
                        <h2>Accounts in this space</h2>
                        {accountsBySpaceQuery.isLoading && (
                            <span className="spaces-suggestion__hint">Loading accounts...</span>
                        )}
                    </div>

                    {accountsBySpaceQuery.error && (
                        <div className="signup-alert signup-alert--error" role="alert">
                            Failed to load accounts.
                        </div>
                    )}

                    {!accountsBySpaceQuery.isLoading &&
                        !accountsBySpaceQuery.error &&
                        accountsBySpaceQuery.data?.length === 0 && (
                            <p className="spaces-suggestion__hint">
                                No accounts yet. Create one using the form.
                            </p>
                        )}

                    {accountsBySpaceQuery.data && accountsBySpaceQuery.data.length > 0 && (
                        <div className="space-members-table">
                            <div className="space-members-table__head">
                                <span>Account</span>
                                <span>Identifier</span>
                                <span>Status</span>
                                <span>Actions</span>
                            </div>
                            {accountsBySpaceQuery.data.map((account) => (
                                <div key={account.id} className="space-members-table__row">
                                    <div className="space-members-table__user">
                                        <strong>{account.name}</strong>
                                    </div>
                                    <span>{account.id}</span>
                                    <span>Active</span>
                                    <div className="space-members-table__actions">
                                        <Link
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            to={ROUTES.accountInSpace(id, account.id)}
                                        >
                                            Manage
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </div>
        </section>
    );
}
