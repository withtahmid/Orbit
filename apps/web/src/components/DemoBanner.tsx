import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, Eye } from "lucide-react";
import { IS_DEMO, PRODUCTION_URL } from "@/config/isDemo";
import { ROUTES } from "@/router/routes";

/**
 * Global banner shown only on the read-only demo deployment. Warns users
 * that writes are disabled and points them at production + the docs.
 * Rendered at the top of RootLayout (non-sticky) so it appears on every
 * page load without interfering with page-level sticky headers.
 */
export function DemoBanner() {
    if (!IS_DEMO) return null;

    return (
        <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs sm:px-8 sm:text-sm">
                <div className="flex items-center gap-2">
                    <Eye className="size-4 shrink-0" />
                    <span>
                        You're on the <b>Orbit demo</b> — read-only. Mutations are
                        disabled here.
                    </span>
                </div>
                <nav className="flex items-center gap-3">
                    <Link
                        to={ROUTES.docs}
                        className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    >
                        <BookOpen className="size-3.5" />
                        Docs
                    </Link>
                    <a
                        href={PRODUCTION_URL}
                        className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    >
                        Open production
                        <ExternalLink className="size-3.5" />
                    </a>
                </nav>
            </div>
        </div>
    );
}
