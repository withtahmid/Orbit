import { personalAccountAllocation } from "../procedures/personal/accountAllocation.mjs";
import { personalAccountDistribution } from "../procedures/personal/accountDistribution.mjs";
import { personalOwnedAccounts } from "../procedures/personal/accounts.mjs";
import { personalBalanceHistory } from "../procedures/personal/balanceHistory.mjs";
import { personalCashFlow } from "../procedures/personal/cashFlow.mjs";
import { personalCategoryBreakdown } from "../procedures/personal/categoryBreakdown.mjs";
import { personalEnvelopeUtilization } from "../procedures/personal/envelopeUtilization.mjs";
import { personalListCategories } from "../procedures/personal/listCategories.mjs";
import { personalPlanProgress } from "../procedures/personal/planProgress.mjs";
import { personalSpendingHeatmap } from "../procedures/personal/spendingHeatmap.mjs";
import { personalSummary } from "../procedures/personal/summary.mjs";
import { personalTopCategories } from "../procedures/personal/topCategories.mjs";
import { personalTransactions } from "../procedures/personal/transactions.mjs";
import { router } from "../trpc/index.mjs";

/**
 * Personal (cross-space) router. Every procedure here is anchored on
 * `user_accounts.role = 'owner'` — the caller's personally-owned
 * accounts — unioned across every space they're currently a member of.
 * Analytics names mirror the per-space `analytics.*` router so the
 * existing views can swap their data source by procedure name alone
 * when the virtual-space sentinel (`spaceId === "me"`) is active.
 */
export const personalRouter = router({
    summary: personalSummary,
    cashFlow: personalCashFlow,
    topCategories: personalTopCategories,
    categoryBreakdown: personalCategoryBreakdown,
    envelopeUtilization: personalEnvelopeUtilization,
    planProgress: personalPlanProgress,
    balanceHistory: personalBalanceHistory,
    spendingHeatmap: personalSpendingHeatmap,
    accountDistribution: personalAccountDistribution,
    accountAllocation: personalAccountAllocation,
    transactions: personalTransactions,
    ownedAccounts: personalOwnedAccounts,
    listCategories: personalListCategories,
});
