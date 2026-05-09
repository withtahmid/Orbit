import { acknowledgeReckoning } from "../procedures/reckoning/acknowledge.mjs";
import { listPendingReckoning } from "../procedures/reckoning/listPending.mjs";
import { router } from "../trpc/index.mjs";

export const reckoningRouter = router({
    listPending: listPendingReckoning,
    acknowledge: acknowledgeReckoning,
});
