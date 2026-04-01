import { makeAutoObservable, runInAction } from "mobx";

const SIGNUP_TOKEN_KEY = "signup_token";

export type SignupStep = 1 | 2 | 3;

/**
 * SignupStore
 *
 * Manages the multi-step signup flow state.
 * Uses a separate token key from the main auth to avoid conflicts.
 */
export class SignupStore {
    step: SignupStep = 1;
    email: string = "";
    signupToken: string | null = null;
    resendCooldown: number = 0;
    private cooldownInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable(this);
        // Restore token if user refreshes mid-signup
        const storedToken = localStorage.getItem(SIGNUP_TOKEN_KEY);
        if (storedToken) {
            this.signupToken = storedToken;
        }
    }

    // ── Actions ─────────────────────────────────────────

    setStep(step: SignupStep) {
        this.step = step;
    }

    setEmail(email: string) {
        this.email = email;
    }

    setSignupToken(token: string | null) {
        this.signupToken = token;
        if (token) {
            localStorage.setItem(SIGNUP_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(SIGNUP_TOKEN_KEY);
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

    /** Reset everything when signup completes or user navigates away */
    reset() {
        this.step = 1;
        this.email = "";
        this.signupToken = null;
        this.resendCooldown = 0;
        localStorage.removeItem(SIGNUP_TOKEN_KEY);
        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
    }
}
