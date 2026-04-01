import { AuthStore } from "./AuthStore";

/**
 * RootStore
 *
 * Composes all domain stores. Add new stores here.
 * Stores can reference each other via `this.root`.
 */
export class RootStore {
    authStore: AuthStore;
    // uiStore: UiStore;
    // userStore: UserStore;

    constructor() {
        this.authStore = new AuthStore();
    }
}

// Singleton — one instance for the whole app lifetime.
export const rootStore = new RootStore();
