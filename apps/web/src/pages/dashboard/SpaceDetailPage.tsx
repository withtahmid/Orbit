import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

const toDateTimeLocal = (value: string | Date) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
};

const toDisplayDateTime = (value: string | Date) =>
    new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
    });

export function SpaceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const spacesQuery = trpc.space.list.useQuery();
    const [accountName, setAccountName] = useState("");
    const [eventName, setEventName] = useState("");
    const [eventStartAt, setEventStartAt] = useState("");
    const [eventEndAt, setEventEndAt] = useState("");
    const [eventDrafts, setEventDrafts] = useState<
        Record<string, { name: string; startAt: string; endAt: string }>
    >({});
    const [activeEventActionId, setActiveEventActionId] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    if (!id) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    const accountsBySpaceQuery = trpc.account.listBySpace.useQuery({
        spaceId: id,
    });
    const eventsBySpaceQuery = trpc.event.listBySpace.useQuery({
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

    const createEventMutation = trpc.event.create.useMutation({
        onSuccess: async () => {
            await eventsBySpaceQuery.refetch();
        },
    });

    const updateEventMutation = trpc.event.update.useMutation({
        onSuccess: async () => {
            await eventsBySpaceQuery.refetch();
        },
    });

    const deleteEventMutation = trpc.event.delete.useMutation({
        onSuccess: async () => {
            await eventsBySpaceQuery.refetch();
        },
    });

    const currentSpace = spacesQuery.data?.find((space) => space.id === id);

    const eventsWithDrafts =
        eventsBySpaceQuery.data?.map((event) => {
            const draft = eventDrafts[event.id] ?? {
                name: event.name,
                startAt: toDateTimeLocal(event.start_time),
                endAt: toDateTimeLocal(event.end_time),
            };

            return { event, draft };
        }) ?? [];

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

    const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            await createEventMutation.mutateAsync({
                spaceId: id,
                name: eventName.trim(),
                startTime: new Date(eventStartAt),
                endTime: new Date(eventEndAt),
            });

            setEventName("");
            setEventStartAt("");
            setEventEndAt("");
            setStatus("Event created successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create event.");
        }
    };

    const handleSaveEvent = async (eventId: string) => {
        const draft = eventDrafts[eventId];
        if (!draft) {
            return;
        }

        setStatus("");
        setError("");

        try {
            setActiveEventActionId(eventId);
            await updateEventMutation.mutateAsync({
                eventId,
                name: draft.name.trim(),
                startTime: new Date(draft.startAt),
                endTime: new Date(draft.endAt),
            });
            setStatus("Event updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update event.");
        } finally {
            setActiveEventActionId(null);
        }
    };

    const handleDeleteEvent = async (eventId: string) => {
        setStatus("");
        setError("");

        try {
            setActiveEventActionId(eventId);
            await deleteEventMutation.mutateAsync({ eventId });
            setStatus("Event deleted successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to delete event.");
        } finally {
            setActiveEventActionId(null);
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

                    <article className="space-card space-card--form">
                        <h2>Create event in this space</h2>
                        <form className="signup-form" onSubmit={handleCreateEvent}>
                            <div className="signup-field">
                                <label htmlFor="new-event-name" className="signup-field__label">
                                    Event name
                                </label>
                                <input
                                    id="new-event-name"
                                    className="signup-field__input"
                                    value={eventName}
                                    onChange={(e) => setEventName(e.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>
                            <div className="signup-field">
                                <label htmlFor="new-event-start" className="signup-field__label">
                                    Start
                                </label>
                                <input
                                    id="new-event-start"
                                    type="datetime-local"
                                    className="signup-field__input"
                                    value={eventStartAt}
                                    onChange={(e) => setEventStartAt(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="signup-field">
                                <label htmlFor="new-event-end" className="signup-field__label">
                                    End
                                </label>
                                <input
                                    id="new-event-end"
                                    type="datetime-local"
                                    className="signup-field__input"
                                    value={eventEndAt}
                                    onChange={(e) => setEventEndAt(e.target.value)}
                                    required
                                />
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={
                                    createEventMutation.isPending ||
                                    !eventName.trim() ||
                                    !eventStartAt ||
                                    !eventEndAt
                                }
                            >
                                Create event
                            </button>
                        </form>
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

            <article className="space-card space-card--members" style={{ marginTop: 14 }}>
                <div className="space-members__header">
                    <h2>Events in this space</h2>
                    {eventsBySpaceQuery.isLoading && (
                        <span className="spaces-suggestion__hint">Loading events...</span>
                    )}
                </div>

                {eventsBySpaceQuery.error && (
                    <div className="signup-alert signup-alert--error" role="alert">
                        Failed to load events.
                    </div>
                )}

                {!eventsBySpaceQuery.isLoading &&
                    !eventsBySpaceQuery.error &&
                    eventsWithDrafts.length === 0 && (
                        <p className="spaces-suggestion__hint">
                            No events yet. Create one from the form.
                        </p>
                    )}

                {eventsWithDrafts.length > 0 && (
                    <div className="space-members-table">
                        <div className="space-members-table__head">
                            <span>Event</span>
                            <span>Start</span>
                            <span>End</span>
                            <span>Actions</span>
                        </div>
                        {eventsWithDrafts.map(({ event, draft }) => {
                            const isRowBusy = activeEventActionId === event.id;
                            return (
                                <div key={event.id} className="space-members-table__row">
                                    <input
                                        className="signup-field__input"
                                        value={draft.name}
                                        onChange={(e) =>
                                            setEventDrafts((previous) => ({
                                                ...previous,
                                                [event.id]: {
                                                    ...draft,
                                                    name: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    />
                                    <div>
                                        <input
                                            type="datetime-local"
                                            className="signup-field__input"
                                            value={draft.startAt}
                                            onChange={(e) =>
                                                setEventDrafts((previous) => ({
                                                    ...previous,
                                                    [event.id]: {
                                                        ...draft,
                                                        startAt: e.target.value,
                                                    },
                                                }))
                                            }
                                            disabled={isRowBusy}
                                        />
                                        <small className="spaces-suggestion__hint">
                                            {toDisplayDateTime(event.start_time)}
                                        </small>
                                    </div>
                                    <div>
                                        <input
                                            type="datetime-local"
                                            className="signup-field__input"
                                            value={draft.endAt}
                                            onChange={(e) =>
                                                setEventDrafts((previous) => ({
                                                    ...previous,
                                                    [event.id]: {
                                                        ...draft,
                                                        endAt: e.target.value,
                                                    },
                                                }))
                                            }
                                            disabled={isRowBusy}
                                        />
                                        <small className="spaces-suggestion__hint">
                                            {toDisplayDateTime(event.end_time)}
                                        </small>
                                    </div>
                                    <div className="space-members-table__actions">
                                        <button
                                            type="button"
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            disabled={
                                                isRowBusy ||
                                                !draft.name.trim() ||
                                                !draft.startAt ||
                                                !draft.endAt
                                            }
                                            onClick={() => handleSaveEvent(event.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-btn spaces-btn--danger space-members-table__btn"
                                            disabled={isRowBusy}
                                            onClick={() => handleDeleteEvent(event.id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </article>
        </section>
    );
}
