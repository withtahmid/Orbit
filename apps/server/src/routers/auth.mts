import { router } from "../trpc/index.mjs";
import { loginProcedure } from "./auth/login.mjs";
import { completePasswordReset } from "./auth/resetPassword/complete.mjs";
import { initiatePasswordReset } from "./auth/resetPassword/initiate.mjs";
import { resendPasswordResetCode } from "./auth/resetPassword/resendCode.mjs";
import { verifyPasswordResetCode } from "./auth/resetPassword/verifyCode.mjs";
import { completeSignup } from "./auth/signup/complete.mjs";
import { initiateSignup } from "./auth/signup/initiate.mjs";
import { resendSignupCode } from "./auth/signup/resendCode.mjs";
import { verifyCode } from "./auth/signup/verifyCode.mjs";

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
});
