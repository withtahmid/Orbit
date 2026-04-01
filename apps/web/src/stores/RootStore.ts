import { AuthStore } from "./AuthStore";
import { SignupStore } from "./SignupStore";
import { ForgotPasswordStore } from "./ForgotPasswordStore";

/**
 * RootStore
 *
 * Composes all domain stores. Add new stores here.
 * Stores can reference each other via `this.root`.
 */
export class RootStore {
    authStore: AuthStore;
    signupStore: SignupStore;
    forgotPasswordStore: ForgotPasswordStore;

    constructor() {
        this.authStore = new AuthStore();
        this.signupStore = new SignupStore();
        this.forgotPasswordStore = new ForgotPasswordStore();
    }
}

// Singleton — one instance for the whole app lifetime.
export const rootStore = new RootStore();
