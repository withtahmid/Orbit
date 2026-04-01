import { makeAutoObservable, runInAction } from "mobx";

const RESET_TOKEN_KEY = "password_reset_token";

export type ForgotPasswordStep = 1 | 2 | 3;

/**
 * ForgotPasswordStore
 *
 * Manages the multi-step password reset flow state.
 * Maintains tokens for verification persistence.
 */
export class ForgotPasswordStore {
    step: ForgotPasswordStep = 1;
    email: string = "";
    resetToken: string | null = null;
    resendCooldown: number = 0;
    private cooldownInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable(this);
        // Restore token if user refreshes mid-reset
        const storedToken = localStorage.getItem(RESET_TOKEN_KEY);
        if (storedToken) {
            this.resetToken = storedToken;
        }
    }

    // ── Actions ─────────────────────────────────────────

    setStep(step: ForgotPasswordStep) {
        this.step = step;
    }

    setEmail(email: string) {
        this.email = email;
    }

    setResetToken(token: string | null) {
        this.resetToken = token;
        if (token) {
            localStorage.setItem(RESET_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(RESET_TOKEN_KEY);
        }
    }

    startResendCooldown(seconds: number = 60) {
        this.resendCooldown = seconds;

        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
        }

        this.cooldownInterval = setInterval(() => {
            runInAction(() => {
                this.resendCooldown -= 1;
                if (this.resendCooldown <= 0) {
                    this.resendCooldown = 0;
                    if (this.cooldownInterval) {
                        clearInterval(this.cooldownInterval);
                        this.cooldownInterval = null;
                    }
                }
            });
        }, 1000);
    }

    /** Reset everything when flow completes or user navigates away */
    reset() {
        this.step = 1;
        this.email = "";
        this.resetToken = null;
        this.resendCooldown = 0;
        localStorage.removeItem(RESET_TOKEN_KEY);
        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
    }
}
