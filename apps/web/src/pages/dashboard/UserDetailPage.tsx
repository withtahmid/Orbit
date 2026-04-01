import { useParams, useNavigate, Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";

interface UserDetailParams {
    userId: string;
}

/**
 * UserDetailPage — /users/:userId
 *
 * Demonstrates reading a URL param with useParams().
 * The param name must match what's declared in router/index.tsx.
 */
export function UserDetailPage() {
    const { userId } = useParams<keyof UserDetailParams>();
    const navigate = useNavigate();

    if (!userId) {
        return <p>No user ID provided.</p>;
    }

    return (
        <div>
            <h1>User Detail</h1>
            <p>
                Showing details for user: <strong>{userId}</strong>
            </p>

            {/* Example: navigate to a sibling user */}
            <button onClick={() => navigate(ROUTES.userDetail(String(Number(userId) + 1)))}>
                Next user →
            </button>

            <br />
            <Link to={ROUTES.dashboard}>← Back to Dashboard</Link>
        </div>
    );
}
