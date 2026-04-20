import { router } from "../trpc/index.mjs";
import { updateAvatar } from "../procedures/user/updateAvatar.mjs";

export const userRouter = router({
    updateAvatar,
});
