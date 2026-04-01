import { makeAutoObservable, runInAction } from "mobx";

const TOKEN_KEY = "auth_token";

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
}

/**
 * AuthStore
 *
 * Single source of truth for authentication state.
 * Persists the token in localStorage so it survives page refreshes.
 */
export class AuthStore {
    token: string | null = null;
    user: AuthUser | null = null;
    isLoading = true; // true while rehydrating from storage

    constructor() {
        makeAutoObservable(this);
        this.rehydrate();
    }

    // ── Computed ────────────────────────────────────────
    get isAuthenticated() {
        return this.token !== null && this.user !== null;
    }

    // ── Actions ─────────────────────────────────────────

    /** Called once on startup to restore a persisted session. */
    private rehydrate() {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (storedToken) {
            // In a real app you'd validate/refresh the token here.
            runInAction(() => {
                this.token = storedToken;
                // Restore user from storage or re-fetch from API.
                const raw = localStorage.getItem("auth_user");
                this.user = raw ? (JSON.parse(raw) as AuthUser) : null;
                this.isLoading = false;
            });
        } else {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    /** Call this after a successful login API response. */
    setAuth(token: string, user: AuthUser) {
        this.token = token;
        this.user = user;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem("auth_user", JSON.stringify(user));
    }

    /** Call this on logout. */
    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("auth_user");
    }
}
