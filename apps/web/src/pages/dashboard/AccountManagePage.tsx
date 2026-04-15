import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

type AccountRole = "owner" | "viewer";

const accountRoleOptions: AccountRole[] = ["owner", "viewer"];
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeAccountRole = (role: unknown): AccountRole => {
    const value = Array.isArray(role) ? role[0] : role;
    return value === "owner" ? "owner" : "viewer";
};

export function AccountManagePage() {
    const { id: spaceId, accountId } = useParams<{ id: string; accountId: string }>();
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const [accountName, setAccountName] = useState("");
    const [addMemberEmail, setAddMemberEmail] = useState("");
    const [addMemberDebouncedEmail, setAddMemberDebouncedEmail] = useState("");
    const [addMemberRole, setAddMemberRole] = useState<AccountRole>("viewer");
    const [addMemberSelectedUser, setAddMemberSelectedUser] = useState<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
    } | null>(null);
    const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, AccountRole>>({});
    const [activeMemberActionId, setActiveMemberActionId] = useState<string | null>(null);

    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const accountsBySpaceQuery = trpc.account.listBySpace.useQuery(
        { spaceId: spaceId ?? "" },
        {
            enabled: Boolean(spaceId),
        }
    );

    const currentAccount = useMemo(() => {
        return accountsBySpaceQuery.data?.find((account) => account.id === accountId);
    }, [accountId, accountsBySpaceQuery.data]);

    const accountUsersQuery = trpc.account.listUsers.useQuery(
        { accountId: accountId ?? "" },
        {
            enabled: Boolean(accountId),
        }
    );

    const normalizedUsers = useMemo(
        () =>
            accountUsersQuery.data?.map((user) => ({
                ...user,
                role: normalizeAccountRole(user.role),
            })) ?? [],
        [accountUsersQuery.data]
    );

    useEffect(() => {
        if (normalizedUsers.length === 0) {
            setMemberRoleDrafts({});
            return;
        }

        setMemberRoleDrafts((previous) => {
            const next: Record<string, AccountRole> = {};

            for (const user of normalizedUsers) {
                next[user.id] = previous[user.id] ?? user.role;
            }

            return next;
        });
    }, [normalizedUsers]);

    useEffect(() => {
        if (currentAccount) {
            setAccountName(currentAccount.name);
        }
    }, [currentAccount]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setAddMemberDebouncedEmail(addMemberEmail.trim());
        }, 350);

        return () => clearTimeout(timer);
    }, [addMemberEmail]);

    const addMemberLookupQuery = trpc.auth.findUserByEmail.useQuery(
        { email: addMemberDebouncedEmail },
        {
            enabled: isValidEmail(addMemberDebouncedEmail) && !addMemberSelectedUser,
        }
    );

    const updateMutation = trpc.account.update.useMutation({
        onSuccess: async () => {
            await accountsBySpaceQuery.refetch();
            await utils.account.listByUser.invalidate();
        },
    });

    const addMemberMutation = trpc.account.addMember.useMutation();
    const removeMemberMutation = trpc.account.removeMember.useMutation();

    const deleteMutation = trpc.account.delete.useMutation({
        onSuccess: async () => {
            await utils.account.listByUser.invalidate();
            await accountsBySpaceQuery.refetch();
            await accountUsersQuery.refetch();
            if (spaceId) {
                navigate(ROUTES.spaceDetail(spaceId), { replace: true });
            }
        },
    });

    if (!spaceId || !accountId) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    if (!accountsBySpaceQuery.isLoading && !currentAccount) {
        return (
            <section className="spaces-page">
                <div className="spaces-empty-state">
                    <h1>Account not found</h1>
                    <p>The selected account is not available in this space.</p>
                    <Link to={ROUTES.spaceDetail(spaceId)} className="signup-link">
                        Back to space
                    </Link>
                </div>
            </section>
        );
    }

    const clearMessages = () => {
        setError("");
        setStatus("");
    };

    const addSuggestion =
        addMemberLookupQuery.data && !addMemberSelectedUser ? [addMemberLookupQuery.data] : [];
    const isBusy =
        updateMutation.isPending ||
        addMemberMutation.isPending ||
        removeMemberMutation.isPending ||
        deleteMutation.isPending;

    const handleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearMessages();

        try {
            await updateMutation.mutateAsync({
                accountId,
                name: accountName.trim(),
            });
            setStatus("Account updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update account.");
        }
    };

    const handleAddMember = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearMessages();

        if (!addMemberSelectedUser) {
            setError("Select a user by email first.");
            return;
        }

        try {
            await addMemberMutation.mutateAsync({
                accountId,
                users: [
                    {
                        id: addMemberSelectedUser.id,
                        role: addMemberRole,
                    },
                ],
            });

            await accountUsersQuery.refetch();
            setAddMemberEmail("");
            setAddMemberDebouncedEmail("");
            setAddMemberSelectedUser(null);
            setStatus("Member added to account successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to add account member.");
        }
    };

    const handleApplyMemberRole = async (userId: string) => {
        clearMessages();

        const selectedRole = memberRoleDrafts[userId];
        if (!selectedRole) {
            setError("Select a valid role first.");
            return;
        }

        try {
            setActiveMemberActionId(userId);
            await addMemberMutation.mutateAsync({
                accountId,
                users: [
                    {
                        id: userId,
                        role: selectedRole,
                    },
                ],
            });

            await accountUsersQuery.refetch();

            setStatus("Member access updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update member access.");
        } finally {
            setActiveMemberActionId(null);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        clearMessages();

        try {
            setActiveMemberActionId(userId);
            await removeMemberMutation.mutateAsync({
                accountId,
                userIds: [userId],
            });

            await accountUsersQuery.refetch();

            setStatus("Member removed from account successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to remove account member.");
        } finally {
            setActiveMemberActionId(null);
        }
    };

    const handleDelete = async () => {
        clearMessages();

        try {
            await deleteMutation.mutateAsync({ accountId });
        } catch (err: any) {
            setError(err?.message || "Failed to delete account.");
        }
    };

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Account Settings</p>
                    <h1 className="spaces-page__title">{currentAccount?.name ?? "Loading..."}</h1>
                </div>
                <Link to={ROUTES.spaceDetail(spaceId)} className="signup-link">
                    Back to space
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
                        <h2>Rename account</h2>
                        <form className="signup-form" onSubmit={handleSave}>
                            <div className="signup-field">
                                <label htmlFor="account-name" className="signup-field__label">
                                    Account name
                                </label>
                                <input
                                    id="account-name"
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
                                disabled={isBusy || !accountName.trim()}
                            >
                                Save account
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--danger">
                        <h2>Danger zone</h2>
                        <p>Deleting this account removes account memberships and balances.</p>
                        <button
                            className="signup-btn spaces-btn--danger"
                            onClick={handleDelete}
                            disabled={isBusy}
                        >
                            Delete account
                        </button>
                    </article>
                </div>

                <div className="space-edit-layout__left">
                    <article className="space-card space-card--form">
                        <h2>Add account member</h2>
                        <form className="signup-form" onSubmit={handleAddMember}>
                            <div className="signup-field">
                                <label
                                    htmlFor="add-account-member-email"
                                    className="signup-field__label"
                                >
                                    User email
                                </label>
                                <input
                                    id="add-account-member-email"
                                    className="signup-field__input"
                                    value={addMemberEmail}
                                    onChange={(event) => {
                                        setAddMemberEmail(event.target.value);
                                        setAddMemberSelectedUser(null);
                                    }}
                                    placeholder="user@example.com"
                                    required
                                />
                                {addMemberLookupQuery.isFetching && (
                                    <p className="spaces-suggestion__hint">Searching user...</p>
                                )}
                                {!addMemberLookupQuery.isFetching &&
                                    addMemberDebouncedEmail.length > 0 &&
                                    isValidEmail(addMemberDebouncedEmail) &&
                                    !addMemberLookupQuery.data &&
                                    !addMemberSelectedUser && (
                                        <p className="spaces-suggestion__hint">
                                            No user found for this email.
                                        </p>
                                    )}

                                {addSuggestion.length > 0 && (
                                    <div className="spaces-suggestion">
                                        {addSuggestion.map((user) => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                className="spaces-suggestion__item"
                                                onClick={() => {
                                                    setAddMemberSelectedUser(user);
                                                    setAddMemberEmail(user.email);
                                                }}
                                            >
                                                <span>
                                                    {user.first_name + " " + user.last_name}
                                                </span>
                                                <small>{user.email}</small>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="signup-field">
                                <label
                                    htmlFor="add-account-member-role"
                                    className="signup-field__label"
                                >
                                    Role
                                </label>
                                <select
                                    id="add-account-member-role"
                                    className="signup-field__input"
                                    value={addMemberRole}
                                    onChange={(event) =>
                                        setAddMemberRole(event.target.value as AccountRole)
                                    }
                                >
                                    {accountRoleOptions.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={isBusy || !addMemberSelectedUser}
                            >
                                Add member
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--members">
                        <div className="space-members__header">
                            <h2>Account access</h2>
                            {accountUsersQuery.isLoading && (
                                <span className="spaces-suggestion__hint">Loading users...</span>
                            )}
                        </div>

                        {accountUsersQuery.error && (
                            <div className="signup-alert signup-alert--error" role="alert">
                                Failed to load account users.
                            </div>
                        )}

                        {!accountUsersQuery.isLoading &&
                            !accountUsersQuery.error &&
                            normalizedUsers.length === 0 && (
                                <p className="spaces-suggestion__hint">
                                    No users have access to this account.
                                </p>
                            )}

                        {normalizedUsers.length > 0 && (
                            <div className="space-members-table">
                                <div className="space-members-table__head">
                                    <span>User</span>
                                    <span>Email</span>
                                    <span>Role</span>
                                    <span>Actions</span>
                                </div>
                                {normalizedUsers.map((user) => {
                                    const selectedRole = memberRoleDrafts[user.id] ?? user.role;
                                    const roleChanged = selectedRole !== user.role;
                                    const rowBusy = activeMemberActionId === user.id && isBusy;

                                    return (
                                        <div key={user.id} className="space-members-table__row">
                                            <div className="space-members-table__user">
                                                <strong>
                                                    {user.first_name + " " + user.last_name}
                                                </strong>
                                                <small>{user.id}</small>
                                            </div>
                                            <span>{user.email}</span>
                                            <select
                                                className="signup-field__input"
                                                value={selectedRole}
                                                onChange={(event) =>
                                                    setMemberRoleDrafts((previous) => ({
                                                        ...previous,
                                                        [user.id]: event.target
                                                            .value as AccountRole,
                                                    }))
                                                }
                                                disabled={rowBusy}
                                            >
                                                {accountRoleOptions.map((role) => (
                                                    <option key={role} value={role}>
                                                        {role}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="space-members-table__actions">
                                                <button
                                                    type="button"
                                                    className="signup-btn signup-btn--primary space-members-table__btn"
                                                    disabled={rowBusy || !roleChanged}
                                                    onClick={() => handleApplyMemberRole(user.id)}
                                                >
                                                    Save role
                                                </button>
                                                <button
                                                    type="button"
                                                    className="signup-btn spaces-btn--danger space-members-table__btn"
                                                    disabled={rowBusy}
                                                    onClick={() => handleRemoveMember(user.id)}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </article>
                </div>
            </div>
        </section>
    );
}
