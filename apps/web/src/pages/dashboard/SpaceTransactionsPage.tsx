,import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

type TransactionType = "income" | "expense" | "transfer" | "adjustment";

const toDisplayDateTime = (value: string | Date) =>
    new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
    });

const normalizeTransactionType = (value: unknown): string => {
    const type = Array.isArray(value) ? value[0] : value;
    return String(type || "unknown").toUpperCase();
};

export function SpaceTransactionsPage() {
    const { id: spaceId } = useParams<{ id: string }>();

    const [type, setType] = useState<TransactionType>("expense");
    const [amount, setAmount] = useState("");
    const [newBalance, setNewBalance] = useState("");
    const [datetime, setDatetime] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [sourceAccountId, setSourceAccountId] = useState("");
    const [destinationAccountId, setDestinationAccountId] = useState("");
    const [expenseCategoryId, setExpenseCategoryId] = useState("");

    const [filterType, setFilterType] = useState<"" | TransactionType>("");
    const [filterEnvelopId, setFilterEnvelopId] = useState("");
    const [filterExpenseCategoryId, setFilterExpenseCategoryId] = useState("");

    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const utils = trpc.useUtils();

    if (!spaceId) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    const accountsBySpaceQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const envelopsBySpaceQuery = trpc.envelop.listBySpace.useQuery({ spaceId });
    const expenseCategoriesBySpaceQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });

    const transactionsBySpaceQuery = trpc.transaction.listBySpace.useQuery({
        spaceId,
        userId: null,
        type: filterType || null,
        envelop_id: filterEnvelopId || null,
        expense_category_id: filterExpenseCategoryId || null,
    });

    const incomeMutation = trpc.transaction.income.useMutation();
    const expenseMutation = trpc.transaction.expense.useMutation();
    const transferMutation = trpc.transaction.transfer.useMutation();
    const adjustMutation = trpc.transaction.adjust.useMutation();

    const accountNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const account of accountsBySpaceQuery.data ?? []) {
            map.set(account.id, account.name);
        }
        return map;
    }, [accountsBySpaceQuery.data]);

    const expenseCategoryNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const category of expenseCategoriesBySpaceQuery.data ?? []) {
            map.set(category.id, category.name);
        }
        return map;
    }, [expenseCategoriesBySpaceQuery.data]);

    const clearFeedback = () => {
        setStatus("");
        setError("");
    };

    const clearTransactionForm = () => {
        setAmount("");
        setNewBalance("");
        setDatetime("");
        setDescription("");
        setLocation("");
        setSourceAccountId("");
        setDestinationAccountId("");
        setExpenseCategoryId("");
    };

    const refetchTransactionData = async () => {
        await Promise.all([
            transactionsBySpaceQuery.refetch(),
            accountsBySpaceQuery.refetch(),
            utils.account.listByUser.invalidate(),
        ]);
    };

    const handleCreateTransaction = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearFeedback();

        try {
            const parsedDate = datetime ? new Date(datetime) : undefined;

            if (type === "income") {
                if (!destinationAccountId) {
                    setError("Select a destination account.");
                    return;
                }
                await incomeMutation.mutateAsync({
                    spaceId,
                    amount: Number(amount),
                    accountId: destinationAccountId,
                    datetime: parsedDate,
                    description: description || undefined,
                    location: location || undefined,
                });
            }

            if (type === "expense") {
                if (!sourceAccountId || !expenseCategoryId) {
                    setError("Select source account and expense category.");
                    return;
                }
                await expenseMutation.mutateAsync({
                    spaceId,
                    amount: Number(amount),
                    sourceAccountId,
                    expense_category_id: expenseCategoryId,
                    datetime: parsedDate,
                    description: description || undefined,
                    location: location || undefined,
                });
            }

            if (type === "transfer") {
                if (!sourceAccountId || !destinationAccountId) {
                    setError("Select source and destination accounts.");
                    return;
                }

                await transferMutation.mutateAsync({
                    spaceId,
                    amount: Number(amount),
                    sourceAccountId,
                    destinationAccountId,
                    datetime: parsedDate,
                    description: description || undefined,
                    location: location || undefined,
                });
            }

            if (type === "adjustment") {
                if (!sourceAccountId) {
                    setError("Select the account to adjust.");
                    return;
                }
                await adjustMutation.mutateAsync({
                    spaceId,
                    accountId: sourceAccountId,
                    newBalance: Number(newBalance),
                    datetime: parsedDate,
                    description: description || undefined,
                    location: location || undefined,
                });
            }

            await refetchTransactionData();
            clearTransactionForm();
            setStatus("Transaction created successfully.");
        } catch (err: any) {
            setError(err?.message || "Failed to create transaction.");
        }
    };

    const isCreating =
        incomeMutation.isPending ||
        expenseMutation.isPending ||
        transferMutation.isPending ||
        adjustMutation.isPending;

    const needsAmount = type !== "adjustment";

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Transactions</p>
                    <h1 className="spaces-page__title">Space Transactions</h1>
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
                        <h2>Create transaction</h2>
                        <form className="signup-form" onSubmit={handleCreateTransaction}>
                            <div className="signup-field">
                                <label htmlFor="transaction-type" className="signup-field__label">
                                    Type
                                </label>
                                <select
                                    id="transaction-type"
                                    className="signup-field__input"
                                    value={type}
                                    onChange={(event) =>
                                        setType(event.target.value as TransactionType)
                                    }
                                >
                                    <option value="income">income</option>
                                    <option value="expense">expense</option>
                                    <option value="transfer">transfer</option>
                                    <option value="adjustment">adjustment</option>
                                </select>
                            </div>

                            {needsAmount && (
                                <div className="signup-field">
                                    <label
                                        htmlFor="transaction-amount"
                                        className="signup-field__label"
                                    >
                                        Amount
                                    </label>
                                    <input
                                        id="transaction-amount"
                                        className="signup-field__input"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={amount}
                                        onChange={(event) => setAmount(event.target.value)}
                                        required
                                    />
                                </div>
                            )}

                            {type === "adjustment" && (
                                <div className="signup-field">
                                    <label
                                        htmlFor="transaction-new-balance"
                                        className="signup-field__label"
                                    >
                                        New balance
                                    </label>
                                    <input
                                        id="transaction-new-balance"
                                        className="signup-field__input"
                                        type="number"
                                        step="0.01"
                                        value={newBalance}
                                        onChange={(event) => setNewBalance(event.target.value)}
                                        required
                                    />
                                </div>
                            )}

                            {(type === "expense" ||
                                type === "transfer" ||
                                type === "adjustment") && (
                                <div className="signup-field">
                                    <label
                                        htmlFor="transaction-source-account"
                                        className="signup-field__label"
                                    >
                                        {type === "adjustment" ? "Account" : "Source account"}
                                    </label>
                                    <select
                                        id="transaction-source-account"
                                        className="signup-field__input"
                                        value={sourceAccountId}
                                        onChange={(event) => setSourceAccountId(event.target.value)}
                                        required
                                    >
                                        <option value="" disabled>
                                            Select account
                                        </option>
                                        {accountsBySpaceQuery.data?.map((account) => (
                                            <option key={account.id} value={account.id}>
                                                {account.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {(type === "income" || type === "transfer") && (
                                <div className="signup-field">
                                    <label
                                        htmlFor="transaction-destination-account"
                                        className="signup-field__label"
                                    >
                                        Destination account
                                    </label>
                                    <select
                                        id="transaction-destination-account"
                                        className="signup-field__input"
                                        value={destinationAccountId}
                                        onChange={(event) =>
                                            setDestinationAccountId(event.target.value)
                                        }
                                        required
                                    >
                                        <option value="" disabled>
                                            Select account
                                        </option>
                                        {accountsBySpaceQuery.data?.map((account) => (
                                            <option key={account.id} value={account.id}>
                                                {account.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {type === "expense" && (
                                <div className="signup-field">
                                    <label
                                        htmlFor="transaction-expense-category"
                                        className="signup-field__label"
                                    >
                                        Expense category
                                    </label>
                                    <select
                                        id="transaction-expense-category"
                                        className="signup-field__input"
                                        value={expenseCategoryId}
                                        onChange={(event) =>
                                            setExpenseCategoryId(event.target.value)
                                        }
                                        required
                                    >
                                        <option value="" disabled>
                                            Select category
                                        </option>
                                        {expenseCategoriesBySpaceQuery.data?.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="signup-field">
                                <label
                                    htmlFor="transaction-datetime"
                                    className="signup-field__label"
                                >
                                    Datetime (optional)
                                </label>
                                <input
                                    id="transaction-datetime"
                                    type="datetime-local"
                                    className="signup-field__input"
                                    value={datetime}
                                    onChange={(event) => setDatetime(event.target.value)}
                                />
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="transaction-description"
                                    className="signup-field__label"
                                >
                                    Description (optional)
                                </label>
                                <input
                                    id="transaction-description"
                                    className="signup-field__input"
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                />
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="transaction-location"
                                    className="signup-field__label"
                                >
                                    Location (optional)
                                </label>
                                <input
                                    id="transaction-location"
                                    className="signup-field__input"
                                    value={location}
                                    onChange={(event) => setLocation(event.target.value)}
                                />
                            </div>

                            <button
                                className="signup-btn signup-btn--primary"
                                disabled={
                                    isCreating ||
                                    (needsAmount && Number(amount) <= 0) ||
                                    (type === "adjustment" && newBalance === "")
                                }
                            >
                                Create transaction
                            </button>
                        </form>
                    </article>
                </div>

                <div className="space-edit-layout__left">
                    <article className="space-card space-card--form">
                        <h2>Filters</h2>
                        <div className="signup-form">
                            <div className="signup-field">
                                <label htmlFor="filter-type" className="signup-field__label">
                                    Type
                                </label>
                                <select
                                    id="filter-type"
                                    className="signup-field__input"
                                    value={filterType}
                                    onChange={(event) =>
                                        setFilterType(event.target.value as "" | TransactionType)
                                    }
                                >
                                    <option value="">All</option>
                                    <option value="income">income</option>
                                    <option value="expense">expense</option>
                                    <option value="transfer">transfer</option>
                                    <option value="adjustment">adjustment</option>
                                </select>
                            </div>

                            <div className="signup-field">
                                <label htmlFor="filter-envelop" className="signup-field__label">
                                    Envelop
                                </label>
                                <select
                                    id="filter-envelop"
                                    className="signup-field__input"
                                    value={filterEnvelopId}
                                    onChange={(event) => setFilterEnvelopId(event.target.value)}
                                >
                                    <option value="">All</option>
                                    {envelopsBySpaceQuery.data?.map((envelop) => (
                                        <option key={envelop.id} value={envelop.id}>
                                            {envelop.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="signup-field">
                                <label
                                    htmlFor="filter-expense-category"
                                    className="signup-field__label"
                                >
                                    Expense category
                                </label>
                                <select
                                    id="filter-expense-category"
                                    className="signup-field__input"
                                    value={filterExpenseCategoryId}
                                    onChange={(event) =>
                                        setFilterExpenseCategoryId(event.target.value)
                                    }
                                >
                                    <option value="">All</option>
                                    {expenseCategoriesBySpaceQuery.data?.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="button"
                                className="signup-btn"
                                onClick={() => {
                                    setFilterType("");
                                    setFilterEnvelopId("");
                                    setFilterExpenseCategoryId("");
                                }}
                            >
                                Clear filters
                            </button>
                        </div>
                    </article>

                    <article className="space-card space-card--members">
                        <div className="space-members__header">
                            <h2>Transactions</h2>
                            {transactionsBySpaceQuery.isFetching && (
                                <span className="spaces-suggestion__hint">Loading...</span>
                            )}
                        </div>

                        {transactionsBySpaceQuery.error && (
                            <div className="signup-alert signup-alert--error" role="alert">
                                {transactionsBySpaceQuery.error.message ||
                                    "Failed to load transactions."}
                            </div>
                        )}

                        {!transactionsBySpaceQuery.isLoading &&
                            (transactionsBySpaceQuery.data?.length ?? 0) === 0 && (
                                <p className="spaces-suggestion__hint">No transactions found.</p>
                            )}

                        <div className="space-members-list">
                            {transactionsBySpaceQuery.data?.map((transaction) => (
                                <article key={transaction.id} className="space-member-row">
                                    <div className="space-member-row__identity">
                                        <span className="space-member-row__name">
                                            {normalizeTransactionType(transaction.type)}
                                        </span>
                                        <span className="spaces-suggestion__hint">
                                            {toDisplayDateTime(transaction.transaction_datetime)}
                                        </span>
                                    </div>
                                    <div className="space-member-row__meta">
                                        <span>
                                            Amount: {Number(transaction.amount).toLocaleString()}
                                        </span>
                                        {transaction.source_account_id && (
                                            <span>
                                                Source:{" "}
                                                {accountNameById.get(
                                                    transaction.source_account_id
                                                ) || "-"}
                                            </span>
                                        )}
                                        {transaction.destination_account_id && (
                                            <span>
                                                Destination:{" "}
                                                {accountNameById.get(
                                                    transaction.destination_account_id
                                                ) || "-"}
                                            </span>
                                        )}
                                        {transaction.expense_category_id && (
                                            <span>
                                                Category:{" "}
                                                {expenseCategoryNameById.get(
                                                    transaction.expense_category_id
                                                ) || "-"}
                                            </span>
                                        )}
                                        {transaction.description && (
                                            <span>Description: {transaction.description}</span>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
}
