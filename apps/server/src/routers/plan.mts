import { createPlan } from "../procedures/plan/create.mjs";
import { createPlanAllocation } from "../procedures/plan/createAllocation.mjs";
import { deletePlan } from "../procedures/plan/delete.mjs";
import { deletePlanAllocation } from "../procedures/plan/deleteAllocation.mjs";
import { listPlanAllocationsBySpace } from "../procedures/plan/listAllocationsBySpace.mjs";
import { listPlansBySpace } from "../procedures/plan/listBySpace.mjs";
import { updatePlan } from "../procedures/plan/update.mjs";
import { router } from "../trpc/index.mjs";

export const planRouter = router({
    create: createPlan,
    update: updatePlan,
    delete: deletePlan,
    listBySpace: listPlansBySpace,
    allocationCreate: createPlanAllocation,
    allocationDelete: deletePlanAllocation,
    allocationListBySpace: listPlanAllocationsBySpace,
});
