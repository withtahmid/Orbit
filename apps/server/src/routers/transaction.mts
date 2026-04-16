import { adjustAccountBalance } from "../procedures/transaction/adjust.mjs";
import { createExpenseTransaction } from "../procedures/transaction/expense.mjs";
import { createIncomeTransaction } from "../procedures/transaction/income.mjs";
import { listTransactionsBySpace } from "../procedures/transaction/list.mjs";
import { createTransferTransaction } from "../procedures/transaction/transfer.mjs";
import { router } from "../trpc/index.mjs";

export const transactionRouter = router({
    income: createIncomeTransaction,
    expense: createExpenseTransaction,
    transfer: createTransferTransaction,
    adjust: adjustAccountBalance,
    listBySpace: listTransactionsBySpace,
});
