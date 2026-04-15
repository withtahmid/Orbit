import { createPlan } from "../procedures/plan/create.mjs";
import { deletePlan } from "../procedures/plan/delete.mjs";
import { listPlansBySpace } from "../procedures/plan/listBySpace.mjs";
import { updatePlan } from "../procedures/plan/update.mjs";
import { router } from "../trpc/index.mjs";

export const planRouter = router({
    create: createPlan,
    update: updatePlan,
    delete: deletePlan,
    listBySpace: listPlansBySpace,
});
