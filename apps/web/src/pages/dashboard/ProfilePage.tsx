import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";

export const ProfilePage = observer(() => {
    const { authStore } = useStore();
    const user = authStore.user;

    return (
        <div>
            <h1>Profile</h1>
            <dl>
                <dt>ID</dt>
                <dd>{user?.id}</dd>
                <dt>Name</dt>
                <dd>{user?.name}</dd>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
            </dl>
        </div>
    );
});
