import { Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

const roleClassMap = {
    owner: "space-role-pill--owner",
    editor: "space-role-pill--editor",
    viewer: "space-role-pill--viewer",
} as const;

export function SpacesPage() {
    const spacesQuery = trpc.space.list.useQuery();

    return (
        <section className="spaces-page">
            <header className="spaces-page__header">
                <div>
                    <p className="spaces-page__kicker">Your Workspace</p>
                    <h1 className="spaces-page__title">Spaces</h1>
                </div>
                <Link
                    className="signup-btn signup-btn--primary spaces-page__create-btn"
                    to={ROUTES.spaceEdit("new")}
                >
                    + Add Space
                </Link>
            </header>

            {spacesQuery.isLoading && <p className="spaces-page__status">Loading spaces...</p>}

            {spacesQuery.error && (
                <div className="signup-alert signup-alert--error" role="alert">
                    Failed to load spaces.
                </div>
            )}

            {!spacesQuery.isLoading && !spacesQuery.error && spacesQuery.data?.length === 0 && (
                <div className="spaces-empty-state">
                    <h2>No spaces yet</h2>
                    <p>
                        Create your first space to start organizing accounts, members, and budgets.
                    </p>
                </div>
            )}

            <div className="spaces-grid">
                {spacesQuery.data?.map((space) => (
                    <article key={space.id} className="space-card">
                        <div className="space-card__top">
                            <h2>{space.name}</h2>
                            <span className={`space-role-pill ${roleClassMap[space.myRole]}`}>
                                {space.myRole}
                            </span>
                        </div>
                        <div className="space-card__actions">
                            <Link to={ROUTES.spaceDetail(space.id)} className="signup-link">
                                Open space
                            </Link>
                            <Link to={ROUTES.spaceEdit(space.id)} className="signup-link">
                                Edit
                            </Link>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
