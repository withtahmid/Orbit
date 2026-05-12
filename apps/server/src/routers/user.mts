import { router } from "../trpc/index.mjs";
import { updateAvatar } from "../procedures/user/updateAvatar.mjs";
import { updateProfile } from "../procedures/user/updateProfile.mjs";
import { changeEmail } from "../procedures/user/changeEmail.mjs";
import { changePassword } from "../procedures/user/changePassword.mjs";
import { deleteAccount } from "../procedures/user/deleteAccount.mjs";

export const userRouter = router({
    updateAvatar,
    updateProfile,
    changeEmail,
    changePassword,
    deleteAccount,
});
