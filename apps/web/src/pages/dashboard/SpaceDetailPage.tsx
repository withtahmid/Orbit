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
    const [envelopName, setEnvelopName] = useState("");
    const [allocationEnvelopId, setAllocationEnvelopId] = useState("");
    const [allocationAmount, setAllocationAmount] = useState("");
    const [planName, setPlanName] = useState("");
    const [expenseCategoryName, setExpenseCategoryName] = useState("");
    const [expenseCategoryParentId, setExpenseCategoryParentId] = useState("");
    const [expenseCategoryEnvelopId, setExpenseCategoryEnvelopId] = useState("");
    const [eventDrafts, setEventDrafts] = useState<
        Record<string, { name: string; startAt: string; endAt: string }>
    >({});
    const [envelopDrafts, setEnvelopDrafts] = useState<Record<string, { name: string }>>({});
    const [planDrafts, setPlanDrafts] = useState<Record<string, { name: string }>>({});
    const [expenseCategoryDrafts, setExpenseCategoryDrafts] = useState<
        Record<string, { name: string; envelopId: string; parentId: string }>
    >({});
    const [activeEventActionId, setActiveEventActionId] = useState<string | null>(null);
    const [activeEnvelopActionId, setActiveEnvelopActionId] = useState<string | null>(null);
    const [activeAllocationActionId, setActiveAllocationActionId] = useState<string | null>(null);
    const [activePlanActionId, setActivePlanActionId] = useState<string | null>(null);
    const [activeExpenseCategoryActionId, setActiveExpenseCategoryActionId] = useState<
        string | null
    >(null);
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
    const envelopsBySpaceQuery = trpc.envelop.listBySpace.useQuery({
        spaceId: id,
    });
    const envelopAllocationsBySpaceQuery = trpc.envelop.allocationListBySpace.useQuery({
        spaceId: id,
    });
    const plansBySpaceQuery = trpc.plan.listBySpace.useQuery({
        spaceId: id,
    });
    const expenseCategoriesBySpaceQuery = trpc.expenseCategory.listBySpace.useQuery({
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

    const createEnvelopMutation = trpc.envelop.create.useMutation({
        onSuccess: async () => {
            await envelopsBySpaceQuery.refetch();
        },
    });

    const updateEnvelopMutation = trpc.envelop.update.useMutation({
        onSuccess: async () => {
            await envelopsBySpaceQuery.refetch();
        },
    });

    const deleteEnvelopMutation = trpc.envelop.delete.useMutation({
        onSuccess: async () => {
            await envelopsBySpaceQuery.refetch();
        },
    });

    const createEnvelopAllocationMutation = trpc.envelop.allocationCreate.useMutation({
        onSuccess: async () => {
            await envelopAllocationsBySpaceQuery.refetch();
        },
    });

    const deleteEnvelopAllocationMutation = trpc.envelop.allocationDelete.useMutation({
        onSuccess: async () => {
            await envelopAllocationsBySpaceQuery.refetch();
        },
    });

    const createPlanMutation = trpc.plan.create.useMutation({
        onSuccess: async () => {
            await plansBySpaceQuery.refetch();
        },
    });

    const updatePlanMutation = trpc.plan.update.useMutation({
        onSuccess: async () => {
            await plansBySpaceQuery.refetch();
        },
    });

    const deletePlanMutation = trpc.plan.delete.useMutation({
        onSuccess: async () => {
            await plansBySpaceQuery.refetch();
        },
    });

    const createExpenseCategoryMutation = trpc.expenseCategory.create.useMutation({
        onSuccess: async () => {
            await expenseCategoriesBySpaceQuery.refetch();
        },
    });

    const updateExpenseCategoryMutation = trpc.expenseCategory.update.useMutation({
        onSuccess: async () => {
            await expenseCategoriesBySpaceQuery.refetch();
        },
    });

    const changeExpenseCategoryParentMutation = trpc.expenseCategory.changeParent.useMutation({
        onSuccess: async () => {
            await expenseCategoriesBySpaceQuery.refetch();
        },
    });

    const deleteExpenseCategoryMutation = trpc.expenseCategory.delete.useMutation({
        onSuccess: async () => {
            await expenseCategoriesBySpaceQuery.refetch();
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

    const envelopsWithDrafts =
        envelopsBySpaceQuery.data?.map((envelop) => {
            const draft = envelopDrafts[envelop.id] ?? {
                name: envelop.name,
            };

            return { envelop, draft };
        }) ?? [];

    const plansWithDrafts =
        plansBySpaceQuery.data?.map((plan) => {
            const draft = planDrafts[plan.id] ?? {
                name: plan.name,
            };

            return { plan, draft };
        }) ?? [];

    const expenseCategoriesWithDrafts =
        expenseCategoriesBySpaceQuery.data?.map((category) => {
            const draft = expenseCategoryDrafts[category.id] ?? {
                name: category.name,
                envelopId: category.envelop_id,
                parentId: category.parent_id ?? "",
            };

            return { category, draft };
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

    const handleCreateEnvelop = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            await createEnvelopMutation.mutateAsync({
                spaceId: id,
                name: envelopName.trim(),
            });

            setEnvelopName("");
            setStatus("Envelop created successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create envelop.");
        }
    };

    const handleCreatePlan = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            await createPlanMutation.mutateAsync({
                spaceId: id,
                name: planName.trim(),
            });

            setPlanName("");
            setStatus("Plan created successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create plan.");
        }
    };

    const handleCreateEnvelopAllocation = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            await createEnvelopAllocationMutation.mutateAsync({
                envelopId: allocationEnvelopId,
                amount: Number(allocationAmount),
            });

            setAllocationAmount("");
            setStatus("Envelop allocation added successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create envelop allocation.");
        }
    };

    const handleCreateExpenseCategory = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("");
        setError("");

        try {
            await createExpenseCategoryMutation.mutateAsync({
                spaceId: id,
                name: expenseCategoryName.trim(),
                parentId: expenseCategoryParentId || null,
                envelopId: expenseCategoryEnvelopId,
            });

            setExpenseCategoryName("");
            setExpenseCategoryParentId("");
            setExpenseCategoryEnvelopId("");
            setStatus("Expense category created successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create expense category.");
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

    const handleSaveEnvelop = async (envelopId: string) => {
        const draft = envelopDrafts[envelopId];
        if (!draft) {
            return;
        }

        setStatus("");
        setError("");

        try {
            setActiveEnvelopActionId(envelopId);
            await updateEnvelopMutation.mutateAsync({
                envelopId,
                name: draft.name.trim(),
            });
            setStatus("Envelop updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update envelop.");
        } finally {
            setActiveEnvelopActionId(null);
        }
    };

    const handleDeleteEnvelop = async (envelopId: string) => {
        setStatus("");
        setError("");

        try {
            setActiveEnvelopActionId(envelopId);
            await deleteEnvelopMutation.mutateAsync({ envelopId });
            setStatus("Envelop deleted successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to delete envelop.");
        } finally {
            setActiveEnvelopActionId(null);
        }
    };

    const handleDeleteEnvelopAllocation = async (allocationId: string) => {
        setStatus("");
        setError("");

        try {
            setActiveAllocationActionId(allocationId);
            await deleteEnvelopAllocationMutation.mutateAsync({ allocationId });
            setStatus("Envelop allocation deleted successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to delete envelop allocation.");
        } finally {
            setActiveAllocationActionId(null);
        }
    };

    const handleSavePlan = async (planId: string) => {
        const draft = planDrafts[planId];
        if (!draft) {
            return;
        }

        setStatus("");
        setError("");

        try {
            setActivePlanActionId(planId);
            await updatePlanMutation.mutateAsync({
                planId,
                name: draft.name.trim(),
            });
            setStatus("Plan updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update plan.");
        } finally {
            setActivePlanActionId(null);
        }
    };

    const handleDeletePlan = async (planId: string) => {
        setStatus("");
        setError("");

        try {
            setActivePlanActionId(planId);
            await deletePlanMutation.mutateAsync({ planId });
            setStatus("Plan deleted successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to delete plan.");
        } finally {
            setActivePlanActionId(null);
        }
    };

    const handleSaveExpenseCategory = async (categoryId: string) => {
        const draft = expenseCategoryDrafts[categoryId];
        if (!draft) {
            return;
        }

        setStatus("");
        setError("");

        try {
            setActiveExpenseCategoryActionId(categoryId);
            await updateExpenseCategoryMutation.mutateAsync({
                categoryId,
                name: draft.name.trim(),
                envelopId: draft.envelopId,
            });
            setStatus("Expense category updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to update expense category.");
        } finally {
            setActiveExpenseCategoryActionId(null);
        }
    };

    const handleChangeExpenseCategoryParent = async (categoryId: string) => {
        const draft = expenseCategoryDrafts[categoryId];
        if (!draft) {
            return;
        }

        setStatus("");
        setError("");

        try {
            setActiveExpenseCategoryActionId(categoryId);
            await changeExpenseCategoryParentMutation.mutateAsync({
                categoryId,
                parentId: draft.parentId || null,
            });
            setStatus("Category parent updated successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to change category parent.");
        } finally {
            setActiveExpenseCategoryActionId(null);
        }
    };

    const handleDeleteExpenseCategory = async (categoryId: string) => {
        setStatus("");
        setError("");

        try {
            setActiveExpenseCategoryActionId(categoryId);
            await deleteExpenseCategoryMutation.mutateAsync({ categoryId });
            setStatus("Expense category deleted successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to delete expense category.");
        } finally {
            setActiveExpenseCategoryActionId(null);
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
                <Link
                    className="signup-btn signup-btn--primary spaces-page__create-btn"
                    to={ROUTES.spaceTransactions(id)}
                >
                    Transactions
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

                    <article className="space-card space-card--form">
                        <h2>Create envelop in this space</h2>
                        <form className="signup-form" onSubmit={handleCreateEnvelop}>
                            <div className="signup-field">
                                <label htmlFor="new-envelop-name" className="signup-field__label">
                                    Envelop name
                                </label>
                                <input
                                    id="new-envelop-name"
                                    className="signup-field__input"
                                    value={envelopName}
                                    onChange={(e) => setEnvelopName(e.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={createEnvelopMutation.isPending || !envelopName.trim()}
                            >
                                Create envelop
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--form">
                        <h2>Create plan in this space</h2>
                        <form className="signup-form" onSubmit={handleCreatePlan}>
                            <div className="signup-field">
                                <label htmlFor="new-plan-name" className="signup-field__label">
                                    Plan name
                                </label>
                                <input
                                    id="new-plan-name"
                                    className="signup-field__input"
                                    value={planName}
                                    onChange={(e) => setPlanName(e.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>
                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={createPlanMutation.isPending || !planName.trim()}
                            >
                                Create plan
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--form">
                        <h2>Allocate to an envelop</h2>
                        <form className="signup-form" onSubmit={handleCreateEnvelopAllocation}>
                            <div className="signup-field">
                                <label
                                    htmlFor="new-envelop-allocation-envelop"
                                    className="signup-field__label"
                                >
                                    Envelop
                                </label>
                                <select
                                    id="new-envelop-allocation-envelop"
                                    className="signup-field__input"
                                    value={allocationEnvelopId}
                                    onChange={(e) => setAllocationEnvelopId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>
                                        Select envelop
                                    </option>
                                    {envelopsBySpaceQuery.data?.map((envelop) => (
                                        <option key={envelop.id} value={envelop.id}>
                                            {envelop.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="new-envelop-allocation-amount"
                                    className="signup-field__label"
                                >
                                    Amount
                                </label>
                                <input
                                    id="new-envelop-allocation-amount"
                                    className="signup-field__input"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={allocationAmount}
                                    onChange={(e) => setAllocationAmount(e.target.value)}
                                    required
                                />
                            </div>

                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={
                                    createEnvelopAllocationMutation.isPending ||
                                    !allocationEnvelopId ||
                                    !allocationAmount ||
                                    Number(allocationAmount) <= 0
                                }
                            >
                                Add allocation
                            </button>
                        </form>
                    </article>

                    <article className="space-card space-card--form">
                        <h2>Create expense category</h2>
                        <form className="signup-form" onSubmit={handleCreateExpenseCategory}>
                            <div className="signup-field">
                                <label
                                    htmlFor="new-expense-category-name"
                                    className="signup-field__label"
                                >
                                    Category name
                                </label>
                                <input
                                    id="new-expense-category-name"
                                    className="signup-field__input"
                                    value={expenseCategoryName}
                                    onChange={(e) => setExpenseCategoryName(e.target.value)}
                                    minLength={1}
                                    maxLength={255}
                                    required
                                />
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="new-expense-category-parent"
                                    className="signup-field__label"
                                >
                                    Parent category (optional)
                                </label>
                                <select
                                    id="new-expense-category-parent"
                                    className="signup-field__input"
                                    value={expenseCategoryParentId}
                                    onChange={(e) => setExpenseCategoryParentId(e.target.value)}
                                >
                                    <option value="">Root category</option>
                                    {expenseCategoriesBySpaceQuery.data?.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="new-expense-category-envelop"
                                    className="signup-field__label"
                                >
                                    Linked envelop
                                </label>
                                <select
                                    id="new-expense-category-envelop"
                                    className="signup-field__input"
                                    value={expenseCategoryEnvelopId}
                                    onChange={(e) => setExpenseCategoryEnvelopId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>
                                        Select envelop
                                    </option>
                                    {envelopsBySpaceQuery.data?.map((envelop) => (
                                        <option key={envelop.id} value={envelop.id}>
                                            {envelop.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={
                                    createExpenseCategoryMutation.isPending ||
                                    !expenseCategoryName.trim() ||
                                    !expenseCategoryEnvelopId
                                }
                            >
                                Create category
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

            <article className="space-card space-card--members" style={{ marginTop: 14 }}>
                <div className="space-members__header">
                    <h2>Envelops in this space</h2>
                    {envelopsBySpaceQuery.isLoading && (
                        <span className="spaces-suggestion__hint">Loading envelops...</span>
                    )}
                </div>

                {envelopsBySpaceQuery.error && (
                    <div className="signup-alert signup-alert--error" role="alert">
                        Failed to load envelops.
                    </div>
                )}

                {!envelopsBySpaceQuery.isLoading &&
                    !envelopsBySpaceQuery.error &&
                    envelopsWithDrafts.length === 0 && (
                        <p className="spaces-suggestion__hint">
                            No envelops yet. Create one from the form.
                        </p>
                    )}

                {envelopsWithDrafts.length > 0 && (
                    <div className="space-members-table">
                        <div className="space-members-table__head">
                            <span>Envelop</span>
                            <span>Created</span>
                            <span>Updated</span>
                            <span>Actions</span>
                        </div>
                        {envelopsWithDrafts.map(({ envelop, draft }) => {
                            const isRowBusy = activeEnvelopActionId === envelop.id;
                            return (
                                <div key={envelop.id} className="space-members-table__row">
                                    <input
                                        className="signup-field__input"
                                        value={draft.name}
                                        onChange={(e) =>
                                            setEnvelopDrafts((previous) => ({
                                                ...previous,
                                                [envelop.id]: {
                                                    name: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    />
                                    <span>{toDisplayDateTime(envelop.created_at)}</span>
                                    <span>
                                        {envelop.updated_at
                                            ? toDisplayDateTime(envelop.updated_at)
                                            : "-"}
                                    </span>
                                    <div className="space-members-table__actions">
                                        <button
                                            type="button"
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            disabled={isRowBusy || !draft.name.trim()}
                                            onClick={() => handleSaveEnvelop(envelop.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-btn spaces-btn--danger space-members-table__btn"
                                            disabled={isRowBusy}
                                            onClick={() => handleDeleteEnvelop(envelop.id)}
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

            <article className="space-card space-card--members" style={{ marginTop: 14 }}>
                <div className="space-members__header">
                    <h2>Envelop allocations in this space</h2>
                    {envelopAllocationsBySpaceQuery.isLoading && (
                        <span className="spaces-suggestion__hint">Loading allocations...</span>
                    )}
                </div>

                {envelopAllocationsBySpaceQuery.error && (
                    <div className="signup-alert signup-alert--error" role="alert">
                        Failed to load envelop allocations.
                    </div>
                )}

                {!envelopAllocationsBySpaceQuery.isLoading &&
                    !envelopAllocationsBySpaceQuery.error &&
                    (envelopAllocationsBySpaceQuery.data?.length ?? 0) === 0 && (
                        <p className="spaces-suggestion__hint">
                            No allocations yet. Add one from the form.
                        </p>
                    )}

                {(envelopAllocationsBySpaceQuery.data?.length ?? 0) > 0 && (
                    <div className="space-members-table">
                        <div className="space-members-table__head">
                            <span>Envelop</span>
                            <span>Amount</span>
                            <span>Created</span>
                            <span>Actions</span>
                        </div>
                        {envelopAllocationsBySpaceQuery.data?.map((allocation) => {
                            const envelopNameLabel =
                                envelopsBySpaceQuery.data?.find(
                                    (envelop) => envelop.id === allocation.envelop_id
                                )?.name ?? allocation.envelop_id;
                            const isBusy = activeAllocationActionId === allocation.id;

                            return (
                                <div key={allocation.id} className="space-members-table__row">
                                    <span>{envelopNameLabel}</span>
                                    <span>{allocation.amount}</span>
                                    <span>{toDisplayDateTime(allocation.created_at)}</span>
                                    <div className="space-members-table__actions">
                                        <button
                                            type="button"
                                            className="signup-btn spaces-btn--danger space-members-table__btn"
                                            disabled={isBusy}
                                            onClick={() =>
                                                handleDeleteEnvelopAllocation(allocation.id)
                                            }
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

            <article className="space-card space-card--members" style={{ marginTop: 14 }}>
                <div className="space-members__header">
                    <h2>Plans in this space</h2>
                    {plansBySpaceQuery.isLoading && (
                        <span className="spaces-suggestion__hint">Loading plans...</span>
                    )}
                </div>

                {plansBySpaceQuery.error && (
                    <div className="signup-alert signup-alert--error" role="alert">
                        Failed to load plans.
                    </div>
                )}

                {!plansBySpaceQuery.isLoading &&
                    !plansBySpaceQuery.error &&
                    plansWithDrafts.length === 0 && (
                        <p className="spaces-suggestion__hint">
                            No plans yet. Create one from the form.
                        </p>
                    )}

                {plansWithDrafts.length > 0 && (
                    <div className="space-members-table">
                        <div className="space-members-table__head">
                            <span>Plan</span>
                            <span>Created</span>
                            <span>Updated</span>
                            <span>Actions</span>
                        </div>
                        {plansWithDrafts.map(({ plan, draft }) => {
                            const isRowBusy = activePlanActionId === plan.id;
                            return (
                                <div key={plan.id} className="space-members-table__row">
                                    <input
                                        className="signup-field__input"
                                        value={draft.name}
                                        onChange={(e) =>
                                            setPlanDrafts((previous) => ({
                                                ...previous,
                                                [plan.id]: {
                                                    name: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    />
                                    <span>{toDisplayDateTime(plan.created_at)}</span>
                                    <span>
                                        {plan.updated_at ? toDisplayDateTime(plan.updated_at) : "-"}
                                    </span>
                                    <div className="space-members-table__actions">
                                        <button
                                            type="button"
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            disabled={isRowBusy || !draft.name.trim()}
                                            onClick={() => handleSavePlan(plan.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-btn spaces-btn--danger space-members-table__btn"
                                            disabled={isRowBusy}
                                            onClick={() => handleDeletePlan(plan.id)}
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

            <article className="space-card space-card--members" style={{ marginTop: 14 }}>
                <div className="space-members__header">
                    <h2>Expense categories in this space</h2>
                    {expenseCategoriesBySpaceQuery.isLoading && (
                        <span className="spaces-suggestion__hint">Loading categories...</span>
                    )}
                </div>

                {expenseCategoriesBySpaceQuery.error && (
                    <div className="signup-alert signup-alert--error" role="alert">
                        Failed to load expense categories.
                    </div>
                )}

                {!expenseCategoriesBySpaceQuery.isLoading &&
                    !expenseCategoriesBySpaceQuery.error &&
                    expenseCategoriesWithDrafts.length === 0 && (
                        <p className="spaces-suggestion__hint">
                            No categories yet. Create one from the form.
                        </p>
                    )}

                {expenseCategoriesWithDrafts.length > 0 && (
                    <div className="space-members-table">
                        <div className="space-members-table__head">
                            <span>Category</span>
                            <span>Parent</span>
                            <span>Envelop</span>
                            <span>Actions</span>
                        </div>
                        {expenseCategoriesWithDrafts.map(({ category, draft }) => {
                            const isRowBusy = activeExpenseCategoryActionId === category.id;
                            return (
                                <div key={category.id} className="space-members-table__row">
                                    <input
                                        className="signup-field__input"
                                        value={draft.name}
                                        onChange={(e) =>
                                            setExpenseCategoryDrafts((previous) => ({
                                                ...previous,
                                                [category.id]: {
                                                    ...draft,
                                                    name: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    />

                                    <select
                                        className="signup-field__input"
                                        value={draft.parentId}
                                        onChange={(e) =>
                                            setExpenseCategoryDrafts((previous) => ({
                                                ...previous,
                                                [category.id]: {
                                                    ...draft,
                                                    parentId: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    >
                                        <option value="">Root</option>
                                        {expenseCategoriesBySpaceQuery.data
                                            ?.filter((item) => item.id !== category.id)
                                            .map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name}
                                                </option>
                                            ))}
                                    </select>

                                    <select
                                        className="signup-field__input"
                                        value={draft.envelopId}
                                        onChange={(e) =>
                                            setExpenseCategoryDrafts((previous) => ({
                                                ...previous,
                                                [category.id]: {
                                                    ...draft,
                                                    envelopId: e.target.value,
                                                },
                                            }))
                                        }
                                        disabled={isRowBusy}
                                    >
                                        {envelopsBySpaceQuery.data?.map((envelop) => (
                                            <option key={envelop.id} value={envelop.id}>
                                                {envelop.name}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="space-members-table__actions">
                                        <button
                                            type="button"
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            disabled={
                                                isRowBusy || !draft.name.trim() || !draft.envelopId
                                            }
                                            onClick={() => handleSaveExpenseCategory(category.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-btn signup-btn--primary space-members-table__btn"
                                            disabled={isRowBusy}
                                            onClick={() =>
                                                handleChangeExpenseCategoryParent(category.id)
                                            }
                                        >
                                            Set parent
                                        </button>
                                        <button
                                            type="button"
                                            className="signup-btn spaces-btn--danger space-members-table__btn"
                                            disabled={isRowBusy}
                                            onClick={() => handleDeleteExpenseCategory(category.id)}
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
