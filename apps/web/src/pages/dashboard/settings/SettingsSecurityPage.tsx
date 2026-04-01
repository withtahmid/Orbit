import { useState } from "react";

/**
 * SettingsSecurityPage — /settings/security
 *
 * Nested child of SettingsPage. Rendered inside SettingsPage's <Outlet />.
 */
export function SettingsSecurityPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // 🔌 await trpc.auth.changePassword.mutate({ currentPassword, newPassword });
        alert("Password changed!");
    };

    return (
        <section>
            <h2>Security</h2>
            <form onSubmit={handleSubmit}>
                <label>
                    Current password
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                    />
                </label>
                <label>
                    New password
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </label>
                <button type="submit">Change password</button>
            </form>
        </section>
    );
}
