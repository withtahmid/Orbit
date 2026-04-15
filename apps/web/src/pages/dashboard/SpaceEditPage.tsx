import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

type MemberRole = "owner" | "editor" | "viewer";

const roleOptions: MemberRole[] = ["owner", "editor", "viewer"];
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeRole = (role: unknown): MemberRole => {
    const value = Array.isArray(role) ? role[0] : role;

    if (value === "owner" || value === "editor" || value === "viewer") {
        return value;
    }

    return "viewer";
};

export function SpaceEditPage() {
    const { id } = useParams<{ id: string }>();
    const isCreateMode = id === "new";
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const spacesQuery = trpc.space.list.useQuery(undefined, {
        enabled: !isCreateMode,
    });

    const currentSpace = useMemo(() => {
        if (isCreateMode || !id) return undefined;
        return spacesQuery.data?.find((space) => space.id === id);
    }, [id, isCreateMode, spacesQuery.data]);

    const memberListQuery = trpc.space.memberList.useQuery(
        { spaceId: id ?? "" },
        {
            enabled: !isCreateMode && Boolean(id),
        }
    );

    const [spaceName, setSpaceName] = useState("");
    const [memberEmail, setMemberEmail] = useState("");
    const [memberDebouncedEmail, setMemberDebouncedEmail] = useState("");
    const [memberSelectedUser, setMemberSelectedUser] = useState<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
    } | null>(null);
    const [memberRole, setMemberRole] = useState<MemberRole>("viewer");
    const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, MemberRole>>({});
    const [activeMemberActionId, setActiveMemberActionId] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setMemberDebouncedEmail(memberEmail.trim());
        }, 350);

        return () => clearTimeout(timer);
    }, [memberEmail]);

    const memberLookupQuery = trpc.auth.findUserByEmail.useQuery(
        { email: memberDebouncedEmail },
        {
            enabled: isValidEmail(memberDebouncedEmail) && !memberSelectedUser,
        }
    );

    useEffect(() => {
        if (isCreateMode) {
            setSpaceName("");
            return;
        }

        if (currentSpace) {
            setSpaceName(currentSpace.name);
        }
    }, [currentSpace, isCreateMode]);

    const createMutation = trpc.space.create.useMutation({
        onSuccess: async (created) => {
            await utils.space.list.invalidate();
            navigate(ROUTES.spaceEdit(created.id), { replace: true });
        },
    });

    const updateMutation = trpc.space.update.useMutation({
        onSuccess: async () => {
            await utils.space.list.invalidate();
        },
    });

    const addMemberMutation = trpc.space.addMembers.useMutation({
        onSuccess: async () => {
            await utils.space.list.invalidate();
            await memberListQuery.refetch();
        },
    });

    const changeRoleMutation = trpc.space.changeMemberRole.useMutation();

    const removeMemberMutation = trpc.space.removeMember.useMutation();

    const deleteMutation = trpc.space.delete.useMutation({
        onSuccess: async () => {
            await utils.space.list.invalidate();
            navigate(ROUTES.spaces, { replace: true });
        },
    });

    const normalizedMembers = useMemo(() => {
        return (
            memberListQuery.data?.map((member) => ({
                ...member,
                role: normalizeRole(member.role),
            })) ?? []
        );
    }, [memberListQuery.data]);

    useEffect(() => {
        if (normalizedMembers.length === 0) {
            setMemberRoleDrafts({});
            return;
        }

        setMemberRoleDrafts((previous) => {
            const next: Record<string, MemberRole> = {};

            for (const member of normalizedMembers) {
                next[member.id] = previous[member.id] ?? member.role;
            }

            return next;
        });
    }, [normalizedMembers]);

    if (!id) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    if (!isCreateMode && !spacesQuery.isLoading && !currentSpace) {
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

    const clearMessages = () => {
        setError("");
        setStatus("");
    };

    const requireExistingSpace = (): string | null => {
        if (!id || isCreateMode) {
            setError("Create the space first, then manage members.");
            return null;
        }

        return id;
    };

    const handleCreateOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearMessages();

        try {
            if (isCreateMode) {
                await createMutation.mutateAsync({ name: spaceName.trim() });
                setStatus("Space created successfully.");
                return;
            }

            const spaceId = requireExistingSpace();
            if (!spaceId) return;

            const result = await updateMutation.mutateAsync({
                spaceId,
                name: spaceName.trim(),
            });
            setStatus(`Space name updated to ${result.name}.`);
        } catch (err: any) {
            setError(err?.message || "Failed to save space.");
        }
    };

    const handleAddMember = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearMessages();

        const spaceId = requireExistingSpace();
        if (!spaceId) return;

        if (!memberSelectedUser) {
            setError("Select a user by email before adding member.");
            return;
        }

        try {
            const result = await addMemberMutation.mutateAsync({
                spaceId,
                members: [{ userId: memberSelectedUser.id, role: memberRole }],
            });
            setMemberEmail("");
            setMemberDebouncedEmail("");
            setMemberSelectedUser(null);
            setStatus(`Member flow complete. Added ${result.addedCount} member(s).`);
        } catch (err: any) {
            setError(err?.message || "Failed to add member.");
        }
    };

    const handleApplyRole = async (userId: string) => {
        clearMessages();

        const spaceId = requireExistingSpace();
        if (!spaceId) return;

        const nextRole = memberRoleDrafts[userId];

        if (!nextRole) {
            setError("Select a valid role before updating.");
            return;
        }

        try {
            setActiveMemberActionId(userId);
            await changeRoleMutation.mutateAsync({
                spaceId,
                userId,
                role: nextRole,
            });

            await memberListQuery.refetch();
            setStatus("Member role updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to change role.");
        } finally {
            setActiveMemberActionId(null);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        clearMessages();

        const spaceId = requireExistingSpace();
        if (!spaceId) return;

        try {
            setActiveMemberActionId(userId);
            await removeMemberMutation.mutateAsync({
                spaceId,
                userIds: [userId],
            });

            await memberListQuery.refetch();
            setStatus("Member removed successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to remove member.");
        } finally {
            setActiveMemberActionId(null);
        }
    };

    const handleDeleteSpace = async () => {
        clearMessages();

        const spaceId = requireExistingSpace();
        if (!spaceId) return;

        try {
            await deleteMutation.mutateAsync({ spaceId });
        } catch (err: any) {
            setError(err?.message || "Failed to delete space.");
        }
    };

    const isBusy =
        createMutation.isPending ||
        updateMutation.isPending ||
        addMemberMutation.isPending ||
        changeRoleMutation.isPending ||
        removeMemberMutation.isPending ||
        deleteMutation.isPending;

    const memberSuggestion =
        memberLookupQuery.data && !memberSelectedUser ? [memberLookupQuery.data] : [];

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Space Control</p>
                    <h1 className="spaces-page__title">
                        {isCreateMode ? "Create Space" : "Edit Space"}
                    </h1>
                </div>
                <Link
                    to={isCreateMode ? ROUTES.spaces : ROUTES.spaceDetail(id)}
                    className="signup-link"
                >
                    Back
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
                        <h2>{isCreateMode ? "Create" : "Rename"} space</h2>
                        <form className="signup-form" onSubmit={handleCreateOrUpdate}>
                            <div className="signup-field">
                                <label htmlFor="space-name" className="signup-field__label">
                                    Space name
                                </label>
                                <input
                                    id="space-name"
                                    className="signup-field__input"
                                    value={spaceName}
                                    onChange={(event) => setSpaceName(event.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={isBusy || !spaceName.trim()}
                            >
                                {isCreateMode ? "Create space" : "Save changes"}
                            </button>
                        </form>
                    </article>

                    {!isCreateMode && (
                        <article className="space-card space-card--form">
                            <h2>Add member</h2>
                            <form className="signup-form" onSubmit={handleAddMember}>
                                <div className="signup-field">
                                    <label htmlFor="add-member-email" className="signup-field__label">
                                        User email
                                    </label>
                                    <input
                                        id="add-member-email"
                                        className="signup-field__input"
                                        value={memberEmail}
                                        onChange={(event) => {
                                            setMemberEmail(event.target.value);
                                            setMemberSelectedUser(null);
                                        }}
                                        placeholder="user@example.com"
                                        required
                                    />
                                    {memberLookupQuery.isFetching && (
                                        <p className="spaces-suggestion__hint">Searching user...</p>
                                    )}
                                    {!memberLookupQuery.isFetching &&
                                        memberDebouncedEmail.length > 0 &&
                                        isValidEmail(memberDebouncedEmail) &&
                                        !memberLookupQuery.data &&
                                        !memberSelectedUser && (
                                            <p className="spaces-suggestion__hint">
                                                No user found for this email.
                                            </p>
                                        )}

                                    {memberSuggestion.length > 0 && (
                                        <div className="spaces-suggestion">
                                            {memberSuggestion.map((user) => (
                                                <button
                                                    key={user.id}
                                                    type="button"
                                                    className="spaces-suggestion__item"
                                                    onClick={() => {
                                                        setMemberSelectedUser(user);
                                                        setMemberEmail(user.email);
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

                                    {memberSelectedUser && (
                                        <p className="spaces-suggestion__picked">
                                            Selected: {memberSelectedUser.first_name}{" "}
                                            {memberSelectedUser.last_name}
                                        </p>
                                    )}
                                </div>
                                <div className="signup-field">
                                    <label htmlFor="add-member-role" className="signup-field__label">
                                        Role
                                    </label>
                                    <select
                                        id="add-member-role"
                                        className="signup-field__input"
                                        value={memberRole}
                                        onChange={(event) =>
                                            setMemberRole(event.target.value as MemberRole)
                                        }
                                    >
                                        {roleOptions.map((role) => (
                                            <option key={role} value={role}>
                                                {role}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    className="signup-btn signup-btn--primary"
                                    disabled={isBusy || !memberEmail.trim() || !memberSelectedUser}
                                >
                                    Add member
                                </button>
                            </form>
                        </article>
                    )}

                    {!isCreateMode && (
                        <article className="space-card space-card--danger">
                            <h2>Danger zone</h2>
                            <p>Deleting a space removes linked members and scoped resources.</p>
                            <button
                                className="signup-btn spaces-btn--danger"
                                onClick={handleDeleteSpace}
                                disabled={isBusy}
                            >
                                Delete this space
                            </button>
                        </article>
                    )}
                </div>

                {!isCreateMode && (
                    <article className="space-card space-card--members">
                        <div className="space-members__header">
                            <h2>Members</h2>
                            {memberListQuery.isLoading && (
                                <span className="spaces-suggestion__hint">Loading members...</span>
                            )}
                        </div>

                        {memberListQuery.error && (
                            <div className="signup-alert signup-alert--error" role="alert">
                                Failed to load members.
                            </div>
                        )}

                        {!memberListQuery.isLoading && !memberListQuery.error && normalizedMembers.length === 0 && (
                            <p className="spaces-suggestion__hint">No members found in this space.</p>
                        )}

                        {normalizedMembers.length > 0 && (
                            <div className="space-members-table">
                                <div className="space-members-table__head">
                                    <span>User</span>
                                    <span>Email</span>
                                    <span>Role</span>
                                    <span>Actions</span>
                                </div>
                                {normalizedMembers.map((member) => {
                                    const selectedRole = memberRoleDrafts[member.id] ?? member.role;
                                    const roleChanged = selectedRole !== member.role;
                                    const rowBusy = isBusy && activeMemberActionId === member.id;

                                    return (
                                        <div key={member.id} className="space-members-table__row">
                                            <div className="space-members-table__user">
                                                <strong>{member.first_name + " " + member.last_name}</strong>
                                                <small>{member.id}</small>
                                            </div>
                                            <span>{member.email}</span>
                                            <select
                                                className="signup-field__input"
                                                value={selectedRole}
                                                onChange={(event) =>
                                                    setMemberRoleDrafts((previous) => ({
                                                        ...previous,
                                                        [member.id]: event.target.value as MemberRole,
                                                    }))
                                                }
                                                disabled={rowBusy}
                                            >
                                                {roleOptions.map((role) => (
                                                    <option key={role} value={role}>
                                                        {role}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="space-members-table__actions">
                                                <button
                                                    className="signup-btn signup-btn--primary space-members-table__btn"
                                                    type="button"
                                                    disabled={!roleChanged || rowBusy}
                                                    onClick={() => handleApplyRole(member.id)}
                                                >
                                                    Save role
                                                </button>
                                                <button
                                                    className="signup-btn spaces-btn--danger space-members-table__btn"
                                                    type="button"
                                                    disabled={rowBusy}
                                                    onClick={() => handleRemoveMember(member.id)}
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
                )}
            </div>
        </section>
    );
}
