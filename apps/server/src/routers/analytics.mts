import { accountAllocation } from "../procedures/analytics/accountAllocation.mjs";
import { accountDistribution } from "../procedures/analytics/accountDistribution.mjs";
import { balanceHistory } from "../procedures/analytics/balanceHistory.mjs";
import { cashFlow } from "../procedures/analytics/cashFlow.mjs";
import { categoryBreakdown } from "../procedures/analytics/categoryBreakdown.mjs";
import { envelopeUtilization } from "../procedures/analytics/envelopeUtilization.mjs";
import { eventTotals } from "../procedures/analytics/eventTotals.mjs";
import { planProgress } from "../procedures/analytics/planProgress.mjs";
import { spaceSummary } from "../procedures/analytics/spaceSummary.mjs";
import { spendingHeatmap } from "../procedures/analytics/spendingHeatmap.mjs";
import { topCategories } from "../procedures/analytics/topCategories.mjs";
import { router } from "../trpc/index.mjs";

export const analyticsRouter = router({
    spaceSummary,
    cashFlow,
    categoryBreakdown,
    envelopeUtilization,
    eventTotals,
    planProgress,
    topCategories,
    accountDistribution,
    accountAllocation,
    balanceHistory,
    spendingHeatmap,
});
