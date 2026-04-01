import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";

/**
 * SettingsGeneralPage — /settings/general (also the index at /settings)
 *
 * Nested child of SettingsPage. Rendered inside SettingsPage's <Outlet />.
 */
export const SettingsGeneralPage = observer(() => {
    const { authStore } = useStore();
    const [name, setName] = useState(authStore.user?.name ?? "");

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        // 🔌 await trpc.user.updateProfile.mutate({ name });
        // authStore.setAuth(authStore.token!, { ...authStore.user!, name });
        alert(`Saved: ${name}`);
    };

    return (
        <section>
            <h2>General</h2>
            <form onSubmit={handleSave}>
                <label>
                    Display name
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <button type="submit">Save changes</button>
            </form>
        </section>
    );
});
