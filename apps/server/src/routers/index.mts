import { router } from "../trpc/index.mjs";
import { healthProcedure } from "./health.mjs";
import { authRouter } from "./auth.mjs";
import { spaceRouter } from "./space.mjs";
import { accountRouter } from "./account.mjs";
import { eventRouter } from "./event.mjs";
import { envelopRouter } from "./envelop.mjs";
import { expenseCategoryRouter } from "./expenseCategory.mjs";
import { transactionRouter } from "./transaction.mjs";
import { allocationRouter } from "./allocation.mjs";
import { analyticsRouter } from "./analytics.mjs";
import { fileRouter } from "./file.mjs";
import { userRouter } from "./user.mjs";
import { personalRouter } from "./personal.mjs";
import { pinRouter } from "./pin.mjs";

export const appRouter = router({
    health: healthProcedure,
    auth: authRouter,
    space: spaceRouter,
    account: accountRouter,
    event: eventRouter,
    envelop: envelopRouter,
    expenseCategory: expenseCategoryRouter,
    transaction: transactionRouter,
    allocation: allocationRouter,
    analytics: analyticsRouter,
    file: fileRouter,
    user: userRouter,
    personal: personalRouter,
    pin: pinRouter,
});
export type AppRouter = typeof appRouter;
