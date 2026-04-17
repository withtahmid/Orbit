import { transferAllocation } from "../procedures/allocation/transfer.mjs";
import { router } from "../trpc/index.mjs";

export const allocationRouter = router({
    transfer: transferAllocation,
});
