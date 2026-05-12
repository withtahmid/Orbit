import { clearPin } from "../procedures/pin/clear.mjs";
import { listPinsBySpace } from "../procedures/pin/listBySpace.mjs";
import { setPin } from "../procedures/pin/set.mjs";
import { router } from "../trpc/index.mjs";

export const pinRouter = router({
    listBySpace: listPinsBySpace,
    set: setPin,
    clear: clearPin,
});
