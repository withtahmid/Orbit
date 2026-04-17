import { loginProcedure } from "../procedures/auth/login.mjs";
import { router } from "../trpc/index.mjs";
import { completePasswordReset } from "../procedures/auth//resetPassword/complete.mjs";
import { initiatePasswordReset } from "../procedures/auth//resetPassword/initiate.mjs";
import { resendPasswordResetCode } from "../procedures/auth//resetPassword/resendCode.mjs";
import { verifyPasswordResetCode } from "../procedures/auth//resetPassword/verifyCode.mjs";
import { completeSignup } from "../procedures/auth//signup/complete.mjs";
import { initiateSignup } from "../procedures/auth//signup/initiate.mjs";
import { resendSignupCode } from "../procedures/auth//signup/resendCode.mjs";
import { verifyCode } from "../procedures/auth//signup/verifyCode.mjs";
import { findUserByEmail } from "../procedures/auth/users/findByEmail.mjs";
import { meProcedure } from "../procedures/auth/me.mjs";

export const authRouter = router({
    signup: router({
        initiate: initiateSignup,
        resendCode: resendSignupCode,
        verify: verifyCode,
        complete: completeSignup,
    }),
    login: loginProcedure,
    resetPassword: router({
        initiate: initiatePasswordReset,
        resendCode: resendPasswordResetCode,
        verify: verifyPasswordResetCode,
        complete: completePasswordReset,
    }),
    findUserByEmail,
    me: meProcedure,
});
