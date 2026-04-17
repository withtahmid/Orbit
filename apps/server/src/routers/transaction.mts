import { adjustAccountBalance } from "../procedures/transaction/adjust.mjs";
import { deleteTransaction } from "../procedures/transaction/delete.mjs";
import { createExpenseTransaction } from "../procedures/transaction/expense.mjs";
import { createIncomeTransaction } from "../procedures/transaction/income.mjs";
import { listTransactionsBySpace } from "../procedures/transaction/list.mjs";
import { createTransferTransaction } from "../procedures/transaction/transfer.mjs";
import { updateTransaction } from "../procedures/transaction/update.mjs";
import { router } from "../trpc/index.mjs";

export const transactionRouter = router({
    income: createIncomeTransaction,
    expense: createExpenseTransaction,
    transfer: createTransferTransaction,
    adjust: adjustAccountBalance,
    update: updateTransaction,
    delete: deleteTransaction,
    listBySpace: listTransactionsBySpace,
});
