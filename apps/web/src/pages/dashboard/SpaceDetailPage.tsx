import { Link, Navigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

export function SpaceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const spacesQuery = trpc.space.list.useQuery();

    if (!id) {
        return <Navigate to={ROUTES.spaces} replace />;
    }

    const currentSpace = spacesQuery.data?.find((space) => space.id === id);

    if (!spacesQuery.isLoading && !currentSpace) {
        return (
            <section className="spaces-page">
                <div className="spaces-empty-state">
                    <h1>Space not found</h1>
                    <p>The selected space is not available for your account.</p>
                    <Link to={ROUTES.spaces} className="signup-link">
                        Back to spaces
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Space</p>
                    <h1 className="spaces-page__title">{currentSpace?.name ?? "Loading..."}</h1>
                </div>
                <Link
                    className="signup-btn signup-btn--primary spaces-page__create-btn"
                    to={ROUTES.spaceEdit(id)}
                >
                    Light Settings / Edit
                </Link>
            </header>

            <article className="space-card space-card--detail">
                <h2>Inside space</h2>
                <p>
                    This page is ready for future modules like accounts, envelopes, and
                    transactions.
                </p>
                <p>
                    Current role: <strong>{currentSpace?.myRole ?? "..."}</strong>
                </p>
            </article>
        </section>
    );
}
