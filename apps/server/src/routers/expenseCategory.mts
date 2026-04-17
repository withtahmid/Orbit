import { changeExpenseCategoryEnvelop } from "../procedures/expenseCategory/changeEnvelop.mjs";
import { changeExpenseCategoryParent } from "../procedures/expenseCategory/changeParent.mjs";
import { createExpenseCategory } from "../procedures/expenseCategory/create.mjs";
import { deleteExpenseCategory } from "../procedures/expenseCategory/delete.mjs";
import { listExpenseCategoriesBySpace } from "../procedures/expenseCategory/listBySpace.mjs";
import { updateExpenseCategory } from "../procedures/expenseCategory/update.mjs";
import { router } from "../trpc/index.mjs";

export const expenseCategoryRouter = router({
    create: createExpenseCategory,
    update: updateExpenseCategory,
    changeParent: changeExpenseCategoryParent,
    changeEnvelop: changeExpenseCategoryEnvelop,
    delete: deleteExpenseCategory,
    listBySpace: listExpenseCategoriesBySpace,
});
